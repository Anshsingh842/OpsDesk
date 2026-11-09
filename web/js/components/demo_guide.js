// web/js/components/demo_guide.js
// Judge Walkthrough Demo Guide (Journeys A to E) with 1-click "Take me there" role switching.

import { apiRequest } from '../api.js';
import { store } from '../store.js';
import { showToast } from './toast.js';

let isVisible = false;

const DEMO_JOURNEYS = [
  {
    id: 'journey-a',
    title: 'Journey A: Context & Linkage',
    proves: 'Problem 1: Tickets without Context',
    targetUserId: 'usr_agent_01', // Aarav Sharma (Agent)
    targetHash: '#ticket/TBO-1003',
    description: 'See the "same refund, 3 contacts" story on TBOH-88219. Shows 2 prior linked tickets, "3rd contact on this TBOH" badge, and intent word match.'
  },
  {
    id: 'journey-b',
    title: 'Journey B: Multi-Factor Routing',
    proves: 'Problem 2: Hardcoded FIFO/LIFO triggers',
    targetUserId: 'usr_agent_01', // Aarav Sharma
    targetHash: '#ticket/TBO-1003',
    description: 'Inspect the "Why this owner" card showing exact mathematical breakdown: Region (+40), Shift (+20), Skill (+15), Rank, and Load deductions.'
  },
  {
    id: 'journey-c',
    title: 'Journey C: Supplier Side Conversation',
    proves: 'Problem 3: Side conversation recipients broken on transfer',
    targetUserId: 'usr_agent_01', // Transferred owner
    targetHash: '#ticket/TBO-1004',
    description: 'Ticket transferred from Sophie to Aarav. Active supplier side convo with 3 explicit recipients survived intact with audit snapshot.'
  },
  {
    id: 'journey-d',
    title: 'Journey D: Travel SLA & Escalation',
    proves: 'Problem 4: Generic SLAs & no direct Escalation Managers',
    targetUserId: 'usr_em_01', // Zoya Akhtar (Escalation Manager)
    targetHash: '#queues?queue=escalated',
    description: 'Urgent check-in proximity boosts priority. Direct Escalation Manager queue and first-class resolve/hand-back workflow.'
  },
  {
    id: 'journey-e',
    title: 'Journey E: Insights & 50K Data Scale',
    proves: 'Problems 5 & 6: Trapped insights & 3K row export limit',
    targetUserId: 'usr_lead_01', // Vikram Singhania (Lead)
    targetHash: '#settings',
    description: 'Lead opens Theme Insights (week-over-week trends) and runs Streaming CSV export with 5,000+ rows & formula injection defense.'
  }
];

export function initDemoGuide() {
  const container = document.createElement('div');
  container.id = 'demo-guide-container';
  container.innerHTML = `
    <button class="btn btn-secondary demo-guide-toggle" id="demo-guide-btn">
      <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--accent-main); margin-right:4px;"></span>
      Demo Guide (Journeys A-E)
    </button>
    <div class="demo-guide-panel" id="demo-guide-panel" style="display: none;">
      <div class="modal-header" style="padding: var(--space-3) var(--space-4);">
        <div>
          <h4 style="font-size: 13px; font-weight: 600;">Hackathon Judge Demo Guide</h4>
          <p style="font-size: 11px; color: var(--text-muted);">1-click walkthrough of Journeys A to E</p>
        </div>
        <button class="btn-icon" id="demo-guide-close">&times;</button>
      </div>
      <div style="max-height: 420px; overflow-y: auto;">
        ${DEMO_JOURNEYS.map((j, i) => `
          <div class="demo-step-item">
            <div class="demo-step-text">
              <strong style="color: var(--text-main); font-size: 12px;">${j.title}</strong>
              <div style="font-size: 11px; color: var(--accent-main); font-weight: 500;">${j.proves}</div>
              <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${j.description}</div>
            </div>
            <button class="btn btn-primary btn-sm take-me-btn" data-user="${j.targetUserId}" data-hash="${j.targetHash}">
              Take me there
            </button>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  document.body.appendChild(container);

  const toggleBtn = document.getElementById('demo-guide-btn');
  const panel = document.getElementById('demo-guide-panel');
  const closeBtn = document.getElementById('demo-guide-close');

  toggleBtn.addEventListener('click', () => {
    isVisible = !isVisible;
    panel.style.display = isVisible ? 'flex' : 'none';
  });

  closeBtn.addEventListener('click', () => {
    isVisible = false;
    panel.style.display = 'none';
  });

  container.querySelectorAll('.take-me-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetUserId = btn.getAttribute('data-user');
      const targetHash = btn.getAttribute('data-hash');

      try {
        btn.textContent = 'Switching...';
        await apiRequest('/api/auth/switch-demo', {
          method: 'POST',
          body: { userId: targetUserId }
        });
        await store.refreshUser();
        await store.refreshCounts();
        window.location.hash = targetHash;
        showToast('Switched persona and navigated to journey screen!', 'info');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.textContent = 'Take me there';
      }
    });
  });
}
