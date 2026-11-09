// server/db/database.js
// SQLite database connection using native node:sqlite DatabaseSync with WAL mode and schema migrations.

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { DB_PATH } = require('../config');
const { SCHEMA_V1 } = require('./schema');
const { getNowISO } = require('../domain/now');

let dbInstance = null;

function getDb(customPath = null) {
  if (dbInstance && !customPath) return dbInstance;

  const targetPath = customPath || DB_PATH;
  const dbDir = path.dirname(targetPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new DatabaseSync(targetPath);

  // Performance and durability pragmas
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA busy_timeout = 5000;');

  // Run migrations
  migrate(db);

  if (!customPath) {
    dbInstance = db;
  }
  return db;
}

function migrate(db) {
  // Ensure schema_migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = db.prepare('SELECT version FROM schema_migrations ORDER BY version ASC').all();
  const appliedVersions = new Set(applied.map(m => m.version));

  if (!appliedVersions.has(1)) {
    // Apply V1
    db.exec(SCHEMA_V1);

    // Seed default app_config if not present
    const insertConfig = db.prepare('INSERT OR IGNORE INTO app_config (key, value, description, updated_at) VALUES (?, ?, ?, ?)');
    const now = getNowISO();
    insertConfig.run('retention_days', '90', 'Days after closure before ticket is archived (our design choice)', now);
    insertConfig.run('sla_urgent_hours', '2', 'Base SLA for urgent tickets (our design choice)', now);
    insertConfig.run('sla_high_hours', '8', 'Base SLA for high priority tickets (our design choice)', now);
    insertConfig.run('sla_normal_hours', '24', 'Base SLA for normal priority tickets (our design choice)', now);
    insertConfig.run('sla_low_hours', '72', 'Base SLA for low priority tickets (our design choice)', now);
    insertConfig.run('simulated_regional_calendar', 'false', 'Simulated regional holiday/calendar buffer (simulated)', now);

    db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
      1,
      '001_initial_schema',
      now
    );
  }
}

function closeDb() {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch (err) {
      // ignore on exit
    }
    dbInstance = null;
  }
}

module.exports = {
  getDb,
  closeDb
};
