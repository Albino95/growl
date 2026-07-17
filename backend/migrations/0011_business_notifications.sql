-- Business hub in-app notifications
CREATE TABLE IF NOT EXISTS business_notifications (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  ref_type TEXT,
  ref_id TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_business_notifications_business_created
  ON business_notifications(business_id, created_at);
