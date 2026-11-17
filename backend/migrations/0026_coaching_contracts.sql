-- 1:1 coaching: instructor offer card, reach-out, written proposal → contract, homework on Garden seeds.
-- Money is recorded as weekly EUR terms only. Stripe Connect charges land in a later ship.

CREATE TABLE IF NOT EXISTS instructor_offerings (
  instructor_id TEXT PRIMARY KEY,
  weekly_fee_eur REAL NOT NULL DEFAULT 10,
  sessions_per_week INTEGER NOT NULL DEFAULT 3,
  typical_weeks INTEGER NOT NULL DEFAULT 2,
  trial_days INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  accepting INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS coaching_inquiries (
  id TEXT PRIMARY KEY,
  instructor_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  conversation_id TEXT,
  status TEXT NOT NULL DEFAULT 'talking',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (instructor_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_coaching_inquiries_instructor
  ON coaching_inquiries(instructor_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_coaching_inquiries_client
  ON coaching_inquiries(client_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_coaching_inquiries_conversation
  ON coaching_inquiries(conversation_id);

CREATE TABLE IF NOT EXISTS coaching_proposals (
  id TEXT PRIMARY KEY,
  inquiry_id TEXT NOT NULL,
  instructor_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  conversation_id TEXT,
  weeks INTEGER NOT NULL,
  sessions_per_week INTEGER NOT NULL,
  weekly_fee_eur REAL NOT NULL,
  total_eur REAL NOT NULL,
  trial_days INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  draw TEXT NOT NULL DEFAULT 'weekly',
  note TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  responded_at TEXT,
  FOREIGN KEY (inquiry_id) REFERENCES coaching_inquiries(id) ON DELETE CASCADE,
  FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_coaching_proposals_pair
  ON coaching_proposals(instructor_id, client_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coaching_proposals_client
  ON coaching_proposals(client_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS coaching_contracts (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  inquiry_id TEXT NOT NULL,
  instructor_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  weeks INTEGER NOT NULL,
  sessions_per_week INTEGER NOT NULL,
  weekly_fee_eur REAL NOT NULL,
  total_eur REAL NOT NULL,
  trial_days INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  draw TEXT NOT NULL DEFAULT 'weekly',
  status TEXT NOT NULL DEFAULT 'active',
  started_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (proposal_id) REFERENCES coaching_proposals(id),
  FOREIGN KEY (inquiry_id) REFERENCES coaching_inquiries(id),
  FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_coaching_contracts_instructor
  ON coaching_contracts(instructor_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_coaching_contracts_client
  ON coaching_contracts(client_id, status, started_at DESC);

CREATE TABLE IF NOT EXISTS coaching_assignments (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL,
  seed_id TEXT NOT NULL,
  title TEXT,
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'assigned',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (contract_id) REFERENCES coaching_contracts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_coaching_assignments_contract
  ON coaching_assignments(contract_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coaching_assignments_seed
  ON coaching_assignments(seed_id);
