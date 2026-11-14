-- Wave 1: idempotent creates, DM privacy, life mode, refresh-token rotation grace.
-- SQLite has no ADD COLUMN IF NOT EXISTS; D1 tracks applied migrations so each
-- ALTER runs once. Tables and indexes use IF NOT EXISTS.

-- 1) Idempotency-Key replay store (utils/idempotency.ts). status 0 = in flight.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 0,
  body TEXT,
  created_at TEXT NOT NULL,          -- ISO-8601 UTC (JS toISOString)
  UNIQUE (user_id, key)
);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created ON idempotency_keys(created_at);

-- 2) Who may start / send DMs to this user: 'everyone' | 'friends' | 'nobody'.
ALTER TABLE users ADD COLUMN dm_policy TEXT NOT NULL DEFAULT 'everyone';

-- 3) Life mode ('none' | 'sick' | 'travel' | 'break'): protects the streak while active.
--    life_mode_since = local day the current mode started; life_mode_until = last
--    protected local day (NULL = open-ended).
ALTER TABLE users ADD COLUMN life_mode TEXT NOT NULL DEFAULT 'none';
ALTER TABLE users ADD COLUMN life_mode_until TEXT;
ALTER TABLE users ADD COLUMN life_mode_since TEXT;

-- 4) Refresh-token rotation grace (utils/sessions.ts): a rotated token presented
--    again within 60 s gets the same replacement pair. grace_payload is AES-GCM
--    encrypted with a key derived from the old raw token (never stored in clear).
ALTER TABLE auth_refresh_sessions ADD COLUMN rotated_at TEXT;
ALTER TABLE auth_refresh_sessions ADD COLUMN replaced_by TEXT;
ALTER TABLE auth_refresh_sessions ADD COLUMN grace_payload TEXT;
