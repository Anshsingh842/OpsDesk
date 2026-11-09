// server/domain/linking.js
// MVP-1 & Design Decision: First-class ticket linkage.
// Automatically links tickets by TBOH (strong) and Agency + Intent within 30 days (medium).
// Supports manual link/unlink with timeline and audit tracking.

const { getNow, getNowISO } = require('./now');
const { logAudit } = require('../db/audit');

function normalizePair(id1, id2) {
  return id1 < id2 ? [id1, id2] : [id2, id1];
}

function autoLinkTicket(db, ticket) {
  const linksCreated = [];
  const now = getNow();
  const nowISO = now.toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)).toISOString();

  // 1. Strong Link: Same TBOH
  if (ticket.tboh && ticket.tboh.trim().length > 0) {
    const matchingTbohTickets = db.prepare(`
      SELECT id, title, created_at FROM tickets
      WHERE tenant_id = ? AND tboh = ? AND id != ?
      ORDER BY created_at ASC
    `).all(ticket.tenant_id, ticket.tboh.trim(), ticket.id);

    for (const match of matchingTbohTickets) {
      const [t1, t2] = normalizePair(ticket.id, match.id);
      const exists = db.prepare(`
        SELECT id FROM ticket_links WHERE ticket_id_1 = ? AND ticket_id_2 = ?
      `).get(t1, t2);

      if (!exists) {
        const linkId = 'lnk_' + Math.random().toString(36).substring(2, 10);
        db.prepare(`
          INSERT INTO ticket_links (id, tenant_id, ticket_id_1, ticket_id_2, link_type, link_reason, created_by_user_id, created_at)
          VALUES (?, ?, ?, ?, 'strong_tboh', ?, NULL, ?)
        `).run(linkId, ticket.tenant_id, t1, t2, `Shared TBOH reference: ${ticket.tboh}`, nowISO);

        linksCreated.push({ otherTicketId: match.id, linkType: 'strong_tboh', reason: `Shared TBOH: ${ticket.tboh}` });
      }
    }
  }

  // 2. Medium Link: Same Agency + Same Category/Intent within 30 days
  if (ticket.agency_id && ticket.category_intent) {
    const matchingIntentTickets = db.prepare(`
      SELECT id, title, created_at FROM tickets
      WHERE tenant_id = ? AND agency_id = ? AND category_intent = ? AND id != ? AND created_at >= ?
      ORDER BY created_at ASC
    `).all(ticket.tenant_id, ticket.agency_id, ticket.category_intent, ticket.id, thirtyDaysAgo);

    for (const match of matchingIntentTickets) {
      const [t1, t2] = normalizePair(ticket.id, match.id);
      const exists = db.prepare(`
        SELECT id FROM ticket_links WHERE ticket_id_1 = ? AND ticket_id_2 = ?
      `).get(t1, t2);

      if (!exists) {
        const linkId = 'lnk_' + Math.random().toString(36).substring(2, 10);
        db.prepare(`
          INSERT INTO ticket_links (id, tenant_id, ticket_id_1, ticket_id_2, link_type, link_reason, created_by_user_id, created_at)
          VALUES (?, ?, ?, ?, 'medium_intent_agency', ?, NULL, ?)
        `).run(linkId, ticket.tenant_id, t1, t2, `Same agency and intent (${ticket.category_intent}) within 30 days`, nowISO);

        linksCreated.push({ otherTicketId: match.id, linkType: 'medium_intent_agency', reason: `Same intent within 30 days` });
      }
    }
  }

  return linksCreated;
}

function getLinkedTicketsForTicket(db, ticketId, tenantId = 'tbo-default') {
  const links = db.prepare(`
    SELECT l.id as link_id, l.link_type, l.link_reason, l.created_at as linked_at,
      CASE WHEN l.ticket_id_1 = ? THEN l.ticket_id_2 ELSE l.ticket_id_1 END as other_ticket_id
    FROM ticket_links l
    WHERE (l.ticket_id_1 = ? OR l.ticket_id_2 = ?) AND l.tenant_id = ?
  `).all(ticketId, ticketId, ticketId, tenantId);

  const results = [];
  for (const link of links) {
    const otherTicket = db.prepare(`
      SELECT t.id, t.title, t.status, t.priority, t.category_intent, t.tboh, t.created_at, a.name as agency_name
      FROM tickets t
      LEFT JOIN agencies a ON t.agency_id = a.id
      WHERE t.id = ?
    `).get(link.other_ticket_id);

    if (otherTicket) {
      results.push({
        linkId: link.link_id,
        linkType: link.link_type,
        linkReason: link.link_reason,
        linkedAt: link.linked_at,
        ticket: otherTicket
      });
    }
  }

  return results;
}

