// server/api/insights.js
// MVP-5: Feedback & Insight Loop.
// Aggregates recurring themes, week-over-week trends, sample cases, and links to engineering/product issues.

const { requireRole, requireAuth } = require('../http/router');
const { parseJsonBody } = require('../http/request_body');
const { getNow, getNowISO } = require('../domain/now');
const { logAudit } = require('../db/audit');

function registerInsightsRoutes(router, db) {
  // GET /api/insights/themes
  router.get('/api/insights/themes', requireRole('lead', 'agent', 'escalation_manager'), (req, res) => {
    const tenantId = req.user.tenant_id || 'tbo-default';
    const now = getNow();
    const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 3600 * 1000)).toISOString();
    const fourteenDaysAgo = new Date(now.getTime() - (14 * 24 * 3600 * 1000)).toISOString();

    // Counts for this week (last 7 days)
    const thisWeekRows = db.prepare(`
      SELECT th.theme_name, COUNT(DISTINCT th.ticket_id) as count
      FROM ticket_themes th
      JOIN tickets t ON th.ticket_id = t.id
      WHERE t.tenant_id = ? AND t.created_at >= ?
      GROUP BY th.theme_name
    `).all(tenantId, sevenDaysAgo);

    // Counts for last week (7-14 days ago)
    const lastWeekRows = db.prepare(`
      SELECT th.theme_name, COUNT(DISTINCT th.ticket_id) as count
      FROM ticket_themes th
      JOIN tickets t ON th.ticket_id = t.id
      WHERE t.tenant_id = ? AND t.created_at >= ? AND t.created_at < ?
      GROUP BY th.theme_name
    `).all(tenantId, fourteenDaysAgo, sevenDaysAgo);

    const lastWeekMap = new Map(lastWeekRows.map(r => [r.theme_name, r.count]));

    // All distinct themes
    const allThemes = new Set([...thisWeekRows.map(r => r.theme_name), ...lastWeekRows.map(r => r.theme_name)]);

    const themeInsights = [];
    for (const theme of allThemes) {
      const thisCount = (thisWeekRows.find(r => r.theme_name === theme) || {}).count || 0;
      const lastCount = lastWeekMap.get(theme) || 0;
      const delta = thisCount - lastCount;
      const pctChange = lastCount > 0 ? Math.round((delta / lastCount) * 100) : (thisCount > 0 ? 100 : 0);

      // Sample 3 tickets for this theme
      const sampleTickets = db.prepare(`
        SELECT t.id, t.title, t.priority, t.status, t.created_at, a.name as agency_name, t.product_bug_link
        FROM tickets t
        JOIN ticket_themes th ON t.id = th.ticket_id
        JOIN agencies a ON t.agency_id = a.id
        WHERE th.theme_name = ? AND t.tenant_id = ?
        ORDER BY t.created_at DESC
        LIMIT 3
      `).all(theme, tenantId);

      themeInsights.push({
        theme,
        thisWeekCount: thisCount,
        lastWeekCount: lastCount,
        delta,
        pctChange,
        sampleTickets
      });
    }

    // Sort themes by current week count descending
    themeInsights.sort((a, b) => b.thisWeekCount - a.thisWeekCount);

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      themes: themeInsights,
      period: {
        thisWeekStart: sevenDaysAgo,
        lastWeekStart: fourteenDaysAgo,
        now: now.toISOString()
      },
      requestId: req.id
    }));
  });

  // POST /api/tickets/:id/product-link (Link ticket to engineering/product bug or backlog)
  router.post('/api/tickets/:id/product-link', requireRole('agent', 'escalation_manager', 'lead'), async (req, res) => {
    const ticketId = req.params.id;
    const body = await parseJsonBody(req);
    const link = (body.link || '').trim();

    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
    if (!ticket) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Ticket not found', requestId: req.id }));
    }

    const nowISO = getNowISO();
    db.prepare('UPDATE tickets SET product_bug_link = ?, updated_at = ? WHERE id = ?').run(link || null, nowISO, ticketId);

    // Timeline event
    db.prepare(`
      INSERT INTO timeline_events (id, tenant_id, ticket_id, event_type, actor_user_id, actor_name, summary, details_json, created_at)
      VALUES (?, ?, ?, 'product_link_updated', ?, ?, ?, ?, ?)
    `).run(
      'tml_' + Math.random().toString(36).substring(2, 10),
      ticket.tenant_id,
      ticketId,
      req.user.id,
      req.user.name,
      link ? `Linked case to product bug/backlog item: ${link}` : 'Removed product bug link',
      JSON.stringify({ link }),
      nowISO
    );

    logAudit(db, {
      tenantId: ticket.tenant_id,
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: 'TICKET_PRODUCT_LINK_UPDATE',
      resourceType: 'tickets',
      resourceId: ticketId,
      newVal: link
    });

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, link, requestId: req.id }));
  });

  // POST /api/tickets/:id/themes (Add theme tag)
  router.post('/api/tickets/:id/themes', requireRole('agent', 'escalation_manager', 'lead'), async (req, res) => {
    const ticketId = req.params.id;
    const body = await parseJsonBody(req);
    const themeName = (body.theme || '').trim().toLowerCase();

    if (!themeName) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Theme name cannot be empty', requestId: req.id }));
    }

    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
    if (!ticket) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: true, message: 'Ticket not found', requestId: req.id }));
    }

    const exists = db.prepare('SELECT id FROM ticket_themes WHERE ticket_id = ? AND LOWER(theme_name) = ?').get(ticketId, themeName);
    if (!exists) {
      const nowISO = getNowISO();
      db.prepare(`
        INSERT INTO ticket_themes (id, tenant_id, ticket_id, theme_name, source, created_at)
        VALUES (?, ?, ?, ?, 'manual', ?)
      `).run('thm_' + Math.random().toString(36).substring(2, 10), ticket.tenant_id, ticketId, themeName, nowISO);

      db.prepare(`
        INSERT INTO timeline_events (id, tenant_id, ticket_id, event_type, actor_user_id, actor_name, summary, details_json, created_at)
        VALUES (?, ?, ?, 'theme_added', ?, ?, ?, ?, ?)
      `).run('tml_' + Math.random().toString(36).substring(2, 10), ticket.tenant_id, ticketId, req.user.id, req.user.name, `Added theme tag "${themeName}"`, null, nowISO);
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, theme: themeName, requestId: req.id }));
  });
}

module.exports = {
  registerInsightsRoutes
};
