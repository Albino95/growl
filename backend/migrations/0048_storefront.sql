-- Wave 6 — Business storefront page + verification requests.
-- One storefront row per business (cover, tagline, about, links, featured products,
-- pinned post, pickup/hours, policies). JSON columns are validated by the API.
-- Verification: a business asks to be verified; an admin approves or rejects.
-- When an admin-provisioned business_profiles row exists, its verification_status
-- stays the source of truth (the review endpoint updates both).
-- Additive only: old app builds never touch these tables.

CREATE TABLE IF NOT EXISTS business_storefronts (
  business_id TEXT PRIMARY KEY,
  cover_url TEXT,
  tagline TEXT,
  about TEXT,
  links TEXT NOT NULL DEFAULT '[]',                 -- [{label,url}] ≤4, https only
  path_tags TEXT NOT NULL DEFAULT '[]',             -- ≤3 growth-path keys
  featured_product_ids TEXT NOT NULL DEFAULT '[]',  -- ≤6 own active products
  pinned_post_id TEXT,
  location_label TEXT,
  pickup_note TEXT,
  hours TEXT NOT NULL DEFAULT '[]',                 -- [{day 0-6, open 'HH:MM', close 'HH:MM'}]
  policies TEXT NOT NULL DEFAULT '{}',              -- {shipping, returns, pickup}
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS business_verification_requests (
  business_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',           -- pending | verified | rejected
  website TEXT,
  registration_number TEXT,
  note TEXT,
  reason TEXT,                                      -- admin's reason (shown to the business)
  reviewed_by_admin_id TEXT,
  reviewed_at TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_business_verification_status
  ON business_verification_requests(status, submitted_at);
