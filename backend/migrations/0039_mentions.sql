-- Wave 3: @mentions and #tags on posts and comments (utils/mentions.ts).
-- Rows are written when a post / comment is created; deleting the post or
-- comment cascades. post_tags is also read by Explore search (#tag queries).

CREATE TABLE IF NOT EXISTS post_mentions (
  post_id TEXT NOT NULL,
  mentioned_user_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (post_id, mentioned_user_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_post_mentions_user
  ON post_mentions(mentioned_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS comment_mentions (
  comment_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  mentioned_user_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (comment_id, mentioned_user_id),
  FOREIGN KEY (comment_id) REFERENCES post_engagement(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_comment_mentions_user
  ON comment_mentions(mentioned_user_id, created_at DESC);

-- Hashtags on posts, stored lowercased without the '#'.
CREATE TABLE IF NOT EXISTS post_tags (
  post_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (post_id, tag),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_post_tags_tag ON post_tags(tag, created_at DESC);

-- Case-insensitive username lookup (mention resolution + @suggest prefix search).
CREATE INDEX IF NOT EXISTS idx_users_username_lower
  ON users(lower(json_extract(metadata, '$.username')));
