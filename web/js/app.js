// web/js/app.js
// Main Application Controller: Hash router, responsive sidebar, theme toggle, and component mounting.

import { store } from './store.js';
import { apiRequest } from './api.js';
import { renderIcon } from './icons.js';
import { initCommandPalette } from './components/command_palette.js';
import { initDemoGuide } from './components/demo_guide.js';

import { renderLogin } from './views/login.js';
import { renderDashboard } from './views/dashboard.js';
import { renderQueues } from './views/queues.js';
import { renderTicketDetail } from './views/ticket_detail.js';
import { renderNewTicket } from './views/new_ticket.js';
import { renderInsights } from './views/insights.js';
import { renderSettings } from './views/settings.js';

class App {
  constructor() {
    this.root = document.getElementById('app');
    this.currentView = null;
  }

  async init() {
    // Apply saved theme
    store.setTheme(store.theme);

    // Subscribe to store updates
    store.subscribe(() => this.updateNavigationState());

    // Check existing session
    const user = await store.refreshUser();
    await store.refreshClock();

    if (user) {
      await store.refreshCounts();
    }

    // Set up hash change router
    window.addEventListener('hashchange', () => this.handleRoute());

    // Initial route handling
    if (!window.location.hash) {
      window.location.hash = user ? (user.role === 'requester' ? '#queues?queue=all' : '#dashboard') : '#login';
    } else {
      this.handleRoute();
    }

    // Init global widgets
    initCommandPalette();
    initDemoGuide();

    // Auto-refresh counts every 30s
    setInterval(() => {
      if (store.user) {
        store.refreshCounts();
        store.refreshClock();
      }
    }, 30000);
  }

