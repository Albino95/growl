-- Refresh demo social content into the home-feed recency window.
-- Safe to re-run. Targets seeded ids only (dense-* / seed-*).
--
--   cd backend && npx wrangler d1 execute growl-db-qa --remote --env qa --file=scripts/refresh-demo-feed-timestamps.sql

PRAGMA foreign_keys = ON;

-- Spread posts across the last ~5 days so home (-7d) and explore stay populated.
UPDATE posts
SET
  created_at = datetime('now', '-' || ((ABS(RANDOM()) % 120) + 1) || ' hours'),
  updated_at = datetime('now')
WHERE id LIKE 'dense-post-%'
   OR id LIKE 'seed-post-%';

-- Revive stories for the ring row.
UPDATE stories
SET
  created_at = datetime('now', '-' || (ABS(RANDOM()) % 16) || ' hours'),
  expires_at = datetime('now', '+22 hours'),
  updated_at = datetime('now')
WHERE id LIKE 'dense-story-%'
   OR id LIKE 'seed-story-%';

-- Tag a slice of vertical-friendly posts as reels for the Reels tab.
UPDATE posts
SET metadata = json_set(COALESCE(metadata, '{}'), '$.format', 'reel')
WHERE id LIKE 'dense-post-%'
  AND (CAST(substr(id, 12) AS INTEGER) % 7) = 0;
