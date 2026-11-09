# OpsDesk - Hackathon Judge Q&A (35 Comprehensive Questions & Answers)

This document prepares the team for technical, architectural, product, and cost scrutiny from TBO judges. In adherence to Rule R1 and R2, all answers are transparent, cite empirical measurements where tested, and state "not measured / design assumption" where applicable.

---

### Category 1: Problem Understanding & TBO Travel Complexity
#### 1. Why can't Zendesk or off-the-shelf ticketing systems solve TBO's problem?
Traditional tools were designed around isolated B2C interactions ("ticket closed = job done"). TBO operates high-volume B2B travel fulfillment where multiple agents, hotel suppliers, airlines, and requesters touch the exact same booking reference (TBOH). Off-the-shelf platforms charge steep add-on taxes for basic features (linking apps, extra storage, AI copilot licenses) without understanding travel urgency (e.g. check-in in 2 hours vs 2 weeks).

#### 2. What exactly is a TBOH and what was your assumption?
As documented in `ASSUMPTIONS.md`, TBOH is assumed to be TBO's canonical Booking / Order Reference code (e.g. `TBOH-88219`). In OpsDesk, TBOH serves as the primary foreign key for Strong Linkage across cases.

#### 3. What does LCD stand for and how does OpsDesk use it?
LCD is assumed to be **Last Cancellation Date**—the supplier cutoff after which a cancellation or modification incurs financial penalty. If a ticket's LCD is within 48 hours, OpsDesk boosts the effective SLA to High; if within 12 hours, to Urgent.

#### 4. How did you handle the "same refund asked 3 times" scenario?
On ticket creation, OpsDesk executes `autoLinkTicket()`. It queries all existing cases with the matching TBOH and creates bi-directional links (`strong_tboh`). The UI surfaces a prominent badge: *"3rd contact on this TBOH"*, preventing redundant investigations and agency frustration.

#### 5. Why did you choose a vertical slice over full Zendesk parity?
The hackathon specification explicitly guided teams: *"Ship a coherent vertical slice, not an entire enterprise ticketing suite in one weekend"*. We built depth into the 6 specific core pain points (P1–P6) rather than superficial omnichannel widgets.

---

### Category 2: Domain Logic (Routing, SLA, Intent)
#### 6. How does your routing algorithm go beyond basic FIFO/LIFO?
OpsDesk evaluates 6 dynamic criteria: 1) Agent availability (strict filter), 2) Region match (+40 pts), 3) Current shift window in IST (+20 pts), 4) Intent skill match (+15 pts), 5) Priority/Rank weighting (+8×rank for Urgent), and 6) Workload deduction (-5 pts per open ticket).

#### 7. What happens if no agent is available or on shift?
The ticket is automatically routed to **Triage (Unassigned)** with an auditable explanation written to `routing_reason` (e.g. *"No qualified agents available on shift; sent to Triage"*). Ops leads see a live alert on their governance dashboard.

#### 8. Why is your intent suggester rule-based instead of using an LLM?
Rule-based matching with weighted English and Hinglish dictionaries is deterministic, runs in under 1 millisecond, requires zero external API cost, has zero network latency, and cannot suffer from prompt injections or hallucinations.

#### 9. How does the intent suggester handle Hinglish colloquialisms?
Our dictionary includes common Indian travel ops phrases: *"paise wapas kab aayenge"* (Refund), *"booking radd karni hai"* (Cancellation), *"paise kat gaye gateway failed"* (Payment issue), *"tareekh badalna"* (Amendment).

#### 10. Can the system change a ticket's intent silently without human consent?
No. The specification explicitly forbids silent intent application. The suggester displays the top intent, confidence score, and matched terms with an explicit *"Apply Suggestion"* button. The human agent remains in control.

#### 11. How does the travel proximity SLA boost work?
If the earliest future event ($\min(\text{Check-in}, \text{LCD})$) is within 12 hours of case creation, the effective priority is boosted to Urgent (2h base SLA). If within 48 hours, it is boosted to at least High (8h base SLA). The deadline is capped to 2 hours before the travel event, with a 30-minute floor.

#### 12. How are "At-risk" and "Breached" SLA states calculated?
A ticket becomes **At-risk** when the remaining time until deadline is $\le 30\%$ of the total window OR $\le 1\text{ hour}$. It becomes **Breached** the moment current time exceeds the due date.

---

### Category 3: Side Conversations & Supplier Threads
#### 13. How did you solve the bug where side conversation recipients break on transfer?
In traditional tools, recipients default to the ticket group. In OpsDesk, recipient lists are stored on the side conversation entity itself (`side_recipients`), completely independent of the ticket's assigned agent or group. Transferring the ticket updates `assigned_agent_id` on the ticket without modifying side recipients.

#### 14. What is a "recipient snapshot" on sent side messages?
Every time a message is sent in a side conversation, a JSON snapshot of all TO and CC recipients at that exact millisecond is permanently serialized onto `side_messages.recipients_snapshot`. This provides an immutable audit trail of who received each transmission.

#### 15. How does the system handle untrusted external recipient domains?
OpsDesk checks each recipient against known partner domains (`.example`, `tbo.com`, `supplier.example`). Any unrecognized domain receives a yellow warning pill: *"⚠ Unknown Domain"*, preventing inadvertent data leaks to wrong email addresses.

---

### Category 4: Data Scale, Archival & Export
#### 16. Why does Zendesk cap exports at 3K rows and how does OpsDesk beat it?
Traditional SaaS platforms cap web exports to prevent unindexed queries from locking multi-tenant memory. OpsDesk implements a cursor-based streaming CSV export using `stmt.iterate()` in SQLite WAL mode. Rows stream directly to the HTTP socket with minimal memory overhead.

