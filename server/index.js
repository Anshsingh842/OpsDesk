// server/index.js
// Main entry point for OpsDesk Operations Platform.
// Zero npm dependencies. Built purely on Node.js 22 LTS standard libraries.

const http = require('node:http');
const fs = require('node:fs');
const { HOST, PORT, IS_CLOUD, SEED_ON_START, PORT_FILE, PID_FILE } = require('./config');
const { getDb, closeDb } = require('./db/database');
const { seedDatabase } = require('./db/seed');
const { Router } = require('./http/router');
const { serveStatic } = require('./http/static_files');
const { registerAuthRoutes } = require('./api/auth');
const { registerTicketRoutes } = require('./api/tickets');
const { registerSideConversationRoutes } = require('./api/side_conversations');
const { registerInsightsRoutes } = require('./api/insights');
const { registerDashboardRoutes } = require('./api/dashboard');
const { registerDataRoutes } = require('./api/data');
const { registerConfigRoutes } = require('./api/config');
const { registerAdminRoutes } = require('./api/admin');

// 1. Initialize SQLite Database & Schema
const db = getDb();

// 2. Reseed or ensure seed data exists
if (IS_CLOUD) {
  console.log('[OpsDesk] Cloud mode detected. Reseeding fresh synthetic dataset...');
  seedDatabase(db, true);
} else if (SEED_ON_START) {
  seedDatabase(db, false);
}

// 3. Initialize REST Router
const router = new Router(db);
registerAuthRoutes(router, db);
registerTicketRoutes(router, db);
registerSideConversationRoutes(router, db);
registerInsightsRoutes(router, db);
registerDashboardRoutes(router, db);
registerDataRoutes(router, db);
registerConfigRoutes(router, db);

// 4. Create HTTP Server
let serverInstance = null;

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];

  // Route API and health endpoints
  if (urlPath.startsWith('/api/') || urlPath === '/health') {
    const handled = await router.handle(req, res);
    if (!handled && !res.headersSent) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: true, message: 'API route not found', requestId: req.id }));
    }
    return;
  }

  // Serve static assets from web/
  const served = serveStatic(req, res, urlPath);
  if (!served && !res.headersSent) {
    // Single-page application fallback for root / HTML navigation
    serveStatic(req, res, '/index.html');
  }
});

serverInstance = server;
registerAdminRoutes(router, db, serverInstance);

// Function to attempt listening on PORT, or increment if busy
function startServer(targetPort, attemptsLeft = 10) {
  server.listen(targetPort, HOST, () => {
    const actualPort = server.address().port;
    console.log(`=======================================================`);
    console.log(`  OpsDesk Operations Ticketing Platform`);
    console.log(`  URL: http://${HOST}:${actualPort}`);
    console.log(`  Mode: ${IS_CLOUD ? 'CLOUD (Ephemeral)' : 'LOCAL (Persistent)'}`);
    console.log(`  Database: WAL mode SQLite`);
    console.log(`=======================================================`);

    // Write port and pid files for batch scripts and control tools
    try {
      fs.writeFileSync(PORT_FILE, String(actualPort), 'utf8');
      fs.writeFileSync(PID_FILE, String(process.pid), 'utf8');
    } catch (err) {
      console.warn('Could not write port/pid files:', err.message);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.log(`Port ${targetPort} is in use, attempting port ${targetPort + 1}...`);
      startServer(targetPort + 1, attemptsLeft - 1);
    } else {
      console.error('Fatal server startup error:', err);
      process.exit(1);
    }
  });
}

// 5. Graceful shutdown signals
function handleTermination(signal) {
  console.log(`\nReceived ${signal}. Gracefully stopping OpsDesk...`);
  closeDb();
  server.close(() => {
    // Clean up pid/port files
    try { if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE); } catch (e) {}
    process.exit(0);
  });
}

process.on('SIGINT', () => handleTermination('SIGINT'));
process.on('SIGTERM', () => handleTermination('SIGTERM'));

// Boot
startServer(PORT);
