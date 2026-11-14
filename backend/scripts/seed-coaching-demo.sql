-- Demo coaching offer, 4-week completed plan, and two-way reviews.
-- Learner is albino.ndreu@gmail.com (must already exist).
-- Coach is instructor@growl.app.
-- Run after migrations 0026 + 0027.
--   cd backend && npx wrangler d1 execute growl-db-qa --remote --env qa --file=scripts/seed-coaching-demo.sql

PRAGMA foreign_keys = ON;

UPDATE users
SET metadata = json_set(
  COALESCE(metadata, '{}'),
  '$.teaching_headline',
  'Strength with calm form — 3× a week.'
)
WHERE lower(email) = 'instructor@growl.app';

INSERT OR REPLACE INTO instructor_offerings (
  instructor_id, weekly_fee_eur, sessions_per_week, typical_weeks, trial_days, currency, accepting, updated_at
)
SELECT
  id, 10, 3, 4, 7, 'EUR', 1, datetime('now')
FROM users
WHERE lower(email) = 'instructor@growl.app'
LIMIT 1;

INSERT OR IGNORE INTO conversations (id, user_a, user_b, created_at, updated_at, last_message_at)
SELECT
  'conv_demo_coach',
  CASE WHEN i.id < l.id THEN i.id ELSE l.id END,
  CASE WHEN i.id < l.id THEN l.id ELSE i.id END,
  datetime('now', '-35 days'),
  datetime('now', '-2 days'),
  datetime('now', '-2 days')
FROM users i
JOIN users l ON lower(l.email) = 'albino.ndreu@gmail.com'
WHERE lower(i.email) = 'instructor@growl.app'
LIMIT 1;

INSERT OR REPLACE INTO coaching_inquiries (
  id, instructor_id, client_id, conversation_id, status, created_at, updated_at
)
SELECT
  'cinq_demo_1',
  i.id,
  l.id,
  COALESCE(
    (SELECT c.id FROM conversations c
      WHERE (c.user_a = i.id AND c.user_b = l.id) OR (c.user_a = l.id AND c.user_b = i.id)
      LIMIT 1),
    'conv_demo_coach'
  ),
  'talking',
  datetime('now', '-35 days'),
  datetime('now', '-2 days')
FROM users i
JOIN users l ON lower(l.email) = 'albino.ndreu@gmail.com'
WHERE lower(i.email) = 'instructor@growl.app'
LIMIT 1;

INSERT OR REPLACE INTO coaching_proposals (
  id, inquiry_id, instructor_id, client_id, conversation_id,
  weeks, sessions_per_week, weekly_fee_eur, total_eur, trial_days,
  currency, draw, note, status, created_at, responded_at
)
SELECT
  'cprop_demo_1',
  'cinq_demo_1',
  i.id,
  l.id,
  COALESCE(
    (SELECT c.id FROM conversations c
      WHERE (c.user_a = i.id AND c.user_b = l.id) OR (c.user_a = l.id AND c.user_b = i.id)
      LIMIT 1),
    'conv_demo_coach'
  ),
  4, 3, 10, 40, 7,
  'EUR', 'weekly',
  'Four weeks of form and consistency.',
  'accepted',
  datetime('now', '-32 days'),
  datetime('now', '-31 days')
FROM users i
JOIN users l ON lower(l.email) = 'albino.ndreu@gmail.com'
WHERE lower(i.email) = 'instructor@growl.app'
LIMIT 1;

INSERT OR REPLACE INTO coaching_contracts (
  id, proposal_id, inquiry_id, instructor_id, client_id,
  weeks, sessions_per_week, weekly_fee_eur, total_eur, trial_days,
  currency, draw, status, started_at, ends_at, completed_at, created_at
)
SELECT
  'ccon_demo_1',
  'cprop_demo_1',
  'cinq_demo_1',
  i.id,
  l.id,
  4, 3, 10, 40, 7,
  'EUR', 'weekly', 'completed',
  datetime('now', '-31 days'),
  datetime('now', '-3 days'),
  datetime('now', '-3 days'),
  datetime('now', '-31 days')
FROM users i
JOIN users l ON lower(l.email) = 'albino.ndreu@gmail.com'
WHERE lower(i.email) = 'instructor@growl.app'
LIMIT 1;

INSERT OR REPLACE INTO coaching_reviews (
  id, contract_id, instructor_id, client_id, reviewer_id, subject_id,
  direction, stars, follow_through, body, created_at, updated_at
)
SELECT
  'crev_demo_client',
  'ccon_demo_1',
  i.id,
  l.id,
  l.id,
  i.id,
  'client_to_instructor',
  5,
  NULL,
  'Calm, specific, and I finally held the habit. The homework seeds made it real.',
  datetime('now', '-2 days'),
  datetime('now', '-2 days')
FROM users i
JOIN users l ON lower(l.email) = 'albino.ndreu@gmail.com'
WHERE lower(i.email) = 'instructor@growl.app'
LIMIT 1;

INSERT OR REPLACE INTO coaching_reviews (
  id, contract_id, instructor_id, client_id, reviewer_id, subject_id,
  direction, stars, follow_through, body, created_at, updated_at
)
SELECT
  'crev_demo_coach',
  'ccon_demo_1',
  i.id,
  l.id,
  i.id,
  l.id,
  'instructor_to_client',
  5,
  5,
  'Showed up, sent proof, and asked good questions. Followed the plan.',
  datetime('now', '-2 days'),
  datetime('now', '-2 days')
FROM users i
JOIN users l ON lower(l.email) = 'albino.ndreu@gmail.com'
WHERE lower(i.email) = 'instructor@growl.app'
LIMIT 1;
