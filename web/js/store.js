// web/js/store.js
// Centralized reactive state store for user session, live queue counts, theme, and clock.

import { apiRequest } from './api.js';

class Store {
  constructor() {
    this.user = null;
    this.counts = {
      all: 0,
      triage: 0,
      my: 0,
      escalated: 0,
      at_risk: 0,
      breached: 0,
      archived: 0
    };
    this.regions = {};
    this.intents = {};
    this.theme = localStorage.getItem('opsdesk_theme') || 'light';
    this.clock = {
      currentNowIST: '-',
      isSimulated: false
    };
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      try { listener(this); } catch (e) { console.error('Store listener error:', e); }
    }
  }

  setTheme(theme) {
    this.theme = theme;
    localStorage.setItem('opsdesk_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    this.notify();
  }

  toggleTheme() {
    this.setTheme(this.theme === 'light' ? 'dark' : 'light');
  }

  setUser(user) {
    this.user = user;
    this.notify();
  }

  async refreshUser() {
    try {
      const data = await apiRequest('/api/auth/me');
      this.setUser(data.user);
      return data.user;
    } catch (e) {
      this.setUser(null);
      return null;
    }
  }

  async refreshCounts() {
    if (!this.user) return;
    try {
      const data = await apiRequest('/api/queues/counts');
      this.counts = data.counts || this.counts;
      this.regions = data.regions || {};
      this.intents = data.intents || {};
      this.notify();
    } catch (e) {
      // Ignore background count failure
    }
  }

  async refreshClock() {
    try {
      const data = await apiRequest('/api/clock');
      this.clock = {
        currentNowIST: data.currentNowIST,
        isSimulated: data.isSimulated
      };
      this.notify();
    } catch (e) {}
  }
}

export const store = new Store();
