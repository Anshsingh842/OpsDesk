// web/js/views/login.js
// Login screen with 1-click Demo Persona Selector for fast evaluation.

import { apiRequest } from '../api.js';
import { store } from '../store.js';
import { showToast } from '../components/toast.js';

export async function renderLogin(container) {
  container.innerHTML = `
    <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: var(--space-4); background-color: var(--bg-app);">
      <div style="width: 100%; max-width: 480px; background-color: var(--bg-surface); border: 1px solid var(--border-main); border-radius: var(--radius-lg); padding: var(--space-8); box-shadow: var(--shadow-md);">
        
        <div style="text-align: center; margin-bottom: var(--space-6);">
          <div style="font-size: 24px; font-weight: 600; color: var(--accent-main); letter-spacing: -0.02em;">OpsDesk</div>
          <p style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">Next-Generation B2B Travel Operations Ticketing Platform</p>
          <div style="display:inline-block; font-size:11px; font-family:var(--font-mono); background:var(--bg-subtle); color:var(--text-dim); padding:2px 8px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); margin-top:var(--space-2);">
            TBO Operations Vertical Slice MVP
          </div>
        </div>

        <form id="login-form">
          <div class="form-group">
            <label class="form-label" for="login-email">Email Address</label>
            <input type="email" id="login-email" class="form-input" required placeholder="e.g. lead@tbo.example" />
          </div>

          <div class="form-group">
            <label class="form-label" for="login-password">Password</label>
            <input type="password" id="login-password" class="form-input" required placeholder="••••••••" />
          </div>

          <button type="submit" class="btn btn-primary" style="width: 100%; padding: 10px; margin-top: var(--space-2);">
            Sign In to OpsDesk
          </button>
        </form>

        <div id="demo-persona-container" style="margin-top: var(--space-6); padding-top: var(--space-4); border-top: 1px solid var(--border-subtle);">
          <div style="font-size: 12px; font-weight: 600; color: var(--text-dim); margin-bottom: var(--space-2); text-transform: uppercase; letter-spacing: 0.05em;">
            1-Click Demo Personas (Evaluation Mode)
          </div>
          <div id="demo-user-cards" style="display: flex; flex-direction: column; gap: var(--space-2);">
            <div style="font-size: 12px; color: var(--text-muted);">Loading personas...</div>
          </div>
        </div>

      </div>
    </div>
  `;

  const form = container.querySelector('#login-form');
  const emailInput = container.querySelector('#login-email');
  const passwordInput = container.querySelector('#login-password');
  const demoContainer = container.querySelector('#demo-user-cards');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    try {
      const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: { email, password }
      });
      store.setUser(data.user);
      await store.refreshCounts();
      showToast(`Welcome back, ${data.user.name}`, 'info');
      window.location.hash = data.user.role === 'requester' ? '#queues?queue=all' : '#dashboard';
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Fetch demo personas
  try {
    const res = await apiRequest('/api/auth/demo-users');
    const users = res.demoUsers || [];

    const highlights = [
      { email: 'lead@tbo.example', label: 'Vikram Singhania (Ops Lead)', roleLabel: 'Lead View', badge: 'lead' },
      { email: 'em.india@tbo.example', label: 'Zoya Akhtar (Escalation Mgr)', roleLabel: 'Escalations Queue', badge: 'em' },
      { email: 'aarav@tbo.example', label: 'Aarav Sharma (Ops Agent - India)', roleLabel: 'India Queue', badge: 'agent' },
      { email: 'tariq@alfanoos.example', label: 'Tariq Mansoor (Agency Requester)', roleLabel: 'Al Fanoos Travel', badge: 'requester' }
    ];

    demoContainer.innerHTML = highlights.map(h => {
      const u = users.find(x => x.email === h.email);
      if (!u) return '';
      return `
        <button class="btn btn-secondary demo-quick-btn" data-id="${u.id}" data-role="${u.role}" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; text-align: left;">
          <div>
            <div style="font-weight: 600; font-size: 13px;">${h.label}</div>
            <div style="font-size: 11px; color: var(--text-muted);">${h.roleLabel} • <span class="tabular-nums">${u.email}</span></div>
          </div>
          <span class="badge ${u.role === 'lead' ? 'badge-info' : u.role === 'escalation_manager' ? 'badge-risk' : u.role === 'agent' ? 'badge-ok' : 'badge-neutral'}">
            1-Click Login
          </span>
        </button>
      `;
    }).join('');

    demoContainer.querySelectorAll('.demo-quick-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const userId = btn.getAttribute('data-id');
        const role = btn.getAttribute('data-role');
        try {
          btn.disabled = true;
          const data = await apiRequest('/api/auth/switch-demo', {
            method: 'POST',
            body: { userId }
          });
          store.setUser(data.user);
          await store.refreshCounts();
          showToast(`Logged in as ${data.user.name}`, 'info');
          window.location.hash = role === 'requester' ? '#queues?queue=all' : '#dashboard';
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    demoContainer.innerHTML = `<div style="font-size: 12px; color: var(--text-muted);">Standard password for demo accounts: <code>Demo@123</code></div>`;
  }
}
