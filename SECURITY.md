# OpsDesk - Security Controls & Privacy Architecture

This document details the security posture, controls implemented, threat model, and privacy safeguards of OpsDesk in accordance with Sections 6 and 10 of the design specifications.

---

## 1. Security Controls Implemented (S1 – S15)

| Control | Implementation Details | Verification Status |
| :--- | :--- | :--- |
| **S1: Object-Level Authorization (IDOR)** | Server-side role and tenancy verification on every route. Requesters are strictly confined to their own `agency_id`. An attempt by Agency A to query Agency B's ticket returns `404 Not Found` (preventing ID enumeration). | Verified in `tests/security_and_api.test.js` |
| **S2: Cryptographic Password Hashing** | Passwords hashed using Node.js native `crypto.scrypt` with per-user 16-byte random salt and parameters `N=16384, r=8, p=1`. Stored as `scrypt$N=16384,r=8,p=1$<salt>$<hash>`. Constant-time comparison using `crypto.timingSafeEqual`. | Verified in `tests/security_and_api.test.js` |
| **S3: Robust Session Management** | 256-bit cryptographically secure random session tokens (`crypto.randomBytes(32)`). Tokens are hashed via SHA-256 before storage in database (leak of database file does not leak active session tokens). Cookie flags: `HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`. Idle timeout: 30 minutes; absolute timeout: 8 hours. Immediate server-side invalidation on logout. | Verified in `tests/security_and_api.test.js` |
| **S4: Multi-Layer CSRF Defense** | Enforced on all state-changing HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`):<br>1. Cookie `SameSite=Strict`<br>2. Mandatory custom security header `X-OpsDesk-Request: 1`<br>3. Origin vs Host validation when Origin header is present. | Verified in `tools/test_server_health.js` |
| **S5: Multi-Tier Rate Limiting** | 1. Sliding window API rate limiter (150 req/min per IP)<br>2. Brute-force login limiter per IP and username (progressive backoff after 5 failures, 15-minute lock after 10)<br>3. Data extract limiter (5 CSV exports per minute per IP). | Verified in `server/auth/rate_limit.js` |
| **S6: Strict Input Validation** | Request body size limit strictly capped at 1 MB. Malformed JSON rejected safely with HTTP 400 and `requestId`. Allowlist validation on all business fields; status, priority, and intent validated against fixed enums. Mass assignment prevented by ignoring or rejecting unauthorized fields. | Verified in unit and API tests |
| **S7: Content Security Policy & Safe Output** | Strict Content Security Policy enforced on all HTTP responses:<br>`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`<br>Zero inline scripts or inline event handlers. DOM rendering uses safe DOM properties or string escaping. Security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`. | Verified in `tools/test_server_health.js` |
| **S8: CSV Formula Injection Protection** | Streaming CSV export inspects every cell before serialization. Any string starting with spreadsheet formula triggers (`=`, `+`, `-`, `@`, tab, carriage return) is prepended with a single quote (`'`), neutralizing executable macros in Excel and LibreOffice. | Verified in `tests/streaming_export.test.js` (5,000/5,000 payloads sanitized) |
| **S9: Sensitive Data Masking** | Pre-storage regex redactor with Luhn algorithm validation. 13-19 digit card numbers passing Luhn are masked to `XXXX-XXXX-XXXX-1234`. Credential patterns (`OTP`, `CVV`, `password`, `PIN`) followed by values are redacted to `[REDACTED]`. State clearly: this catches known structural patterns only and is not a substitute for tokenized PCI DSS payment vaults. | Verified in `tests/domain.test.js` |
| **S10: Privacy by Design** | Strict role-based isolation: Requesters never receive or view internal notes or supplier side conversations. Configurable retention and archival stance (closed tickets archived after $N$ days, not silently dropped). Minimal field collection. | Verified in `tests/security_and_api.test.js` |
| **S11: Zero Hardcoded Secrets** | No API keys, tokens, or hardcoded session secrets in code or repository. Session secret is generated at first run and stored locally with restricted permissions (`0o600`) in `data/session_secret.txt`. Demo credentials are documented synthetic demo accounts. | Codebase audited |
| **S12: Immutable Audit Log** | Append-only audit logger records actor user ID, actor name, action, resource type, resource ID, IP, user agent, and JSON diffs of previous and new state. No update or delete code paths exist for the audit log table. | Verified in `server/db/audit.js` |
| **S13: Local Interface Binding & Control Token** | Local server binds strictly to `127.0.0.1`. The graceful shutdown control channel requires local IP origin and a randomized token stored in `data/shutdown.token`. Endpoint is completely disabled when running in `CLOUD` mode. | Verified in `tools/test_server_health.js` |
| **S14: Fail-Safe Error Handling** | All unexpected errors, malformed payloads, or database exceptions return a normalized JSON payload with a `requestId`. Internal stack traces are never leaked to clients. | Verified across router and endpoints |
| **S15: AI / LLM Safety Architecture** | In V1, intent classification is deterministic and rule-based. For future LLM integrations, the architectural boundary specifies: models receive masked text only, outputs are treated as untrusted suggestions requiring human sign-off, and ticket content is strictly untrusted data, never instructions. | Documented in `ARCHITECTURE.md` |

