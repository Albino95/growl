-- Two-way coaching reviews. A pair may review only after ≥4 completed weeks together.
-- client_to_instructor = public testimonial. instructor_to_client = follow-through.

CREATE TABLE IF NOT EXISTS coaching_reviews (
  id TEXT PRIMARY KEY,
  contract_id TEXT,
  instructor_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  stars INTEGER NOT NULL,
  follow_through INTEGER,
  body TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (instructor_id, client_id, direction)
);

CREATE INDEX IF NOT EXISTS idx_coaching_reviews_instructor
  ON coaching_reviews(instructor_id, direction, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coaching_reviews_client
  ON coaching_reviews(client_id, direction, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coaching_reviews_subject
  ON coaching_reviews(subject_id, direction);