#### 17. What row count and streaming throughput did you actually measure?
In our empirical benchmark (`tests/streaming_export.test.js`), OpsDesk committed **5,000 synthetic tickets in 116 ms** (43,478 rows/sec) and streamed **5,012 CSV rows in 18 ms** (294,824 rows/sec) with 100% of formula injection payloads sanitized.

#### 18. What is CSV formula injection and how does OpsDesk protect against it?
If an attacker submits ticket text starting with `=`, `+`, `-`, or `@`, opening the exported CSV in Excel or LibreOffice can execute arbitrary local OS commands via DDE macros. OpsDesk prepends a single quote (`'`) to any cell starting with these characters.

#### 19. What is your retention and archival stance?
Tickets in `Closed` status older than the retention threshold (configurable in DB, default 90 days) are marked `is_archived = 1`. They do not clutter active queues, but remain fully queryable, auditable, and included in large-scale CSV extracts.

---

### Category 5: Security, Auth & Privacy
#### 20. How do you prevent Insecure Direct Object References (IDOR)?
In `server/api/tickets.js`, every ticket query by a Requester automatically injects `AND t.agency_id = ?` using the user's validated session agency ID. Requesting another agency's ticket returns `404 Not Found` (not 403, preventing resource enumeration).

#### 21. How are passwords stored?
Using Node.js native `crypto.scrypt` with a per-user 16-byte random salt and parameters $N=16384, r=8, p=1$. Password verification uses `crypto.timingSafeEqual` to prevent timing attacks.

#### 22. What CSRF defenses are implemented?
Triple-layer defense: 1) Session cookie `SameSite=Strict`, 2) Required custom HTTP header `X-OpsDesk-Request: 1` on all state-changing requests, and 3) Origin vs Host header validation.

#### 23. What Content Security Policy is enforced?
A strict CSP without `unsafe-inline` or `unsafe-eval`:
`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`

#### 24. How does sensitive data masking work?
Before storing descriptions or messages, OpsDesk runs a Luhn check on all 13-19 digit number sequences and masks valid cards to `XXXX-XXXX-XXXX-1234`. It also redacts regex credential patterns (`OTP: [REDACTED]`, `password: [REDACTED]`).

#### 25. How does OpsDesk approach India's DPDP Act, 2023?
OpsDesk applies data minimization, purpose limitation (processing data strictly to resolve the travel booking inquiry), configurable retention limits, and full audit logging. Formal statutory obligations must be verified from official gazette sources prior to enterprise deployment.

---

### Category 6: Front-End & Design Standards
#### 26. Why did you choose Vanilla JS ES Modules instead of React or Vue?
Zero npm runtime dependencies, zero build step, instant local startup on any machine, zero vulnerability supply-chain risk, and 100% offline functionality.

#### 27. Did you copy the TBO logo or branding?
No. Rule R6 strictly forbids copying real brands. The product wordmark is simply "OpsDesk", styled with clean typography.

#### 28. What typography is bundled and how is it licensed?
Self-hosted IBM Plex Sans (Regular and SemiBold) and IBM Plex Mono (WOFF2), licensed under the SIL Open Font License (OFL).

#### 29. What were the results of your WCAG AA contrast check?
`tools/contrast_check.js` tested 16 color pairs across light and dark themes. 100% passed the 4.5:1 requirement, with primary text achieving 17.85:1 (light) and 16.98:1 (dark).

---

### Category 7: Packaging & Windows Run Experience
#### 30. How does a beginner student start OpsDesk on Windows?
Unzip the folder, double-click `1 START OpsDesk.bat`. The script detects the bundled portable `runtime\node.exe`, starts the server in a minimized background console, waits for `/health`, and opens the default browser. To stop, double-click `2 STOP OpsDesk.bat`.

#### 31. Does OpsDesk require admin privileges or PowerShell?
No. The batch scripts use pure ASCII CMD syntax (`@echo off`, `setlocal`, `start`, `taskkill`) and run entirely in user space without admin elevation.

#### 32. What if port 4173 is already in use?
The server automatically detects `EADDRINUSE`, tries the next sequential port (4174, 4175...), and writes the active port to `data/port.txt`. The launcher reads this file and opens the correct port in the browser.

---

### Category 8: 20–30 Year Maintainability & Extensibility
#### 33. How does this architecture survive for 20 to 30 years?
OpsDesk avoids proprietary framework churn by relying on **open web standards**:
1. **Standard Protocols**: HTTP/1.1, REST JSON, W3C DOM, ES Modules.
2. **Data Portability**: SQLite file format is an official Library of Congress archival format guaranteed for decades.
3. **Configuration as Governance**: SLA hours, routing weights, and retention policies live in database configuration tables rather than hardcoded code.
4. **Tenant ID Everywhere**: Every business table includes `tenant_id`, enabling migration to multi-tenant cloud without schema redesign.

#### 34. How would you scale OpsDesk beyond SQLite in production?
Replace `node:sqlite` with PostgreSQL connection pooling (`pg`), offload background notifications to Redis/RabbitMQ workers, connect OpenSearch for full-text search, and plug in enterprise OIDC / SAML SSO.

#### 35. What is the total cost of ownership (TCO) view?
Unlike SaaS platforms that charge \$99-\$199 per agent/month plus per-API query step-ups:
$$\text{Cost}_{\text{OpsDesk}} = \text{Hosting Infrastructure} + \text{Internal Developer Maintenance}$$
With zero per-ticket fees, zero third-party linking app fees, and zero external vendor lock-in.
