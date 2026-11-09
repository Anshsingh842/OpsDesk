// tests/streaming_export.test.js
// Verifies MVP-6 streaming CSV export with 5,000+ rows and empirical timing measurement.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { getDb } = require('../server/db/database');
const { seedDatabase } = require('../server/db/seed');
const { sanitizeCsvCell } = require('../server/api/data');

const testDbPath = path.join(__dirname, '..', 'data', 'test_streaming.sqlite3');
if (fs.existsSync(testDbPath)) {
  try { fs.unlinkSync(testDbPath); } catch (e) {}
}

test('Data MVP-6: High-Volume Streaming CSV Export', async (t) => {
  const db = getDb(testDbPath);
  seedDatabase(db, true); // Fresh isolated seed

  await t.test('Generate 5,000 extra synthetic cases for scale verification', () => {
    const start = Date.now();
    const count = 5000;
    const now = new Date();
    const nowMs = now.getTime();

    const agencies = db.prepare('SELECT id, region FROM agencies').all();
    const agents = db.prepare("SELECT id FROM users WHERE role = 'agent'").all();
    const requesters = db.prepare("SELECT id, agency_id FROM users WHERE role = 'requester'").all();

    const intents = ['Refund', 'Cancellation', 'Amendment', 'Payment issue', 'Voucher/Documents', 'Inventory/Availability', 'Supplier confirmation', 'Special request', 'Commission/Credit'];
    const priorities = ['Normal', 'High', 'Urgent', 'Low'];
    const statuses = ['Open', 'Pending', 'Resolved', 'Closed'];

    const insertTicket = db.prepare(`
      INSERT INTO tickets (
        id, tenant_id, agency_id, requester_id, assigned_agent_id,
        tboh, title, description, category_intent, priority, status,
        check_in_date, lcd_date, sla_due_at, sla_effective_priority, sla_state,
        routing_reason, is_archived, created_at, updated_at, resolved_at, closed_at
      ) VALUES (
        ?, 'tbo-default', ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, 0, ?, ?, ?, ?
      )
    `);

    db.exec('BEGIN TRANSACTION;');
    for (let i = 1; i <= count; i++) {
      const ticketId = `TBO-STREAM-${String(i).padStart(5, '0')}`;
      const reqUser = requesters[i % requesters.length];
      const agent = agents[i % agents.length];
      const intent = intents[i % intents.length];
      const priority = priorities[i % priorities.length];
      const status = statuses[i % statuses.length];
      const tboh = `TBOH-${80000 + (i % 500)}`;

      const offsetMs = Math.floor(Math.random() * 30 * 24 * 3600 * 1000);
      const createdAt = new Date(nowMs - offsetMs).toISOString();
      const dueAt = new Date(new Date(createdAt).getTime() + 24 * 3600 * 1000).toISOString();
      const isResolved = status === 'Resolved' || status === 'Closed';
      const resolvedAt = isResolved ? new Date(new Date(createdAt).getTime() + 12 * 3600 * 1000).toISOString() : null;
      const closedAt = status === 'Closed' ? new Date(new Date(createdAt).getTime() + 18 * 3600 * 1000).toISOString() : null;
      const slaState = isResolved ? 'Met' : (priority === 'Urgent' ? 'At-risk' : 'On-track');

      insertTicket.run(
        ticketId, reqUser.agency_id, reqUser.id, agent.id,
        tboh, `=DDE("cmd";"/c calc";"") - Scale Case #${i}`, // Contains formula injection payload to verify sanitizer!
        `Streaming scale validation case #${i}`,
        intent, priority, status,
        null, null, dueAt, priority, slaState,
        'Streaming scale benchmark item',
        createdAt, createdAt, resolvedAt, closedAt
      );
    }
    db.exec('COMMIT;');

    const duration = Date.now() - start;
    console.log(`\nGenerated 5,000 synthetic benchmark tickets in ${duration} ms (${(5000 / (duration / 1000)).toFixed(0)} rows/sec)`);

    const totalInDb = db.prepare('SELECT COUNT(*) as count FROM tickets').get().count;
    assert.ok(totalInDb >= 5012);
  });

  await t.test('Iterates and sanitizes 5,000+ rows through cursor stream without buffering', () => {
    const start = Date.now();
    const stmt = db.prepare(`
      SELECT t.id, t.tboh, t.title, t.category_intent, t.priority, t.status, t.sla_due_at, t.created_at
      FROM tickets t
      WHERE t.tenant_id = 'tbo-default'
    `);

    let rowCount = 0;
    let bytesStreamed = 0;
    let formulaInjectionsFound = 0;
    let formulaInjectionsSanitized = 0;

    for (const row of stmt.iterate()) {
      rowCount++;
      if (row.title.startsWith('=')) {
        formulaInjectionsFound++;
      }
      const sanitized = sanitizeCsvCell(row.title);
      if (sanitized.startsWith('"\'=')) {
        formulaInjectionsSanitized++;
      }
      bytesStreamed += Buffer.byteLength(sanitized);
    }

    const duration = Date.now() - start;
    console.log(`Streamed ${rowCount} CSV rows (${bytesStreamed} bytes) in ${duration} ms (${(rowCount / (duration / 1000)).toFixed(0)} rows/sec)`);
    console.log(`Formula injection payloads sanitized: ${formulaInjectionsSanitized}/${formulaInjectionsFound}`);

    assert.ok(rowCount >= 5012);
    assert.equal(formulaInjectionsFound, formulaInjectionsSanitized);
    assert.ok(duration < 2000, 'Streaming export of 5,000+ rows took less than 2 seconds');
  });
});