function manualLink(db, ticketId1, ticketId2, user) {
  if (ticketId1 === ticketId2) throw new Error('Cannot link a ticket to itself');
  const [t1, t2] = normalizePair(ticketId1, ticketId2);

  const exists = db.prepare(`SELECT id FROM ticket_links WHERE ticket_id_1 = ? AND ticket_id_2 = ?`).get(t1, t2);
  if (exists) throw new Error('Tickets are already linked');

  const linkId = 'lnk_' + Math.random().toString(36).substring(2, 10);
  const nowISO = getNowISO();

  db.prepare(`
    INSERT INTO ticket_links (id, tenant_id, ticket_id_1, ticket_id_2, link_type, link_reason, created_by_user_id, created_at)
    VALUES (?, ?, ?, ?, 'manual', ?, ?, ?)
  `).run(linkId, user.tenant_id || 'tbo-default', t1, t2, `Manually linked by ${user.name}`, user.id, nowISO);

  // Timeline entries for both tickets
  const insertTimeline = db.prepare(`
    INSERT INTO timeline_events (id, tenant_id, ticket_id, event_type, actor_user_id, actor_name, summary, details_json, created_at)
    VALUES (?, ?, ?, 'linked', ?, ?, ?, ?, ?)
  `);

  insertTimeline.run(
    'tml_' + Math.random().toString(36).substring(2, 10),
    user.tenant_id || 'tbo-default',
    ticketId1,
    user.id,
    user.name,
    `Linked to case ${ticketId2}`,
    JSON.stringify({ targetTicketId: ticketId2, linkType: 'manual' }),
    nowISO
  );

  insertTimeline.run(
    'tml_' + Math.random().toString(36).substring(2, 10),
    user.tenant_id || 'tbo-default',
    ticketId2,
    user.id,
    user.name,
    `Linked to case ${ticketId1}`,
    JSON.stringify({ targetTicketId: ticketId1, linkType: 'manual' }),
    nowISO
  );

  logAudit(db, {
    tenantId: user.tenant_id,
    actorUserId: user.id,
    actorName: user.name,
    action: 'TICKET_LINK_MANUAL',
    resourceType: 'ticket_links',
    resourceId: linkId,
    newVal: { ticketId1, ticketId2 }
  });

  return linkId;
}

function manualUnlink(db, linkId, user) {
  const link = db.prepare(`SELECT * FROM ticket_links WHERE id = ?`).get(linkId);
  if (!link) throw new Error('Link not found');

  db.prepare(`DELETE FROM ticket_links WHERE id = ?`).run(linkId);
  const nowISO = getNowISO();

  const insertTimeline = db.prepare(`
    INSERT INTO timeline_events (id, tenant_id, ticket_id, event_type, actor_user_id, actor_name, summary, details_json, created_at)
    VALUES (?, ?, ?, 'unlinked', ?, ?, ?, ?, ?)
  `);

  insertTimeline.run(
    'tml_' + Math.random().toString(36).substring(2, 10),
    user.tenant_id || 'tbo-default',
    link.ticket_id_1,
    user.id,
    user.name,
    `Unlinked from case ${link.ticket_id_2}`,
    JSON.stringify({ otherTicketId: link.ticket_id_2 }),
    nowISO
  );

  insertTimeline.run(
    'tml_' + Math.random().toString(36).substring(2, 10),
    user.tenant_id || 'tbo-default',
    link.ticket_id_2,
    user.id,
    user.name,
    `Unlinked from case ${link.ticket_id_1}`,
    JSON.stringify({ otherTicketId: link.ticket_id_1 }),
    nowISO
  );

  logAudit(db, {
    tenantId: user.tenant_id,
    actorUserId: user.id,
    actorName: user.name,
    action: 'TICKET_UNLINK_MANUAL',
    resourceType: 'ticket_links',
    resourceId: linkId,
    previousVal: link
  });

  return true;
}

module.exports = {
  autoLinkTicket,
  getLinkedTicketsForTicket,
  manualLink,
  manualUnlink
};
