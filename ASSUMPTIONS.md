# OpsDesk - Design Decisions & Assumptions

This document records all architectural choices, parameter assumptions, and open questions as required by Rule R5 and the TBO Hackathon specification.

---

## 1. Domain & Terminology Assumptions
1. **TBOH**: Assumed to be TBO's canonical Booking / Order Reference code (e.g. `TBOH-98241`). Tickets sharing a TBOH represent inquiries or issues regarding the exact same travel booking.
2. **LCD (Last Cancellation Date)**: Assumed to be the supplier-imposed penalty cutoff date/time after which cancellation or changes incur financial forfeiture. Tickets nearing LCD require prioritized operations action to protect the agency/traveler from avoidable financial losses.
3. **Single-Tenant Core with Multi-Tenant Architecture**: For this hackathon MVP, the system operates as a single TBO instance serving multiple B2B travel agencies. Every business table includes a `tenant_id` column to allow easy transition to multi-tenant deployment without schema changes.

---

## 2. Our Design Choices (Explicitly Labelled as Design Choices, Not Scientific Standards)
1. **SLA Base Hours**:
   - `Urgent`: 2 hours
   - `High`: 8 hours
   - `Normal`: 24 hours
   - `Low`: 72 hours
2. **Travel Proximity SLA Boost**:
   - Earliest future event among `check_in_date` and `lcd_date`:
     - If `<= 12 hours` from now: effective priority is boosted to `Urgent`.
     - If `<= 48 hours` from now: effective priority is boosted to at least `High`.
   - Dynamic Due Date: `min(created_at + base_hours, travel_event - 2 hours)`, with a safeguard floor of `created_at + 30 minutes`.
   - At-Risk Threshold: Ticket enters `At-risk` status when remaining time is `<= 30%` of original window OR `<= 1 hour`.
3. **Routing Scoring Weights**:
   - Region match: `+40 points`
   - Active shift window (IST match): `+20 points`
   - Intent skill match: `+15 points`
   - Urgent/High priority: `+ (8 * agent.rank)` (rank 1 to 3; rank 3 = senior)
   - Normal/Low priority: `+ (4 * (4 - agent.rank))` (distributes routine tickets to junior agents)
   - Workload penalty: `- (5 * count_of_assigned_open_tickets)`
   - Minimum eligibility: Agent must be marked as `is_available = 1`. If no available agent scores > 0, the ticket moves to `Triage` with an audit explanation.
4. **Ticket Linking Rules**:
   - **Strong Link**: Matching `TBOH` across any ticket.
   - **Medium Link**: Same agency + same category/intent within 30 days.
   - **Manual Link**: Explicit agent action, fully logged in the activity timeline.
5. **Data Retention & Archival**:
   - Default threshold: Tickets in `Closed` status older than 90 days are archived (`is_archived = 1`).
   - Archived tickets do not clutter active queues but remain fully searchable, auditable, and included in large-scale CSV extracts.
6. **Intent Taxonomy**:
   - 10 structured categories: `Refund`, `Cancellation`, `Amendment`, `Payment issue`, `Voucher/Documents`, `Inventory/Availability`, `Supplier confirmation`, `Special request`, `Commission/Credit`, `Other`.
   - Suggester is rules-based using weighted keywords in English and conversational Hinglish.

---

## 3. Security & Operational Assumptions
1. **Authentication in Demo Mode**:
   - Password hashing uses Node.js native `crypto.scrypt` with per-user random 16-byte salt and N=16384, r=8, p=1.
   - For demo convenience, a quick-role picker is provided on the login page when `DEMO_MODE=true`. In non-demo environments, this picker is hidden.
2. **Data Isolation (IDOR Defense)**:
   - Requester accounts belong to a specific agency. An attempt by Agency A to view or query a ticket belonging to Agency B yields an immediate `404 Not Found` (not 403, preventing resource enumeration).
   - Requesters can never view internal agent notes or side conversations with suppliers.
3. **Offline & Zero NPM Runtime**:
   - OpsDesk runs purely on Node.js 22 built-in modules (`node:sqlite`, `node:http`, `node:crypto`, `node:test`, `node:fs`, `node:path`).
   - Front-end is native vanilla ES modules without build tools, webpack, or external CDNs.
   - Typography is self-hosted IBM Plex (SIL Open Font License).

---

## 4. Open Questions for TBO Hackathon Organizers
1. **TBOH Format & API**: What is the canonical regex/format for TBOH booking references, and will an external Booking API be provided for real-time validation?
2. **LCD Definition**: Is LCD strictly a timestamp or does it vary by supplier timezone / hotel local check-in time?
3. **Judging Criteria & Evaluation Weights**: What are the exact weight percentages allocated to code architecture vs demo presentation vs cost modeling?
4. **Hosted URL vs Local Submission**: Is a public cloud link strictly required for submission, or is the self-contained portable Windows ZIP sufficient?
