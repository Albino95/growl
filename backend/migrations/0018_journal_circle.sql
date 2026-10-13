-- Circle journal reactions ("Felt this") + index for public circle feed
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS journal_reactions (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'felt' CHECK(type IN ('felt')),
  created_at TEXT NOT NULL,
  UNIQUE(entry_id, user_id, type),
  FOREIGN KEY (entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_journal_reactions_entry ON journal_reactions(entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_reactions_user ON journal_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_public_created
  ON journal_entries(is_public, created_at DESC);
