-- Early-access waitlist from letsgrow.lu (e.g. Android users waiting for the app).
-- One row per (email, platform); re-submits are ignored (INSERT OR IGNORE).
CREATE TABLE IF NOT EXISTS waitlist_signups (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (email, platform)
);

CREATE INDEX IF NOT EXISTS idx_waitlist_signups_platform_created
  ON waitlist_signups (platform, created_at);
