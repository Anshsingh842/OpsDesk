// server/db/schema.js
// Database schema definitions for OpsDesk with multi-tenant readiness (tenant_id) and WAL mode.

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agencies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  country TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  agency_id TEXT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('requester', 'agent', 'escalation_manager', 'lead')),
  password_hash TEXT NOT NULL,
  region TEXT,
  shift_start TEXT,
  shift_end TEXT,
  skills TEXT,
  rank INTEGER DEFAULT 1 CHECK(rank BETWEEN 1 AND 3),
  is_available INTEGER DEFAULT 1 CHECK(is_available IN (0, 1)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id)
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  agency_id TEXT NOT NULL,
  requester_id TEXT NOT NULL,
  assigned_agent_id TEXT,
  escalation_manager_id TEXT,
  previous_agent_id TEXT,
  tboh TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category_intent TEXT NOT NULL,
  priority TEXT NOT NULL CHECK(priority IN ('Urgent', 'High', 'Normal', 'Low')),
  status TEXT NOT NULL CHECK(status IN ('New', 'Open', 'Pending', 'Escalated', 'Resolved', 'Closed')),
  check_in_date TEXT,
  lcd_date TEXT,
  sla_due_at TEXT NOT NULL,
  sla_effective_priority TEXT NOT NULL,
  sla_state TEXT NOT NULL CHECK(sla_state IN ('On-track', 'At-risk', 'Breached', 'Met', 'Missed')),
  routing_reason TEXT,
  routing_score_breakdown TEXT,
  escalation_reason TEXT,
  escalated_at TEXT,
  escalated_by TEXT,
  product_bug_link TEXT,
  is_archived INTEGER DEFAULT 0 CHECK(is_archived IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT,
  closed_at TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id),
  FOREIGN KEY (requester_id) REFERENCES users(id),
  FOREIGN KEY (assigned_agent_id) REFERENCES users(id),
  FOREIGN KEY (escalation_manager_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_tickets_agency ON tickets(tenant_id, agency_id);
CREATE INDEX IF NOT EXISTS idx_tickets_tboh ON tickets(tenant_id, tboh);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_agent ON tickets(tenant_id, assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_tickets_em ON tickets(tenant_id, escalation_manager_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_is_archived ON tickets(is_archived);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  sender_user_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL,
  message_type TEXT NOT NULL CHECK(message_type IN ('public_reply', 'internal_note')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_ticket ON ticket_messages(ticket_id);

CREATE TABLE IF NOT EXISTS side_conversations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  side_type TEXT NOT NULL,
  supplier_name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'closed')),
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS side_recipients (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  side_conversation_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  recipient_type TEXT NOT NULL CHECK(recipient_type IN ('to', 'cc')),
  is_known_domain INTEGER DEFAULT 1,
  added_at TEXT NOT NULL,
  FOREIGN KEY (side_conversation_id) REFERENCES side_conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS side_messages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  side_conversation_id TEXT NOT NULL,
  sender_user_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  body TEXT NOT NULL,
  recipients_snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (side_conversation_id) REFERENCES side_conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ticket_links (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  ticket_id_1 TEXT NOT NULL,
  ticket_id_2 TEXT NOT NULL,
  link_type TEXT NOT NULL CHECK(link_type IN ('strong_tboh', 'medium_intent_agency', 'manual')),
  link_reason TEXT NOT NULL,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id_1) REFERENCES tickets(id),
  FOREIGN KEY (ticket_id_2) REFERENCES tickets(id)
);

CREATE INDEX IF NOT EXISTS idx_links_t1 ON ticket_links(ticket_id_1);
CREATE INDEX IF NOT EXISTS idx_links_t2 ON ticket_links(ticket_id_2);

CREATE TABLE IF NOT EXISTS ticket_themes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  theme_name TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('auto', 'manual')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_themes_ticket ON ticket_themes(ticket_id);
CREATE INDEX IF NOT EXISTS idx_themes_name ON ticket_themes(theme_name);

CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT,
  actor_name TEXT NOT NULL,
  summary TEXT NOT NULL,
  details_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_timeline_ticket ON timeline_events(ticket_id);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_active_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  absolute_expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_hash ON sessions(token_hash);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  username TEXT NOT NULL,
  success INTEGER NOT NULL,
  attempted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(ip, attempted_at);
CREATE INDEX IF NOT EXISTS idx_login_user ON login_attempts(username, attempted_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  actor_user_id TEXT,
  actor_name TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  previous_val TEXT,
  new_val TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
`;

module.exports = {
  SCHEMA_V1
};
