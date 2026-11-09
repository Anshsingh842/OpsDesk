// server/api/auth.js
// Authentication, session lifecycle, and demo persona switching.

const { verifyPassword } = require('../auth/passwords');
const { createSession, destroySession, buildCookieHeader, buildClearCookieHeader, parseCookie } = require('../auth/sessions');
const { checkLoginRateLimit, recordLoginAttempt } = require('../auth/rate_limit');
const { parseJsonBody } = require('../http/request_body');
const { logAudit } = require('../db/audit');
const { DEMO_MODE } = require('../config');

function registerAuthRoutes(router, db) {
  // POST /api/auth/login
  router.post('/api/auth/login', async (req, res) => {
    const body = await parseJsonBody(req);
    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';

    if (!email || !password) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Email and password are required', requestId: req.id }));
    }

    // Rate limiting check
    const rateCheck = checkLoginRateLimit(db, req.clientIp, email);
    if (!rateCheck.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: rateCheck.message, retryAfterSec: rateCheck.retryAfterSec, requestId: req.id }));
    }

    const user = db.prepare(`
      SELECT u.*, a.name as agency_name, a.code as agency_code
      FROM users u
      LEFT JOIN agencies a ON u.agency_id = a.id
      WHERE LOWER(u.email) = ?
    `).get(email);

    if (!user || !verifyPassword(password, user.password_hash)) {
      recordLoginAttempt(db, req.clientIp, email, false);
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Invalid email or password', requestId: req.id }));
    }

    recordLoginAttempt(db, req.clientIp, email, true);

    const { rawToken, expiresAt } = createSession(db, user);
    res.setHeader('Set-Cookie', buildCookieHeader(rawToken, req));

    logAudit(db, {
      tenantId: user.tenant_id,
      actorUserId: user.id,
      actorName: user.name,
      action: 'USER_LOGIN',
      resourceType: 'sessions',
      ip: req.clientIp,
      userAgent: req.headers['user-agent']
    });

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        agency_id: user.agency_id,
        agency_name: user.agency_name,
        agency_code: user.agency_code,
        region: user.region,
        rank: user.rank,
        skills: user.skills
      },
      expiresAt,
      requestId: req.id
    }));
  });

  // POST /api/auth/logout
  router.post('/api/auth/logout', async (req, res) => {
    const rawToken = parseCookie(req);
    if (rawToken) {
      destroySession(db, rawToken);
    }

    if (req.user) {
      logAudit(db, {
        tenantId: req.user.tenant_id,
        actorUserId: req.user.id,
        actorName: req.user.name,
        action: 'USER_LOGOUT',
        resourceType: 'sessions',
        ip: req.clientIp,
        userAgent: req.headers['user-agent']
      });
    }

    res.setHeader('Set-Cookie', buildClearCookieHeader(req));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, message: 'Logged out successfully', requestId: req.id }));
  });

  // GET /api/auth/me
  router.get('/api/auth/me', (req, res) => {
    if (!req.user) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Unauthenticated', requestId: req.id }));
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      user: req.user,
      requestId: req.id
    }));
  });

  // GET /api/auth/demo-users (Allowed when DEMO_MODE=true for judge persona selection)
  router.get('/api/auth/demo-users', (req, res) => {
    if (!DEMO_MODE) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Demo persona list disabled in production mode', requestId: req.id }));
    }

    const demoUsers = db.prepare(`
      SELECT u.id, u.email, u.name, u.role, u.region, u.rank, u.skills, u.is_available,
             a.name as agency_name, a.code as agency_code
      FROM users u
      LEFT JOIN agencies a ON u.agency_id = a.id
      ORDER BY
        CASE u.role
          WHEN 'lead' THEN 1
          WHEN 'escalation_manager' THEN 2
          WHEN 'agent' THEN 3
          WHEN 'requester' THEN 4
          ELSE 5
        END,
        u.name ASC
    `).all();

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      demoUsers,
      defaultPassword: 'Demo@123',
      note: 'Simulated demo credentials for evaluation only. Public demo accounts.',
      requestId: req.id
    }));
  });

  // POST /api/auth/switch-demo (One-click judge role switcher when DEMO_MODE=true)
  router.post('/api/auth/switch-demo', async (req, res) => {
    if (!DEMO_MODE) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Demo switch disabled in production', requestId: req.id }));
    }

    const body = await parseJsonBody(req);
    const userId = body.userId;

    const user = db.prepare(`
      SELECT u.*, a.name as agency_name, a.code as agency_code
      FROM users u
      LEFT JOIN agencies a ON u.agency_id = a.id
      WHERE u.id = ?
    `).get(userId);

    if (!user) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Demo user not found', requestId: req.id }));
    }

    const { rawToken, expiresAt } = createSession(db, user);
    res.setHeader('Set-Cookie', buildCookieHeader(rawToken, req));

    logAudit(db, {
      tenantId: user.tenant_id,
      actorUserId: user.id,
      actorName: user.name,
      action: 'DEMO_USER_SWITCH',
      resourceType: 'sessions',
      newVal: { role: user.role, email: user.email },
      ip: req.clientIp
    });

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        agency_id: user.agency_id,
        agency_name: user.agency_name,
        agency_code: user.agency_code,
        region: user.region,
        rank: user.rank,
        skills: user.skills
      },
      expiresAt,
      requestId: req.id
    }));
  });
}

module.exports = {
  registerAuthRoutes
};
