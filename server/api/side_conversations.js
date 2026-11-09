// server/api/side_conversations.js
// MVP-3: Side conversations with suppliers and external partners.
// Explicit recipient list independent of ticket group, surviving transfers, with recipient snapshots.

const { requireRole } = require('../http/router');
const { parseJsonBody } = require('../http/request_body');
const { getNowISO } = require('../domain/now');
const { maskSensitiveData } = require('../domain/masking');
const { logAudit } = require('../db/audit');

// List of recognized partner domain suffixes for supplier security warnings
const KNOWN_PARTNER_DOMAINS = ['.example', '.test', 'tbo.com', 'hotel.example', 'supplier.example'];

function isKnownDomain(email) {
  if (!email || !email.includes('@')) return false;
  const domain = email.split('@')[1].toLowerCase();
  return KNOWN_PARTNER_DOMAINS.some(d => domain.endsWith(d));
}

function registerSideConversationRoutes(router, db) {
  // GET /api/tickets/:id/side-conversations (Staff only)
  router.get('/api/tickets/:id/side-conversations', requireRole('agent', 'escalation_manager', 'lead'), (req, res) => {
    const ticketId = req.params.id;
    const tenantId = req.user.tenant_id || 'tbo-default';

    const convos = db.prepare(`
      SELECT * FROM side_conversations
      WHERE ticket_id = ? AND tenant_id = ?
      ORDER BY created_at DESC
    `).all(ticketId, tenantId);

    const fullConvos = [];
    for (const c of convos) {
      const recipients = db.prepare(`
        SELECT * FROM side_recipients
        WHERE side_conversation_id = ?
        ORDER BY recipient_type ASC, added_at ASC
      `).all(c.id);

      const messages = db.prepare(`
        SELECT * FROM side_messages
        WHERE side_conversation_id = ?
        ORDER BY created_at ASC
      `).all(c.id);

      fullConvos.push({
        ...c,
        recipients,
        messages: messages.map(m => {
          let snap = [];
          try { snap = JSON.parse(m.recipients_snapshot); } catch (e) {}
          return { ...m, recipientsSnapshot: snap };
        })
      });
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      sideConversations: fullConvos,
      requestId: req.id
    }));
  });

  // POST /api/tickets/:id/side-conversations (Create new thread)
  router.post('/api/tickets/:id/side-conversations', requireRole('agent', 'escalation_manager', 'lead'), async (req, res) => {
    const ticketId = req.params.id;
    const body = await parseJsonBody(req);
    const subject = (body.subject || '').trim();
    const sideType = body.side_type || 'supplier';
    const supplierName = (body.supplier_name || '').trim();
    const initialMessage = (body.initial_message || '').trim();
    const recipientsList = Array.isArray(body.recipients) ? body.recipients : [];

    if (!subject) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Subject is required', requestId: req.id }));
    }
    if (recipientsList.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'At least one recipient is required', requestId: req.id }));
    }

    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
    if (!ticket) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Ticket not found', requestId: req.id }));
    }

    const nowISO = getNowISO();
    const sideConvoId = 'sdc_' + Math.random().toString(36).substring(2, 10);

    db.prepare(`
      INSERT INTO side_conversations (id, tenant_id, ticket_id, subject, side_type, supplier_name, status, created_by_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `).run(sideConvoId, ticket.tenant_id, ticketId, subject, sideType, supplierName, req.user.id, nowISO, nowISO);

    // Insert recipients
    const warnings = [];
    const savedRecipients = [];
    const insertRec = db.prepare(`
      INSERT INTO side_recipients (id, tenant_id, side_conversation_id, email, name, recipient_type, is_known_domain, added_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const r of recipientsList) {
      const email = (r.email || '').trim().toLowerCase();
      const name = (r.name || email).trim();
      const type = r.type === 'cc' ? 'cc' : 'to';
      const known = isKnownDomain(email) ? 1 : 0;
      if (!known) {
        warnings.push(`Recipient domain for ${email} is not in known partner directory.`);
      }

      const recId = 'rec_' + Math.random().toString(36).substring(2, 10);
      insertRec.run(recId, ticket.tenant_id, sideConvoId, email, name, type, known, nowISO);
      savedRecipients.push({ email, name, recipient_type: type, is_known_domain: known });
    }

    // Insert initial message if provided
    if (initialMessage) {
      const masked = maskSensitiveData(initialMessage);
      db.prepare(`
        INSERT INTO side_messages (id, tenant_id, side_conversation_id, sender_user_id, sender_name, body, recipients_snapshot, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('sdm_' + Math.random().toString(36).substring(2, 10), ticket.tenant_id, sideConvoId, req.user.id, req.user.name, masked, JSON.stringify(savedRecipients), nowISO);
    }

    // Timeline event
    db.prepare(`
      INSERT INTO timeline_events (id, tenant_id, ticket_id, event_type, actor_user_id, actor_name, summary, details_json, created_at)
      VALUES (?, ?, ?, 'side_convo_created', ?, ?, ?, ?, ?)
    `).run(
      'tml_' + Math.random().toString(36).substring(2, 10),
      ticket.tenant_id,
      ticketId,
      req.user.id,
      req.user.name,
      `Started side conversation with ${supplierName || 'external partner'}: "${subject}"`,
      JSON.stringify({ sideConversationId: sideConvoId, recipientsCount: savedRecipients.length }),
      nowISO
    );

    logAudit(db, {
      tenantId: ticket.tenant_id,
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: 'SIDE_CONVERSATION_CREATE',
      resourceType: 'side_conversations',
      resourceId: sideConvoId,
      newVal: { subject, supplierName, recipients: savedRecipients }
    });

    res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      success: true,
      sideConversationId: sideConvoId,
      warnings,
      requestId: req.id
    }));
  });

  // POST /api/side-conversations/:id/messages (Send message in thread)
  router.post('/api/side-conversations/:id/messages', requireRole('agent', 'escalation_manager', 'lead'), async (req, res) => {
    const sideConvoId = req.params.id;
    const body = await parseJsonBody(req);
    const rawBody = (body.body || '').trim();

    if (!rawBody) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Message body cannot be empty', requestId: req.id }));
    }

    const sideConvo = db.prepare('SELECT * FROM side_conversations WHERE id = ?').get(sideConvoId);
    if (!sideConvo) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Side conversation not found', requestId: req.id }));
    }

    const currentRecipients = db.prepare('SELECT email, name, recipient_type, is_known_domain FROM side_recipients WHERE side_conversation_id = ?').all(sideConvoId);
    const masked = maskSensitiveData(rawBody);
    const nowISO = getNowISO();

    const msgId = 'sdm_' + Math.random().toString(36).substring(2, 10);
    db.prepare(`
      INSERT INTO side_messages (id, tenant_id, side_conversation_id, sender_user_id, sender_name, body, recipients_snapshot, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(msgId, sideConvo.tenant_id, sideConvoId, req.user.id, req.user.name, masked, JSON.stringify(currentRecipients), nowISO);

    db.prepare(`UPDATE side_conversations SET updated_at = ? WHERE id = ?`).run(nowISO, sideConvoId);

    // Timeline event on ticket
    db.prepare(`
      INSERT INTO timeline_events (id, tenant_id, ticket_id, event_type, actor_user_id, actor_name, summary, details_json, created_at)
      VALUES (?, ?, ?, 'side_convo_message', ?, ?, ?, ?, ?)
    `).run(
      'tml_' + Math.random().toString(36).substring(2, 10),
      sideConvo.tenant_id,
      sideConvo.ticket_id,
      req.user.id,
      req.user.name,
      `Sent reply in side conversation "${sideConvo.subject}" to ${currentRecipients.length} recipients`,
      JSON.stringify({ sideConversationId: sideConvoId, recipientsCount: currentRecipients.length }),
      nowISO
    );

    res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, messageId: msgId, requestId: req.id }));
  });

  // PUT /api/side-conversations/:id/recipients (Update recipient list)
  router.put('/api/side-conversations/:id/recipients', requireRole('agent', 'escalation_manager', 'lead'), async (req, res) => {
    const sideConvoId = req.params.id;
    const body = await parseJsonBody(req);
    const recipientsList = Array.isArray(body.recipients) ? body.recipients : [];

    if (recipientsList.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Side conversation must have at least one recipient', requestId: req.id }));
    }

    const sideConvo = db.prepare('SELECT * FROM side_conversations WHERE id = ?').get(sideConvoId);
    if (!sideConvo) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Side conversation not found', requestId: req.id }));
    }

    const prevRecipients = db.prepare('SELECT * FROM side_recipients WHERE side_conversation_id = ?').all(sideConvoId);
    const nowISO = getNowISO();

    db.prepare('DELETE FROM side_recipients WHERE side_conversation_id = ?').run(sideConvoId);

    const insertRec = db.prepare(`
      INSERT INTO side_recipients (id, tenant_id, side_conversation_id, email, name, recipient_type, is_known_domain, added_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const warnings = [];
    const newSaved = [];
    for (const r of recipientsList) {
      const email = (r.email || '').trim().toLowerCase();
      const name = (r.name || email).trim();
      const type = r.type === 'cc' ? 'cc' : 'to';
      const known = isKnownDomain(email) ? 1 : 0;
      if (!known) {
        warnings.push(`Recipient domain for ${email} is not in known partner directory.`);
      }

      const recId = 'rec_' + Math.random().toString(36).substring(2, 10);
      insertRec.run(recId, sideConvo.tenant_id, sideConvoId, email, name, type, known, nowISO);
      newSaved.push({ email, name, recipient_type: type, is_known_domain: known });
    }

    // Timeline event
    db.prepare(`
      INSERT INTO timeline_events (id, tenant_id, ticket_id, event_type, actor_user_id, actor_name, summary, details_json, created_at)
      VALUES (?, ?, ?, 'recipient_added', ?, ?, ?, ?, ?)
    `).run(
      'tml_' + Math.random().toString(36).substring(2, 10),
      sideConvo.tenant_id,
      sideConvo.ticket_id,
      req.user.id,
      req.user.name,
      `Updated side conversation recipient list (${newSaved.length} recipients)`,
      JSON.stringify({ previousCount: prevRecipients.length, newCount: newSaved.length }),
      nowISO
    );

    logAudit(db, {
      tenantId: sideConvo.tenant_id,
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: 'SIDE_CONVERSATION_RECIPIENTS_UPDATE',
      resourceType: 'side_conversations',
      resourceId: sideConvoId,
      previousVal: prevRecipients,
      newVal: newSaved
    });

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, recipients: newSaved, warnings, requestId: req.id }));
  });
}

module.exports = {
  registerSideConversationRoutes
};