  updateNavigationState() {
    const user = store.user;
    if (!user) return;

    // Update queue counts in sidebar
    const setBadge = (id, count, isAlert = false) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = count || 0;
        if (isAlert && count > 0) el.classList.add('alert');
        else el.classList.remove('alert');
      }
    };

    setBadge('count-triage', store.counts.triage, true);
    setBadge('count-my', store.counts.my);
    setBadge('count-escalated', store.counts.escalated, true);
    setBadge('count-atrisk', store.counts.at_risk, true);
    setBadge('count-all', store.counts.all);

    // Update user info bar
    const userNameEl = document.getElementById('sidebar-user-name');
    const userRoleEl = document.getElementById('sidebar-user-role');
    if (userNameEl) userNameEl.textContent = user.name;
    if (userRoleEl) {
      userRoleEl.textContent = user.role === 'requester' ? `${user.agency_name || 'Agency'}` : user.role.replace('_', ' ');
    }

    // Update clock in footer
    const footerClock = document.getElementById('footer-clock-display');
    if (footerClock) {
      footerClock.textContent = `${store.clock.currentNowIST} ${store.clock.isSimulated ? '(Simulated)' : ''}`;
    }
  }

  renderShell() {
    const user = store.user;
    const isRequester = user && user.role === 'requester';

    this.root.innerHTML = `
      <!-- Persistent Left Navigation Sidebar -->
      <aside class="app-sidebar">
        <div class="sidebar-header">
          <div class="brand-title">
            ${renderIcon('ticket')}
            <span>OpsDesk</span>
          </div>
          <span class="brand-badge">Vertical MVP</span>
        </div>

        <nav class="sidebar-nav">
          ${!isRequester ? `
            <a href="#dashboard" class="nav-item" data-hash="#dashboard">
              <span class="nav-item-content">
                ${renderIcon('layers')}
                <span>Governance Dashboard</span>
              </span>
            </a>
          ` : ''}

          <div class="nav-section-title">Operations Queues</div>

          ${!isRequester ? `
            <a href="#queues?queue=triage" class="nav-item" data-hash="#queues?queue=triage">
              <span class="nav-item-content">
                ${renderIcon('inbox')}
                <span>Triage Queue</span>
              </span>
              <span class="counter-pill" id="count-triage">0</span>
            </a>

            <a href="#queues?queue=my" class="nav-item" data-hash="#queues?queue=my">
              <span class="nav-item-content">
                ${renderIcon('user')}
                <span>My Queue</span>
              </span>
              <span class="counter-pill" id="count-my">0</span>
            </a>

            <a href="#queues?queue=escalated" class="nav-item" data-hash="#queues?queue=escalated">
              <span class="nav-item-content">
                ${renderIcon('shield')}
                <span>Escalations</span>
              </span>
              <span class="counter-pill alert" id="count-escalated">0</span>
            </a>
          ` : ''}

          <a href="#queues?queue=at_risk" class="nav-item" data-hash="#queues?queue=at_risk">
            <span class="nav-item-content">
              ${renderIcon('alertTriangle')}
              <span>At-Risk SLA</span>
            </span>
            <span class="counter-pill" id="count-atrisk">0</span>
          </a>

          <a href="#queues?queue=all" class="nav-item" data-hash="#queues?queue=all">
            <span class="nav-item-content">
              ${renderIcon('ticket')}
              <span>${isRequester ? 'My Agency Cases' : 'All Operations Cases'}</span>
            </span>
            <span class="counter-pill" id="count-all">0</span>
          </a>

          ${!isRequester ? `
            <div class="nav-section-title">Operations Insights</div>

            <a href="#insights" class="nav-item" data-hash="#insights">
              <span class="nav-item-content">
                ${renderIcon('trendingUp')}
                <span>Recurring Themes</span>
              </span>
            </a>

            <a href="#settings" class="nav-item" data-hash="#settings">
              <span class="nav-item-content">
                ${renderIcon('settings')}
                <span>Data & Settings</span>
              </span>
            </a>
          ` : ''}
        </nav>

        <div class="sidebar-footer">
          <div class="user-profile-bar">
            <div class="user-info">
              <div class="user-name" id="sidebar-user-name">${user ? user.name : 'Loading...'}</div>
              <div class="user-role-badge" id="sidebar-user-role">${user ? user.role : ''}</div>
            </div>
            <button class="btn-icon" id="btn-logout" title="Sign out of OpsDesk">
              ${renderIcon('logout')}
            </button>
          </div>
        </div>
      </aside>

      <!-- Viewport -->
      <div class="app-viewport">
        <!-- Top Action Bar -->
        <header class="top-bar">
          <button class="top-search-btn" id="search-trigger-btn" aria-label="Open search command palette">
            ${renderIcon('search')}
            <span>Search cases, TBOH, queues...</span>
            <kbd>Ctrl+K</kbd>
          </button>

          <div class="top-actions">
            <a href="#new-ticket" class="btn btn-primary btn-sm">
              ${renderIcon('plus')} New Case
            </a>

            <button class="btn-icon" id="theme-toggle-btn" title="Toggle Light/Dark Theme" aria-label="Toggle theme">
              ${renderIcon(store.theme === 'light' ? 'moon' : 'sun')}
            </button>
          </div>
        </header>

        <!-- Main Dynamic Content Container -->
        <main class="main-content" id="main-view-container"></main>

        <!-- Footer Environment & Clock Bar -->
        <footer class="app-footer-bar">
          <div class="env-indicator">
            <span class="status-dot"></span>
            <span><strong>OpsDesk Local</strong> • Synthetic Dataset (.example) • No external network calls</span>
          </div>
          <div>
            Clock: <strong class="tabular-nums" id="footer-clock-display">${store.clock.currentNowIST}</strong>
          </div>
        </footer>
      </div>
    `;

    // Bind logout button
    document.getElementById('btn-logout').addEventListener('click', async () => {
      try {
        await apiRequest('/api/auth/logout', { method: 'POST' });
        store.setUser(null);
        window.location.hash = '#login';
      } catch (e) {
        store.setUser(null);
        window.location.hash = '#login';
      }
    });

    // Bind theme toggle
    document.getElementById('theme-toggle-btn').addEventListener('click', () => {
      store.toggleTheme();
      document.getElementById('theme-toggle-btn').innerHTML = renderIcon(store.theme === 'light' ? 'moon' : 'sun');
    });

    this.updateNavigationState();
  }

  async handleRoute() {
    const rawHash = window.location.hash || '#login';
    const [pathWithParams] = rawHash.split('?');
    const queryString = rawHash.includes('?') ? rawHash.split('?')[1] : '';
    const queryParams = Object.fromEntries(new URLSearchParams(queryString));

    // Handle Unauthenticated State
    if (!store.user && pathWithParams !== '#login') {
      const refreshedUser = await store.refreshUser();
      if (!refreshedUser) {
        this.root.innerHTML = '';
        renderLogin(this.root);
        return;
      }
    }

    if (pathWithParams === '#login') {
      if (store.user) {
        window.location.hash = store.user.role === 'requester' ? '#queues?queue=all' : '#dashboard';
        return;
      }
      this.root.innerHTML = '';
      renderLogin(this.root);
      return;
    }

    // Ensure Shell is mounted
    if (!document.getElementById('main-view-container')) {
      this.renderShell();
    }

    const container = document.getElementById('main-view-container');

    // Highlight active nav item
    document.querySelectorAll('.nav-item').forEach(item => {
      const itemHash = item.getAttribute('data-hash');
      if (itemHash === rawHash || (rawHash.startsWith('#queues') && itemHash.startsWith('#queues') && rawHash.includes(itemHash.split('?')[1]))) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Route dispatching
    if (pathWithParams === '#dashboard') {
      renderDashboard(container);
    } else if (pathWithParams === '#queues') {
      renderQueues(container, queryParams);
    } else if (pathWithParams.startsWith('#ticket/')) {
      const ticketId = pathWithParams.replace('#ticket/', '');
      renderTicketDetail(container, ticketId);
    } else if (pathWithParams === '#new-ticket') {
      renderNewTicket(container);
    } else if (pathWithParams === '#insights') {
      renderInsights(container);
    } else if (pathWithParams === '#settings') {
      renderSettings(container);
    } else {
      // Default fallback
      renderQueues(container, { queue: 'all' });
    }
  }
}

// Bootstrap
window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
