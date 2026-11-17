-- Phase 0: soft-hide for moderation (never hard-delete) + MFA recovery codes
-- Backward-compatible: DEFAULT 0 / NULL so existing rows remain visible.

PRAGMA foreign_keys=OFF;

ALTER TABLE posts ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN hidden_at TEXT;
ALTER TABLE posts ADD COLUMN hidden_reason TEXT;

ALTER TABLE products ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN hidden_at TEXT;
ALTER TABLE products ADD COLUMN hidden_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_posts_is_hidden ON posts(is_hidden);
CREATE INDEX IF NOT EXISTS idx_products_is_hidden ON products(is_hidden);

CREATE TABLE IF NOT EXISTS admin_mfa_recovery_codes (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_mfa_recovery_admin ON admin_mfa_recovery_codes(admin_id);

PRAGMA foreign_keys=ON;