---

## 2. Threat Model & Mitigations

| Threat | Risk Level | Mitigation in OpsDesk |
| :--- | :--- | :--- |
| **Cross-Agency Ticket Access (IDOR)** | Critical | Database queries for requesters enforce `agency_id = currentUser.agency_id` in SQL WHERE clause. Requesting other agency IDs returns 404. |
| **Cross-Site Scripting (XSS)** | High | Strict CSP forbidding `unsafe-inline` and `unsafe-eval`. Native ES modules with textContent rendering. |
| **Cross-Site Request Forgery (CSRF)** | Medium | `SameSite=Strict` cookies combined with custom `X-OpsDesk-Request: 1` header check and Origin verification. |
| **Credential Harvesting (Brute Force)** | Medium | Scrypt hashing creates high CPU/memory cost; progressive delay and account locking in rate limiter. |
| **Malicious CSV Formula Injection** | Medium | All export cells beginning with `=`, `+`, `-`, or `@` prepended with `'` prior to streaming. |
| **Accidental PII Persistence** | Medium | Luhn card check and OTP/credential regex redaction run prior to database commit. |

---

## 3. Privacy & Data Protection Stance

1. **India's Digital Personal Data Protection Act (DPDP Act, 2023)**:
   OpsDesk handles B2B operations inquiry data. Where passenger or travel agency staff personal data is processed, the system adheres to data minimization, purpose limitation (handling the specific booking inquiry), and retention limits.
   > [!NOTE]
   > The DPDP Act 2023 and its rules govern the processing of digital personal data in India. Specific statutory obligations and compliance mandates must be verified from official government gazette sources prior to commercial deployment.
2. **Archival vs Deletion**:
   Travel operations require historical transaction records for financial reconciliations, airline chargeback disputes, and tax audits. OpsDesk archives closed tickets older than the configurable retention threshold (default 90 days), removing them from active triage queues while keeping them auditable and exportable.
3. **Data Portability**:
   The streaming CSV pipeline allows travel agencies and ops leads to extract complete, un-truncated operational records at any scale without commercial row-cap penalties.

---

## 4. Honest Limitations & Non-Claims

In compliance with Rule R2:
- OpsDesk does not claim to be "100% unhackable" or "production certified".
- **No SSO / MFA in MVP**: The current vertical slice implements session-based authentication with demo accounts. Production deployment requires integration with an enterprise Identity Provider (OIDC / SAML) with Multi-Factor Authentication.
- **No Formal Penetration Test**: While automated security tests verify OWASP Top 10 defenses (IDOR, CSRF, CSP, SQL injection parameterization), formal third-party penetration testing has not been performed.
- **Masking Limitations**: S9 regex masking catches common, structured card numbers and credential patterns; it cannot detect unstructured or disguised PII (e.g. written-out word numbers).
