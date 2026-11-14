-- Growth Seeds — goals from category library, tracking, members (owners/witness/instructor)

CREATE TABLE IF NOT EXISTS growth_seeds (
  id TEXT PRIMARY KEY,
  category_key TEXT NOT NULL,
  subcategory_key TEXT NOT NULL,
  title TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'seed',
  growth_score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'growing',
  ownership TEXT NOT NULL DEFAULT 'solo',
  visibility TEXT NOT NULL DEFAULT 'private',
  planted_by_user_id TEXT NOT NULL,
  planted_at TEXT NOT NULL DEFAULT (datetime('now')),
  matured_at TEXT,
  resting_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_growth_seeds_status ON growth_seeds(status);
CREATE INDEX IF NOT EXISTS idx_growth_seeds_planted_by ON growth_seeds(planted_by_user_id);

CREATE TABLE IF NOT EXISTS growth_seed_members (
  seed_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (seed_id, user_id),
  FOREIGN KEY (seed_id) REFERENCES growth_seeds(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_growth_seed_members_user ON growth_seed_members(user_id, status);

CREATE TABLE IF NOT EXISTS growth_seed_events (
  id TEXT PRIMARY KEY,
  seed_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  delta INTEGER NOT NULL DEFAULT 0,
  ref_type TEXT,
  ref_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (seed_id) REFERENCES growth_seeds(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_growth_seed_events_seed ON growth_seed_events(seed_id, created_at);
