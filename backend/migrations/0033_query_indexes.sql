-- Query-path indexes for feed, journal circle, relationships, notifications,
-- instructor votes and refresh-session cleanup, plus a uniqueness guarantee for likes.
-- Additive (IF NOT EXISTS) apart from the one-off like dedupe below.
--
-- Not added here (already covered):
--   post_engagement(post_id, type, ...)  -> idx_post_engagement_post_type_created (0032)
--     serves like/comment counts; viewer/friend like lookups use uq_post_engagement_like.

-- Likes must be unique per (post, user). Before creating the unique index, remove
-- duplicate like rows left by the old check-then-insert toggle race, keeping the
-- earliest row (lowest rowid) of each (post_id, user_id) pair. Comments are untouched.
DELETE FROM post_engagement
WHERE type = 'like'
  AND rowid NOT IN (
    SELECT MIN(rowid) FROM post_engagement
    WHERE type = 'like'
    GROUP BY post_id, user_id
  );

-- toggleLike relies on this for INSERT ... ON CONFLICT DO NOTHING race safety.
CREATE UNIQUE INDEX IF NOT EXISTS uq_post_engagement_like
  ON post_engagement(post_id, user_id) WHERE type = 'like';

-- Profile grids / streaks: WHERE user_id = ? ORDER BY created_at DESC.
CREATE INDEX IF NOT EXISTS idx_posts_user_created
  ON posts(user_id, created_at);

-- Friend / block / mute lookups in both directions.
CREATE INDEX IF NOT EXISTS idx_user_relationships_user_type_target
  ON user_relationships(user_id, type, target_user_id);
CREATE INDEX IF NOT EXISTS idx_user_relationships_target_type_user
  ON user_relationships(target_user_id, type, user_id);

-- Own / profile / circle journal lists: WHERE user_id = ? AND is_public = ? ORDER BY created_at DESC.
CREATE INDEX IF NOT EXISTS idx_journal_entries_user_public_created
  ON journal_entries(user_id, is_public, created_at);

-- Notification de-dupe (once per actor + ref).
CREATE INDEX IF NOT EXISTS idx_user_notifications_dedupe
  ON user_notifications(user_id, actor_id, type, ref_id);

-- Vote counts per candidate (UNIQUE(user_id, candidate_id) does not serve this).
CREATE INDEX IF NOT EXISTS idx_instructor_votes_candidate
  ON instructor_votes(candidate_id);

-- Expired refresh-session cleanup.
CREATE INDEX IF NOT EXISTS idx_auth_refresh_sessions_expires
  ON auth_refresh_sessions(expires_at);
