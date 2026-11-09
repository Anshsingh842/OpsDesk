// server/api/dashboard.js
// Lead Governance Dashboard: queue health, SLA risks, regional volume, and agent roster load.

const { requireRole } = require('../http/router');
const { getNow } = require('../domain/now');

function registerDashboardRoutes(router, db) {
  // GET /api/dashboard/stats
  router.get('/api/dashboard/stats', requireRole('lead', 'agent', 'escalation_manager'), (req, res) => {
    const tenantId = req.user.tenant_id || 'tbo-default';
    const now = getNow();

    // 1. Status breakdown
    const statusRows = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM tickets
      WHERE tenant_id = ? AND is_archived = 0
      GROUP BY status
    `).all(tenantId);

    const statusCounts = Object.fromEntries(statusRows.map(r => [r.status, r.count]));

    // 2. SLA state breakdown
    const slaRows = db.prepare(`
      SELECT sla_state, COUNT(*) as count
      FROM tickets
      WHERE tenant_id = ? AND is_archived = 0
      GROUP BY sla_state
    `).all(tenantId);

    const slaCounts = Object.fromEntries(slaRows.map(r => [r.sla_state, r.count]));

    // 3. Unassigned / Triage age metrics
    const unassignedTickets = db.prepare(`
      SELECT created_at FROM tickets
      WHERE tenant_id = ? AND assigned_agent_id IS NULL AND status IN ('New', 'Open') AND is_archived = 0
    `).all(tenantId);

    let avgUnassignedAgeMinutes = 0;
    if (unassignedTickets.length > 0) {
      const nowMs = now.getTime();
      const totalMinutes = unassignedTickets.reduce((sum, t) => {
        const createdMs = new Date(t.created_at).getTime();
        return sum + Math.max(0, Math.round((nowMs - createdMs) / 60000));
      }, 0);
      avgUnassignedAgeMinutes = Math.round(totalMinutes / unassignedTickets.length);
    }

    // 4. Region breakdown
    const regionRows = db.prepare(`
      SELECT a.region, COUNT(t.id) as count
      FROM tickets t
      JOIN agencies a ON t.agency_id = a.id
      WHERE t.tenant_id = ? AND t.is_archived = 0
      GROUP BY a.region
      ORDER BY count DESC
    `).all(tenantId);

    // 5. Agent roster and workload
    const agentRoster = db.prepare(`
      SELECT u.id, u.name, u.email, u.role, u.region, u.shift_start, u.shift_end, u.skills, u.rank, u.is_available,
        (SELECT COUNT(*) FROM tickets t WHERE t.assigned_agent_id = u.id AND t.status IN ('New', 'Open', 'Pending', 'Escalated') AND t.is_archived = 0) as open_tickets,
        (SELECT COUNT(*) FROM tickets t WHERE t.assigned_agent_id = u.id AND t.sla_state = 'At-risk' AND t.status NOT IN ('Resolved', 'Closed') AND t.is_archived = 0) as at_risk_tickets
      FROM users u
      WHERE u.role IN ('agent', 'escalation_manager', 'lead') AND u.tenant_id = ?
      ORDER BY u.role ASC, open_tickets DESC
    `).all(tenantId);

    // 6. Recent Escalations
    const activeEscalations = db.prepare(`
      SELECT t.id, t.title, t.priority, t.category_intent, t.escalation_reason, t.escalated_at, t.escalated_by,
             u_em.name as escalation_manager_name, a.name as agency_name
      FROM tickets t
      JOIN agencies a ON t.agency_id = a.id
      LEFT JOIN users u_em ON t.escalation_manager_id = u_em.id
      WHERE t.status = 'Escalated' AND t.tenant_id = ? AND t.is_archived = 0
      ORDER BY t.escalated_at DESC
      LIMIT 5
    `).all(tenantId);

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      statusCounts,
      slaCounts,
      triageMetrics: {
        unassignedCount: unassignedTickets.length,
        avgAgeMinutes: avgUnassignedAgeMinutes
      },
      regionDistribution: regionRows,
      agentRoster,
      activeEscalations,
      timestamp: now.toISOString(),
      requestId: req.id
    }));
  });
}

module.exports = {
  registerDashboardRoutes
};
