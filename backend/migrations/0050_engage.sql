-- Wave 6 engagement: product Q&A, verified-purchase reviews with one business reply,
-- saved replies + away message for business inboxes. Additive only.

CREATE TABLE IF NOT EXISTS product_questions (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  business_id TEXT NOT NULL,
  asker_id TEXT NOT NULL,
  body TEXT NOT NULL,
  hidden_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (business_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (asker_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_product_questions_product ON product_questions(product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_product_questions_business ON product_questions(business_id, created_at);

-- One answer per question (editable).
CREATE TABLE IF NOT EXISTS product_answers (
  question_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  body TEXT NOT NULL,
  answered_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (question_id) REFERENCES product_questions(id) ON DELETE CASCADE,
  FOREIGN KEY (business_id) REFERENCES users(id) ON DELETE CASCADE
);

-- One review per author per product; order_id is the delivered order that unlocked it.
CREATE TABLE IF NOT EXISTS product_reviews (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  business_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT NOT NULL DEFAULT '',
  order_id TEXT,
  hidden_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (business_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (product_id, author_id)
);
CREATE INDEX IF NOT EXISTS idx_product_reviews_product ON product_reviews(product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_product_reviews_business ON product_reviews(business_id, created_at);

-- One business reply per review (editable).
CREATE TABLE IF NOT EXISTS review_replies (
  review_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  body TEXT NOT NULL,
  replied_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (review_id) REFERENCES product_reviews(id) ON DELETE CASCADE,
  FOREIGN KEY (business_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS business_inbox_settings (
  business_id TEXT PRIMARY KEY,
  saved_replies TEXT NOT NULL DEFAULT '[]',
  away_enabled INTEGER NOT NULL DEFAULT 0,
  away_message TEXT NOT NULL DEFAULT '',
  away_schedule TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (business_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Last automatic away reply per conversation (at most one per 12 h).
CREATE TABLE IF NOT EXISTS business_away_log (
  conversation_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  last_sent_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Flags on a message, e.g. {"auto":true} for an away auto-reply.
ALTER TABLE messages ADD COLUMN metadata TEXT;
