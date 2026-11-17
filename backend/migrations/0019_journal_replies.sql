-- Sentence-level replies on public journal entries (circle conversation)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS journal_entry_replies (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  quote_text TEXT NOT NULL,
  body TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public', 'private')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_journal_replies_entry ON journal_entry_replies(entry_id, created_at);
CREATE INDEX IF NOT EXISTS idx_journal_replies_user ON journal_entry_replies(user_id);
