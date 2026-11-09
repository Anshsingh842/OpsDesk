// web/js/views/settings.js
// Ops Data Access, Streaming CSV Export (50K+ rows), Data Retention, Demo Clock, and Configurable Rules.

import { apiRequest } from '../api.js';
import { renderIcon } from '../icons.js';
import { store } from '../store.js';
import { showToast } from '../components/toast.js';
import { confirmDialog } from '../components/modal.js';

export async function renderSettings(container) {
  container.innerHTML = `
    <div class="view-header">
      <div class="view-title-row">
        <div>
          <h1 class="view-title">Data Access & Platform Configuration</h1>
          <p class="view-helper">Streaming data exports beyond the 3K row limit, retention archival, configurable rules, and simulated demo clock.</p>
        </div>
      </div>
    </div>

    <div style="display: flex; flex-direction: column; gap: var(--space-6); max-width: 860px;">

      <!-- SECTION 1: Ops Data Export (MVP-6) -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">${renderIcon('download')} Ops Data Access & Streaming CSV Export</div>
          <span class="badge badge-ok">No 3K Cap • Streaming 50K+</span>
        </div>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: var(--space-4);">
          Traditional ticketing tools cap exports around 3,000 rows. OpsDesk uses a cursor-based streaming CSV pipeline with built-in formula injection protection (S8).
        </p>

        <div style="display: flex; gap: var(--space-3); flex-wrap: wrap; align-items: center;">
          <a href="/api/data/export" download class="btn btn-primary" id="btn-export-csv">
            ${renderIcon('download')} Download Streaming CSV Extract
          </a>

          <button class="btn btn-secondary" id="btn-generate-bulk">
            ${renderIcon('plus')} Generate 5,000 Extra Demo Cases (Test Scale)
          </button>
        </div>
        <div id="bulk-gen-status" style="font-size: 12px; color: var(--accent-text); margin-top: var(--space-2);"></div>
      </div>

      <!-- SECTION 2: Simulated Demo Clock (Section 4 & 7) -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">${renderIcon('clock')} Simulated Operations Clock</div>
          <span class="badge ${store.clock.isSimulated ? 'badge-risk' : 'badge-neutral'}">
            ${store.clock.isSimulated ? 'Simulated Active' : 'Real System Clock'}
          </span>
        </div>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: var(--space-3);">
          Shift agent shifts and ticket SLAs on demand to demonstrate SLA Breach and At-risk state transitions without waiting real hours.
        </p>

        <div style="display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;">
          <div style="font-size: 13px;">
            Current Clock: <strong class="tabular-nums" id="clock-display">${store.clock.currentNowIST}</strong>
          </div>
          <button class="btn btn-secondary btn-sm" id="btn-advance-4h">+ Advance 4 Hours</button>
          <button class="btn btn-secondary btn-sm" id="btn-advance-24h">+ Advance 24 Hours</button>
          <button class="btn btn-outline btn-sm" id="btn-reset-clock">Reset to Real Time</button>
        </div>
      </div>

      <!-- SECTION 3: Data Retention & Archival (MVP-6) -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">${renderIcon('shield')} Data Retention & Archival Stance</div>
          <span class="badge badge-neutral">Our Design Choice: 90 Days</span>
        </div>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: var(--space-3);">
          Closed tickets older than the retention threshold are safely archived (<code class="tabular-nums">is_archived = 1</code>), removing them from active queues while preserving full auditability and streaming export access.
        </p>

        <div style="display: flex; gap: var(--space-3); align-items: center;">
          <button class="btn btn-secondary" id="btn-run-archive">
            Run Archival Job Now
          </button>
          <span id="archive-status-text" style="font-size: 12px; color: var(--text-muted);"></span>
        </div>
      </div>

      <!-- SECTION 4: Configurable Rules & Design Choices -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">${renderIcon('settings')} Rules & Policy Configuration</div>
          <span class="badge badge-neutral">Versioned in DB</span>
        </div>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: var(--space-4);">
          All threshold parameters are governed in configuration tables (not buried in code or prompts).
        </p>

        <form id="rules-config-form">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); margin-bottom: var(--space-4);">
            <div class="form-group">
              <label class="form-label" for="cfg-retention">Retention Threshold (Days)</label>
              <input type="number" id="cfg-retention" class="form-input" min="7" max="730" required />
            </div>

            <div class="form-group">
              <label class="form-label" for="cfg-urgent-sla">Urgent Base SLA (Hours)</label>
              <input type="number" id="cfg-urgent-sla" class="form-input" min="1" max="24" required />
            </div>

            <div class="form-group">
              <label class="form-label" for="cfg-high-sla">High Base SLA (Hours)</label>
              <input type="number" id="cfg-high-sla" class="form-input" min="2" max="72" required />
            </div>

            <div class="form-group">
              <label class="form-label" for="cfg-normal-sla">Normal Base SLA (Hours)</label>
              <input type="number" id="cfg-normal-sla" class="form-input" min="4" max="168" required />
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end;">
            <button type="submit" class="btn btn-primary">Save Rules Configuration</button>
          </div>
        </form>
      </div>

      <!-- SECTION 5: Demo Reset -->
      <div class="card" style="border-color: var(--status-risk-border);">
        <div class="card-header">
          <div class="card-title" style="color: var(--status-risk-text);">${renderIcon('alertTriangle')} Reset Demo Dataset</div>
          <span class="badge badge-risk">Judge Walkthrough Tool</span>
        </div>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: var(--space-3);">
          Resets all cases and queues back to the original synthetic seed stories (same refund on TBOH-88219, transferred supplier thread, near check-in/LCD cases).
        </p>
        <button class="btn btn-danger btn-sm" id="btn-reset-demo-data">
          Reset Demo Data to Initial State
        </button>
      </div>

    </div>
  `;

  // Load existing config
  async function loadConfig() {
    try {
      const res = await apiRequest('/api/config');
      const cfg = res.config || {};

      if (cfg.retention_days) container.querySelector('#cfg-retention').value = cfg.retention_days.value;
      if (cfg.sla_urgent_hours) container.querySelector('#cfg-urgent-sla').value = cfg.sla_urgent_hours.value;
      if (cfg.sla_high_hours) container.querySelector('#cfg-high-sla').value = cfg.sla_high_hours.value;
      if (cfg.sla_normal_hours) container.querySelector('#cfg-normal-sla').value = cfg.sla_normal_hours.value;

      await store.refreshClock();
      container.querySelector('#clock-display').textContent = store.clock.currentNowIST;
    } catch (err) {}
  }

  // Rules form submit
  const configForm = container.querySelector('#rules-config-form');
  configForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await apiRequest('/api/config', {
        method: 'PUT',
        body: {
          updates: {
            retention_days: container.querySelector('#cfg-retention').value,
            sla_urgent_hours: container.querySelector('#cfg-urgent-sla').value,
            sla_high_hours: container.querySelector('#cfg-high-sla').value,
            sla_normal_hours: container.querySelector('#cfg-normal-sla').value
          }
        }
      });
      showToast('Rules configuration saved successfully', 'info');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Generate 5,000 extra tickets
  const bulkBtn = container.querySelector('#btn-generate-bulk');
  const bulkStatus = container.querySelector('#bulk-gen-status');
  bulkBtn.addEventListener('click', async () => {
    try {
      bulkBtn.disabled = true;
      bulkBtn.textContent = 'Generating 5,000 cases...';
      const res = await apiRequest('/api/data/generate-demo', { method: 'POST' });
      bulkStatus.textContent = res.message;
      showToast('Generated 5,000 extra demo cases!', 'info');
      await store.refreshCounts();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      bulkBtn.disabled = false;
      bulkBtn.textContent = 'Generate 5,000 Extra Demo Cases (Test Scale)';
    }
  });

  // Run archival
  const archiveBtn = container.querySelector('#btn-run-archive');
  const archiveText = container.querySelector('#archive-status-text');
  archiveBtn.addEventListener('click', async () => {
    try {
      archiveBtn.disabled = true;
      const res = await apiRequest('/api/data/archive', { method: 'POST' });
      archiveText.textContent = res.message;
      showToast(res.message, 'info');
      await store.refreshCounts();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      archiveBtn.disabled = false;
    }
  });

  // Reset demo dataset
  const resetDemoBtn = container.querySelector('#btn-reset-demo-data');
  resetDemoBtn.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Reset Demo Data',
      message: 'This will purge modifications and restore all 5 hackathon evaluation stories. Proceed?',
      confirmText: 'Reset All Data',
      isDanger: true
    });
    if (!confirmed) return;

    try {
      await apiRequest('/api/data/reset', { method: 'POST' });
      showToast('Demo dataset reset to initial state!', 'info');
      await store.refreshCounts();
      await loadConfig();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Clock advancement buttons
  async function advanceClock(hours) {
    try {
      const clockRes = await apiRequest('/api/clock');
      const baseTime = clockRes.simulatedNowUTC ? new Date(clockRes.simulatedNowUTC) : new Date(clockRes.currentNowUTC);
      const newTime = new Date(baseTime.getTime() + (hours * 3600 * 1000)).toISOString();

      await apiRequest('/api/clock', {
        method: 'POST',
        body: { simulatedNow: newTime }
      });
      await store.refreshClock();
      container.querySelector('#clock-display').textContent = store.clock.currentNowIST;
      showToast(`Clock advanced by ${hours} hours to ${store.clock.currentNowIST}`, 'info');
      await store.refreshCounts();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  container.querySelector('#btn-advance-4h').addEventListener('click', () => advanceClock(4));
  container.querySelector('#btn-advance-24h').addEventListener('click', () => advanceClock(24));
  container.querySelector('#btn-reset-clock').addEventListener('click', async () => {
    try {
      await apiRequest('/api/clock', { method: 'POST', body: { simulatedNow: null } });
      await store.refreshClock();
      container.querySelector('#clock-display').textContent = store.clock.currentNowIST;
      showToast('Clock reset to real time', 'info');
      await store.refreshCounts();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  loadConfig();
}
