-- Wave 4 (main user): one-level comment replies.
-- Additive only: old app builds never send parent_id and keep working (NULL = top-level).
ALTER TABLE post_engagement ADD COLUMN parent_id TEXT;
CREATE INDEX IF NOT EXISTS idx_post_engagement_parent
  ON post_engagement(parent_id) WHERE parent_id IS NOT NULL;
