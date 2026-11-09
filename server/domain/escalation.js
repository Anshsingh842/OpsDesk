// server/domain/escalation.js
// MVP-4 & Design Decision: First-class escalation workflow.
// Mandatory reason, region-based EM assignment with lowest load, and full timeline auditing.

const { getNowISO } = require('./now');
const { logAudit } = require('../db/audit');

function findEscalationManager(db, ticketRegion) {
  const managers = db.prepare(`
    SELECT u.id, u.name, u.email, u.region,
      (SELECT COUNT(*) FROM tickets t WHERE t.escalation_manager_id = u.id AND t.status = 'Escalated') as load
    FROM users u
    WHERE u.role = 'escalation_manager' AND u.is_available = 1
    ORDER BY
      CASE WHEN LOWER(u.region) = LOWER(?) THEN 0 ELSE 1 END,
      load ASC
  `).all(ticketRegion || '');

  return managers.length > 0 ? managers[0] : null;
}

function escalateTicket(db, ticketId, reason, actorUser) {
  if (!reason || reason.trim().length < 5) {
    throw new Error('Mandatory escalation reason required (minimum 5 characters).');
  }

  const ticket = db.prepare(`
    SELECT t.*, a.region as agency_region
    FROM tickets t
    LEFT JOIN agencies a ON t.agency_id = a.id
    WHERE t.id = ?
  `).get(ticketId);

  if (!ticket) throw new Error('Ticket not found');

  const em = findEscalationManager(db, ticket.agency_region);
  const nowISO = getNowISO();

  const prevOwner = ticket.assigned_agent_id;
  const newEmId = em ? em.id : null;
  const newEmName = em ? em.name : 'Unassigned EM Queue';

  db.prepare(`
    UPDATE tickets
    SET status = 'Escalated',
        escalation_manager_id = ?,
        previous_agent_id = ?,
        escalation_reason = ?,
        escalated_at = ?,
        escalated_by = ?,
        updated_at = ?
    WHERE id = ?
  `).run(newEmId, prevOwner, reason.trim(), nowISO, actorUser.name, nowISO, ticketId);

  // Timeline entry
  db.prepare(`
    INSERT INTO timeline_events (id, tenant_id, ticket_id, event_type, actor_user_id, actor_name, summary, details_json, created_at)
    VALUES (?, ?, ?, 'escalated', ?, ?, ?, ?, ?)
  `).run(
    'tml_' + Math.random().toString(36).substring(2, 10),
    ticket.tenant_id,
    ticketId,
    actorUser.id,
    actorUser.name,
    `Escalated to ${newEmName}. Reason: ${reason.trim()}`,
    JSON.stringify({
      previousOwnerId: prevOwner,
      escalationManagerId: newEmId,
      escalationManagerName: newEmName,
      reason: reason.trim()
    }),
    nowISO
  );

  logAudit(db, {
    tenantId: ticket.tenant_id,
    actorUserId: actorUser.id,
    actorName: actorUser.name,
    action: 'TICKET_ESCALATE',
    resourceType: 'tickets',
    resourceId: ticketId,
    previousVal: { status: ticket.status, assigned_agent_id: ticket.assigned_agent_id },
    newVal: { status: 'Escalated', escalation_manager_id: newEmId, reason }
  });

  return { emId: newEmId, emName: newEmName };
}

function handBackTicket(db, ticketId, notes, actorUser) {
  const ticket = db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(ticketId);
  if (!ticket) throw new Error('Ticket not found');

  const returnAgentId = ticket.previous_agent_id || ticket.assigned_agent_id;
  const nowISO = getNowISO();

  db.prepare(`
    UPDATE tickets
    SET status = 'Open',
        escalation_manager_id = NULL,
        assigned_agent_id = ?,
        updated_at = ?
    WHERE id = ?
  `).run(returnAgentId, nowISO, ticketId);

  // Timeline entry
  db.prepare(`
    INSERT INTO timeline_events (id, tenant_id, ticket_id, event_type, actor_user_id, actor_name, summary, details_json, created_at)
    VALUES (?, ?, ?, 'deescalated', ?, ?, ?, ?, ?)
  `).run(
    'tml_' + Math.random().toString(36).substring(2, 10),
    ticket.tenant_id,
    ticketId,
    actorUser.id,
    actorUser.name,
    `Handed back from Escalation to agent queue. Notes: ${notes || 'Action completed'}`,
    JSON.stringify({ notes }),
    nowISO
  );

  logAudit(db, {
    tenantId: ticket.tenant_id,
    actorUserId: actorUser.id,
    actorName: actorUser.name,
    action: 'TICKET_HANDBACK',
    resourceType: 'tickets',
    resourceId: ticketId,
    previousVal: { status: 'Escalated', em_id: ticket.escalation_manager_id },
    newVal: { status: 'Open', assigned_agent_id: returnAgentId }
  });

  return true;
}

module.exports = {
  findEscalationManager,
  escalateTicket,
  handBackTicket
};
