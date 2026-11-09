-- Seed goal metrics + evidence check-ins

ALTER TABLE growth_seeds ADD COLUMN metric_type TEXT;
ALTER TABLE growth_seeds ADD COLUMN metric_unit TEXT;
ALTER TABLE growth_seeds ADD COLUMN metric_start REAL;
ALTER TABLE growth_seeds ADD COLUMN metric_target REAL;
ALTER TABLE growth_seeds ADD COLUMN metric_current REAL;

ALTER TABLE growth_seed_events ADD COLUMN note TEXT;
ALTER TABLE growth_seed_events ADD COLUMN photo_url TEXT;
ALTER TABLE growth_seed_events ADD COLUMN metric_value REAL;
ALTER TABLE growth_seed_events ADD COLUMN days_since_plant INTEGER;
