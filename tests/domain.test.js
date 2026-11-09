// tests/domain.test.js
// Unit tests for core travel ops domain logic: Linking, Routing, SLA, Intent, and Sensitive Data Masking.

const test = require('node:test');
const assert = require('node:assert/strict');

const { luhnCheck, maskCardNumbers, maskCredentials, maskSensitiveData } = require('../server/domain/masking');
const { suggestIntent } = require('../server/domain/intent');
const { calculateSla, BASE_HOURS } = require('../server/domain/sla');
const { isInsideShift, scoreAgent, routeTicket } = require('../server/domain/routing');
const { setSimulatedNow } = require('../server/domain/now');
const { getDb } = require('../server/db/database');
const { seedDatabase } = require('../server/db/seed');
const { autoLinkTicket, manualLink, manualUnlink, getLinkedTicketsForTicket } = require('../server/domain/linking');
const { escalateTicket, handBackTicket } = require('../server/domain/escalation');

test('Domain: S9 Sensitive Data Masking', async (t) => {
  await t.test('Luhn card check correctly identifies valid vs invalid card numbers', () => {
    // 4532 0151 1284 3211 (passes Luhn)
    assert.equal(luhnCheck('4532015112843211'), true);
    // Invalid Luhn
    assert.equal(luhnCheck('4532015112843215'), false);
    // Too short (< 13)
    assert.equal(luhnCheck('123456789'), false);
  });

  await t.test('maskCardNumbers redacts valid card numbers to XXXX-XXXX-XXXX-1234', () => {
    const text = 'Guest card is 4532-0151-1284-3211 for guarantee.';
    const masked = maskCardNumbers(text);
    assert.equal(masked, 'Guest card is XXXX-XXXX-XXXX-3211 for guarantee.');
  });

  await t.test('maskCredentials redacts OTP, CVV, and passwords', () => {
    const text = 'Guest OTP: 884920 and CVV=432 with password: SuperSecretPassword123.';
    const masked = maskCredentials(text);
    assert.match(masked, /otp: \[REDACTED\]/i);
    assert.match(masked, /cvv: \[REDACTED\]/i);
    assert.match(masked, /password: \[REDACTED\]/i);
    assert.ok(!masked.includes('884920'));
    assert.ok(!masked.includes('SuperSecretPassword123'));
  });

  await t.test('maskSensitiveData runs both card and credential sanitizers', () => {
    const input = 'Client 4532 0151 1284 3211 entered OTP: 123456 on phone.';
    const out = maskSensitiveData(input);
    assert.ok(out.includes('XXXX-XXXX-XXXX-3211'));
    assert.match(out, /otp: \[REDACTED\]/i);
  });
});

test('Domain: Intent Taxonomy & Hinglish Suggester', async (t) => {
  await t.test('Accurately identifies Refund from Hinglish queries', () => {
    const res = suggestIntent('Urgent follow up', 'Paise wapas kab aayenge? Flight was cancelled.');
    assert.equal(res.top_intent, 'Refund');
    assert.ok(res.confidence > 0.4);
    assert.ok(res.matched_words.includes('paise wapas'));
  });

  await t.test('Accurately identifies Payment issue from Hindi colloquial terms', () => {
    const res = suggestIntent('Transaction error', 'Account se paise kat gaye but booking failed on gateway.');
    assert.equal(res.top_intent, 'Payment issue');
    assert.ok(res.matched_words.includes('paise kat gaye'));
  });

  await t.test('Accurately identifies Cancellation', () => {
    const res = suggestIntent('Need to cancel reservation', 'Booking radd karni hai, guest emergency.');
    assert.equal(res.top_intent, 'Cancellation');
    assert.ok(res.matched_words.includes('booking radd') || res.matched_words.includes('cancel'));
  });

  await t.test('Accurately identifies Special request', () => {
    const res = suggestIntent('Room requirements', 'Honeymoon setup needed with extra bed and Jain food.');
    assert.equal(res.top_intent, 'Special request');
  });

  await t.test('Handles low confidence / unknown queries safely', () => {
    const res = suggestIntent('Hello', 'Just saying hi to support');
    assert.equal(res.top_intent, 'Other');
    assert.equal(res.is_low_confidence, true);
  });
});

