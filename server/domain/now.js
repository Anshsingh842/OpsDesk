// server/domain/now.js
// Centralized time provider supporting a simulated demo clock for testing and judge demonstrations.
// All business domain logic MUST call getNow() instead of new Date().

let simulatedNow = null; // Stored as timestamp in ms or null for real time

function setSimulatedNow(isoOrTimestamp) {
  if (!isoOrTimestamp) {
    simulatedNow = null;
    return null;
  }
  const date = new Date(isoOrTimestamp);
  if (isNaN(date.getTime())) {
    throw new Error('Invalid ISO timestamp for simulated clock');
  }
  simulatedNow = date.getTime();
  return new Date(simulatedNow).toISOString();
}

function getSimulatedNow() {
  return simulatedNow ? new Date(simulatedNow).toISOString() : null;
}

function getNow() {
  if (simulatedNow !== null) {
    return new Date(simulatedNow);
  }
  return new Date();
}

function getNowISO() {
  return getNow().toISOString();
}

/**
 * Format a Date or ISO string into Asia/Kolkata (IST) display format.
 * Example output: "09 Nov 2026, 03:30 PM IST"
 */
function formatIST(dateOrIso) {
  if (!dateOrIso) return '-';
  const d = new Date(dateOrIso);
  if (isNaN(d.getTime())) return '-';

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(d) + ' IST';
}

/**
 * Returns current IST time components { hours: 15, minutes: 30 }
 * Useful for shift window checks against agent shifts.
 */
function getISTTimeComponents(date = getNow()) {
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);

  const hours = parseInt(parts.find(p => p.type === 'hour').value, 10);
  const minutes = parseInt(parts.find(p => p.type === 'minute').value, 10);
  return { hours, minutes, totalMinutes: hours * 60 + minutes };
}

module.exports = {
  getNow,
  getNowISO,
  setSimulatedNow,
  getSimulatedNow,
  formatIST,
  getISTTimeComponents
};
