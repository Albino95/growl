-- Social read paths: newest-page message fetch, comment keyset paging, story trays.
-- Additive only (IF NOT EXISTS), safe to re-run.

-- getMessages: WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?
-- and the inbox "last message" correlated subqueries.
CREATE INDEX IF NOT EXISTS idx_messages_conv_created
  ON messages(conversation_id, created_at);

-- getComments: WHERE post_id = ? AND type = 'comment' ORDER BY created_at DESC
-- (also serves like counts by post/type).
CREATE INDEX IF NOT EXISTS idx_post_engagement_post_type_created
  ON post_engagement(post_id, type, created_at);

-- getUserStories: WHERE user_id = ? AND created_at > ...
CREATE INDEX IF NOT EXISTS idx_stories_user_created
  ON stories(user_id, created_at);
