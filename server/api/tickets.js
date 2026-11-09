// server/api/tickets.js
// MVP-1, MVP-2, MVP-4: Ticket lifecycle, queues, linking, and server-side state machine.

const { requireAuth, requireRole } = require('../http/router');
const { parseJsonBody } = require('../http/request_body');
const { getNow, getNowISO } = require('../domain/now');
const { maskSensitiveData } = require('../domain/masking');
const { suggestIntent, INTENT_TAXONOMY } = require('../domain/intent');
const { calculateSla, BASE_HOURS } = require('../domain/sla');
const { routeTicket } = require('../domain/routing');
const { autoLinkTicket, getLinkedTicketsForTicket, manualLink, manualUnlink } = require('../domain/linking');
const { escalateTicket, handBackTicket } = require('../domain/escalation');
const { logAudit } = require('../db/audit');

const ALLOWED_STATUSES = ['New', 'Open', 'Pending', 'Escalated', 'Resolved', 'Closed'];
const ALLOWED_PRIORITIES = ['Urgent', 'High', 'Normal', 'Low'];

// Server-enforced status transition matrix
const ALLOWED_TRANSITIONS = {
  New: ['Open', 'Pending', 'Escalated', 'Resolved', 'Closed'],
  Open: ['Pending', 'Escalated', 'Resolved', 'Closed'],
  Pending: ['Open', 'Escalated', 'Resolved', 'Closed'],
  Escalated: ['Open', 'Resolved', 'Closed'],
  Resolved: ['Open', 'Closed'],
  Closed: ['Open'] // Reopen allowed by staff
};

