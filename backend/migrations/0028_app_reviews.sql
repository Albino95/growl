-- In-app beta reviews (pre-store). One review per person; founder can reply.
CREATE TABLE IF NOT EXISTS app_reviews (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  stars INTEGER NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  reply_body TEXT,
  reply_by TEXT,
  replied_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_app_reviews_created
  ON app_reviews(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_reviews_unreplied
  ON app_reviews(status, replied_at, created_at DESC);
