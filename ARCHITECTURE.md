# OpsDesk - Architecture & Technical Design

OpsDesk is an operations ticketing platform custom-engineered for TBO's B2B travel operations. It replaces disconnected, reactive ticketing with context-rich, travel-aware cases linked by agency and booking reference (TBOH), routed by operational reality, and escalated intentionally.

---

## 1. System Architecture Diagram

```mermaid
flowchart TD
  subgraph Client ["Client Layer (Vanilla ES Modules - Zero Build)"]
    UI["Web UI (Vanilla JS, CSS Tokens, IBM Plex Fonts)"]
    Router["Hash-Based Client Router (#dashboard, #queues, #ticket)"]
    Store["Reactive State Store (User, Counts, Theme, Clock)"]
  end

  subgraph Gateway ["HTTP & Security Gateway (Node.js 22 Built-ins)"]
    HTTPServer["Node:HTTP Server (Port 4173)"]
    SecHeaders["Strict CSP & Security Headers (No unsafe-inline)"]
    RateLimiter["In-Memory Rate Limiter & Brute-Force Delay"]
    CSRF["CSRF Defense (Origin & X-OpsDesk-Request Header)"]
    BodyParser["Safe Stream JSON Parser (1MB Cap)"]
  end

  subgraph Domain ["Domain Engine Layer"]
    Linking["Case Linkage Engine (TBOH Strong / 30d Intent Medium)"]
    Routing["Multi-Factor Routing (Region, Shift, Skill, Rank, Workload)"]
    SLA["Travel-Aware SLA (Check-in & LCD Proximity Boost)"]
    Intent["Rule-based Hinglish Taxonomy Suggester"]
    Escalation["First-Class Escalation Engine (EM Assignment & Handback)"]
    Masking["Sensitive Data Masking (Luhn Card & Credential Redactor)"]
    Clock["Centralized Clock Provider (Simulated Demo Clock)"]
  end

  subgraph Storage ["Durable Persistence Layer"]
    SQLite["SQLite DatabaseSync (WAL Mode, Foreign Keys ON)"]
    Audit["Append-Only Audit Log (Immutable State Tracking)"]
    Config["App Config & Versioned Schema Migrations"]
  end

  UI --> Router
  Router --> HTTPServer
  HTTPServer --> SecHeaders
  SecHeaders --> RateLimiter
  RateLimiter --> CSRF
  CSRF --> BodyParser
  BodyParser --> Domain
  Domain --> SQLite
  Domain --> Audit
  Domain --> Config
```

---

## 2. Data Model & Entity Relationships

```mermaid
erDiagram
  TENANTS ||--o{ AGENCIES : owns
  AGENCIES ||--o{ USERS : employs
  AGENCIES ||--o{ TICKETS : submits
  USERS ||--o{ TICKETS : requests_or_assigns
  TICKETS ||--o{ TICKET_MESSAGES : contains
  TICKETS ||--o{ SIDE_CONVERSATIONS : hosts
  SIDE_CONVERSATIONS ||--o{ SIDE_RECIPIENTS : maintains
  SIDE_CONVERSATIONS ||--o{ SIDE_MESSAGES : logs
  TICKETS ||--o{ TICKET_LINKS : relates
  TICKETS ||--o{ TICKET_THEMES : tagged_with
  TICKETS ||--o{ TIMELINE_EVENTS : records
  USERS ||--o{ SESSIONS : authenticates

  TICKETS {
    string id PK "TBO-1001"
    string tenant_id FK "tbo-default"
    string agency_id FK "agy_del_02"
    string requester_id FK "usr_req_del_1"
    string assigned_agent_id FK "usr_agent_01"
    string escalation_manager_id FK
    string tboh "TBOH-88219"
    string title
    string description
    string category_intent
    string priority "Urgent | High | Normal | Low"
    string status "New | Open | Pending | Escalated | Resolved | Closed"
    string check_in_date
    string lcd_date
    string sla_due_at
    string sla_effective_priority
    string sla_state "On-track | At-risk | Breached | Met | Missed"
    string routing_reason
    string escalation_reason
    int is_archived
  }

  SIDE_CONVERSATIONS {
    string id PK "sdc_55011"
    string ticket_id FK
    string subject
    string supplier_name
    string status "active | closed"
  }

  SIDE_RECIPIENTS {
    string id PK
    string side_conversation_id FK
    string email
    string name
    string recipient_type "to | cc"
    int is_known_domain
  }
```

---

## 3. Case Lifecycle State Machine

OpsDesk enforces strict allowed transitions on the server. Invalid transitions return an HTTP 400 with allowed next states.

```mermaid
stateDiagram-v2
  [*] --> New : Created by Agency or Agent
  New --> Open : Assigned or Picked Up
  New --> Escalated : Direct Escalation
  Open --> Pending : Waiting for Agency / Supplier
  Pending --> Open : New Message Received
  Open --> Escalated : Escalate with Reason
  Escalated --> Open : Hand Back by Manager
  Open --> Resolved : Resolution Delivered
  Escalated --> Resolved : Resolved by EM
  Resolved --> Closed : Closure after Audit
  Closed --> Open : Reopen by Staff
```

---

## 4. Multi-Factor Routing Formula

Eligibility is gated strictly on `is_available = 1`. Qualifying agents are scored by:

$$\text{Score} = \text{RegionMatch}(+40) + \text{ShiftWindow}(+20) + \text{SkillMatch}(+15) + \text{RankScore} - (5 \times \text{OpenTickets})$$

Where:
- $\text{RankScore}_{\text{Urgent/High}} = 8 \times \text{Rank}$ (Favoring senior agents for crises)
- $\text{RankScore}_{\text{Normal/Low}} = 4 \times (4 - \text{Rank})$ (Distributing routine cases to junior agents)

If all available agents score $\le 0$ or no agent is on shift, the case automatically defaults to **Triage (Unassigned)** with an auditable explanation.

---

## 5. Travel-Aware SLA Engine

Unlike static ticketing clocks, OpsDesk boosts resolution urgency based on real-world travel proximity:
- If $\min(\text{Check-in}, \text{LCD}) \le \text{Now} + 12\text{ hours}$: Priority boosted to **Urgent** ($2\text{h}$ base window).
- If $\min(\text{Check-in}, \text{LCD}) \le \text{Now} + 48\text{ hours}$: Priority boosted to at least **High** ($8\text{h}$ base window).
- Dynamic deadline:

$$\text{Due Date} = \max(\text{Created} + 30\text{ min}, \min(\text{Created} + \text{BaseHours}, \text{TravelEvent} - 2\text{ hours}))$$

- **At-risk**: Triggers when remaining time $\le 30\%$ of total window OR $\le 1\text{ hour}$.
- **Breached**: Triggers when $\text{Now} \ge \text{Due Date}$.
