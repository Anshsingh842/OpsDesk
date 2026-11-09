// server/auth/sessions.js
// S3: Secure session handling with hashed tokens, idle & absolute timeouts, and server-side invalidation.

const crypto = require('node:crypto');
const { getNow } = require('../domain/now');

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;       // 30 minutes
const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours
const COOKIE_NAME = 'opsdesk_session';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createSession(db, user) {
  const rawToken = crypto.randomBytes(32).toString('hex'); // 256-bit random token
  const tokenHash = hashToken(rawToken);
  const sessionId = 'ses_' + crypto.randomBytes(12).toString('hex');
  const now = getNow();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + IDLE_TIMEOUT_MS).toISOString();
  const absoluteExpiresAt = new Date(now.getTime() + ABSOLUTE_TIMEOUT_MS).toISOString();

  const stmt = db.prepare(`
    INSERT INTO sessions (id, token_hash, user_id, tenant_id, created_at, last_active_at, expires_at, absolute_expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(sessionId, tokenHash, user.id, user.tenant_id, createdAt, createdAt, expiresAt, absoluteExpiresAt);

  return { rawToken, expiresAt };
}

function validateSession(db, rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return null;

  const tokenHash = hashToken(rawToken);
  const now = getNow();
  const nowISO = now.toISOString();

  const session = db.prepare(`
    SELECT s.*, u.email, u.name, u.role, u.agency_id, u.region, u.rank, u.skills, u.is_available, a.name as agency_name, a.code as agency_code
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    LEFT JOIN agencies a ON u.agency_id = a.id
    WHERE s.token_hash = ?
  `).get(tokenHash);

  if (!session) return null;

  // Check absolute and idle timeouts
  if (nowISO > session.absolute_expires_at || nowISO > session.expires_at) {
    // Session expired; remove it
    db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
    return null;
  }

  // Update rolling idle expiration
  const newIdleExpires = new Date(now.getTime() + IDLE_TIMEOUT_MS).toISOString();
  // Ensure we do not extend past absolute expiration
  const effectiveExpires = newIdleExpires < session.absolute_expires_at ? newIdleExpires : session.absolute_expires_at;

  db.prepare(`
    UPDATE sessions
    SET last_active_at = ?, expires_at = ?
    WHERE token_hash = ?
  `).run(nowISO, effectiveExpires, tokenHash);

  return session;
}

function destroySession(db, rawToken) {
  if (!rawToken) return;
  const tokenHash = hashToken(rawToken);
  db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
}

function clearExpiredSessions(db) {
  const nowISO = getNow().toISOString();
  db.prepare(`DELETE FROM sessions WHERE expires_at < ? OR absolute_expires_at < ?`).run(nowISO, nowISO);
}

function buildCookieHeader(rawToken, req) {
  const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
  const secureFlag = isHttps ? '; Secure' : '';
  // Max-age 8 hours (absolute max)
  return `${COOKIE_NAME}=${rawToken}; Path=/; HttpOnly; SameSite=Strict${secureFlag}; Max-Age=28800`;
}

function buildClearCookieHeader(req) {
  const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
  const secureFlag = isHttps ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict${secureFlag}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

function parseCookie(req) {
  const header = req.headers.cookie;
  if (!header) return null;
  const match = header.split(';').map(c => c.trim()).find(c => c.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  return match.substring(COOKIE_NAME.length + 1);
}

module.exports = {
  COOKIE_NAME,
  createSession,
  validateSession,
  destroySession,
  clearExpiredSessions,
  buildCookieHeader,
  buildClearCookieHeader,
  parseCookie
};
