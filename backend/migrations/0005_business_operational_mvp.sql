-- Business Operational MVP: KPI-safe order attribution + partnerships + settings

PRAGMA foreign_keys=OFF;

ALTER TABLE orders ADD COLUMN business_id TEXT REFERENCES users(id);
ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'paid';
ALTER TABLE orders ADD COLUMN completed_at TEXT;
ALTER TABLE orders ADD COLUMN refund_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN source TEXT NOT NULL DEFAULT 'organic';

CREATE TABLE IF NOT EXISTS partnership_requests (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  instructor_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'declined')),
  partnership_type TEXT NOT NULL CHECK(partnership_type IN ('commission', 'fixed', 'hybrid')),
  commission_rate REAL,
  fixed_fee REAL,
  message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(business_id, instructor_id),
  FOREIGN KEY (business_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS partnerships (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  instructor_id TEXT NOT NULL,
  partnership_type TEXT NOT NULL CHECK(partnership_type IN ('commission', 'fixed', 'hybrid')),
  commission_rate REAL,
  fixed_fee REAL,
  status TEXT NOT NULL CHECK(status IN ('active', 'paused', 'ended')) DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(business_id, instructor_id),
  FOREIGN KEY (business_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS business_settings (
  business_id TEXT PRIMARY KEY,
  business_name TEXT,
  logo_url TEXT,
  analytics_prefs TEXT NOT NULL DEFAULT '{}',
  notifications_prefs TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (business_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_orders_business_id ON orders(business_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at_status ON orders(created_at, status);
CREATE INDEX IF NOT EXISTS idx_partnership_requests_business_status ON partnership_requests(business_id, status);
CREATE INDEX IF NOT EXISTS idx_partnerships_business_status ON partnerships(business_id, status);

PRAGMA foreign_keys=ON;
