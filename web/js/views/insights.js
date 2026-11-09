// web/js/views/insights.js
// MVP-5: Product Feedback Loop: Recurring operations themes and engineering backlog linkage.

import { apiRequest } from '../api.js';
import { renderIcon } from '../icons.js';
import { showToast } from '../components/toast.js';
import { showModal } from '../components/modal.js';

export async function renderInsights(container) {
  container.innerHTML = `
    <div class="view-header">
      <div class="view-title-row">
        <div>
          <h1 class="view-title">Operations Insights & Product Feedback Loop</h1>
          <p class="view-helper">Continuous thematic clustering of agency contacts to inform engineering roadmaps and product fixes.</p>
        </div>
        <button class="btn btn-secondary" id="refresh-insights-btn">
          ${renderIcon('refresh')} Refresh Themes
        </button>
      </div>
    </div>

    <!-- Themes Overview Cards -->
    <div id="insights-content">
      <div style="text-align:center; padding:40px;"><span class="loading-spinner"></span> Aggregating conversation themes...</div>
    </div>
  `;

  const contentArea = container.querySelector('#insights-content');

  async function loadInsights() {
    try {
      const data = await apiRequest('/api/insights/themes');
      const themes = data.themes || [];

      if (themes.length === 0) {
        contentArea.innerHTML = `
          <div class="card empty-state">
            <div class="empty-state-icon">${renderIcon('tag')}</div>
            <div style="font-weight:600; font-size:14px;">No recurring themes detected yet</div>
            <p style="font-size:12px; color:var(--text-muted); margin-top:4px;">As agency cases are handled, recurring patterns will appear here automatically.</p>
          </div>
        `;
        return;
      }

      contentArea.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: var(--space-4);">
          ${themes.map(t => {
            const isIncreasing = t.delta > 0;
            const deltaColor = isIncreasing ? '#b91c1c' : t.delta < 0 ? '#15803d' : 'var(--text-dim)';
            const deltaSign = isIncreasing ? '+' : '';

            return `
              <div class="card">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:var(--space-3); flex-wrap:wrap; gap:var(--space-2);">
                  <div>
                    <div style="display:flex; align-items:center; gap:var(--space-2);">
                      <h3 style="font-size: 15px; font-weight: 600; text-transform: capitalize;">${t.theme}</h3>
                      <span class="badge badge-neutral">${t.thisWeekCount} cases this week</span>
                    </div>
                    <div style="font-size: 11px; color: var(--text-dim); margin-top: 2px;">
                      Last week: <span class="tabular-nums">${t.lastWeekCount} cases</span> • 
                      Trend: <strong class="tabular-nums" style="color: ${deltaColor};">${deltaSign}${t.delta} (${deltaSign}${t.pctChange}%)</strong>
                    </div>
                  </div>
                  <span class="badge ${isIncreasing ? 'badge-risk' : 'badge-ok'}">
                    ${isIncreasing ? 'Surging Theme' : 'Stabilizing'}
                  </span>
                </div>

                <!-- Sample Cases for this theme -->
                <div style="background:var(--bg-subtle); border-radius:var(--radius-md); padding:var(--space-3); border:1px solid var(--border-subtle);">
                  <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--text-dim); margin-bottom: var(--space-2);">
                    Recent Sample Cases for Investigation
                  </div>
                  <div style="display:flex; flex-direction:column; gap:var(--space-2);">
                    ${(t.sampleTickets || []).map(sample => `
                      <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-surface); padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); font-size:12px;">
                        <div>
                          <a href="#ticket/${sample.id}" style="color:var(--accent-main); font-weight:600; text-decoration:none;">${sample.id}</a>
                          <span style="font-weight:500; margin-left:4px;">${sample.title}</span>
                          <span style="font-size:11px; color:var(--text-dim); margin-left:6px;">(${sample.agency_name})</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:var(--space-2);">
                          ${sample.product_bug_link ? `
                            <span class="badge badge-link" style="font-size:10px;" title="${sample.product_bug_link}">
                              Linked to Product Bug
                            </span>
                          ` : `
                            <button class="btn btn-outline btn-sm btn-link-bug" data-id="${sample.id}">
                              Link to Product Bug
                            </button>
                          `}
                        </div>
                      </div>
                    `).join('')}
                  </div>
                </div>

              </div>
            `;
          }).join('')}
        </div>
      `;

      // Link to Product Bug modal handler
      contentArea.querySelectorAll('.btn-link-bug').forEach(btn => {
        btn.addEventListener('click', () => {
          const ticketId = btn.getAttribute('data-id');
          showModal({
            title: `Link Case ${ticketId} to Engineering / Bug Tracker`,
            contentHtml: `
              <div class="form-group">
                <label class="form-label" for="bug-link-url">Issue Tracker URL or JIRA/GitHub Key</label>
                <input type="text" id="bug-link-url" class="form-input" placeholder="e.g. JIRA-TRAVEL-4091 or https://issues.internal/OPS-82" required />
                <div class="form-hint">Connects recurring operational friction directly to product backlog sprint planning.</div>
              </div>
              <div style="display:flex; justify-content:flex-end; gap:var(--space-2);">
                <button class="btn btn-secondary cancel-modal-btn">Cancel</button>
                <button class="btn btn-primary confirm-bug-btn">Save Backlog Link</button>
              </div>
            `,
            onRender: (modal, closeModal) => {
              const input = modal.querySelector('#bug-link-url');
              modal.querySelector('.cancel-modal-btn').addEventListener('click', closeModal);
              modal.querySelector('.confirm-bug-btn').addEventListener('click', async () => {
                const link = input.value.trim();
                if (!link) return;
                try {
                  await apiRequest(`/api/tickets/${ticketId}/product-link`, {
                    method: 'POST',
                    body: { link }
                  });
                  closeModal();
                  showToast('Product bug linkage saved', 'info');
                  loadInsights();
                } catch (err) {
                  showToast(err.message, 'error');
                }
              });
            }
          });
        });
      });

    } catch (err) {
      contentArea.innerHTML = `<div style="color:#dc2626; padding:20px;">Failed to load insights: ${err.message}</div>`;
    }
  }

  container.querySelector('#refresh-insights-btn').addEventListener('click', loadInsights);
  loadInsights();
}
