// server/api/config.js
// Configuration management, simulated demo clock, and agent roster availability toggles.

const { requireRole, requireAuth } = require('../http/router');
const { parseJsonBody } = require('../http/request_body');
const { getNow, getNowISO, setSimulatedNow, getSimulatedNow, formatIST } = require('../domain/now');
const { logAudit } = require('../db/audit');

function registerConfigRoutes(router, db) {
  // GET /api/config
  router.get('/api/config', requireRole('lead'), (req, res) => {
    const rows = db.prepare('SELECT key, value, description, updated_at FROM app_config').all();
    const configMap = Object.fromEntries(rows.map(r => [r.key, { value: r.value, description: r.description, updated_at: r.updated_at }]));

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      config: configMap,
      requestId: req.id
    }));
  });

  // PUT /api/config
  router.put('/api/config', requireRole('lead'), async (req, res) => {
    const body = await parseJsonBody(req);
    const updates = body.updates || {};
    const nowISO = getNowISO();

    const stmt = db.prepare('INSERT OR REPLACE INTO app_config (key, value, description, updated_at) VALUES (?, ?, (SELECT description FROM app_config WHERE key = ?), ?)');

    for (const [key, val] of Object.entries(updates)) {
      stmt.run(key, String(val), key, nowISO);
    }

    logAudit(db, {
      tenantId: req.user.tenant_id,
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: 'APP_CONFIG_UPDATE',
      resourceType: 'app_config',
      newVal: updates
    });

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, message: 'Settings saved successfully', requestId: req.id }));
  });

  // GET /api/clock (Current system time vs simulated clock)
  router.get('/api/clock', requireAuth, (req, res) => {
    const now = getNow();
    const sim = getSimulatedNow();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      currentNowUTC: now.toISOString(),
      currentNowIST: formatIST(now),
      simulatedNowUTC: sim,
      isSimulated: sim !== null,
      requestId: req.id
    }));
  });

  // POST /api/clock (Set or clear simulated demo clock)
  router.post('/api/clock', requireRole('lead'), async (req, res) => {
    const body = await parseJsonBody(req);
    const targetISO = body.simulatedNow || null; // null clears simulated clock

    try {
      const active = setSimulatedNow(targetISO);
      logAudit(db, {
        tenantId: req.user.tenant_id,
        actorUserId: req.user.id,
        actorName: req.user.name,
        action: 'DEMO_CLOCK_SET',
        resourceType: 'system_clock',
        newVal: active
      });

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        simulatedNow: active,
        currentNowIST: formatIST(getNow()),
        isSimulated: active !== null,
        requestId: req.id
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: true, message: err.message, requestId: req.id }));
    }
  });

  // GET /api/agents (Agent roster list)
  router.get('/api/agents', requireRole('lead', 'agent', 'escalation_manager'), (req, res) => {
    const agents = db.prepare(`
      SELECT id, name, email, role, region, shift_start, shift_end, skills, rank, is_available
      FROM users
      WHERE role IN ('agent', 'escalation_manager')
      ORDER BY role ASC, name ASC
    `).all();

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ agents, requestId: req.id }));
  });

  // POST /api/agents/:id/availability (Toggle availability)
  router.post('/api/agents/:id/availability', requireRole('lead'), async (req, res) => {
    const agentId = req.params.id;
    const body = await parseJsonBody(req);
    const isAvailable = body.isAvailable ? 1 : 0;

    const user = db.prepare('SELECT id, name, is_available FROM users WHERE id = ?').get(agentId);
    if (!user) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Agent not found', requestId: req.id }));
    }

    db.prepare('UPDATE users SET is_available = ? WHERE id = ?').run(isAvailable, agentId);

    logAudit(db, {
      tenantId: req.user.tenant_id,
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: 'AGENT_AVAILABILITY_TOGGLE',
      resourceType: 'users',
      resourceId: agentId,
      previousVal: user.is_available,
      newVal: isAvailable
    });

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      success: true,
      agentId,
      name: user.name,
      isAvailable: isAvailable === 1,
      requestId: req.id
    }));
  });
}

module.exports = {
  registerConfigRoutes
};
