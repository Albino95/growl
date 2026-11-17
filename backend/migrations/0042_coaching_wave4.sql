-- Wave 4 coaching: client consent to share Today check-ins with the coach (default OFF),
-- coach feedback on finished homework, and private session notes (coach only).
-- Additive only: old app builds ignore the new columns/table.

ALTER TABLE coaching_contracts ADD COLUMN share_checkins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE coaching_contracts ADD COLUMN share_checkins_at TEXT;

ALTER TABLE coaching_assignments ADD COLUMN coach_feedback TEXT;
ALTER TABLE coaching_assignments ADD COLUMN coach_feedback_at TEXT;

CREATE TABLE IF NOT EXISTS coaching_session_notes (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL,
  instructor_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (contract_id) REFERENCES coaching_contracts(id) ON DELETE CASCADE,
  FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_coaching_session_notes_contract
  ON coaching_session_notes(contract_id, created_at DESC);
