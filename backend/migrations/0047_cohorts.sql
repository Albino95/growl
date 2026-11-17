-- Wave 5 — Group (cohort) plans: one coach, 2–150 members, invite-only.
-- Coach broadcasts updates (members ❤️ + one-level replies), assigns group homework
-- that fans out into one completion record per member, and sees a weekly summary.
-- No payments: money terms are agreed directly with the coach.
-- Additive only: old app builds never touch these tables.

CREATE TABLE IF NOT EXISTS cohorts (
  id TEXT PRIMARY KEY,
  coach_id TEXT NOT NULL,
  title TEXT NOT NULL,
  path TEXT,
  description TEXT,
  weeks INTEGER NOT NULL DEFAULT 4,
  start_date TEXT NOT NULL,              -- YYYY-MM-DD
  capacity INTEGER NOT NULL DEFAULT 20,  -- 2..150
  visibility TEXT NOT NULL DEFAULT 'invite',
  invite_code TEXT,                      -- Crockford, 8 chars; rotated by the coach
  status TEXT NOT NULL DEFAULT 'active', -- active | archived
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (coach_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cohorts_invite_code ON cohorts(invite_code);
CREATE INDEX IF NOT EXISTS idx_cohorts_coach ON cohorts(coach_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS cohort_members (
  cohort_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active | left | removed
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  left_at TEXT,
  last_active_at TEXT,                   -- last in-group action (reply, ❤️, homework)
  PRIMARY KEY (cohort_id, user_id),
  FOREIGN KEY (cohort_id) REFERENCES cohorts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cohort_members_user ON cohort_members(user_id, status);
CREATE INDEX IF NOT EXISTS idx_cohort_members_cohort ON cohort_members(cohort_id, status, joined_at);

-- Direct invites from the coach (existing clients / friends).
CREATE TABLE IF NOT EXISTS cohort_invites (
  cohort_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  invited_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (cohort_id, user_id),
  FOREIGN KEY (cohort_id) REFERENCES cohorts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cohort_invites_user ON cohort_invites(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cohort_posts (
  id TEXT PRIMARY KEY,
  cohort_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  media_url TEXT,
  hearts INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (cohort_id) REFERENCES cohorts(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cohort_posts_cohort ON cohort_posts(cohort_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cohort_post_replies (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  cohort_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (post_id) REFERENCES cohort_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cohort_post_replies_post ON cohort_post_replies(post_id, created_at);

CREATE TABLE IF NOT EXISTS cohort_post_reactions (
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '❤️',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (post_id, user_id),
  FOREIGN KEY (post_id) REFERENCES cohort_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Group homework (one per coach action) …
CREATE TABLE IF NOT EXISTS cohort_assignments (
  id TEXT PRIMARY KEY,
  cohort_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_at TEXT,                           -- YYYY-MM-DD (local day) or NULL
  proof_kind TEXT,                       -- note | timer | number | photo | voice | NULL
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (cohort_id) REFERENCES cohorts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cohort_assignments_cohort ON cohort_assignments(cohort_id, created_at DESC);

-- … fanned out into one completion record per member (id prefix cohort_asg_).
-- Proofs reference these ids as context { type: 'assignment', id }.
CREATE TABLE IF NOT EXISTS cohort_member_assignments (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL,
  cohort_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'assigned', -- assigned | done | partly
  completed_at TEXT,
  proof_id TEXT,
  proof_kind TEXT,
  seen_at TEXT,                          -- coach marked "seen ✓"
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (assignment_id, user_id),
  FOREIGN KEY (assignment_id) REFERENCES cohort_assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (cohort_id) REFERENCES cohorts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cohort_member_assignments_cohort
  ON cohort_member_assignments(cohort_id, user_id, status);
CREATE INDEX IF NOT EXISTS idx_cohort_member_assignments_user
  ON cohort_member_assignments(user_id, status, created_at DESC);
