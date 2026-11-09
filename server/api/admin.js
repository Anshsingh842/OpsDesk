// server/api/admin.js
// Health check and authenticated local-only graceful shutdown control channel.

const { IS_CLOUD, SHUTDOWN_TOKEN } = require('../config');
const { closeDb } = require('../db/database');
const { parseJsonBody } = require('../http/request_body');

function registerAdminRoutes(router, db, serverInstance) {
  // GET /health
  router.get('/health', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      status: 'ok',
      product: 'OpsDesk',
      version: '1.0.0',
      uptime: Math.round(process.uptime()),
      mode: IS_CLOUD ? 'CLOUD' : 'LOCAL',
      timestamp: new Date().toISOString()
    }));
  });

  // POST /api/admin/shutdown (S13: Local-only, token-protected control channel)
  router.post('/api/admin/shutdown', async (req, res) => {
    // Disabled in CLOUD mode
    if (IS_CLOUD) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Shutdown endpoint disabled in cloud deployment' }));
    }

    // Local IP check (127.0.0.1 or ::1)
    const remoteIp = req.socket.remoteAddress;
    const isLocal = remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1';
    if (!isLocal) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Access denied: Local requests only' }));
    }

    // Check token
    let passedToken = req.headers['x-shutdown-token'];
    if (!passedToken) {
      try {
        const body = await parseJsonBody(req);
        passedToken = body.token;
      } catch (e) {}
    }

    if (!passedToken || passedToken !== SHUTDOWN_TOKEN) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Unauthorized: Invalid shutdown token' }));
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, message: 'OpsDesk stopping gracefully...' }));

    // Graceful cleanup
    setTimeout(() => {
      console.log('OpsDesk server shutting down gracefully on control request...');
      closeDb();
      if (serverInstance) {
        serverInstance.close(() => {
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    }, 200);
  });
}

module.exports = {
  registerAdminRoutes
};
