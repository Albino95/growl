-- Circles are pods of 10. Starting rows stay as path templates; overflow lands in
-- kind='cohort' children. Empty user/cohort rooms are pruned in application code.
-- city/country/lat/lng are seating hints (optional prefs), not GPS requirements.

ALTER TABLE growth_groups ADD COLUMN max_members INTEGER NOT NULL DEFAULT 10;
ALTER TABLE growth_groups ADD COLUMN parent_id TEXT;
ALTER TABLE growth_groups ADD COLUMN city TEXT;
ALTER TABLE growth_groups ADD COLUMN country TEXT;
ALTER TABLE growth_groups ADD COLUMN lat REAL;
ALTER TABLE growth_groups ADD COLUMN lng REAL;

CREATE INDEX IF NOT EXISTS idx_growth_groups_parent ON growth_groups(parent_id);
CREATE INDEX IF NOT EXISTS idx_growth_groups_place ON growth_groups(path_key, kind, parent_id);
