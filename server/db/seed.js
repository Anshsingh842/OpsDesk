// server/db/seed.js
// Synthetic seed dataset generated relative to getNow() so SLA states and queues are always live and meaningful.
// Complies strictly with R4 (synthetic data only, fake names, .example domains, no real PII).

const { hashPassword } = require('../auth/passwords');
const { getNow } = require('../domain/now');
const { calculateSla } = require('../domain/sla');
const { autoLinkTicket } = require('../domain/linking');

function seedDatabase(db, forceReseed = false) {
  const existingCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (existingCount > 0 && !forceReseed) {
    return false; // Already seeded
  }

  // Clear existing data cleanly if forced
  if (forceReseed) {
    db.exec(`
      DELETE FROM timeline_events;
      DELETE FROM ticket_themes;
      DELETE FROM ticket_links;
      DELETE FROM side_messages;
      DELETE FROM side_recipients;
      DELETE FROM side_conversations;
      DELETE FROM ticket_messages;
      DELETE FROM tickets;
      DELETE FROM sessions;
      DELETE FROM login_attempts;
      DELETE FROM audit_log;
      DELETE FROM users;
      DELETE FROM agencies;
      DELETE FROM tenants;
    `);
  }

  const now = getNow();
  const nowMs = now.getTime();
  const nowISO = now.toISOString();

  // 1. Tenant
  db.prepare('INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)').run(
    'tbo-default',
    'TBO Global Travel Operations',
    nowISO
  );

  // 2. Agencies across 4 regions
  const agencies = [
    { id: 'agy_dxb_01', tenant_id: 'tbo-default', code: 'AGY-DXB-01', name: 'Al Fanoos Travel LLC', region: 'Middle East', country: 'United Arab Emirates' },
    { id: 'agy_del_02', tenant_id: 'tbo-default', code: 'AGY-DEL-02', name: 'Bharat Yatra Connect Pvt Ltd', region: 'India', country: 'India' },
    { id: 'agy_ams_03', tenant_id: 'tbo-default', code: 'AGY-AMS-03', name: 'EuroVoyage Holidays BV', region: 'Europe', country: 'Netherlands' },
    { id: 'agy_sin_04', tenant_id: 'tbo-default', code: 'AGY-SIN-04', name: 'Nusantara Travel Hub Pte', region: 'South-East Asia', country: 'Singapore' }
  ];

  const insertAgency = db.prepare('INSERT INTO agencies (id, tenant_id, code, name, region, country, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const a of agencies) {
    insertAgency.run(a.id, a.tenant_id, a.code, a.name, a.region, a.country, nowISO);
  }

  // 3. Demo Users with hashed passwords ('Demo@123')
  const defaultPasswordHash = hashPassword('Demo@123');

  const users = [
    // Ops Lead
    { id: 'usr_lead_01', tenant_id: 'tbo-default', agency_id: null, email: 'lead@tbo.example', name: 'Vikram Singhania', role: 'lead', region: 'India', shift_start: '09:00', shift_end: '18:00', skills: 'All', rank: 3, is_available: 1 },

    // Escalation Managers
    { id: 'usr_em_01', tenant_id: 'tbo-default', agency_id: null, email: 'em.india@tbo.example', name: 'Zoya Akhtar', role: 'escalation_manager', region: 'India', shift_start: '09:00', shift_end: '18:00', skills: 'Refund,Cancellation,Amendment,Payment issue', rank: 3, is_available: 1 },
    { id: 'usr_em_02', tenant_id: 'tbo-default', agency_id: null, email: 'em.me@tbo.example', name: 'Hamdan Qureshi', role: 'escalation_manager', region: 'Middle East', shift_start: '08:00', shift_end: '17:00', skills: 'Refund,Supplier confirmation,Special request', rank: 3, is_available: 1 },

    // Ops Agents
    { id: 'usr_agent_01', tenant_id: 'tbo-default', agency_id: null, email: 'aarav@tbo.example', name: 'Aarav Sharma', role: 'agent', region: 'India', shift_start: '09:00', shift_end: '18:00', skills: 'Refund,Cancellation,Amendment', rank: 3, is_available: 1 },
    { id: 'usr_agent_02', tenant_id: 'tbo-default', agency_id: null, email: 'kavita@tbo.example', name: 'Kavita Patel', role: 'agent', region: 'India', shift_start: '13:00', shift_end: '22:00', skills: 'Payment issue,Commission/Credit', rank: 2, is_available: 1 },
    { id: 'usr_agent_03', tenant_id: 'tbo-default', agency_id: null, email: 'omar@tbo.example', name: 'Omar Al-Sayed', role: 'agent', region: 'Middle East', shift_start: '08:00', shift_end: '17:00', skills: 'Refund,Supplier confirmation,Special request', rank: 2, is_available: 1 },
    { id: 'usr_agent_04', tenant_id: 'tbo-default', agency_id: null, email: 'sophie@tbo.example', name: 'Sophie Dubois', role: 'agent', region: 'Europe', shift_start: '12:00', shift_end: '21:00', skills: 'Inventory/Availability,Voucher/Documents', rank: 1, is_available: 1 },
    { id: 'usr_agent_05', tenant_id: 'tbo-default', agency_id: null, email: 'wei@tbo.example', name: 'Tan Wei Ming', role: 'agent', region: 'South-East Asia', shift_start: '06:00', shift_end: '15:00', skills: 'Refund,Cancellation,Special request', rank: 2, is_available: 1 },
    { id: 'usr_agent_06', tenant_id: 'tbo-default', agency_id: null, email: 'deepak@tbo.example', name: 'Deepak Verma', role: 'agent', region: 'India', shift_start: '00:00', shift_end: '09:00', skills: 'Refund,Payment issue', rank: 1, is_available: 0 }, // Simulated Offline

    // Requesters (2 per agency)
    { id: 'usr_req_dxb_1', tenant_id: 'tbo-default', agency_id: 'agy_dxb_01', email: 'tariq@alfanoos.example', name: 'Tariq Mansoor', role: 'requester', region: 'Middle East', rank: 1, is_available: 1 },
    { id: 'usr_req_dxb_2', tenant_id: 'tbo-default', agency_id: 'agy_dxb_01', email: 'fatima@alfanoos.example', name: 'Fatima Al-Zahra', role: 'requester', region: 'Middle East', rank: 1, is_available: 1 },

    { id: 'usr_req_del_1', tenant_id: 'tbo-default', agency_id: 'agy_del_02', email: 'rohit@bharatyatra.example', name: 'Rohit Khanna', role: 'requester', region: 'India', rank: 1, is_available: 1 },
    { id: 'usr_req_del_2', tenant_id: 'tbo-default', agency_id: 'agy_del_02', email: 'priya@bharatyatra.example', name: 'Priya Sundaram', role: 'requester', region: 'India', rank: 1, is_available: 1 },

    { id: 'usr_req_ams_1', tenant_id: 'tbo-default', agency_id: 'agy_ams_03', email: 'lars@eurovoyage.example', name: 'Lars van Dijk', role: 'requester', region: 'Europe', rank: 1, is_available: 1 },
    { id: 'usr_req_ams_2', tenant_id: 'tbo-default', agency_id: 'agy_ams_03', email: 'emma@eurovoyage.example', name: 'Emma De Jong', role: 'requester', region: 'Europe', rank: 1, is_available: 1 },

    { id: 'usr_req_sin_1', tenant_id: 'tbo-default', agency_id: 'agy_sin_04', email: 'budi@nusantara.example', name: 'Budi Santoso', role: 'requester', region: 'South-East Asia', rank: 1, is_available: 1 },
    { id: 'usr_req_sin_2', tenant_id: 'tbo-default', agency_id: 'agy_sin_04', email: 'lin@nusantara.example', name: 'Lin Mei-Ling', role: 'requester', region: 'South-East Asia', rank: 1, is_available: 1 }
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (id, tenant_id, agency_id, email, name, role, password_hash, region, shift_start, shift_end, skills, rank, is_available, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const u of users) {
    insertUser.run(
      u.id, u.tenant_id, u.agency_id, u.email, u.name, u.role, defaultPasswordHash,
      u.region || 'India', u.shift_start || null, u.shift_end || null,
      u.skills || null, u.rank || 1, u.is_available !== undefined ? u.is_available : 1, nowISO
    );
  }

  // Helper for generating relative dates
  const hoursAgo = (h) => new Date(nowMs - h * 3600 * 1000).toISOString();
  const hoursFromNow = (h) => new Date(nowMs + h * 3600 * 1000).toISOString();
  const daysAgo = (d) => new Date(nowMs - d * 24 * 3600 * 1000).toISOString();

  // 4. Seed Tickets with clear storytelling:
  // - Story A: "Same refund, three contacts" on TBOH-88219 (Al Fanoos Travel)
  // - Story B: Transferred ticket with active supplier side convo (3 recipients)
  // - Story C: Near Check-in (4 hours) -> Breached/At-risk
  // - Story D: Near LCD (8 hours) -> At-risk
  // - Story E: Escalation Manager queue (2 tickets)
  // - Spread across 14 days with theme tags for Insights

  const seedTickets = [
    // Story A - Contact 1 (Closed 6 days ago)
    {
      id: 'TBO-1001',
      agency_id: 'agy_dxb_01',
      requester_id: 'usr_req_dxb_1',
      assigned_agent_id: 'usr_agent_03',
      tboh: 'TBOH-88219',
      title: 'Refund request for cancelled Dubai flight',
      description: 'Customer flight was cancelled due to schedule change. Kindly initiate fare refund back to agency balance.',
      category_intent: 'Refund',
      priority: 'Normal',
      status: 'Closed',
      check_in_date: daysAgo(5),
      lcd_date: daysAgo(7),
      created_at: daysAgo(6),
      resolved_at: daysAgo(5),
      closed_at: daysAgo(4),
      themes: ['refund delay']
    },
    // Story A - Contact 2 (Pending 2 days ago)
    {
      id: 'TBO-1002',
      agency_id: 'agy_dxb_01',
      requester_id: 'usr_req_dxb_1',
      assigned_agent_id: 'usr_agent_03',
      tboh: 'TBOH-88219',
      title: 'Refund kab aayega? Follow-up on TBOH-88219',
      description: 'Paise wapas kab aayenge? Follow up on ticket 1001. Guest is asking daily for status update.',
      category_intent: 'Refund',
      priority: 'Normal',
      status: 'Pending',
      check_in_date: daysAgo(5),
      lcd_date: daysAgo(7),
      created_at: daysAgo(2),
      resolved_at: null,
      closed_at: null,
      themes: ['refund delay']
    },
    // Story A - Contact 3 (Active, recent, High priority)
    {
      id: 'TBO-1003',
      agency_id: 'agy_dxb_01',
      requester_id: 'usr_req_dxb_2',
      assigned_agent_id: 'usr_agent_03',
      tboh: 'TBOH-88219',
      title: 'URGENT: Escalated refund demand for TBOH-88219',
      description: 'Third contact regarding refund. Agency client is threatening consumer court dispute if credit note is not issued today.',
      category_intent: 'Refund',
      priority: 'High',
      status: 'Open',
      check_in_date: daysAgo(5),
      lcd_date: daysAgo(7),
      created_at: hoursAgo(3),
      resolved_at: null,
      closed_at: null,
      themes: ['refund delay']
    },

    // Story B - Transferred ticket with active supplier side conversation
    {
      id: 'TBO-1004',
      agency_id: 'agy_del_02',
      requester_id: 'usr_req_del_1',
      assigned_agent_id: 'usr_agent_01', // Transferred from usr_agent_04 to usr_agent_01
      previous_agent_id: 'usr_agent_04',
      tboh: 'TBOH-55011',
      title: 'Special meal request and early check-in for Goa luxury villa',
      description: 'Honeymoon couple requires Jain meal package and 10 AM early check-in. Booking ref TBOH-55011.',
      category_intent: 'Special request',
      priority: 'Normal',
      status: 'Open',
      check_in_date: hoursFromNow(36),
      lcd_date: hoursFromNow(24),
      created_at: hoursAgo(6),
      resolved_at: null,
      closed_at: null,
      themes: ['special request'],
      has_side_convo: true
    },

    // Story C - Near Check-in (in 3 hours) -> Breached SLA demo
    {
      id: 'TBO-1005',
      agency_id: 'agy_del_02',
      requester_id: 'usr_req_del_2',
      assigned_agent_id: 'usr_agent_01',
      tboh: 'TBOH-77204',
      title: 'Guest at hotel reception: Hotel says no booking found!',
      description: 'Guest arrived at Grand Plaza Delhi with voucher. Front desk says reservation not in system. Immediate hotel confirmation needed!',
      category_intent: 'Supplier confirmation',
      priority: 'Urgent',
      status: 'Open',
      check_in_date: hoursFromNow(2), // Check-in in 2 hours!
      lcd_date: daysAgo(1),
      created_at: hoursAgo(3), // 3 hours ago for a 2 hour SLA -> Breached!
      resolved_at: null,
      closed_at: null,
      themes: ['supplier confirmation', 'inventory sync']
    },

    // Story D - Near LCD (Last Cancellation Date in 6 hours) -> At-risk SLA
    {
      id: 'TBO-1006',
      agency_id: 'agy_ams_03',
      requester_id: 'usr_req_ams_1',
      assigned_agent_id: 'usr_agent_04',
      tboh: 'TBOH-33190',
      title: 'Urgent cancellation before penalty cutoff (LCD tonight)',
      description: 'Guest visa rejected. Free cancellation deadline (LCD) expires in 6 hours. Cancel immediately to avoid 100% room penalty.',
      category_intent: 'Cancellation',
      priority: 'High',
      status: 'Open',
      check_in_date: hoursFromNow(48),
      lcd_date: hoursFromNow(6), // LCD in 6h!
      created_at: hoursAgo(4), // At-risk
      resolved_at: null,
      closed_at: null,
      themes: ['cancellation penalty']
    },

    // Story E - In Escalation Manager Queue (Item 1)
    {
      id: 'TBO-1007',
      agency_id: 'agy_sin_04',
      requester_id: 'usr_req_sin_1',
      assigned_agent_id: 'usr_agent_05',
      escalation_manager_id: 'usr_em_01',
      previous_agent_id: 'usr_agent_05',
      tboh: 'TBOH-99412',
      title: 'Overbooked hotel in Bali - guest stranded without room',
      description: 'Hotel denied check-in due to inventory sync failure. Guest standing in lobby with children. Relocation and compensation authorization required.',
      category_intent: 'Inventory/Availability',
      priority: 'Urgent',
      status: 'Escalated',
      escalation_reason: 'Supplier inventory failure with guest stranded on site; requires manager financial compensation limit approval.',
      escalated_at: hoursAgo(1),
      escalated_by: 'Tan Wei Ming',
      check_in_date: hoursAgo(1),
      lcd_date: daysAgo(2),
      created_at: hoursAgo(2),
      resolved_at: null,
      closed_at: null,
      themes: ['inventory sync']
    },

    // Story E - In Escalation Manager Queue (Item 2)
    {
      id: 'TBO-1008',
      agency_id: 'agy_dxb_01',
      requester_id: 'usr_req_dxb_2',
      assigned_agent_id: 'usr_agent_03',
      escalation_manager_id: 'usr_em_02',
      previous_agent_id: 'usr_agent_03',
      tboh: 'TBOH-11084',
      title: 'Major payment mismatch and credit limit blockage',
      description: 'Agency wallet debited twice for $4,200 booking, locking agency credit balance. Manager approval needed for immediate finance unlock.',
      category_intent: 'Payment issue',
      priority: 'Urgent',
      status: 'Escalated',
      escalation_reason: 'Double debit locked entire agency B2B credit limit, stopping all new bookings.',
      escalated_at: hoursAgo(2),
      escalated_by: 'Omar Al-Sayed',
      check_in_date: hoursFromNow(72),
      lcd_date: hoursFromNow(48),
      created_at: hoursAgo(4),
      resolved_at: null,
      closed_at: null,
      themes: ['payment failure']
    },

    // Additional tickets spread across last 14 days for week-over-week Insights
    {
      id: 'TBO-1009',
      agency_id: 'agy_del_02',
      requester_id: 'usr_req_del_1',
      assigned_agent_id: 'usr_agent_01',
      tboh: 'TBOH-44102',
      title: 'Change passenger name spelling on flight voucher',
      description: 'Minor spelling mistake in passenger first name: Sunita instead of Suneeta. Airline requires endorsement.',
      category_intent: 'Amendment',
      priority: 'Normal',
      status: 'Resolved',
      check_in_date: daysAgo(10),
      lcd_date: daysAgo(12),
      created_at: daysAgo(11),
      resolved_at: daysAgo(10),
      closed_at: daysAgo(9),
      themes: ['amendment issue']
    },
    {
      id: 'TBO-1010',
      agency_id: 'agy_ams_03',
      requester_id: 'usr_req_ams_2',
      assigned_agent_id: 'usr_agent_04',
      tboh: 'TBOH-44102', // Same TBOH as 1009
      title: 'Follow-up on passenger name correction endorsement',
      description: 'Need confirmed updated e-ticket copy with amended spelling for TBOH-44102.',
      category_intent: 'Amendment',
      priority: 'Normal',
      status: 'Closed',
      check_in_date: daysAgo(10),
      lcd_date: daysAgo(12),
      created_at: daysAgo(9),
      resolved_at: daysAgo(8),
      closed_at: daysAgo(7),
      themes: ['amendment issue', 'voucher/documents']
    },
    {
      id: 'TBO-1011',
      agency_id: 'agy_sin_04',
      requester_id: 'usr_req_sin_2',
      assigned_agent_id: 'usr_agent_05',
      tboh: 'TBOH-66120',
      title: 'Voucher generate nahi hua for Singapore Sentosa package',
      description: 'Booking payment successful but confirmation PDF failed to download from dashboard.',
      category_intent: 'Voucher/Documents',
      priority: 'Normal',
      status: 'Resolved',
      check_in_date: daysAgo(3),
      lcd_date: daysAgo(5),
      created_at: daysAgo(4),
      resolved_at: daysAgo(3),
      closed_at: null,
      themes: ['voucher/documents']
    },
    {
      id: 'TBO-1012',
      agency_id: 'agy_dxb_01',
      requester_id: 'usr_req_dxb_1',
      assigned_agent_id: null, // Unassigned in Triage!
      tboh: 'TBOH-77334',
      title: 'New unassigned booking inquiry: Commission mismatch',
      description: 'Commission calculation on Abu Dhabi tour shows 3% instead of agreed 5% contract tier.',
      category_intent: 'Commission/Credit',
      priority: 'Normal',
      status: 'New',
      check_in_date: hoursFromNow(96),
      lcd_date: hoursFromNow(72),
      created_at: hoursAgo(1),
      resolved_at: null,
      closed_at: null,
      themes: ['commission mismatch']
    }
  ];

  const insertTicket = db.prepare(`
    INSERT INTO tickets (
      id, tenant_id, agency_id, requester_id, assigned_agent_id, escalation_manager_id, previous_agent_id,
      tboh, title, description, category_intent, priority, status, check_in_date, lcd_date,
      sla_due_at, sla_effective_priority, sla_state, routing_reason, routing_score_breakdown,
      escalation_reason, escalated_at, escalated_by, is_archived, created_at, updated_at, resolved_at, closed_at
    ) VALUES (
      ?, 'tbo-default', ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, 0, ?, ?, ?, ?
    )
  `);

  const insertTheme = db.prepare('INSERT INTO ticket_themes (id, tenant_id, ticket_id, theme_name, source, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  const insertMessage = db.prepare('INSERT INTO ticket_messages (id, tenant_id, ticket_id, sender_user_id, sender_name, sender_role, message_type, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insertTimeline = db.prepare('INSERT INTO timeline_events (id, tenant_id, ticket_id, event_type, actor_user_id, actor_name, summary, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');

  for (const t of seedTickets) {
    const sla = calculateSla({
      priority: t.priority,
      createdAt: t.created_at,
      checkInDate: t.check_in_date,
      lcdDate: t.lcd_date,
      resolvedAt: t.resolved_at,
      status: t.status
    });

    const routingReason = t.assigned_agent_id ? `Assigned by automated routing rule based on region, shift, and skill match.` : 'Pending triage assignment.';

    insertTicket.run(
      t.id, t.agency_id, t.requester_id, t.assigned_agent_id || null, t.escalation_manager_id || null, t.previous_agent_id || null,
      t.tboh, t.title, t.description, t.category_intent, t.priority, t.status, t.check_in_date, t.lcd_date,
      sla.dueAtISO, sla.effectivePriority, sla.slaState, routingReason, JSON.stringify({ seeded: true }),
      t.escalation_reason || null, t.escalated_at || null, t.escalated_by || null,
      t.created_at, t.created_at, t.resolved_at || null, t.closed_at || null
    );

    // Initial message
    insertMessage.run(
      'msg_' + Math.random().toString(36).substring(2, 10),
      'tbo-default',
      t.id,
      t.requester_id,
      'Agency Partner',
      'requester',
      'public_reply',
      t.description,
      t.created_at
    );

    // Initial timeline event
    insertTimeline.run(
      'tml_' + Math.random().toString(36).substring(2, 10),
      'tbo-default',
      t.id,
      'created',
      t.requester_id,
      'Agency Partner',
      `Ticket created with intent ${t.category_intent} and priority ${t.priority}`,
      JSON.stringify({ priority: t.priority, category: t.category_intent, tboh: t.tboh }),
      t.created_at
    );

    // Themes
    if (t.themes) {
      for (const th of t.themes) {
        insertTheme.run(
          'thm_' + Math.random().toString(36).substring(2, 10),
          'tbo-default',
          t.id,
          th,
          'auto',
          t.created_at
        );
      }
    }
  }

  // 5. Build automated links for all seeded tickets
  const allTickets = db.prepare('SELECT * FROM tickets').all();
  for (const t of allTickets) {
    autoLinkTicket(db, t);
  }

  // 6. Seed Side Conversation for Story B (TBO-1004)
  // 3 explicit recipients with supplier
  const sideConvoId = 'sdc_55011';
  db.prepare(`
    INSERT INTO side_conversations (id, tenant_id, ticket_id, subject, side_type, supplier_name, status, created_by_user_id, created_at, updated_at)
    VALUES (?, 'tbo-default', 'TBO-1004', 'Meal preferences and early arrival reconfirmation - TBOH-55011', 'supplier', 'Goa Heritage Luxury Villas', 'active', 'usr_agent_04', ?, ?)
  `).run(sideConvoId, hoursAgo(5), hoursAgo(1));

  const sideRecipients = [
    { email: 'reservations@goaheritage.supplier.example', name: 'Goa Heritage Central Reservations', type: 'to', known: 1 },
    { email: 'duty.manager@goaheritage.supplier.example', name: 'Villa Duty Manager', type: 'cc', known: 1 },
    { email: 'transfers@goacabs.local.example', name: 'Goa VIP Airport Transfers', type: 'cc', known: 0 } // External warning domain
  ];

  const insertRecipient = db.prepare(`
    INSERT INTO side_recipients (id, tenant_id, side_conversation_id, email, name, recipient_type, is_known_domain, added_at)
    VALUES (?, 'tbo-default', ?, ?, ?, ?, ?, ?)
  `);

  for (const r of sideRecipients) {
    insertRecipient.run(
      'rec_' + Math.random().toString(36).substring(2, 10),
      sideConvoId,
      r.email,
      r.name,
      r.type,
      r.known,
      hoursAgo(5)
    );
  }

  // Messages in Side Conversation
  db.prepare(`
    INSERT INTO side_messages (id, tenant_id, side_conversation_id, sender_user_id, sender_name, body, recipients_snapshot, created_at)
    VALUES (?, 'tbo-default', ?, 'usr_agent_04', 'Sophie Dubois', ?, ?, ?)
  `).run(
    'sdm_01',
    sideConvoId,
    'Dear Goa Heritage Team, kindly confirm if early check-in at 10 AM is possible for guest under TBOH-55011 and if Jain dining setup is ready.',
    JSON.stringify(sideRecipients),
    hoursAgo(5)
  );

  db.prepare(`
    INSERT INTO side_messages (id, tenant_id, side_conversation_id, sender_user_id, sender_name, body, recipients_snapshot, created_at)
    VALUES (?, 'tbo-default', ?, 'usr_agent_01', 'Aarav Sharma', ?, ?, ?)
  `).run(
    'sdm_02',
    sideConvoId,
    'Following up on this request as new case owner. Guest flight lands at Dabolim Airport at 08:30 AM.',
    JSON.stringify(sideRecipients),
    hoursAgo(1)
  );

  // Add timeline event on ticket for transfer and side convo
  insertTimeline.run(
    'tml_trans_01',
    'tbo-default',
    'TBO-1004',
    'reassigned',
    'usr_agent_04',
    'Sophie Dubois',
    'Transferred ticket from Sophie Dubois to Aarav Sharma (India Region Shift). Side conversation recipients preserved.',
    JSON.stringify({ from: 'Sophie Dubois', to: 'Aarav Sharma', sideConvoPreserved: true }),
    hoursAgo(2)
  );

  return true;
}

module.exports = {
  seedDatabase
};
