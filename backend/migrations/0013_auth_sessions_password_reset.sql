-- Refresh token sessions + password reset columns

CREATE TABLE IF NOT EXISTS auth_refresh_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_sessions_user ON auth_refresh_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_sessions_hash ON auth_refresh_sessions(token_hash);

ALTER TABLE users ADD COLUMN password_reset_token_hash TEXT;
ALTER TABLE users ADD COLUMN password_reset_expires_at TEXT;
