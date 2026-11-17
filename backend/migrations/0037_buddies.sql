-- Wave 3: Path Buddies — a shared streak with a friend (max 5 per user).
-- One row per pair (user_lo < user_hi keeps it unique regardless of who invited).
-- Decline / end deletes the row, so a pair can start again later.
-- since_day: the invitee's local day when the invite was accepted; only days from
-- then on count towards the shared streak. best is the longest shared run seen
-- (kept here because the live computation only looks back 120 days).
CREATE TABLE IF NOT EXISTS path_buddies (
  id TEXT PRIMARY KEY,
  inviter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_lo TEXT NOT NULL,
  user_hi TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
  since_day TEXT,
  best INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  accepted_at TEXT,
  UNIQUE (user_lo, user_hi)
);
CREATE INDEX IF NOT EXISTS idx_path_buddies_inviter ON path_buddies(inviter_id, status);
CREATE INDEX IF NOT EXISTS idx_path_buddies_invitee ON path_buddies(invitee_id, status);
