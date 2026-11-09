// web/js/components/command_palette.js
// Ctrl+K Quick Jump Command Palette for rapid operations triage.

import { apiRequest } from '../api.js';
import { renderIcon } from '../icons.js';
import { store } from '../store.js';

let paletteOpen = false;

export function initCommandPalette() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandPalette();
    }
  });

  const searchTrigger = document.getElementById('search-trigger-btn');
  if (searchTrigger) {
    searchTrigger.addEventListener('click', openCommandPalette);
  }
}

export function openCommandPalette() {
  if (paletteOpen) return;
  paletteOpen = true;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  backdrop.innerHTML = `
    <div class="modal-dialog command-palette-dialog">
      <div class="palette-input-box">
        ${renderIcon('search')}
        <input type="text" class="palette-input" placeholder="Type a ticket ID (TBO-...), TBOH reference, queue, or action..." autofocus />
        <button class="btn-icon close-palette-btn">&times;</button>
      </div>
      <div class="palette-results">
        <div class="empty-state" style="padding: var(--space-4);">Type to search tickets or jump to queues...</div>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const input = backdrop.querySelector('.palette-input');
  const resultsContainer = backdrop.querySelector('.palette-results');
  const closeBtn = backdrop.querySelector('.close-palette-btn');

  const close = () => {
    paletteOpen = false;
    document.removeEventListener('keydown', handleKey);
    if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
  };

  const handleKey = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', handleKey);

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  // Default quick actions
  const defaultActions = [
    { label: 'Go to Triage Queue', target: '#queues?queue=triage', icon: 'inbox', badge: store.counts.triage },
    { label: 'Go to Escalations Queue', target: '#queues?queue=escalated', icon: 'shield', badge: store.counts.escalated },
    { label: 'Go to At-Risk SLA Cases', target: '#queues?queue=at_risk', icon: 'alertTriangle', badge: store.counts.at_risk },
    { label: 'Go to Lead Governance Dashboard', target: '#dashboard', icon: 'layers' },
    { label: 'Go to Theme Insights & Backlog', target: '#insights', icon: 'trendingUp' },
    { label: 'Data Export & Platform Settings', target: '#settings', icon: 'settings' }
  ];

  function renderActions(actions) {
    if (actions.length === 0) {
      resultsContainer.innerHTML = `<div class="empty-state" style="padding: var(--space-4);">No matching cases or commands found.</div>`;
      return;
    }

    resultsContainer.innerHTML = actions.map((a, idx) => `
      <div class="palette-item ${idx === 0 ? 'selected' : ''}" data-target="${a.target}">
        <div style="display:flex; align-items:center; gap:var(--space-2);">
          ${renderIcon(a.icon || 'arrowRight')}
          <span>${a.label}</span>
        </div>
        ${a.badge ? `<span class="counter-pill">${a.badge}</span>` : ''}
      </div>
    `).join('');

    resultsContainer.querySelectorAll('.palette-item').forEach(item => {
      item.addEventListener('click', () => {
        const target = item.getAttribute('data-target');
        if (target) {
          window.location.hash = target;
          close();
        }
      });
    });
  }

  renderActions(defaultActions);

  let searchTimeout = null;
  input.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const q = input.value.trim();
    if (!q) {
      renderActions(defaultActions);
      return;
    }

    searchTimeout = setTimeout(async () => {
      try {
        const res = await apiRequest(`/api/tickets?q=${encodeURIComponent(q)}&limit=8`);
        const ticketItems = (res.tickets || []).map(t => ({
          label: `<strong class="ticket-id">${t.id}</strong> - ${t.title} (${t.tboh})`,
          target: `#ticket/${t.id}`,
          icon: 'ticket',
          badge: t.status
        }));

        renderActions(ticketItems);
      } catch (err) {
        // ignore
      }
    }, 200);
  });
}
