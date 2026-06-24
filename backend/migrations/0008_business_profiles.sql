-- Admin-provisioned business profiles

PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS business_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  field_of_operation TEXT NOT NULL,
  vat_number TEXT,
  country_code TEXT,
  address_line TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(verification_status IN ('pending', 'verified', 'rejected')),
  notes TEXT,
  created_by_admin_id TEXT REFERENCES admin_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_business_profiles_verification ON business_profiles(verification_status);

PRAGMA foreign_keys=ON;
