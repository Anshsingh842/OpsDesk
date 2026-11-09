// web/js/views/dashboard.js
// Lead Operations Governance Dashboard: Queue health, SLA risk distribution, regional volume, and agent roster load.

import { apiRequest } from '../api.js';
import { renderIcon } from '../icons.js';
import { showToast } from '../components/toast.js';

export async function renderDashboard(container) {
  container.innerHTML = `
    <div class="view-header">
      <div class="view-title-row">
        <div>
          <h1 class="view-title">Operations Governance Dashboard</h1>
          <p class="view-helper">Real-time queue health, SLA performance, regional distribution, and agent workload oversight.</p>
        </div>
        <div style="display:flex; gap:var(--space-2);">
          <button class="btn btn-secondary" id="refresh-dashboard-btn">
            ${renderIcon('refresh')} Refresh Stats
          </button>
        </div>
      </div>
    </div>

    <!-- Metric Summary Grid -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-4); margin-bottom: var(--space-6);">
      <div class="card" style="margin-bottom:0;">
        <div style="font-size: 11px; font-weight: 600; color: var(--text-dim); text-transform: uppercase;">Unassigned in Triage</div>
        <div style="display: flex; align-items: baseline; gap: var(--space-2); margin-top: var(--space-2);">
          <div style="font-size: 28px; font-weight: 600; font-family: var(--font-mono);" id="m-triage">-</div>
          <div style="font-size: 12px; color: var(--text-muted);" id="m-triage-age">Avg - mins</div>
        </div>
        <div style="font-size: 11px; color: var(--text-dim); margin-top: 4px;">Awaiting automated/manual dispatch</div>
      </div>

      <div class="card" style="margin-bottom:0;">
        <div style="font-size: 11px; font-weight: 600; color: var(--status-risk-text); text-transform: uppercase;">At-Risk SLA Cases</div>
        <div style="display: flex; align-items: baseline; gap: var(--space-2); margin-top: var(--space-2);">
          <div style="font-size: 28px; font-weight: 600; font-family: var(--font-mono); color: var(--status-risk-text);" id="m-atrisk">-</div>
          <div class="badge badge-risk">Travel Boosted</div>
        </div>
        <div style="font-size: 11px; color: var(--text-dim); margin-top: 4px;">≤30% SLA window or ≤1h left</div>
      </div>

      <div class="card" style="margin-bottom:0;">
        <div style="font-size: 11px; font-weight: 600; color: var(--status-breached-text); text-transform: uppercase;">Breached SLA Cases</div>
        <div style="display: flex; align-items: baseline; gap: var(--space-2); margin-top: var(--space-2);">
          <div style="font-size: 28px; font-weight: 600; font-family: var(--font-mono); color: var(--status-breached-text);" id="m-breached">-</div>
          <div class="badge badge-breached">Overdue</div>
        </div>
        <div style="font-size: 11px; color: var(--text-dim); margin-top: 4px;">Immediate manager action required</div>
      </div>

      <div class="card" style="margin-bottom:0;">
        <div style="font-size: 11px; font-weight: 600; color: var(--accent-text); text-transform: uppercase;">Active Escalations</div>
        <div style="display: flex; align-items: baseline; gap: var(--space-2); margin-top: var(--space-2);">
          <div style="font-size: 28px; font-weight: 600; font-family: var(--font-mono); color: var(--accent-text);" id="m-escalated">-</div>
          <div class="badge badge-link">In EM Queue</div>
        </div>
        <div style="font-size: 11px; color: var(--text-dim); margin-top: 4px;">Managed by Escalation Managers</div>
      </div>
    </div>

    <!-- Active Queues & Regional Distribution Split -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-6); margin-bottom: var(--space-6);">
      
      <!-- Status Health -->
      <div class="card" style="margin-bottom:0;">
        <div class="card-header">
          <div class="card-title">${renderIcon('layers')} Case Lifecycle Status Breakdown</div>
        </div>
        <div id="status-bars" style="display:flex; flex-direction:column; gap:var(--space-2);">
          <div style="font-size: 12px; color: var(--text-muted);">Loading status health...</div>
        </div>
      </div>

      <!-- Regional Volume -->
      <div class="card" style="margin-bottom:0;">
        <div class="card-header">
          <div class="card-title">${renderIcon('compass')} Regional Operations Distribution</div>
        </div>
        <div id="region-bars" style="display:flex; flex-direction:column; gap:var(--space-2);">
          <div style="font-size: 12px; color: var(--text-muted);">Loading regional volume...</div>
        </div>
      </div>

    </div>

    <!-- Agent Roster & Workload Table -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">${renderIcon('users')} Operations Staff Roster & Dynamic Workload</div>
        <span class="badge badge-neutral">Simulated Roster & Availability</span>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Agent Name</th>
              <th>Role</th>
              <th>Region</th>
              <th>Shift Window (IST)</th>
              <th>Specialist Skills</th>
              <th>Rank</th>
              <th>Active Load</th>
              <th>At-Risk</th>
              <th>Availability Toggle</th>
            </tr>
          </thead>
          <tbody id="agent-roster-tbody">
            <tr><td colspan="9" style="text-align:center; padding:20px;">Loading staff roster...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  async function loadStats() {
    try {
      const stats = await apiRequest('/api/dashboard/stats');

      // Summary metrics
      container.querySelector('#m-triage').textContent = stats.triageMetrics.unassignedCount;
      container.querySelector('#m-triage-age').textContent = `Avg ${stats.triageMetrics.avgAgeMinutes}m`;
      container.querySelector('#m-atrisk').textContent = stats.slaCounts['At-risk'] || 0;
      container.querySelector('#m-breached').textContent = stats.slaCounts['Breached'] || 0;
      container.querySelector('#m-escalated').textContent = stats.statusCounts['Escalated'] || 0;

      // Status breakdown
      const statusContainer = container.querySelector('#status-bars');
      const allStatuses = ['New', 'Open', 'Pending', 'Escalated', 'Resolved', 'Closed'];
      const totalTickets = Object.values(stats.statusCounts).reduce((a, b) => a + b, 0) || 1;

      statusContainer.innerHTML = allStatuses.map(s => {
        const count = stats.statusCounts[s] || 0;
        const pct = Math.round((count / totalTickets) * 100);
        return `
          <div>
            <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:2px;">
              <span><strong>${s}</strong></span>
              <span class="tabular-nums" style="color:var(--text-muted);">${count} cases (${pct}%)</span>
            </div>
            <div style="height:6px; background:var(--bg-subtle); border-radius:var(--radius-full); overflow:hidden;">
              <div style="height:100%; width:${pct}%; background:${s === 'Escalated' ? 'var(--status-risk-border)' : s === 'Resolved' || s === 'Closed' ? 'var(--status-ok-border)' : 'var(--accent-main)'};"></div>
            </div>
          </div>
        `;
      }).join('');

      // Region distribution
      const regionContainer = container.querySelector('#region-bars');
      const regions = stats.regionDistribution || [];
      const totalRegionTickets = regions.reduce((sum, r) => sum + r.count, 0) || 1;

      regionContainer.innerHTML = regions.map(r => {
        const pct = Math.round((r.count / totalRegionTickets) * 100);
        return `
          <div>
            <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:2px;">
              <span><strong>${r.region}</strong></span>
              <span class="tabular-nums" style="color:var(--text-muted);">${r.count} cases (${pct}%)</span>
            </div>
            <div style="height:6px; background:var(--bg-subtle); border-radius:var(--radius-full); overflow:hidden;">
              <div style="height:100%; width:${pct}%; background:var(--accent-main);"></div>
            </div>
          </div>
        `;
      }).join('');

      // Staff roster
      const rosterTbody = container.querySelector('#agent-roster-tbody');
      rosterTbody.innerHTML = (stats.agentRoster || []).map(agent => `
        <tr>
          <td>
            <strong>${agent.name}</strong>
            <div style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono);">${agent.email}</div>
          </td>
          <td>
            <span class="badge ${agent.role === 'escalation_manager' ? 'badge-risk' : agent.role === 'lead' ? 'badge-info' : 'badge-ok'}">
              ${agent.role.replace('_', ' ')}
            </span>
          </td>
          <td>${agent.region || '-'}</td>
          <td class="tabular-nums">${agent.shift_start ? `${agent.shift_start} - ${agent.shift_end}` : 'Flexible'}</td>
          <td style="font-size:11px; max-width:180px; overflow:hidden; text-overflow:ellipsis;">
            ${agent.skills || 'All Categories'}
          </td>
          <td class="tabular-nums">Rank ${agent.rank || 1}</td>
          <td class="tabular-nums"><strong>${agent.open_tickets}</strong> open</td>
          <td class="tabular-nums">
            ${agent.at_risk_tickets > 0 ? `<span class="badge badge-risk">${agent.at_risk_tickets} at-risk</span>` : '<span style="color:var(--text-dim);">-</span>'}
          </td>
          <td>
            <button class="btn btn-sm ${agent.is_available ? 'btn-secondary' : 'btn-outline'} toggle-avail-btn" data-id="${agent.id}" data-current="${agent.is_available}">
              ${agent.is_available ? 'Online (Available)' : 'Offline (Simulated)'}
            </button>
          </td>
        </tr>
      `).join('');

      rosterTbody.querySelectorAll('.toggle-avail-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const current = btn.getAttribute('data-current') === '1';
          try {
            await apiRequest(`/api/agents/${id}/availability`, {
              method: 'POST',
              body: { isAvailable: !current }
            });
            showToast(`Availability updated for agent`, 'info');
            loadStats();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });

    } catch (err) {
      showToast('Failed to load dashboard: ' + err.message, 'error');
    }
  }

  container.querySelector('#refresh-dashboard-btn').addEventListener('click', loadStats);
  loadStats();
}
