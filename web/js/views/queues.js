// web/js/views/queues.js
// Operations Queues view: Triage, My queue, Escalated, At-risk, Breached, and facet filters.

import { apiRequest } from '../api.js';
import { renderIcon } from '../icons.js';
import { store } from '../store.js';
import { showToast } from '../components/toast.js';

export async function renderQueues(container, queryParams = {}) {
  const currentQueue = queryParams.queue || 'all';
  const currentRegion = queryParams.region || '';
  const currentIntent = queryParams.intent || '';
  const currentSearch = queryParams.q || '';

  const queueTitles = {
    all: 'All Operations Cases',
    triage: 'Triage Queue (Unassigned Cases)',
    my: 'My Assigned Queue',
    escalated: 'Escalations Manager Queue',
    at_risk: 'At-Risk SLA Cases',
    breached: 'Breached SLA Cases',
    archived: 'Archived Historical Cases'
  };

  const queueHelpers = {
    all: 'Complete view of active operations cases across all agencies and regions.',
    triage: 'Unassigned cases awaiting routing dispatch or manual agent pickup.',
    my: 'Cases currently owned by and assigned to you.',
    escalated: 'Critical cases escalated to Escalation Managers requiring senior authorization.',
    at_risk: 'Cases within 30% of SLA window or less than 1 hour before deadline.',
    breached: 'Cases that have passed their guaranteed SLA resolution window.',
    archived: 'Closed cases older than retention policy archived for governance and audit.'
  };

  container.innerHTML = `
    <div class="view-header">
      <div class="view-title-row">
        <div>
          <h1 class="view-title">${queueTitles[currentQueue] || 'Operations Queue'}</h1>
          <p class="view-helper">${queueHelpers[currentQueue] || 'View and manage operations cases.'}</p>
        </div>
        <div style="display:flex; gap:var(--space-2);">
          <button class="btn btn-primary" id="open-new-ticket-btn">
            ${renderIcon('plus')} New Case
          </button>
        </div>
      </div>
    </div>

    <!-- Filter & Queue Navigation Bar -->
    <div style="display:flex; align-items:center; justify-content:space-between; gap:var(--space-4); margin-bottom:var(--space-4); flex-wrap:wrap;">
      <div style="display:flex; gap:var(--space-2); flex-wrap:wrap;">
        <a href="#queues?queue=all" class="btn btn-sm ${currentQueue === 'all' ? 'btn-primary' : 'btn-secondary'}">
          All Active
        </a>
        <a href="#queues?queue=triage" class="btn btn-sm ${currentQueue === 'triage' ? 'btn-primary' : 'btn-secondary'}">
          Triage <span class="counter-pill ${store.counts.triage > 0 ? 'alert' : ''}">${store.counts.triage}</span>
        </a>
        <a href="#queues?queue=my" class="btn btn-sm ${currentQueue === 'my' ? 'btn-primary' : 'btn-secondary'}">
          My Queue <span class="counter-pill">${store.counts.my}</span>
        </a>
        <a href="#queues?queue=escalated" class="btn btn-sm ${currentQueue === 'escalated' ? 'btn-primary' : 'btn-secondary'}">
          Escalations <span class="counter-pill alert">${store.counts.escalated}</span>
        </a>
        <a href="#queues?queue=at_risk" class="btn btn-sm ${currentQueue === 'at_risk' ? 'btn-primary' : 'btn-secondary'}">
          At Risk <span class="counter-pill">${store.counts.at_risk}</span>
        </a>
        <a href="#queues?queue=breached" class="btn btn-sm ${currentQueue === 'breached' ? 'btn-primary' : 'btn-secondary'}">
          Breached <span class="counter-pill alert">${store.counts.breached}</span>
        </a>
        <a href="#queues?queue=archived" class="btn btn-sm ${currentQueue === 'archived' ? 'btn-primary' : 'btn-secondary'}">
          Archived <span class="counter-pill">${store.counts.archived}</span>
        </a>
      </div>

      <!-- Quick Search input -->
      <div style="display:flex; gap:var(--space-2); min-width:260px;">
        <input type="text" id="queue-search-input" class="form-input" style="padding:4px 10px; font-size:12px;" placeholder="Search ID, TBOH, agency..." value="${currentSearch}" />
      </div>
    </div>

    <!-- Table Card -->
    <div class="table-card">
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Case ID</th>
              <th>TBOH Ref</th>
              <th>Title & Category</th>
              <th>Agency & Region</th>
              <th>Priority</th>
              <th>Status</th>
              <th>SLA State & Deadline</th>
              <th>Owner</th>
              <th>Created (IST)</th>
            </tr>
          </thead>
          <tbody id="tickets-tbody">
            <tr><td colspan="9" style="text-align:center; padding:30px;"><span class="loading-spinner"></span> Loading cases...</td></tr>
          </tbody>
        </table>
      </div>
      <div id="pagination-bar" style="padding:var(--space-3) var(--space-4); border-top:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:12px; color:var(--text-muted);" id="pagination-info">Showing cases</span>
        <button class="btn btn-secondary btn-sm" id="load-more-btn" style="display:none;">Load More Cases</button>
      </div>
    </div>
  `;

  // Search input binding
  const searchInput = container.querySelector('#queue-search-input');
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = searchInput.value.trim();
      window.location.hash = `#queues?queue=${currentQueue}&q=${encodeURIComponent(q)}`;
    }
  });

  // New ticket button
  container.querySelector('#open-new-ticket-btn').addEventListener('click', () => {
    window.location.hash = '#new-ticket';
  });

  const tbody = container.querySelector('#tickets-tbody');
  const loadMoreBtn = container.querySelector('#load-more-btn');
  const paginationInfo = container.querySelector('#pagination-info');

  let currentCursor = null;
  let allLoadedTickets = [];

  async function fetchTickets(cursor = null, append = false) {
    try {
      let url = `/api/tickets?queue=${currentQueue}&limit=25`;
      if (currentSearch) url += `&q=${encodeURIComponent(currentSearch)}`;
      if (currentRegion) url += `&region=${encodeURIComponent(currentRegion)}`;
      if (currentIntent) url += `&intent=${encodeURIComponent(currentIntent)}`;
      if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;

      const data = await apiRequest(url);
      const tickets = data.tickets || [];

      if (append) {
        allLoadedTickets = [...allLoadedTickets, ...tickets];
      } else {
        allLoadedTickets = tickets;
      }

      currentCursor = data.nextCursor;

      if (allLoadedTickets.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="9" style="text-align:center; padding:40px;">
              <div class="empty-state">
                <div class="empty-state-icon">${renderIcon('checkCircle')}</div>
                <div style="font-weight:600; font-size:14px;">Queue is clear</div>
                <p style="font-size:12px; color:var(--text-muted); margin-top:4px;">No cases found matching the current filters.</p>
              </div>
            </td>
          </tr>
        `;
        paginationInfo.textContent = '0 cases';
        loadMoreBtn.style.display = 'none';
        return;
      }

      tbody.innerHTML = allLoadedTickets.map(t => {
        // Format IST timestamp
        const createdDate = new Date(t.created_at);
        const createdIST = createdDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true });

        // SLA Badge class
        const slaClass = t.sla_state === 'Breached' ? 'badge-breached' :
                         t.sla_state === 'At-risk' ? 'badge-risk' :
                         t.sla_state === 'Met' ? 'badge-ok' :
                         t.sla_state === 'Missed' ? 'badge-breached' : 'badge-neutral';

        // Priority badge
        const prioClass = t.priority === 'Urgent' ? 'badge-breached' :
                          t.priority === 'High' ? 'badge-risk' : 'badge-neutral';

        // Owner label
        const ownerName = t.status === 'Escalated' ? (t.escalation_manager_name ? `EM: ${t.escalation_manager_name}` : 'Unassigned EM') :
                          (t.assigned_agent_name || '<em style="color:var(--text-dim);">Unassigned (Triage)</em>');

        return `
          <tr class="clickable" data-id="${t.id}">
            <td>
              <strong class="ticket-id" style="color:var(--accent-main);">${t.id}</strong>
              ${t.linked_count > 0 ? `<span class="badge badge-link" style="font-size:9px; padding:1px 4px; margin-left:2px;">${t.linked_count} linked</span>` : ''}
            </td>
            <td><code class="tboh-ref">${t.tboh}</code></td>
            <td style="max-width:280px;">
              <div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${t.title}</div>
              <div style="font-size:11px; color:var(--text-muted);">${t.category_intent}</div>
            </td>
            <td>
              <div>${t.agency_name}</div>
              <div style="font-size:11px; color:var(--text-dim);">${t.agency_region}</div>
            </td>
            <td><span class="badge ${prioClass}">${t.priority}</span></td>
            <td>
              <span class="badge ${t.status === 'Escalated' ? 'badge-risk' : t.status === 'Resolved' || t.status === 'Closed' ? 'badge-ok' : 'badge-info'}">
                ${t.status}
              </span>
            </td>
            <td>
              <span class="badge ${slaClass}">${t.sla_state}</span>
              ${t.sla_effective_priority !== t.priority ? `<span class="badge badge-risk" style="font-size:9px; margin-left:2px;">Boosted</span>` : ''}
            </td>
            <td>${ownerName}</td>
            <td class="tabular-nums" style="font-size:12px;">${createdIST}</td>
          </tr>
        `;
      }).join('');

      tbody.querySelectorAll('tr.clickable').forEach(row => {
        row.addEventListener('click', () => {
          const id = row.getAttribute('data-id');
          if (id) window.location.hash = `#ticket/${id}`;
        });
      });

      paginationInfo.textContent = `Showing ${allLoadedTickets.length} cases`;
      loadMoreBtn.style.display = currentCursor ? 'inline-flex' : 'none';

    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:20px; color:#dc2626;">Failed to load cases: ${err.message}</td></tr>`;
    }
  }

  loadMoreBtn.addEventListener('click', () => {
    if (currentCursor) {
      fetchTickets(currentCursor, true);
    }
  });

  fetchTickets();
}
