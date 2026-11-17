-- Growth Circles — starting groups per path + user-created groups.
-- Call rooms are reserved for LiveKit / Cloudflare Calls (voice + video later).

CREATE TABLE IF NOT EXISTS growth_groups (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE,
  name TEXT NOT NULL,
  path_key TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'starting',
  description TEXT,
  accent TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_growth_groups_path ON growth_groups(path_key, kind);
CREATE INDEX IF NOT EXISTS idx_growth_groups_kind ON growth_groups(kind);

CREATE TABLE IF NOT EXISTS growth_group_members (
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_pulse_at TEXT,
  PRIMARY KEY (group_id, user_id),
  FOREIGN KEY (group_id) REFERENCES growth_groups(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_growth_group_members_user ON growth_group_members(user_id);

CREATE TABLE IF NOT EXISTS growth_group_pulses (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (group_id) REFERENCES growth_groups(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_growth_group_pulses_group ON growth_group_pulses(group_id, created_at);

CREATE TABLE IF NOT EXISTS growth_group_call_interest (
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (group_id, user_id, kind),
  FOREIGN KEY (group_id) REFERENCES growth_groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS growth_group_calls (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  scheduled_at TEXT,
  livekit_room TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (group_id) REFERENCES growth_groups(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO growth_groups (id, slug, name, path_key, kind, description, accent) VALUES
  ('ggrp_grove', 'grove', 'The Grove', 'grove', 'starting',
   'Everyone’s first circle — a quiet place to land, check in, and meet people growing anything.',
   '#059669'),
  ('ggrp_fitness', 'fitness', 'Fitness starting circle', 'fitness', 'starting',
   'Show up for movement, check-ins, and (soon) live sits with people on the same path.',
   '#059669'),
  ('ggrp_art', 'art', 'Art starting circle', 'art', 'starting',
   'Practice together — piano, drawing, guitar, and the rest of the art path.',
   '#0F766E'),
  ('ggrp_nutrition', 'nutrition', 'Nutrition starting circle', 'nutrition', 'starting',
   'Meals, cooking skills, and kind accountability around food.',
   '#047857'),
  ('ggrp_mindset', 'mindset', 'Mindset starting circle', 'mindset', 'starting',
   'Stress, confidence, and the inner work — pulse when you practiced.',
   '#0D9488'),
  ('ggrp_discipline', 'discipline', 'Discipline starting circle', 'discipline', 'starting',
   'Habits, time, and the unglamorous reps that actually stick.',
   '#115E59'),
  ('ggrp_martial', 'martial-arts', 'Martial arts starting circle', 'martial-arts', 'starting',
   'Sparring partners for the long game — karate, boxing, jiu-jitsu, taekwondo.',
   '#065F46'),
  ('ggrp_language', 'language', 'Language starting circle', 'language', 'starting',
   'Speak, listen, and keep a streak with people learning beside you.',
   '#0F766E'),
  ('ggrp_coding', 'coding', 'Coding starting circle', 'coding', 'starting',
   'Ship small, ask often, celebrate the boring bugs you actually fixed.',
   '#064E3B'),
  ('ggrp_sustainability', 'sustainability', 'Sustainability starting circle', 'sustainability', 'starting',
   'Living lighter — habits, not lectures.',
   '#047857'),
  ('ggrp_wellness', 'wellness', 'Wellness starting circle', 'wellness', 'starting',
   'Sleep, self-care, and the rest that makes growth possible.',
   '#0D9488'),
  ('ggrp_finance', 'finance', 'Finance starting circle', 'finance', 'starting',
   'Budgets and literacy without the flex. Quiet progress only.',
   '#115E59');
