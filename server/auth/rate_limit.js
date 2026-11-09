// server/auth/rate_limit.js
// S5: Rate limiting and brute-force protection.

const { getNow } = require('../domain/now');

// In-memory sliding windows for API and export limits
const apiHitsByIp = new Map();
const exportHitsByIp = new Map();

// Periodic cleanup every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 60000;
  for (const [ip, hits] of apiHitsByIp.entries()) {
    const valid = hits.filter(t => t > cutoff);
    if (valid.length === 0) apiHitsByIp.delete(ip);
    else apiHitsByIp.set(ip, valid);
  }
  for (const [ip, hits] of exportHitsByIp.entries()) {
    const valid = hits.filter(t => t > cutoff);
    if (valid.length === 0) exportHitsByIp.delete(ip);
    else exportHitsByIp.set(ip, valid);
  }
}, 300000).unref();

function checkApiRateLimit(ip, maxPerMinute = 150) {
  const now = Date.now();
  const windowStart = now - 60000;
  let hits = apiHitsByIp.get(ip) || [];
  hits = hits.filter(t => t > windowStart);
  if (hits.length >= maxPerMinute) {
    return { allowed: false, remaining: 0, retryAfterSec: Math.ceil((hits[0] + 60000 - now) / 1000) };
  }
  hits.push(now);
  apiHitsByIp.set(ip, hits);
  return { allowed: true, remaining: maxPerMinute - hits.length };
}

function checkExportRateLimit(ip, maxPerMinute = 5) {
  const now = Date.now();
  const windowStart = now - 60000;
  let hits = exportHitsByIp.get(ip) || [];
  hits = hits.filter(t => t > windowStart);
  if (hits.length >= maxPerMinute) {
    return { allowed: false, remaining: 0, retryAfterSec: Math.ceil((hits[0] + 60000 - now) / 1000) };
  }
  hits.push(now);
  exportHitsByIp.set(ip, hits);
  return { allowed: true, remaining: maxPerMinute - hits.length };
}

/**
 * Checks login attempts in DB. If >= 5 failed attempts in the last 15 minutes
 * for this username or IP, enforce progressive delay / block.
 */
function checkLoginRateLimit(db, ip, username) {
  const fifteenMinsAgo = new Date(getNow().getTime() - 15 * 60 * 1000).toISOString();

  const ipFails = db.prepare(`
    SELECT COUNT(*) as count FROM login_attempts
    WHERE ip = ? AND success = 0 AND attempted_at > ?
  `).get(ip, fifteenMinsAgo).count;

  const userFails = db.prepare(`
    SELECT COUNT(*) as count FROM login_attempts
    WHERE username = ? AND success = 0 AND attempted_at > ?
  `).get(username, fifteenMinsAgo).count;

  const totalFails = Math.max(ipFails, userFails);

  if (totalFails >= 10) {
    return { allowed: false, retryAfterSec: 900, message: 'Too many failed login attempts. Account temporarily locked for 15 minutes.' };
  }
  if (totalFails >= 5) {
    return { allowed: false, retryAfterSec: 60, message: 'Too many attempts. Please wait 1 minute before trying again.' };
  }

  return { allowed: true, delayMs: totalFails * 200 };
}

function recordLoginAttempt(db, ip, username, success) {
  const nowISO = getNow().toISOString();
  db.prepare(`
    INSERT INTO login_attempts (ip, username, success, attempted_at)
    VALUES (?, ?, ?, ?)
  `).run(ip, username, success ? 1 : 0, nowISO);
}

module.exports = {
  checkApiRateLimit,
  checkExportRateLimit,
  checkLoginRateLimit,
  recordLoginAttempt
};
