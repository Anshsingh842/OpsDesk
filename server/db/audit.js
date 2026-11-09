// server/db/audit.js
// S12: Append-only audit logger.
// Immutable record of all state mutations, assignments, escalations, and permission changes.

const { getNowISO } = require('../domain/now');

function logAudit(db, {
  tenantId = 'tbo-default',
  actorUserId = null,
  actorName = 'System',
  action,
  resourceType,
  resourceId = null,
  previousVal = null,
  newVal = null,
  ip = null,
  userAgent = null
}) {
  try {
    const prevStr = previousVal !== null && typeof previousVal === 'object' ? JSON.stringify(previousVal) : previousVal;
    const newStr = newVal !== null && typeof newVal === 'object' ? JSON.stringify(newVal) : newVal;

    const stmt = db.prepare(`
      INSERT INTO audit_log (tenant_id, actor_user_id, actor_name, action, resource_type, resource_id, previous_val, new_val, ip, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      tenantId,
      actorUserId,
      actorName,
      action,
      resourceType,
      resourceId,
      prevStr,
      newStr,
      ip,
      userAgent,
      getNowISO()
    );
  } catch (err) {
    // Audit log failure must not crash business operation, but should be logged to stderr
    console.error('[AUDIT_LOG_ERROR]', err.message);
  }
}

module.exports = {
  logAudit
};
