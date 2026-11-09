// web/js/views/ticket_detail.js
// Ticket Workspace: Status Stepper, Two-Column Layout, "Why this owner", "Why this SLA", Related Cases, Side Convos.

import { apiRequest } from '../api.js';
import { renderIcon } from '../icons.js';
import { store } from '../store.js';
import { showToast } from '../components/toast.js';
import { showModal, confirmDialog } from '../components/modal.js';

export async function renderTicketDetail(container, ticketId) {
  container.innerHTML = `
    <div class="breadcrumbs">
      <a href="#queues?queue=all">Queues</a>
      <span>/</span>
      <span class="tabular-nums" style="font-weight:600;">${ticketId}</span>
    </div>

    <div id="ticket-content-area">
      <div style="text-align:center; padding:40px;"><span class="loading-spinner"></span> Loading case details...</div>
    </div>
  `;

  const contentArea = container.querySelector('#ticket-content-area');

  async function loadTicket() {
    try {
      const data = await apiRequest(`/api/tickets/${ticketId}`);
      const t = data.ticket;
      const messages = data.messages || [];
      const linkedCases = data.linkedCases || [];
      const timeline = data.timeline || [];
      const repeatTbohCount = data.repeatTbohCount || 1;
      const allowedTransitions = data.allowedTransitions || [];
      const currentUser = store.user;
      const isRequester = currentUser && currentUser.role === 'requester';

      // Format IST strings
      const createdIST = new Date(t.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST';
      const dueIST = new Date(t.sla_due_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST';
      const checkInIST = t.check_in_date ? new Date(t.check_in_date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST' : 'Not specified';
      const lcdIST = t.lcd_date ? new Date(t.lcd_date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST' : 'Not specified';

      // Stepper status order
      const STEPS = ['New', 'Open', 'Pending', 'Escalated', 'Resolved', 'Closed'];
      const currentIndex = STEPS.indexOf(t.status);

      const stepperHtml = `
        <div class="status-stepper">
          ${STEPS.map((s, idx) => {
            const isCompleted = idx < currentIndex;
            const isActive = s === t.status;
            return `
              <div class="stepper-step ${isActive ? 'active' : isCompleted ? 'completed' : ''}">
                <span style="font-family:var(--font-mono); font-size:10px;">${idx + 1}</span>
                <span>${s}</span>
              </div>
              ${idx < STEPS.length - 1 ? '<span class="stepper-divider">&rsaquo;</span>' : ''}
            `;
          }).join('')}
        </div>
      `;

      // SLA Badge class
      const slaClass = t.sla_state === 'Breached' ? 'badge-breached' :
                       t.sla_state === 'At-risk' ? 'badge-risk' :
                       t.sla_state === 'Met' ? 'badge-ok' :
                       t.sla_state === 'Missed' ? 'badge-breached' : 'badge-neutral';

      contentArea.innerHTML = `
        <!-- Top Case Title and Quick Actions Bar -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:var(--space-4); flex-wrap:wrap; gap:var(--space-3);">
          <div>
            <div style="display:flex; align-items:center; gap:var(--space-2); margin-bottom:var(--space-1);">
              <h1 style="font-size: 20px; font-weight: 600;">${t.title}</h1>
              <span class="badge ${t.priority === 'Urgent' ? 'badge-breached' : t.priority === 'High' ? 'badge-risk' : 'badge-neutral'}">
                ${t.priority}
              </span>
              <span class="badge ${slaClass}">${t.sla_state}</span>
            </div>
            <div style="display:flex; gap:var(--space-3); font-size:12px; color:var(--text-muted); flex-wrap:wrap;">
              <span>Case ID: <strong class="ticket-id" style="color:var(--accent-main);">${t.id}</strong></span>
              <span>TBOH: <strong class="tboh-ref">${t.tboh}</strong></span>
              <span>Agency: <strong>${t.agency_name} (${t.agency_code})</strong></span>
              <span>Requester: <strong>${t.requester_name}</strong></span>
            </div>
          </div>

          <!-- Action Buttons for Staff -->
          ${!isRequester ? `
            <div style="display:flex; gap:var(--space-2); flex-wrap:wrap;">
              ${t.status !== 'Escalated' ? `
                <button class="btn btn-outline btn-sm" id="btn-escalate-case">
                  ${renderIcon('alertTriangle')} Escalate to Manager
                </button>
              ` : `
                <button class="btn btn-secondary btn-sm" id="btn-handback-case">
                  ${renderIcon('arrowRight')} Hand Back to Agent
                </button>
              `}
              
              <button class="btn btn-secondary btn-sm" id="btn-reassign-case">
                ${renderIcon('user')} Reassign
              </button>

              ${allowedTransitions.length > 0 ? `
                <div style="display:inline-flex; gap:var(--space-1);">
                  ${allowedTransitions.map(st => `
                    <button class="btn btn-sm ${st === 'Resolved' || st === 'Closed' ? 'btn-primary' : 'btn-secondary'} btn-transition-status" data-target="${st}">
                      ${st === 'Resolved' ? 'Resolve Case' : st === 'Closed' ? 'Close Case' : `Move to ${st}`}
                    </button>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          ` : ''}
        </div>

        ${stepperHtml}

        <!-- Two Column Layout: Main Conversation / Sides / Timeline vs Metadata / Whys -->
        <div style="display:grid; grid-template-columns: 2fr 1fr; gap:var(--space-6); align-items:start;">
          
          <!-- LEFT COLUMN: Tabs for Messages, Side Convos, Timeline -->
          <div>
            <!-- Tab Headers -->
            <div style="display:flex; gap:var(--space-2); border-bottom:1px solid var(--border-main); margin-bottom:var(--space-4);">
              <button class="btn btn-sm tab-header-btn active" data-tab="tab-messages" style="border-radius:var(--radius-sm) var(--radius-sm) 0 0; border-bottom:2px solid var(--accent-main);">
                ${renderIcon('messageSquare')} Conversation Thread (${messages.length})
              </button>
              ${!isRequester ? `
                <button class="btn btn-sm tab-header-btn" data-tab="tab-side-convos" style="border-radius:var(--radius-sm) var(--radius-sm) 0 0;">
                  ${renderIcon('users')} Side Conversations
                </button>
              ` : ''}
              <button class="btn btn-sm tab-header-btn" data-tab="tab-timeline" style="border-radius:var(--radius-sm) var(--radius-sm) 0 0;">
                ${renderIcon('clock')} Activity Timeline (${timeline.length})
              </button>
            </div>

            <!-- TAB 1: Messages Conversation Feed -->
            <div id="tab-messages" class="tab-pane active">
              <div class="conversation-feed">
                ${messages.map(m => {
                  const isNote = m.message_type === 'internal_note';
                  const msgDate = new Date(m.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
                  return `
                    <div class="message-card ${isNote ? 'internal-note' : ''}">
                      <div class="message-header">
                        <div style="display:flex; align-items:center; gap:var(--space-2);">
                          <strong>${m.sender_name}</strong>
                          <span style="font-size:11px; text-transform:capitalize; color:var(--text-dim);">(${m.sender_role})</span>
                          ${isNote ? `
                            <span class="badge" style="background:#fef3c7; color:#92400e; font-size:10px;">
                              ${renderIcon('lock')} Internal Note - Hidden from Agency
                            </span>
                          ` : ''}
                        </div>
                        <div class="tabular-nums" style="font-size:11px; color:var(--text-dim);">${msgDate}</div>
                      </div>
                      <div class="message-body">${m.body}</div>
                    </div>
                  `;
                }).join('')}
              </div>

              <!-- Message Composer Form -->
              <div class="card" style="margin-top:var(--space-4);">
                <div class="card-title" style="margin-bottom:var(--space-3); font-size:13px;">Add Response</div>
                <form id="reply-form">
                  ${!isRequester ? `
                    <div style="display:flex; gap:var(--space-4); margin-bottom:var(--space-2); font-size:12px;">
                      <label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
                        <input type="radio" name="reply_type" value="public_reply" checked />
                        <span>Public Reply (Visible to Agency)</span>
                      </label>
                      <label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
                        <input type="radio" name="reply_type" value="internal_note" />
                        <span style="color:#92400e; font-weight:600;">Internal Staff Note</span>
                      </label>
                    </div>
                  ` : ''}
                  <textarea id="reply-body" class="form-textarea" placeholder="Type your message or notes here... (Sensitive credentials & card numbers are masked automatically)" required></textarea>
                  <div style="display:flex; justify-content:flex-end; margin-top:var(--space-2);">
                    <button type="submit" class="btn btn-primary btn-sm">Send Response</button>
                  </div>
                </form>
              </div>
            </div>

            <!-- TAB 2: Side Conversations (Staff Only) -->
            ${!isRequester ? `
              <div id="tab-side-convos" class="tab-pane" style="display:none;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-4);">
                  <div>
                    <h3 style="font-size:14px; font-weight:600;">Partner & Supplier Side Conversations</h3>
                    <p style="font-size:12px; color:var(--text-muted);">Independent recipient threads that survive transfers without breaking.</p>
                  </div>
                  <button class="btn btn-primary btn-sm" id="btn-new-side-convo">
                    ${renderIcon('plus')} New Side Thread
                  </button>
                </div>
                <div id="side-convos-list">
                  <div style="text-align:center; padding:20px;"><span class="loading-spinner"></span> Loading threads...</div>
                </div>
              </div>
            ` : ''}

            <!-- TAB 3: Activity Timeline -->
            <div id="tab-timeline" class="tab-pane" style="display:none;">
              <div class="timeline-feed">
                ${timeline.map(item => {
                  const itemDate = new Date(item.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
                  return `
                    <div class="timeline-item">
                      <div class="timeline-dot"></div>
                      <div class="timeline-content">
                        <div class="timeline-summary">${item.summary}</div>
                        <div class="timeline-meta">By <strong>${item.actor_name}</strong> • <span class="tabular-nums">${itemDate}</span></div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

          </div>

          <!-- RIGHT COLUMN: Whys, Links, and Case Details -->
          <div>
            
            <!-- "Why this owner" Card (MVP-2) -->
            ${!isRequester ? `
              <div class="card">
                <div class="card-title">${renderIcon('user')} Why this owner?</div>
                <div class="why-box" style="margin-top:var(--space-2);">
                  <div class="why-box-title">${renderIcon('checkCircle')} Routing Logic</div>
                  <p style="font-size:12px; line-height:1.4; color:var(--text-main);">${t.routing_reason || 'Manual assignment'}</p>
                </div>
                ${t.routing_breakdown && t.routing_breakdown.winner ? `
                  <div style="font-size:11px; margin-top:var(--space-2);">
                    <div style="font-weight:600; color:var(--text-dim); margin-bottom:4px; text-transform:uppercase;">Score Breakdown (+${t.routing_breakdown.winner.totalScore} pts)</div>
                    ${(t.routing_breakdown.winner.breakdown || []).map(b => `
                      <div class="why-score-item">
                        <span>${b.factor}</span>
                        <strong class="tabular-nums" style="color:${b.points > 0 ? 'var(--status-ok-text)' : b.points < 0 ? 'var(--status-breached-text)' : 'inherit'};">
                          ${b.points > 0 ? `+${b.points}` : b.points}
                        </strong>
                      </div>
                    `).join('')}
                  </div>
                ` : ''}
              </div>
            ` : ''}

            <!-- "Why this SLA" Card (MVP-4) -->
            <div class="card">
              <div class="card-title">${renderIcon('clock')} Why this SLA?</div>
              <div class="why-box" style="margin-top:var(--space-2);">
                <div class="why-box-title">${renderIcon('alertTriangle')} Travel Proximity Boost</div>
                <p style="font-size:12px; line-height:1.4; color:var(--text-main);">${t.why_sla ? t.why_sla.boostReason : 'Standard SLA clock.'}</p>
                <div style="margin-top:6px; font-size:11px; color:var(--text-muted);">
                  Status: <strong>${t.why_sla ? t.why_sla.stateReason : ''}</strong>
                </div>
              </div>
              <div style="font-size:11px; color:var(--text-muted); display:flex; flex-direction:column; gap:4px;">
                <div style="display:flex; justify-content:space-between;">
                  <span>Base Window:</span>
                  <strong class="tabular-nums">${t.why_sla ? t.why_sla.baseHours : 24} hours</strong>
                </div>
                <div style="display:flex; justify-content:space-between;">
                  <span>Guaranteed Deadline:</span>
                  <strong class="tabular-nums" style="color:var(--text-main);">${dueIST}</strong>
                </div>
              </div>
            </div>

            <!-- "Related cases" Linked Cases Card (MVP-1) -->
            <div class="card">
              <div class="card-header">
                <div class="card-title">${renderIcon('link')} Related Cases</div>
                ${repeatTbohCount > 1 ? `<span class="badge badge-risk">${repeatTbohCount}rd contact on this TBOH</span>` : ''}
              </div>
              ${linkedCases.length === 0 ? `
                <div style="font-size:12px; color:var(--text-muted); padding:var(--space-2) 0;">No prior linked cases for this booking.</div>
              ` : `
                <div style="display:flex; flex-direction:column; gap:var(--space-2);">
                  ${linkedCases.map(link => `
                    <div style="padding:var(--space-2); background:var(--bg-subtle); border-radius:var(--radius-sm); font-size:12px; border:1px solid var(--border-subtle);">
                      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                        <a href="#ticket/${link.ticket.id}" style="color:var(--accent-main); font-weight:600; text-decoration:none;">${link.ticket.id}</a>
                        <span class="badge ${link.linkType === 'strong_tboh' ? 'badge-risk' : 'badge-neutral'}" style="font-size:9px;">
                          ${link.linkType === 'strong_tboh' ? 'Same TBOH' : link.linkType === 'medium_intent_agency' ? '30d Intent Match' : 'Manual'}
                        </span>
                      </div>
                      <div style="font-weight:500; font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${link.ticket.title}</div>
                      <div style="font-size:10px; color:var(--text-dim); margin-top:2px;">${link.linkReason}</div>
                    </div>
                  `).join('')}
                </div>
              `}
              ${!isRequester ? `
                <button class="btn btn-outline btn-sm" id="btn-manual-link-case" style="width:100%; margin-top:var(--space-3);">
                  ${renderIcon('plus')} Link Another Case
                </button>
              ` : ''}
            </div>

            <!-- Travel Key Dates -->
            <div class="card">
              <div class="card-title">${renderIcon('compass')} Travel Details</div>
              <div style="font-size:12px; display:flex; flex-direction:column; gap:6px; margin-top:var(--space-2);">
                <div>
                  <span style="color:var(--text-dim);">Check-in Date:</span>
                  <div class="tabular-nums" style="font-weight:600;">${checkInIST}</div>
                </div>
                <div>
                  <span style="color:var(--text-dim);">Last Cancellation Date (LCD):</span>
                  <div class="tabular-nums" style="font-weight:600;">${lcdIST}</div>
                </div>
                <div>
                  <span style="color:var(--text-dim);">Created At:</span>
                  <div class="tabular-nums">${createdIST}</div>
                </div>
              </div>
            </div>

          </div>

        </div>
      `;

      // Tab switching handler
      contentArea.querySelectorAll('.tab-header-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          contentArea.querySelectorAll('.tab-header-btn').forEach(b => {
            b.classList.remove('active');
            b.style.borderBottom = 'none';
          });
          contentArea.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');

          btn.classList.add('active');
          btn.style.borderBottom = '2px solid var(--accent-main)';
          const tabId = btn.getAttribute('data-tab');
          const targetPane = contentArea.querySelector(`#${tabId}`);
          if (targetPane) {
            targetPane.style.display = 'block';
            if (tabId === 'tab-side-convos') loadSideConvos();
          }
        });
      });

      // Reply form submission
      const replyForm = contentArea.querySelector('#reply-form');
      const replyBody = contentArea.querySelector('#reply-body');
      replyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = replyBody.value.trim();
        if (!text) return;

        let replyType = 'public_reply';
        const typeRadio = replyForm.querySelector('input[name="reply_type"]:checked');
        if (typeRadio) replyType = typeRadio.value;

        try {
          await apiRequest(`/api/tickets/${ticketId}/messages`, {
            method: 'POST',
            body: { body: text, message_type: replyType }
          });
          showToast(replyType === 'internal_note' ? 'Internal note added' : 'Reply sent to agency', 'info');
          loadTicket();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });

      // Status transitions
      contentArea.querySelectorAll('.btn-transition-status').forEach(btn => {
        btn.addEventListener('click', async () => {
          const targetStatus = btn.getAttribute('data-target');
          const confirmed = await confirmDialog({
            title: `Move Case to ${targetStatus}`,
            message: `Are you sure you want to transition case ${ticketId} from ${t.status} to ${targetStatus}?`,
            confirmText: `Confirm ${targetStatus}`,
            isDanger: targetStatus === 'Closed'
          });
          if (!confirmed) return;

          try {
            await apiRequest(`/api/tickets/${ticketId}/status`, {
              method: 'PATCH',
              body: { status: targetStatus }
            });
            showToast(`Case moved to ${targetStatus}`, 'info');
            store.refreshCounts();
            loadTicket();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });

      // Escalate action button
      const escalateBtn = contentArea.querySelector('#btn-escalate-case');
      if (escalateBtn) {
        escalateBtn.addEventListener('click', () => {
          showModal({
            title: `Escalate Case ${ticketId} to Escalation Manager`,
            contentHtml: `
              <div class="form-group">
                <label class="form-label" for="esc-reason">Mandatory Escalation Reason</label>
                <textarea id="esc-reason" class="form-textarea" placeholder="Detail the financial or operational block requiring Escalation Manager signoff..." required></textarea>
                <div class="form-hint">Reason is auditable and visible in timeline. Automatically assigns best available EM by region and lowest workload.</div>
              </div>
              <div style="display:flex; justify-content:flex-end; gap:var(--space-2);">
                <button class="btn btn-secondary cancel-modal-btn">Cancel</button>
                <button class="btn btn-danger confirm-esc-btn">Confirm Escalation</button>
              </div>
            `,
            onRender: (modal, closeModal) => {
              const reasonInput = modal.querySelector('#esc-reason');
              const confirmBtn = modal.querySelector('.confirm-esc-btn');
              const cancelBtn = modal.querySelector('.cancel-modal-btn');
              cancelBtn.addEventListener('click', closeModal);

              confirmBtn.addEventListener('click', async () => {
                const reason = reasonInput.value.trim();
                if (reason.length < 5) {
                  showToast('Escalation reason must be at least 5 characters.', 'error');
                  return;
                }
                try {
                  confirmBtn.disabled = true;
                  const res = await apiRequest(`/api/tickets/${ticketId}/escalate`, {
                    method: 'POST',
                    body: { reason }
                  });
                  closeModal();
                  showToast(`Escalated to ${res.escalationManagerName}!`, 'info');
                  store.refreshCounts();
                  loadTicket();
                } catch (err) {
                  showToast(err.message, 'error');
                  confirmBtn.disabled = false;
                }
              });
            }
          });
        });
      }

      // Hand back action button
      const handBackBtn = contentArea.querySelector('#btn-handback-case');
      if (handBackBtn) {
        handBackBtn.addEventListener('click', async () => {
          const confirmed = await confirmDialog({
            title: 'Hand Back from Escalation',
            message: `Return case ${ticketId} to normal operations queue? Previous owner will be restored.`,
            confirmText: 'Hand Back'
          });
          if (!confirmed) return;
          try {
            await apiRequest(`/api/tickets/${ticketId}/deescalate`, {
              method: 'POST',
              body: { notes: 'Resolved by Escalation Manager' }
            });
            showToast('Case returned to operations queue', 'info');
            store.refreshCounts();
            loadTicket();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      }

      // Reassign action button
      const reassignBtn = contentArea.querySelector('#btn-reassign-case');
      if (reassignBtn) {
        reassignBtn.addEventListener('click', async () => {
          const agentsRes = await apiRequest('/api/agents');
          const agents = agentsRes.agents || [];

          showModal({
            title: `Reassign Case ${ticketId}`,
            contentHtml: `
              <div class="form-group">
                <label class="form-label" for="reassign-agent-select">Select New Case Owner</label>
                <select id="reassign-agent-select" class="form-select">
                  <option value="">-- Send to Triage (Unassign) --</option>
                  ${agents.map(a => `
                    <option value="${a.id}" ${a.id === t.assigned_agent_id ? 'selected' : ''}>
                      ${a.name} (${a.region || 'Ops'} • ${a.shift_start ? `${a.shift_start}-${a.shift_end}` : 'Flexible'})
                    </option>
                  `).join('')}
                </select>
                <div class="form-hint">Side conversation recipient lists remain completely intact upon reassignment.</div>
              </div>
              <div style="display:flex; justify-content:flex-end; gap:var(--space-2);">
                <button class="btn btn-secondary cancel-modal-btn">Cancel</button>
                <button class="btn btn-primary confirm-reassign-btn">Save Assignment</button>
              </div>
            `,
            onRender: (modal, closeModal) => {
              const select = modal.querySelector('#reassign-agent-select');
              modal.querySelector('.cancel-modal-btn').addEventListener('click', closeModal);
              modal.querySelector('.confirm-reassign-btn').addEventListener('click', async () => {
                const agentId = select.value || null;
                try {
                  await apiRequest(`/api/tickets/${ticketId}/assign`, {
                    method: 'POST',
                    body: { agent_id: agentId }
                  });
                  closeModal();
                  showToast('Assignment updated', 'info');
                  store.refreshCounts();
                  loadTicket();
                } catch (err) {
                  showToast(err.message, 'error');
                }
              });
            }
          });
        });
      }

      // Manual Link action button
      const manualLinkBtn = contentArea.querySelector('#btn-manual-link-case');
      if (manualLinkBtn) {
        manualLinkBtn.addEventListener('click', () => {
          showModal({
            title: `Link Another Case to ${ticketId}`,
            contentHtml: `
              <div class="form-group">
                <label class="form-label" for="target-link-id">Target Case ID</label>
                <input type="text" id="target-link-id" class="form-input" placeholder="e.g. TBO-1001" required />
                <div class="form-hint">Links both cases bi-directionally with full activity audit logging.</div>
              </div>
              <div style="display:flex; justify-content:flex-end; gap:var(--space-2);">
                <button class="btn btn-secondary cancel-modal-btn">Cancel</button>
                <button class="btn btn-primary confirm-link-btn">Create Link</button>
              </div>
            `,
            onRender: (modal, closeModal) => {
              const input = modal.querySelector('#target-link-id');
              modal.querySelector('.cancel-modal-btn').addEventListener('click', closeModal);
              modal.querySelector('.confirm-link-btn').addEventListener('click', async () => {
                const targetId = input.value.trim().toUpperCase();
                if (!targetId) return;
                try {
                  await apiRequest(`/api/tickets/${ticketId}/links`, {
                    method: 'POST',
                    body: { targetTicketId: targetId }
                  });
                  closeModal();
                  showToast(`Successfully linked to ${targetId}`, 'info');
                  loadTicket();
                } catch (err) {
                  showToast(err.message, 'error');
                }
              });
            }
          });
        });
      }

      // Helper to load side conversations
      async function loadSideConvos() {
        const sideList = contentArea.querySelector('#side-convos-list');
        if (!sideList) return;

        try {
          const res = await apiRequest(`/api/tickets/${ticketId}/side-conversations`);
          const convos = res.sideConversations || [];

          if (convos.length === 0) {
            sideList.innerHTML = `
              <div class="empty-state" style="padding:20px 0;">
                <div class="empty-state-icon">${renderIcon('messageSquare')}</div>
                <div style="font-size:13px; font-weight:600;">No active side threads</div>
                <p style="font-size:12px; color:var(--text-muted);">Start an external thread with hotel suppliers, transport, or finance partners.</p>
              </div>
            `;
            return;
          }

          sideList.innerHTML = convos.map(c => `
            <div class="card" style="margin-bottom:var(--space-4);">
              <div class="card-header">
                <div>
                  <div style="font-weight:600; font-size:13px;">${c.subject}</div>
                  <div style="font-size:11px; color:var(--text-dim);">Supplier: <strong>${c.supplier_name || 'External Partner'}</strong></div>
                </div>
                <button class="btn btn-secondary btn-sm btn-edit-recipients" data-id="${c.id}">
                  ${renderIcon('users')} Edit Recipients (${c.recipients.length})
                </button>
              </div>

              <!-- Recipient Pills -->
              <div class="recipient-list">
                ${c.recipients.map(r => `
                  <span class="recipient-chip ${!r.is_known_domain ? 'external-warning' : ''}" title="${r.email}">
                    ${r.name || r.email}
                    ${!r.is_known_domain ? `<span style="color:#b45309; font-weight:700;">⚠ Unknown Domain</span>` : ''}
                  </span>
                `).join('')}
              </div>

              <!-- Side Messages -->
              <div style="display:flex; flex-direction:column; gap:var(--space-2); margin-top:var(--space-3);">
                ${c.messages.map(sm => `
                  <div style="background:var(--bg-subtle); border-radius:var(--radius-sm); padding:var(--space-2) var(--space-3); font-size:12px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:2px; font-size:11px; color:var(--text-dim);">
                      <strong>${sm.sender_name}</strong>
                      <span class="tabular-nums">${new Date(sm.created_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div style="white-space:pre-wrap;">${sm.body}</div>
                  </div>
                `).join('')}
              </div>

              <!-- Side Message Reply -->
              <form class="side-reply-form" data-id="${c.id}" style="margin-top:var(--space-3); display:flex; gap:var(--space-2);">
                <input type="text" class="form-input side-reply-input" style="padding:4px 10px; font-size:12px;" placeholder="Send reply to current recipients snapshot..." required />
                <button type="submit" class="btn btn-primary btn-sm">Send</button>
              </form>
            </div>
          `).join('');

          // Reply handler for side convo
          sideList.querySelectorAll('.side-reply-form').forEach(sForm => {
            sForm.addEventListener('submit', async (e) => {
              e.preventDefault();
              const sId = sForm.getAttribute('data-id');
              const input = sForm.querySelector('.side-reply-input');
              const text = input.value.trim();
              if (!text) return;
              try {
                await apiRequest(`/api/side-conversations/${sId}/messages`, {
                  method: 'POST',
                  body: { body: text }
                });
                showToast('Side conversation message sent', 'info');
                loadSideConvos();
              } catch (err) {
                showToast(err.message, 'error');
              }
            });
          });

        } catch (err) {
          sideList.innerHTML = `<div style="color:#dc2626; padding:10px;">Failed to load side conversations: ${err.message}</div>`;
        }
      }

      // New Side Thread Button
      const newSideBtn = contentArea.querySelector('#btn-new-side-convo');
      if (newSideBtn) {
        newSideBtn.addEventListener('click', () => {
          showModal({
            title: `Start Supplier Side Conversation`,
            contentHtml: `
              <div class="form-group">
                <label class="form-label">Subject</label>
                <input type="text" id="side-subject" class="form-input" placeholder="e.g. Reconfirmation of Early Check-in" required />
              </div>
              <div class="form-group">
                <label class="form-label">Supplier / Partner Name</label>
                <input type="text" id="side-supplier" class="form-input" placeholder="e.g. Goa Heritage Luxury Villas" />
              </div>
              <div class="form-group">
                <label class="form-label">Recipients (Email addresses separated by comma)</label>
                <input type="text" id="side-recipients-str" class="form-input" placeholder="reservations@goaheritage.supplier.example, manager@supplier.example" required />
                <div class="form-hint">Stored directly on thread. Independent of ticket group.</div>
              </div>
              <div class="form-group">
                <label class="form-label">Initial Message</label>
                <textarea id="side-msg" class="form-textarea" placeholder="Dear Reservations team, kindly confirm room status..."></textarea>
              </div>
              <div style="display:flex; justify-content:flex-end; gap:var(--space-2);">
                <button class="btn btn-secondary cancel-modal-btn">Cancel</button>
                <button class="btn btn-primary confirm-side-btn">Start Side Thread</button>
              </div>
            `,
            onRender: (modal, closeModal) => {
              modal.querySelector('.cancel-modal-btn').addEventListener('click', closeModal);
              modal.querySelector('.confirm-side-btn').addEventListener('click', async () => {
                const subject = modal.querySelector('#side-subject').value.trim();
                const supplier_name = modal.querySelector('#side-supplier').value.trim();
                const rawRecs = modal.querySelector('#side-recipients-str').value.trim();
                const initial_message = modal.querySelector('#side-msg').value.trim();

                const recipients = rawRecs.split(',').map(s => s.trim()).filter(Boolean).map(email => ({ email, name: email }));

                if (!subject || recipients.length === 0) {
                  showToast('Subject and at least one recipient are required', 'error');
                  return;
                }

                try {
                  const res = await apiRequest(`/api/tickets/${ticketId}/side-conversations`, {
                    method: 'POST',
                    body: { subject, supplier_name, recipients, initial_message }
                  });
                  closeModal();
                  if (res.warnings && res.warnings.length > 0) {
                    showToast(res.warnings.join(' '), 'info');
                  } else {
                    showToast('Side conversation thread created', 'info');
                  }
                  loadSideConvos();
                } catch (err) {
                  showToast(err.message, 'error');
                }
              });
            }
          });
        });
      }

    } catch (err) {
      contentArea.innerHTML = `<div style="text-align:center; padding:40px; color:#dc2626;">Failed to load case: ${err.message}</div>`;
    }
  }

  loadTicket();
}