function registerTicketRoutes(router, db) {
  // GET /api/queues/counts
  router.get('/api/queues/counts', requireAuth, (req, res) => {
    const isReq = req.user.role === 'requester';
    const agencyFilter = isReq ? req.user.agency_id : null;
    const tenantId = req.user.tenant_id || 'tbo-default';

    let baseQuery = `FROM tickets WHERE tenant_id = ? AND is_archived = 0`;
    const params = [tenantId];
    if (agencyFilter) {
      baseQuery += ` AND agency_id = ?`;
      params.push(agencyFilter);
    }

    const counts = {
      all: db.prepare(`SELECT COUNT(*) as count ${baseQuery}`).get(...params).count,
      triage: isReq ? 0 : db.prepare(`SELECT COUNT(*) as count ${baseQuery} AND assigned_agent_id IS NULL AND status IN ('New', 'Open')`).get(...params).count,
      my: isReq ? 0 : db.prepare(`SELECT COUNT(*) as count ${baseQuery} AND assigned_agent_id = ? AND status IN ('New', 'Open', 'Pending', 'Escalated')`).get(...params, req.user.id).count,
      escalated: db.prepare(`SELECT COUNT(*) as count ${baseQuery} AND status = 'Escalated' ${req.user.role === 'escalation_manager' ? 'AND escalation_manager_id = ?' : ''}`).get(...params, ...(req.user.role === 'escalation_manager' ? [req.user.id] : [])).count,
      at_risk: db.prepare(`SELECT COUNT(*) as count ${baseQuery} AND sla_state = 'At-risk' AND status NOT IN ('Resolved', 'Closed')`).get(...params).count,
      breached: db.prepare(`SELECT COUNT(*) as count ${baseQuery} AND sla_state = 'Breached' AND status NOT IN ('Resolved', 'Closed')`).get(...params).count,
      archived: db.prepare(`SELECT COUNT(*) as count FROM tickets WHERE tenant_id = ? AND is_archived = 1 ${agencyFilter ? 'AND agency_id = ?' : ''}`).get(tenantId, ...(agencyFilter ? [agencyFilter] : [])).count
    };

    // Region distribution
    const regionRows = db.prepare(`
      SELECT a.region, COUNT(t.id) as count
      FROM tickets t
      JOIN agencies a ON t.agency_id = a.id
      WHERE t.tenant_id = ? AND t.is_archived = 0 ${agencyFilter ? 'AND t.agency_id = ?' : ''}
      GROUP BY a.region
    `).all(tenantId, ...(agencyFilter ? [agencyFilter] : []));

    // Intent distribution
    const intentRows = db.prepare(`
      SELECT category_intent, COUNT(*) as count
      ${baseQuery}
      GROUP BY category_intent
    `).all(...params);

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      counts,
      regions: Object.fromEntries(regionRows.map(r => [r.region, r.count])),
      intents: Object.fromEntries(intentRows.map(i => [i.category_intent, i.count])),
      requestId: req.id
    }));
  });

  // GET /api/tickets
  router.get('/api/tickets', requireAuth, (req, res) => {
    const isReq = req.user.role === 'requester';
    const tenantId = req.user.tenant_id || 'tbo-default';
    const queue = req.query.queue || 'all';
    const region = req.query.region;
    const intent = req.query.intent;
    const status = req.query.status;
    const searchQuery = (req.query.q || '').trim();
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '25', 10)));
    const cursor = req.query.cursor; // ISO timestamp for cursor pagination

    let whereClauses = ['t.tenant_id = ?'];
    let params = [tenantId];

    // S1: Strict Requester IDOR isolation
    if (isReq) {
      whereClauses.push('t.agency_id = ?');
      params.push(req.user.agency_id);
    }

    // Queue filter
    if (queue === 'triage') {
      whereClauses.push("t.assigned_agent_id IS NULL AND t.status IN ('New', 'Open') AND t.is_archived = 0");
    } else if (queue === 'my') {
      whereClauses.push("t.assigned_agent_id = ? AND t.status IN ('New', 'Open', 'Pending', 'Escalated') AND t.is_archived = 0");
      params.push(req.user.id);
    } else if (queue === 'escalated') {
      whereClauses.push("t.status = 'Escalated' AND t.is_archived = 0");
      if (req.user.role === 'escalation_manager') {
        whereClauses.push('t.escalation_manager_id = ?');
        params.push(req.user.id);
      }
    } else if (queue === 'at_risk') {
      whereClauses.push("t.sla_state = 'At-risk' AND t.status NOT IN ('Resolved', 'Closed') AND t.is_archived = 0");
    } else if (queue === 'breached') {
      whereClauses.push("t.sla_state = 'Breached' AND t.status NOT IN ('Resolved', 'Closed') AND t.is_archived = 0");
    } else if (queue === 'archived') {
      whereClauses.push('t.is_archived = 1');
    } else {
      // 'all' active queue
      if (queue !== 'history') {
        whereClauses.push('t.is_archived = 0');
      }
    }

    // Specific facet filters
    if (region) {
      whereClauses.push('a.region = ?');
      params.push(region);
    }
    if (intent) {
      whereClauses.push('t.category_intent = ?');
      params.push(intent);
    }
    if (status) {
      whereClauses.push('t.status = ?');
      params.push(status);
    }

    // Free text search
    if (searchQuery) {
      whereClauses.push('(t.id LIKE ? OR t.tboh LIKE ? OR t.title LIKE ? OR t.description LIKE ? OR a.name LIKE ?)');
      const wild = `%${searchQuery}%`;
      params.push(wild, wild, wild, wild, wild);
    }

    // Cursor pagination (created_at < cursor)
    if (cursor) {
      whereClauses.push('t.created_at < ?');
      params.push(cursor);
    }

    const sql = `
      SELECT t.id, t.tboh, t.title, t.category_intent, t.priority, t.status,
             t.sla_due_at, t.sla_effective_priority, t.sla_state, t.routing_reason,
             t.check_in_date, t.lcd_date, t.is_archived, t.created_at, t.updated_at,
             a.name as agency_name, a.code as agency_code, a.region as agency_region,
             u_req.name as requester_name,
             u_agent.name as assigned_agent_name,
             u_em.name as escalation_manager_name,
             (SELECT COUNT(*) FROM ticket_links WHERE (ticket_id_1 = t.id OR ticket_id_2 = t.id)) as linked_count
      FROM tickets t
      JOIN agencies a ON t.agency_id = a.id
      JOIN users u_req ON t.requester_id = u_req.id
      LEFT JOIN users u_agent ON t.assigned_agent_id = u_agent.id
      LEFT JOIN users u_em ON t.escalation_manager_id = u_em.id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY t.created_at DESC
      LIMIT ?
    `;

    params.push(limit + 1); // Fetch 1 extra to check for next cursor
    const rows = db.prepare(sql).all(...params);

    let nextCursor = null;
    if (rows.length > limit) {
      const extraItem = rows.pop();
      nextCursor = rows[rows.length - 1].created_at;
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      tickets: rows,
      nextCursor,
      limit,
      requestId: req.id
    }));
  });

  // GET /api/tickets/:id
  router.get('/api/tickets/:id', requireAuth, (req, res) => {
    const ticketId = req.params.id;
    const tenantId = req.user.tenant_id || 'tbo-default';

    const ticket = db.prepare(`
      SELECT t.*,
             a.name as agency_name, a.code as agency_code, a.region as agency_region,
             u_req.name as requester_name, u_req.email as requester_email,
             u_agent.name as assigned_agent_name, u_agent.email as assigned_agent_email,
             u_em.name as escalation_manager_name
      FROM tickets t
      JOIN agencies a ON t.agency_id = a.id
      JOIN users u_req ON t.requester_id = u_req.id
      LEFT JOIN users u_agent ON t.assigned_agent_id = u_agent.id
      LEFT JOIN users u_em ON t.escalation_manager_id = u_em.id
      WHERE t.id = ? AND t.tenant_id = ?
    `).get(ticketId, tenantId);

    // S1: Object-level check: Return 404 if ticket doesn't exist or belongs to another agency for requester
    if (!ticket || (req.user.role === 'requester' && ticket.agency_id !== req.user.agency_id)) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Ticket not found', requestId: req.id }));
    }

    // Refresh dynamic SLA state in case time has moved
    const freshSla = calculateSla({
      priority: ticket.priority,
      createdAt: ticket.created_at,
      checkInDate: ticket.check_in_date,
      lcdDate: ticket.lcd_date,
      resolvedAt: ticket.resolved_at,
      status: ticket.status
    });
    ticket.sla_state = freshSla.slaState;
    ticket.why_sla = {
      boostReason: freshSla.boostReason,
      stateReason: freshSla.stateReason,
      baseHours: freshSla.baseHours,
      effectivePriority: freshSla.effectivePriority,
      dueAt: freshSla.dueAtISO
    };

    // Parse routing breakdown
    try {
      ticket.routing_breakdown = JSON.parse(ticket.routing_score_breakdown || '{}');
    } catch (e) {
      ticket.routing_breakdown = null;
    }

    // Messages: Filter out internal notes for requesters (S10 Privacy)
    let messagesSql = `SELECT * FROM ticket_messages WHERE ticket_id = ?`;
    if (req.user.role === 'requester') {
      messagesSql += ` AND message_type != 'internal_note'`;
    }
    messagesSql += ` ORDER BY created_at ASC`;
    const messages = db.prepare(messagesSql).all(ticketId);

    // Linked cases
    const linkedCases = getLinkedTicketsForTicket(db, ticketId, tenantId);

    // Count repeat contacts on this TBOH
    const repeatCount = db.prepare(`SELECT COUNT(*) as count FROM tickets WHERE tenant_id = ? AND tboh = ?`).get(tenantId, ticket.tboh).count;

    // Timeline events
    const timeline = db.prepare(`
      SELECT * FROM timeline_events
      WHERE ticket_id = ?
      ORDER BY created_at ASC
    `).all(ticketId);

    // Theme tags
    const themes = db.prepare(`SELECT theme_name, source FROM ticket_themes WHERE ticket_id = ?`).all(ticketId);

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ticket,
      messages,
      linkedCases,
      repeatTbohCount: repeatCount,
      timeline,
      themes,
      allowedTransitions: ALLOWED_TRANSITIONS[ticket.status] || [],
      requestId: req.id
    }));
  });

  // POST /api/tickets/suggest-intent (Intent Suggester)
  router.post('/api/tickets/suggest-intent', requireAuth, async (req, res) => {
    const body = await parseJsonBody(req);
    const result = suggestIntent(body.title || '', body.description || '');
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ...result, requestId: req.id }));
  });

  // POST /api/tickets (Create Ticket)
  router.post('/api/tickets', requireAuth, async (req, res) => {
    const body = await parseJsonBody(req);

    // Input Validation (S6)
    const title = (body.title || '').trim();
    const rawDescription = (body.description || '').trim();
    const tboh = (body.tboh || '').trim().toUpperCase();
    const categoryIntent = (body.category_intent || '').trim();
    const priority = body.priority || 'Normal';
    const checkInDate = body.check_in_date || null;
    const lcdDate = body.lcd_date || null;

    if (!title || title.length > 150) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Title is required (maximum 150 characters)', requestId: req.id }));
    }
    if (!rawDescription || rawDescription.length > 5000) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Description is required (maximum 5000 characters)', requestId: req.id }));
    }
    if (!tboh || tboh.length > 50) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'TBOH booking reference is required (maximum 50 characters)', requestId: req.id }));
    }
    if (!INTENT_TAXONOMY.includes(categoryIntent)) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: `Invalid intent category. Must be one of: ${INTENT_TAXONOMY.join(', ')}`, requestId: req.id }));
    }
    if (!ALLOWED_PRIORITIES.includes(priority)) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Invalid priority', requestId: req.id }));
    }

    // Mass assignment defense: determine agency_id securely
    let agencyId = req.user.agency_id;
    if (req.user.role !== 'requester') {
      agencyId = body.agency_id || agencyId;
      if (!agencyId) {
        // Fallback to first agency
        const firstAgy = db.prepare('SELECT id FROM agencies LIMIT 1').get();
        agencyId = firstAgy ? firstAgy.id : null;
      }
    }

    if (!agencyId) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Valid agency association required', requestId: req.id }));
    }

    // S9: Sensitive data masking before storage
    const maskedDescription = maskSensitiveData(rawDescription);

    const agency = db.prepare('SELECT * FROM agencies WHERE id = ?').get(agencyId);
    const now = getNow();
    const nowISO = now.toISOString();

    // Generate readable Ticket ID (e.g. TBO-1013)
    const lastTicket = db.prepare(`SELECT id FROM tickets WHERE id LIKE 'TBO-%' ORDER BY rowid DESC LIMIT 1`).get();
    let nextNum = 1013;
    if (lastTicket) {
      const match = lastTicket.id.match(/^TBO-(\d+)$/);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }
    const ticketId = `TBO-${nextNum}`;

    // SLA calculation
    const sla = calculateSla({
      priority,
      createdAt: nowISO,
      checkInDate,
      lcdDate,
      status: 'New'
    });

    // Multi-factor Automated Routing (MVP-2)
    const routingResult = routeTicket(db, {
      priority,
      category_intent: categoryIntent,
      region: agency.region
    });

    // Insert Ticket
    db.prepare(`
      INSERT INTO tickets (
        id, tenant_id, agency_id, requester_id, assigned_agent_id,
        tboh, title, description, category_intent, priority, status,
        check_in_date, lcd_date, sla_due_at, sla_effective_priority, sla_state,
        routing_reason, routing_score_breakdown, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, 'New',
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?
      )
    `).run(
      ticketId, req.user.tenant_id || 'tbo-default', agencyId, req.user.id, routingResult.assignedAgentId,
      tboh, title, maskedDescription, categoryIntent, priority,
      checkInDate, lcdDate, sla.dueAtISO, sla.effectivePriority, sla.slaState,
      routingResult.routingReason, JSON.stringify(routingResult.scoreBreakdown),
      nowISO, nowISO
    );

    // Initial message
    db.prepare(`
      INSERT INTO ticket_messages (id, tenant_id, ticket_id, sender_user_id, sender_name, sender_role, message_type, body, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'public_reply', ?, ?)
    `).run(
      'msg_' + Math.random().toString(36).substring(2, 10),
      req.user.tenant_id || 'tbo-default',
      ticketId,
      req.user.id,
      req.user.name,
      req.user.role,
      maskedDescription,
      nowISO
    );

    // Initial timeline event
    db.prepare(`
      INSERT INTO timeline_events (id, tenant_id, ticket_id, event_type, actor_user_id, actor_name, summary, details_json, created_at)
      VALUES (?, ?, ?, 'created', ?, ?, ?, ?, ?)
    `).run(
      'tml_' + Math.random().toString(36).substring(2, 10),
      req.user.tenant_id || 'tbo-default',
      ticketId,
      req.user.id,
      req.user.name,
      `Case created. ${routingResult.routingReason}`,
      JSON.stringify({
        priority,
        category: categoryIntent,
        assignedAgent: routingResult.assignedAgentName,
        slaTarget: sla.dueAtISO
      }),
      nowISO
    );

    // Automatic Linking (MVP-1)
    const newTicketRecord = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
    const links = autoLinkTicket(db, newTicketRecord);

    // Auto-theme tag
    const themeName = categoryIntent.toLowerCase().includes('refund') ? 'refund delay' :
                      categoryIntent.toLowerCase().includes('inventory') ? 'inventory sync' :
                      categoryIntent.toLowerCase().includes('payment') ? 'payment failure' :
                      categoryIntent.toLowerCase().includes('amend') ? 'amendment issue' :
                      categoryIntent.toLowerCase();

    db.prepare(`
      INSERT INTO ticket_themes (id, tenant_id, ticket_id, theme_name, source, created_at)
      VALUES (?, ?, ?, ?, 'auto', ?)
    `).run('thm_' + Math.random().toString(36).substring(2, 10), req.user.tenant_id || 'tbo-default', ticketId, themeName, nowISO);

    logAudit(db, {
      tenantId: req.user.tenant_id,
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: 'TICKET_CREATE',
      resourceType: 'tickets',
      resourceId: ticketId,
      newVal: { tboh, priority, categoryIntent, assignedAgentId: routingResult.assignedAgentId },
      ip: req.clientIp
    });

    res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      success: true,
      ticketId,
      routingReason: routingResult.routingReason,
      assignedAgentName: routingResult.assignedAgentName,
      linksCreated: links.length,
      requestId: req.id
    }));
  });

  // POST /api/tickets/:id/messages (Add Reply or Internal Note)
  router.post('/api/tickets/:id/messages', requireAuth, async (req, res) => {
    const ticketId = req.params.id;
    const body = await parseJsonBody(req);
    const rawBody = (body.body || '').trim();
    let messageType = body.message_type || 'public_reply';

    if (!rawBody) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Message body cannot be empty', requestId: req.id }));
    }

    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
    if (!ticket || (req.user.role === 'requester' && ticket.agency_id !== req.user.agency_id)) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Ticket not found', requestId: req.id }));
    }

    // Requester cannot post internal notes (S10 Privacy)
    if (req.user.role === 'requester') {
      messageType = 'public_reply';
    }

    // S9 Sensitive data masking
    const maskedBody = maskSensitiveData(rawBody);
    const nowISO = getNowISO();

    const msgId = 'msg_' + Math.random().toString(36).substring(2, 10);
    db.prepare(`
      INSERT INTO ticket_messages (id, tenant_id, ticket_id, sender_user_id, sender_name, sender_role, message_type, body, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(msgId, ticket.tenant_id, ticketId, req.user.id, req.user.name, req.user.role, messageType, maskedBody, nowISO);

    // If requester replied on a Pending ticket, reopen it to Open
    if (req.user.role === 'requester' && ticket.status === 'Pending') {
      db.prepare(`UPDATE tickets SET status = 'Open', updated_at = ? WHERE id = ?`).run(nowISO, ticketId);
    } else {
      db.prepare(`UPDATE tickets SET updated_at = ? WHERE id = ?`).run(nowISO, ticketId);
    }

    // Timeline event
    db.prepare(`
      INSERT INTO timeline_events (id, tenant_id, ticket_id, event_type, actor_user_id, actor_name, summary, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'tml_' + Math.random().toString(36).substring(2, 10),
      ticket.tenant_id,
      ticketId,
      messageType,
      req.user.id,
      req.user.name,
      messageType === 'internal_note' ? 'Added an internal note' : 'Sent a reply to requester',
      JSON.stringify({ messageId: msgId, length: maskedBody.length }),
      nowISO
    );

    res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, messageId: msgId, requestId: req.id }));
  });

  // PATCH /api/tickets/:id/status (Status Transitions)
  router.patch('/api/tickets/:id/status', requireAuth, async (req, res) => {
    const ticketId = req.params.id;
    const body = await parseJsonBody(req);
    const targetStatus = body.status;

    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
    if (!ticket || (req.user.role === 'requester' && ticket.agency_id !== req.user.agency_id)) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Ticket not found', requestId: req.id }));
    }

    // Role restrictions on transitions
    if (req.user.role === 'requester') {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Requesters cannot directly alter operational status', requestId: req.id }));
    }

    if (!ALLOWED_STATUSES.includes(targetStatus)) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Invalid target status', requestId: req.id }));
    }

    const allowedNext = ALLOWED_TRANSITIONS[ticket.status] || [];
    if (!allowedNext.includes(targetStatus)) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({
        error: true,
        message: `Invalid transition from ${ticket.status} to ${targetStatus}. Allowed: ${allowedNext.join(', ')}`,
        requestId: req.id
      }));
    }

    const now = getNow();
    const nowISO = now.toISOString();
    let resolvedAt = ticket.resolved_at;
    let closedAt = ticket.closed_at;

    if (targetStatus === 'Resolved' && !resolvedAt) {
      resolvedAt = nowISO;
    }
    if (targetStatus === 'Closed' && !closedAt) {
      closedAt = nowISO;
    }

    // Recalculate terminal SLA state
    const sla = calculateSla({
      priority: ticket.priority,
      createdAt: ticket.created_at,
      checkInDate: ticket.check_in_date,
      lcdDate: ticket.lcd_date,
      resolvedAt,
      status: targetStatus
    });

    db.prepare(`
      UPDATE tickets
      SET status = ?, sla_state = ?, resolved_at = ?, closed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(targetStatus, sla.slaState, resolvedAt, closedAt, nowISO, ticketId);

    // Timeline event
    db.prepare(`
      INSERT INTO timeline_events (id, tenant_id, ticket_id, event_type, actor_user_id, actor_name, summary, details_json, created_at)
      VALUES (?, ?, ?, 'status_change', ?, ?, ?, ?, ?)
    `).run(
      'tml_' + Math.random().toString(36).substring(2, 10),
      ticket.tenant_id,
      ticketId,
      req.user.id,
      req.user.name,
      `Status changed from ${ticket.status} to ${targetStatus}`,
      JSON.stringify({ from: ticket.status, to: targetStatus, slaState: sla.slaState }),
      nowISO
    );

    logAudit(db, {
      tenantId: ticket.tenant_id,
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: 'TICKET_STATUS_CHANGE',
      resourceType: 'tickets',
      resourceId: ticketId,
      previousVal: ticket.status,
      newVal: targetStatus,
      ip: req.clientIp
    });

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, status: targetStatus, slaState: sla.slaState, requestId: req.id }));
  });

  // POST /api/tickets/:id/assign (Reassign or Unassign)
  router.post('/api/tickets/:id/assign', requireRole('agent', 'escalation_manager', 'lead'), async (req, res) => {
    const ticketId = req.params.id;
    const body = await parseJsonBody(req);
    const targetAgentId = body.agent_id || null; // null means unassign to triage

    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
    if (!ticket) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Ticket not found', requestId: req.id }));
    }

    let targetAgentName = 'Triage (Unassigned)';
    if (targetAgentId) {
      const targetUser = db.prepare(`SELECT name FROM users WHERE id = ? AND role IN ('agent', 'lead')`).get(targetAgentId);
      if (!targetUser) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: true, message: 'Target agent not found', requestId: req.id }));
      }
      targetAgentName = targetUser.name;
    }

    const nowISO = getNowISO();
    const prevAgentId = ticket.assigned_agent_id;

    db.prepare(`
      UPDATE tickets
      SET assigned_agent_id = ?, previous_agent_id = ?, updated_at = ?
      WHERE id = ?
    `).run(targetAgentId, prevAgentId, nowISO, ticketId);

    // Timeline event
    db.prepare(`
      INSERT INTO timeline_events (id, tenant_id, ticket_id, event_type, actor_user_id, actor_name, summary, details_json, created_at)
      VALUES (?, ?, ?, 'reassigned', ?, ?, ?, ?, ?)
    `).run(
      'tml_' + Math.random().toString(36).substring(2, 10),
      ticket.tenant_id,
      ticketId,
      req.user.id,
      req.user.name,
      `Reassigned to ${targetAgentName}`,
      JSON.stringify({ fromAgentId: prevAgentId, toAgentId: targetAgentId, toAgentName: targetAgentName }),
      nowISO
    );

    logAudit(db, {
      tenantId: ticket.tenant_id,
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: 'TICKET_REASSIGN',
      resourceType: 'tickets',
      resourceId: ticketId,
      previousVal: prevAgentId,
      newVal: targetAgentId,
      ip: req.clientIp
    });

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, assignedAgentName: targetAgentName, requestId: req.id }));
  });

  // POST /api/tickets/:id/escalate (MVP-4: Direct Escalate to Escalation Manager)
  router.post('/api/tickets/:id/escalate', requireRole('agent', 'lead'), async (req, res) => {
    const ticketId = req.params.id;
    const body = await parseJsonBody(req);
    const reason = (body.reason || '').trim();

    try {
      const result = escalateTicket(db, ticketId, reason, req.user);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        escalationManagerName: result.emName,
        requestId: req.id
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: true, message: err.message, requestId: req.id }));
    }
  });

  // POST /api/tickets/:id/deescalate (Hand Back from Escalation)
  router.post('/api/tickets/:id/deescalate', requireRole('escalation_manager', 'lead'), async (req, res) => {
    const ticketId = req.params.id;
    const body = await parseJsonBody(req);
    const notes = (body.notes || '').trim();

    try {
      handBackTicket(db, ticketId, notes, req.user);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, message: 'Ticket handed back to operations agent queue', requestId: req.id }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: true, message: err.message, requestId: req.id }));
    }
  });

  // POST /api/tickets/:id/links (Manual Link)
  router.post('/api/tickets/:id/links', requireRole('agent', 'escalation_manager', 'lead'), async (req, res) => {
    const ticketId = req.params.id;
    const body = await parseJsonBody(req);
    const targetTicketId = (body.targetTicketId || '').trim();

    try {
      const linkId = manualLink(db, ticketId, targetTicketId, req.user);
      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, linkId, requestId: req.id }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: true, message: err.message, requestId: req.id }));
    }
  });

  // DELETE /api/tickets/:id/links/:linkId (Manual Unlink)
  router.delete('/api/tickets/:id/links/:linkId', requireRole('agent', 'escalation_manager', 'lead'), (req, res) => {
    const linkId = req.params.linkId;
    try {
      manualUnlink(db, linkId, req.user);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, message: 'Ticket unlinked', requestId: req.id }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: true, message: err.message, requestId: req.id }));
    }
  });
}

module.exports = {
  registerTicketRoutes
};
