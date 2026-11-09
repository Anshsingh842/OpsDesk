// server/domain/sla.js
// MVP-4 & Design Decision: Travel-aware SLA engine.
// Adjusts urgency based on check-in and LCD (Last Cancellation Date) proximity.
// Calculates exact due dates, states (On-track, At-risk, Breached, Met, Missed), and human explanations.

const { getNow } = require('./now');

const BASE_HOURS = {
  Urgent: 2,
  High: 8,
  Normal: 24,
  Low: 72
};

function calculateSla({
  priority = 'Normal',
  createdAt = null,
  checkInDate = null,
  lcdDate = null,
  resolvedAt = null,
  status = 'New',
  regionalCalendarSimulated = false
}) {
  const created = createdAt ? new Date(createdAt) : getNow();
  const createdMs = created.getTime();
  const now = getNow();
  const nowMs = now.getTime();

  // Find earliest future travel event relative to creation/now
  let earliestEventMs = null;
  let earliestEventType = null;

  const checkInMs = checkInDate ? new Date(checkInDate).getTime() : null;
  const lcdMs = lcdDate ? new Date(lcdDate).getTime() : null;

  if (checkInMs && !isNaN(checkInMs) && lcdMs && !isNaN(lcdMs)) {
    if (checkInMs <= lcdMs) {
      earliestEventMs = checkInMs;
      earliestEventType = 'Check-in';
    } else {
      earliestEventMs = lcdMs;
      earliestEventType = 'LCD (Cancellation Cutoff)';
    }
  } else if (checkInMs && !isNaN(checkInMs)) {
    earliestEventMs = checkInMs;
    earliestEventType = 'Check-in';
  } else if (lcdMs && !isNaN(lcdMs)) {
    earliestEventMs = lcdMs;
    earliestEventType = 'LCD (Cancellation Cutoff)';
  }

  // Travel boost evaluation relative to ticket creation
  let effectivePriority = priority;
  let boostReason = 'No travel proximity boost applied.';

  if (earliestEventMs) {
    const hoursToEventFromCreation = (earliestEventMs - createdMs) / (1000 * 60 * 60);

    if (hoursToEventFromCreation <= 12) {
      effectivePriority = 'Urgent';
      boostReason = `${earliestEventType} is within ${Math.max(0, Math.round(hoursToEventFromCreation))}h of case creation (<= 12h threshold), boosting priority to Urgent.`;
    } else if (hoursToEventFromCreation <= 48) {
      if (priority === 'Normal' || priority === 'Low') {
        effectivePriority = 'High';
        boostReason = `${earliestEventType} is within ${Math.round(hoursToEventFromCreation)}h (<= 48h threshold), elevating priority from ${priority} to High.`;
      } else {
        boostReason = `${earliestEventType} is within ${Math.round(hoursToEventFromCreation)}h; priority retained as ${priority}.`;
      }
    } else {
      boostReason = `${earliestEventType} is comfortably in future (${Math.round(hoursToEventFromCreation)}h away).`;
    }
  }

  let baseHours = BASE_HOURS[effectivePriority] || 24;
  if (regionalCalendarSimulated) {
    baseHours = Math.round(baseHours * 1.25); // Simulated regional calendar buffer
  }

  // due = created + baseHours
  let dueMs = createdMs + (baseHours * 60 * 60 * 1000);

  // If travel event exists, cap due date to 2 hours before the event
  if (earliestEventMs) {
    const eventCapMs = earliestEventMs - (2 * 60 * 60 * 1000);
    if (eventCapMs < dueMs) {
      dueMs = eventCapMs;
    }
  }

  // Safeguard floor: SLA cannot be less than created + 30 minutes
  const floorMs = createdMs + (30 * 60 * 1000);
  if (dueMs < floorMs) {
    dueMs = floorMs;
  }

  const dueAtISO = new Date(dueMs).toISOString();

  // State evaluation
  let slaState = 'On-track';
  let stateReason = '';

  const isTerminal = status === 'Resolved' || status === 'Closed';

  if (isTerminal) {
    const resolutionMs = resolvedAt ? new Date(resolvedAt).getTime() : nowMs;
    if (resolutionMs <= dueMs) {
      slaState = 'Met';
      stateReason = 'Resolved within SLA target window.';
    } else {
      slaState = 'Missed';
      stateReason = `Resolved ${Math.round((resolutionMs - dueMs) / (1000 * 60))} minutes past SLA target.`;
    }
  } else {
    const totalWindowMs = dueMs - createdMs;
    const remainingMs = dueMs - nowMs;

    if (nowMs >= dueMs) {
      slaState = 'Breached';
      stateReason = `Target breached by ${Math.round((nowMs - dueMs) / (1000 * 60))} minutes.`;
    } else if (remainingMs <= 0.3 * totalWindowMs || remainingMs <= (60 * 60 * 1000)) {
      slaState = 'At-risk';
      const remainingMin = Math.round(remainingMs / (1000 * 60));
      stateReason = `Only ${remainingMin} minutes remaining (<= 30% of SLA window or <= 1 hour).`;
    } else {
      slaState = 'On-track';
      const remainingHours = (remainingMs / (1000 * 60 * 60)).toFixed(1);
      stateReason = `${remainingHours} hours remaining until deadline.`;
    }
  }

  return {
    effectivePriority,
    dueAtISO,
    slaState,
    boostReason,
    stateReason,
    baseHours,
    isTerminal
  };
}

module.exports = {
  BASE_HOURS,
  calculateSla
};
