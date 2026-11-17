-- Grow! growth system (docs/GROWTH_SYSTEM.md §2): unified streak with rest days,
-- Today check-ins, badges, weekly recaps, path challenges and invite links.

ALTER TABLE users ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE users ADD COLUMN invite_code TEXT;           -- unique, lazily generated
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_invite_code ON users(invite_code) WHERE invite_code IS NOT NULL;

-- one row per user per local day with any growth activity
CREATE TABLE IF NOT EXISTS user_activity_days (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,                 -- YYYY-MM-DD local
  kinds INTEGER NOT NULL DEFAULT 0,  -- bitmask 1 post, 2 story, 4 journal, 8 checkin
  paths TEXT NOT NULL DEFAULT '',    -- comma list of top-level paths touched that day (for challenges)
  is_rest INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS user_streaks (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current INTEGER NOT NULL DEFAULT 0,
  longest INTEGER NOT NULL DEFAULT 0,
  total_days INTEGER NOT NULL DEFAULT 0,
  rest_tokens INTEGER NOT NULL DEFAULT 1,     -- max 2; +1 per 7 active days
  active_since_token INTEGER NOT NULL DEFAULT 0,
  last_active_day TEXT,
  settled_through TEXT,                        -- last local day already settled
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_checkins (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,                 -- YYYY-MM-DD local
  tz TEXT,
  mood INTEGER CHECK (mood BETWEEN 1 AND 5),
  path TEXT,
  intention TEXT,                    -- <=140
  rest INTEGER NOT NULL DEFAULT 0,
  followup TEXT CHECK (followup IN ('yes','partly','no')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, day)
);
CREATE INDEX IF NOT EXISTS idx_checkins_user_day ON daily_checkins(user_id, day);

CREATE TABLE IF NOT EXISTS user_badges (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL,
  earned_at TEXT NOT NULL DEFAULT (datetime('now')),
  seen_at TEXT,
  UNIQUE(user_id, badge_id)
);

CREATE TABLE IF NOT EXISTS weekly_recaps (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week TEXT NOT NULL,                -- ISO week, e.g. 2026-W46
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, week)
);

CREATE TABLE IF NOT EXISTS challenge_participants (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id TEXT NOT NULL,
  joined_at TEXT NOT NULL,           -- local day YYYY-MM-DD
  ends_at TEXT NOT NULL,             -- local day
  completed_at TEXT,
  PRIMARY KEY (user_id, challenge_id)
);
CREATE INDEX IF NOT EXISTS idx_challenge_participants_challenge
  ON challenge_participants(challenge_id, ends_at);

CREATE TABLE IF NOT EXISTS invite_redemptions (
  invitee_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  inviter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','rewarded')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  rewarded_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_invite_redemptions_inviter ON invite_redemptions(inviter_id, created_at);

-- One-time backfill (UTC-day approximation). Kinds are distinct bits per source,
-- so SUM(DISTINCT bit) equals their bitwise OR. Streak rows are rebuilt lazily.
INSERT OR IGNORE INTO user_activity_days (user_id, day, kinds, paths, is_rest)
SELECT user_id, day, SUM(DISTINCT bit), COALESCE(GROUP_CONCAT(DISTINCT path), ''), 0
FROM (
  SELECT user_id, date(created_at) AS day, 1 AS bit,
         lower(CASE WHEN instr(category, ':') > 0
                    THEN substr(category, 1, instr(category, ':') - 1)
                    ELSE category END) AS path
  FROM posts
  UNION
  SELECT user_id, date(created_at), 2, NULL FROM stories
  UNION
  SELECT user_id, date(created_at), 4, NULL FROM journal_entries
) src
WHERE day IS NOT NULL AND user_id IN (SELECT id FROM users)
GROUP BY user_id, day;