test('Domain: Travel-Aware SLA Engine', async (t) => {
  // Use a fixed simulated clock for deterministic testing
  const fixedNow = '2026-11-09T10:00:00.000Z';
  setSimulatedNow(fixedNow);

  await t.test('Base SLA targets match design choices when no travel event is near', () => {
    const normal = calculateSla({ priority: 'Normal', createdAt: fixedNow });
    assert.equal(normal.baseHours, 24);
    assert.equal(normal.effectivePriority, 'Normal');
    assert.equal(normal.dueAtISO, new Date(new Date(fixedNow).getTime() + 24 * 3600 * 1000).toISOString());

    const urgent = calculateSla({ priority: 'Urgent', createdAt: fixedNow });
    assert.equal(urgent.baseHours, 2);
    assert.equal(urgent.dueAtISO, new Date(new Date(fixedNow).getTime() + 2 * 3600 * 1000).toISOString());
  });

  await t.test('Check-in within 12 hours boosts effective priority to Urgent', () => {
    const checkIn = new Date(new Date(fixedNow).getTime() + 8 * 3600 * 1000).toISOString();
    const res = calculateSla({ priority: 'Low', createdAt: fixedNow, checkInDate: checkIn });

    assert.equal(res.effectivePriority, 'Urgent');
    assert.ok(res.boostReason.includes('Check-in is within 8h'));
    // Due is capped to checkIn - 2h = 6h from creation (which is < base 72h or 2h)
    // Since base for Urgent is 2h, min(created + 2h, checkIn - 2h) = created + 2h
    assert.equal(res.dueAtISO, new Date(new Date(fixedNow).getTime() + 2 * 3600 * 1000).toISOString());
  });

  await t.test('LCD within 48 hours elevates Normal/Low priority to High', () => {
    const lcd = new Date(new Date(fixedNow).getTime() + 30 * 3600 * 1000).toISOString();
    const res = calculateSla({ priority: 'Normal', createdAt: fixedNow, lcdDate: lcd });

    assert.equal(res.effectivePriority, 'High');
    assert.equal(res.baseHours, 8);
    assert.ok(res.boostReason.includes('LCD (Cancellation Cutoff) is within 30h'));
  });

  await t.test('SLA State flags At-risk when remaining time <= 30% or <= 1h', () => {
    // Created 1.5 hours ago for a 2-hour window -> remaining 30 mins (<= 1h)
    const created = new Date(new Date(fixedNow).getTime() - 90 * 60 * 1000).toISOString();
    const res = calculateSla({ priority: 'Urgent', createdAt: created });

    assert.equal(res.slaState, 'At-risk');
    assert.ok(res.stateReason.includes('30 minutes remaining'));
  });

  await t.test('SLA State flags Breached when past deadline', () => {
    // Created 3 hours ago for a 2-hour window
    const created = new Date(new Date(fixedNow).getTime() - 3 * 3600 * 1000).toISOString();
    const res = calculateSla({ priority: 'Urgent', createdAt: created });

    assert.equal(res.slaState, 'Breached');
    assert.ok(res.stateReason.includes('Target breached'));
  });

  await t.test('Resolved tickets show Met or Missed', () => {
    const created = new Date(new Date(fixedNow).getTime() - 5 * 3600 * 1000).toISOString();
    const metResolved = new Date(new Date(fixedNow).getTime() - 4 * 3600 * 1000).toISOString();
    const missedResolved = new Date(new Date(fixedNow).getTime() - 1 * 3600 * 1000).toISOString();

    const met = calculateSla({ priority: 'Urgent', createdAt: created, resolvedAt: metResolved, status: 'Resolved' });
    assert.equal(met.slaState, 'Met');

    const missed = calculateSla({ priority: 'Urgent', createdAt: created, resolvedAt: missedResolved, status: 'Resolved' });
    assert.equal(missed.slaState, 'Missed');
  });

  // Reset clock
  setSimulatedNow(null);
});

test('Domain: Multi-Factor Routing Engine', async (t) => {
  // Test agent scoring formula directly
  const agentOnShift = {
    id: 'a1',
    region: 'India',
    shift_start: '09:00',
    shift_end: '18:00',
    skills: 'refund,cancellation',
    rank: 3,
    is_available: 1
  };

  const agentOffline = {
    ...agentOnShift,
    id: 'a2',
    is_available: 0
  };

  const istMidday = { hours: 14, minutes: 0, totalMinutes: 840 }; // 14:00 IST

  await t.test('Offline agent is strictly ineligible', () => {
    const ticket = { region: 'India', category_intent: 'Refund', priority: 'Urgent' };
    const score = scoreAgent(agentOffline, ticket, istMidday, 0);
    assert.equal(score.eligible, false);
  });

  await t.test('Scores full bonus for region (+40), shift (+20), skill (+15), and rank (+24 for Urgent)', () => {
    const ticket = { region: 'India', category_intent: 'Refund', priority: 'Urgent' };
    const score = scoreAgent(agentOnShift, ticket, istMidday, 0);

    // 40 (region) + 20 (shift) + 15 (skill) + 24 (8*3 for rank 3 urgent) = 99
    assert.equal(score.eligible, true);
    assert.equal(score.totalScore, 99);
  });

  await t.test('Deducts 5 points per open ticket workload', () => {
    const ticket = { region: 'India', category_intent: 'Refund', priority: 'Urgent' };
    const scoreWithLoad = scoreAgent(agentOnShift, ticket, istMidday, 4); // 4 open tickets = -20

    assert.equal(scoreWithLoad.totalScore, 99 - 20);
  });
});
