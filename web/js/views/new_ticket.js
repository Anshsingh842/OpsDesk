// web/js/views/new_ticket.js
// Ticket Creation form with real-time rule-based intent suggester and travel proximity fields.

import { apiRequest } from '../api.js';
import { renderIcon } from '../icons.js';
import { store } from '../store.js';
import { showToast } from '../components/toast.js';

export async function renderNewTicket(container) {
  const isRequester = store.user && store.user.role === 'requester';

  container.innerHTML = `
    <div class="view-header">
      <div class="view-title-row">
        <div>
          <h1 class="view-title">Create New Operations Case</h1>
          <p class="view-helper">Submit a context-rich travel operations case with TBOH reference and travel proximity dates.</p>
        </div>
        <a href="#queues?queue=all" class="btn btn-secondary">
          Cancel
        </a>
      </div>
    </div>

    <div style="max-width: 760px; margin: 0 auto;">
      <div class="card">
        <form id="new-ticket-form">

          <!-- TBOH Reference & Priority -->
          <div style="display: grid; grid-template-columns: 2fr 1fr; gap: var(--space-4);">
            <div class="form-group">
              <label class="form-label" for="ticket-tboh">TBOH Booking Reference *</label>
              <input type="text" id="ticket-tboh" class="form-input" placeholder="e.g. TBOH-88219" required />
              <div class="form-hint">Canonical booking code. Automatically links all inquiries sharing this booking.</div>
            </div>

            <div class="form-group">
              <label class="form-label" for="ticket-priority">Priority</label>
              <select id="ticket-priority" class="form-select">
                <option value="Normal" selected>Normal (24h SLA)</option>
                <option value="Urgent">Urgent (2h SLA)</option>
                <option value="High">High (8h SLA)</option>
                <option value="Low">Low (72h SLA)</option>
              </select>
            </div>
          </div>

          <!-- Title -->
          <div class="form-group">
            <label class="form-label" for="ticket-title">Case Subject / Title *</label>
            <input type="text" id="ticket-title" class="form-input" placeholder="e.g. Refund kab aayega for cancelled flight booking" maxlength="150" required />
          </div>

          <!-- Description -->
          <div class="form-group">
            <label class="form-label" for="ticket-description">Detailed Description *</label>
            <textarea id="ticket-description" class="form-textarea" style="min-height: 120px;" placeholder="Provide clear details regarding the guest situation or supplier issue... (Payment card numbers and credentials will be masked automatically before storage)" maxlength="5000" required></textarea>
          </div>

          <!-- Intent Suggester Box (Realtime Assistant) -->
          <div id="intent-suggester-box" class="why-box" style="display: none; margin-bottom: var(--space-4);">
            <div class="why-box-title">
              ${renderIcon('tag')} Smart Intent Classifier (Rule-based)
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-2); margin-top: 4px;">
              <div>
                Suggested Intent: <strong id="suggested-intent-name" style="color: var(--accent-text);">-</strong>
                <span id="suggested-confidence-badge" class="badge badge-ok" style="margin-left: 6px;">-</span>
                <div id="suggested-matched-words" style="font-size: 11px; color: var(--text-dim); margin-top: 2px;"></div>
              </div>
              <button type="button" class="btn btn-primary btn-sm" id="btn-apply-suggested-intent">
                Apply Suggestion
              </button>
            </div>
          </div>

          <!-- Category / Intent Selector -->
          <div class="form-group">
            <label class="form-label" for="ticket-intent">Category Intent *</label>
            <select id="ticket-intent" class="form-select" required>
              <option value="">-- Select or Apply Suggestion --</option>
              <option value="Refund">Refund</option>
              <option value="Cancellation">Cancellation</option>
              <option value="Amendment">Amendment</option>
              <option value="Payment issue">Payment issue</option>
              <option value="Voucher/Documents">Voucher/Documents</option>
              <option value="Inventory/Availability">Inventory/Availability</option>
              <option value="Supplier confirmation">Supplier confirmation</option>
              <option value="Special request">Special request</option>
              <option value="Commission/Credit">Commission/Credit</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <!-- Travel Proximity Dates -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
            <div class="form-group">
              <label class="form-label" for="ticket-checkin">Check-in Date & Time (Optional)</label>
              <input type="datetime-local" id="ticket-checkin" class="form-input" />
              <div class="form-hint">Proximity within 12h triggers automated Urgent SLA boost.</div>
            </div>

            <div class="form-group">
              <label class="form-label" for="ticket-lcd">Last Cancellation Date (LCD) (Optional)</label>
              <input type="datetime-local" id="ticket-lcd" class="form-input" />
              <div class="form-hint">Penalty cutoff date. Proximity within 48h triggers High priority boost.</div>
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-4);">
            <a href="#queues?queue=all" class="btn btn-secondary">Cancel</a>
            <button type="submit" class="btn btn-primary" id="btn-submit-ticket">
              ${renderIcon('check')} Submit Operations Case
            </button>
          </div>

        </form>
      </div>
    </div>
  `;

  const form = container.querySelector('#new-ticket-form');
  const titleInput = container.querySelector('#ticket-title');
  const descInput = container.querySelector('#ticket-description');
  const tbohInput = container.querySelector('#ticket-tboh');
  const prioritySelect = container.querySelector('#ticket-priority');
  const intentSelect = container.querySelector('#ticket-intent');
  const checkinInput = container.querySelector('#ticket-checkin');
  const lcdInput = container.querySelector('#ticket-lcd');

  const suggesterBox = container.querySelector('#intent-suggester-box');
  const suggesterName = container.querySelector('#suggested-intent-name');
  const suggesterBadge = container.querySelector('#suggested-confidence-badge');
  const suggesterWords = container.querySelector('#suggested-matched-words');
  const applySugBtn = container.querySelector('#btn-apply-suggested-intent');

  let activeSuggestion = null;
  let suggestTimeout = null;

  async function checkSuggestion() {
    const title = titleInput.value.trim();
    const description = descInput.value.trim();

    if (!title && !description) {
      suggesterBox.style.display = 'none';
      return;
    }

    try {
      const res = await apiRequest('/api/tickets/suggest-intent', {
        method: 'POST',
        body: { title, description }
      });

      if (res.top_intent && res.top_intent !== 'Other') {
        activeSuggestion = res.top_intent;
        suggesterName.textContent = res.top_intent;
        suggesterBadge.textContent = `${Math.round(res.confidence * 100)}% Match`;
        suggesterWords.textContent = res.matched_words.length > 0 ? `Matched terms: ${res.matched_words.join(', ')}` : '';
        suggesterBox.style.display = 'block';
      } else {
        suggesterBox.style.display = 'none';
      }
    } catch (e) {}
  }

  titleInput.addEventListener('input', () => {
    clearTimeout(suggestTimeout);
    suggestTimeout = setTimeout(checkSuggestion, 250);
  });

  descInput.addEventListener('input', () => {
    clearTimeout(suggestTimeout);
    suggestTimeout = setTimeout(checkSuggestion, 250);
  });

  applySugBtn.addEventListener('click', () => {
    if (activeSuggestion) {
      intentSelect.value = activeSuggestion;
      showToast(`Applied intent: ${activeSuggestion}`, 'info');
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = titleInput.value.trim();
    const description = descInput.value.trim();
    const tboh = tbohInput.value.trim().toUpperCase();
    const priority = prioritySelect.value;
    const category_intent = intentSelect.value;
    const check_in_date = checkinInput.value ? new Date(checkinInput.value).toISOString() : null;
    const lcd_date = lcdInput.value ? new Date(lcdInput.value).toISOString() : null;

    if (!category_intent) {
      showToast('Please select a Category Intent', 'error');
      intentSelect.focus();
      return;
    }

    try {
      const submitBtn = container.querySelector('#btn-submit-ticket');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting Case...';

      const res = await apiRequest('/api/tickets', {
        method: 'POST',
        body: {
          title,
          description,
          tboh,
          priority,
          category_intent,
          check_in_date,
          lcd_date
        }
      });

      showToast(`Case ${res.ticketId} created! ${res.routingReason}`, 'info');
      await store.refreshCounts();
      window.location.hash = `#ticket/${res.ticketId}`;
    } catch (err) {
      showToast(err.message, 'error');
      const submitBtn = container.querySelector('#btn-submit-ticket');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Operations Case';
    }
  });
}
