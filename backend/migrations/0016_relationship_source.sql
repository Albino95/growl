-- Distinguish auto-cohort friendships from explicit/manual friend adds.
-- source: 'cohort' | 'manual' | NULL (legacy — treated as cohort for detach on path change)

ALTER TABLE user_relationships ADD COLUMN source TEXT;
