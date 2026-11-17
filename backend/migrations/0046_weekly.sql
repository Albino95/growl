-- Wave 5 · weekly rituals (routes/wave3/weekly.ts). Additive only.
-- Sunday check-in form (coach-customisable), weekly answers, opt-in weekly
-- commitment with 2 rest passes, cron markers.

-- A coach's custom check-in form for their clients (up to 5 questions, JSON array).
CREATE TABLE IF NOT EXISTS weekly_forms (
  coach_id TEXT PRIMARY KEY,
  questions TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (coach_id) REFERENCES users(id) ON DELETE CASCADE
);

-- One check-in per user per ISO week; editable until Monday 12:00 local.
-- `questions` is a snapshot of the form the user answered.
CREATE TABLE IF NOT EXISTS weekly_checkins (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  week TEXT NOT NULL,
  week_start TEXT NOT NULL,
  form_source TEXT NOT NULL DEFAULT 'default',
  coach_id TEXT,
  questions TEXT NOT NULL,
  answers TEXT NOT NULL,
  shared_with_coach INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, week),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_weekly_checkins_user ON weekly_checkins(user_id, week DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_checkins_submitted ON weekly_checkins(submitted_at);

-- Opt-in "show up X days this week". pass_days: comma-separated day keys covered
-- by a rest pass (for the commitment only; never touches the growth streak).
CREATE TABLE IF NOT EXISTS weekly_commitments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  week TEXT NOT NULL,
  week_start TEXT NOT NULL,
  target_days INTEGER NOT NULL,
  pass_days TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  covered_days INTEGER,
  points_awarded INTEGER NOT NULL DEFAULT 0,
  settled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, week),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_weekly_commitments_user ON weekly_commitments(user_id, week_start DESC);

-- Cron sent-markers (Saturday "Your week in 2 minutes" nudge).
CREATE TABLE IF NOT EXISTS weekly_nudges (
  user_id TEXT NOT NULL,
  week TEXT NOT NULL,
  kind TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (user_id, week, kind)
);
CREATE INDEX IF NOT EXISTS idx_weekly_nudges_batch ON weekly_nudges(week, kind, sent_at);

-- Coach "N clients sent their week" batching: at most one per coach per hour.
CREATE TABLE IF NOT EXISTS weekly_coach_pings (
  coach_id TEXT PRIMARY KEY,
  last_sent_at TEXT NOT NULL
);
