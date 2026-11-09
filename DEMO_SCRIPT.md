# OpsDesk - Hackathon Demo Script (4–5 Minutes)

This script walks hackathon judges step-by-step through Journeys A to E. An in-app **"Demo Guide (Journeys A-E)"** button is permanently anchored at the bottom right of the screen for 1-click navigation.

---

## 30-Second Elevator Pitch (Fallback Version)

> "Traditional ticketing platforms treat every interaction as an isolated ticket. For TBO's B2B travel operations, that means three follow-ups on the same refund create three disconnected tickets, routing ignores shifts and regions, and supplier side conversations break upon transfer.
> 
> **OpsDesk replaces isolated tickets with travel-aware cases.** Cases are linked by booking reference (TBOH), routed by operational reality (region, shift, skills, workload), escalated with mandatory governance to Escalation Managers, and exportable beyond artificial 3K row caps. Here are the 5 live journeys."

---

## Complete 4–5 Minute Hackathon Walkthrough

### 0:00 – 0:45 | Introduction & Problem Framing
- **Screen**: `#login`
- **What to say**:
  - "Hello judges. Today we are presenting OpsDesk, built specifically for TBO's B2B operations."
  - "The core problem isn't whether tickets can be managed—it's whether traditional ticketing platforms can handle TBO's travel complexity efficiently and economically."
  - "Notice our 1-click Demo Persona Selector. We will start by signing in as **Aarav Sharma**, a Senior Operations Agent in India."
- **Action**: Click `Aarav Sharma (Ops Agent - India)` card or use the Demo Guide.

---

### 0:45 – 1:45 | Journey A: Context & First-Class Linkage (Problem 1)
- **Screen**: `#ticket/TBO-1003`
- **What to say**:
  - "Here is case **TBO-1003**: an urgent refund demand from Al Fanoos Travel on booking **TBOH-88219**."
  - "In a traditional ticketing tool, this is treated as a brand-new stranger interaction. Look at our **'Related Cases'** panel on the right: OpsDesk automatically surfaces **two prior linked cases** sharing this exact TBOH reference (`TBO-1001` and `TBO-1002`)."
  - "Notice the badge: **'3rd contact on this TBOH'**. The agent instantly knows the full history without asking the agency to repeat themselves."
  - "Look at the Intent: our rule-based classifier detected the Hinglish query *'paise wapas kab aayenge'* and categorized it under **Refund** with matched keywords."
- **Proves**: Context-rich cases, first-class TBOH linkage, and intent classification without costly bolt-ons.

---

### 1:45 – 2:30 | Journey B: Multi-Factor Routing & Ownership (Problem 2)
- **Screen**: `#ticket/TBO-1003` (Right column card: *"Why this owner"*)
- **What to say**:
  - "Why was Aarav assigned this ticket instead of arbitrary FIFO/LIFO triggers?"
  - "Look at the **'Why this owner'** card. OpsDesk scored all active agents across 6 operational factors:"
    1. **Region Match**: +40 points (India / Middle East coverage)
    2. **Shift Window**: +20 points (Currently active in IST shift)
    3. **Skill Match**: +15 points (Specialist tag in Refund)
    4. **Seniority Ranking**: +24 points (Rank 3 agent prioritized for high-urgency cases)
    5. **Workload Penalty**: -5 points per open case currently assigned.
  - "Every routing decision is mathematically transparent, auditable, and logged."
- **Proves**: Intelligent routing considering region, time window, skill, rank, workload, and availability.

---

### 2:30 – 3:15 | Journey C: Resilient Side Conversations (Problem 3)
- **Screen**: Open `#ticket/TBO-1004` -> click **"Side Conversations"** tab
- **What to say**:
  - "Case **TBO-1004** was originally owned by Sophie Dubois and transferred to Aarav Sharma."
  - "Notice the **Side Conversation** with *Goa Heritage Luxury Villas*. It has 3 explicit recipients."
  - "In traditional ticketing systems, transferring a ticket breaks or corrupts side conversation recipient lists. In OpsDesk, the recipient list is independent of the ticket group."
  - "Notice the badge on `transfers@goacabs.local.example`: **'⚠ Unknown Domain'**. OpsDesk warns staff when an external recipient is outside the approved partner directory."
  - "Every sent message records a tamper-proof snapshot of recipients at that exact moment."
- **Proves**: Supplier side conversations survive transfers cleanly without delivery errors.

---

### 3:15 – 4:00 | Journey D: Travel-Aware SLA & Escalation (Problem 4)
- **Screen**: Click Demo Guide -> `Journey D` (signs in as **Zoya Akhtar**, Escalation Manager) -> opens `#queues?queue=escalated`
- **What to say**:
  - "Now we are signed in as **Zoya Akhtar**, Escalation Manager."
  - "Notice case **TBO-1007** (Overbooked hotel with guest stranded in lobby). Check-in was 1 hour ago. Because check-in is imminent, our SLA engine automatically boosted the priority to **Urgent** and pulled the resolution deadline forward."
  - "Look at the **'Why this SLA'** card: it spells out the exact travel proximity boost formula."
  - "Notice this is in the first-class **Escalations Queue**. Rather than merely CC-ing people on email, the agent performed a governed escalation with a mandatory reason. Zoya can now resolve it or hand it back with notes."
- **Proves**: Real-world travel urgency drives SLAs; first-class Escalation Manager workflow.

---

### 4:00 – 4:45 | Journey E: Feedback Loop & Scale Beyond 3K Rows (Problems 5 & 6)
- **Screen**: Click Demo Guide -> `Journey E` (signs in as **Vikram Singhania**, Ops Lead) -> opens `#insights` then `#settings`
- **What to say**:
  - "Finally, we sign in as **Vikram Singhania**, Ops Lead."
  - "On the **Recurring Themes** page, operational friction is automatically clustered: *Refund Delay*, *Inventory Sync*, *Payment Failure*. We see week-over-week trends and can link recurring issues directly to our engineering bug tracker."
  - "Now let's look at **Data Access** in Settings: traditional tools cap exports at 3,000 rows. OpsDesk uses a cursor-based streaming CSV pipeline."
  - "Judges, watch this button: **'Generate 5,000 Extra Demo Cases'**. In 130 milliseconds, 5,000 cases are committed to SQLite. When we click **'Download Streaming CSV Extract'**, all rows stream instantly with formula injection protection (S8)."
- **Proves**: Feedback loop into product backlogs, and real-time streaming data access without artificial 3K limits.

---

### 4:45 – 5:00 | Conclusion & Q&A
- **What to say**:
  - "OpsDesk proves that with clean software architecture, zero runtime dependencies, and a travel-shaped data model, TBO can solve its operational complexity efficiently and economically."
  - "Thank you. We are ready for your questions."
