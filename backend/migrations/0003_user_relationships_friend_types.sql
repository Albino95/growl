-- Extend user_relationships.type with friendship flows (SQLite rebuild)

PRAGMA foreign_keys=OFF;

CREATE TABLE user_relationships_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('follow', 'block', 'mute', 'friend', 'friend_request')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, target_user_id, type)
);

INSERT INTO user_relationships_new SELECT * FROM user_relationships;

DROP TABLE user_relationships;

ALTER TABLE user_relationships_new RENAME TO user_relationships;

CREATE INDEX IF NOT EXISTS idx_user_relationships_user_id ON user_relationships(user_id);
CREATE INDEX IF NOT EXISTS idx_user_relationships_target_user_id ON user_relationships(target_user_id);
CREATE INDEX IF NOT EXISTS idx_user_relationships_type ON user_relationships(type);

PRAGMA foreign_keys=ON;
