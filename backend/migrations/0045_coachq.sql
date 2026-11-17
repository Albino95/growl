-- Wave 5 coach supervision (routes/wave3/coachq.ts): attention queue marks (handled /
-- override), saved reply templates, coach digest setting, Monday summary sent markers and
-- the homework proof request. Additive only: old app builds ignore the new column/tables.

-- Coach asks for a proof type when assigning homework (NULL = no proof requested).
ALTER TABLE coaching_assignments ADD COLUMN proof_kind TEXT;

CREATE INDEX IF NOT EXISTS idx_coaching_assignments_contract_status
  ON coaching_assignments(contract_id, status);

-- One row per contract: "Handled" snooze and a manual status override (both expire).
CREATE TABLE IF NOT EXISTS coach_queue_marks (
  contract_id TEXT PRIMARY KEY,
  instructor_id TEXT NOT NULL,
  handled_until TEXT,            -- ISO; reasons present when handled are snoozed until then
  handled_codes TEXT,            -- JSON array of reason codes snoozed
  override_status TEXT,          -- 'red' | 'amber' | 'green'
  override_reason TEXT,
  override_until TEXT,           -- ISO; 7 days after it was set
  updated_at TEXT NOT NULL,
  FOREIGN KEY (contract_id) REFERENCES coaching_contracts(id) ON DELETE CASCADE,
  FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_coach_queue_marks_instructor ON coach_queue_marks(instructor_id);

-- Saved quick replies (JSON array of strings, max 20) and coach preferences.
CREATE TABLE IF NOT EXISTS coach_settings (
  instructor_id TEXT PRIMARY KEY,
  templates TEXT,                -- JSON array; NULL = defaults
  email_digest INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Monday summary idempotency: one row per user, ISO week and kind ('coach' | 'client').
CREATE TABLE IF NOT EXISTS coach_weekly_sent (
  user_id TEXT NOT NULL,
  week TEXT NOT NULL,
  kind TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (user_id, week, kind)
) WITHOUT ROWID;
