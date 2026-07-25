-- Promo codes for business sellers
CREATE TABLE IF NOT EXISTS promo_codes (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  code TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('percent', 'fixed')),
  value REAL NOT NULL,
  max_uses INTEGER,
  uses INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  starts_at TEXT,
  ends_at TEXT,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(business_id, code),
  FOREIGN KEY (business_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_business_active
  ON promo_codes(business_id, active);
