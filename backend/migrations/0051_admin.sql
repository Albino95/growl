-- Wave 6 admin hardening (additive only).

-- System actor for audit rows that have no signed-in admin: failed logins for
-- unknown emails and scheduled GDPR purges. It can never sign in: status is
-- 'suspended' and the password hash is not a valid hash.
INSERT OR IGNORE INTO admin_users (id, email, password_hash, role, status, mfa_enabled, created_at, updated_at)
VALUES ('admin_system', 'system@admin.invalid', '!', 'analyst_readonly', 'suspended', 0, datetime('now'), datetime('now'));

-- When the account was scheduled for deletion; the hourly purge hard-deletes after a grace period.
ALTER TABLE user_account_states ADD COLUMN deletion_requested_at TEXT;

-- Refund ledger: one row per refund, idempotent per (order, key).
CREATE TABLE IF NOT EXISTS admin_order_refunds (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  admin_id TEXT NOT NULL,
  amount REAL NOT NULL,
  reason_text TEXT,
  idempotency_key TEXT NOT NULL,
  result TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  UNIQUE(order_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_admin_order_refunds_order ON admin_order_refunds(order_id, created_at);

CREATE INDEX IF NOT EXISTS idx_user_account_states_deletion ON user_account_states(status, deletion_requested_at);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_user ON privacy_requests(user_id, request_type, status);
