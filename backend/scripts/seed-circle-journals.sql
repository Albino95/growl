-- Public circle journals + sample sentence replies for Circle testing.
--   cd backend && npx wrangler d1 execute growl-db-prod --env production --remote --file=scripts/seed-circle-journals.sql
--   cd backend && npx wrangler d1 execute growl-db-qa --env qa --remote --file=scripts/seed-circle-journals.sql

PRAGMA foreign_keys = ON;

-- Give Xhuliana richer fitness focuses (Home cohort + endorse overlap).
UPDATE users
SET metadata = json_set(
  COALESCE(metadata, '{}'),
  '$.categories',
  json('["fitness:building-muscle","fitness:cardio","fitness:flexibility"]')
),
updated_at = datetime('now')
WHERE id = 'user_muzuvyw9_i8a3a70'
   OR lower(json_extract(metadata, '$.username')) = 'xhulianagjoka';

INSERT OR REPLACE INTO journal_entries (
  id, user_id, title, content, mood, tags, is_public, metadata, created_at, updated_at
) VALUES
(
  'journal-circle-seed-01',
  'dense-u-001',
  NULL,
  'Today I chose the long walk instead of the shortcut. My legs complained, then quieted. Somewhere around kilometer three I remembered why I started — not to beat anyone, just to keep a promise to myself.',
  'proud',
  '["fitness:cardio","fitness"]',
  1,
  '{"growth_path":"fitness:cardio","allowMessages":true}',
  datetime('now', '-2 hours'),
  datetime('now', '-2 hours')
),
(
  'journal-circle-seed-02',
  'dense-u-002',
  NULL,
  'I almost skipped the session. Then I did the first set badly on purpose — permission to be imperfect. After that, the rest showed up. Progress is rarely glamorous. It is usually just returning.',
  'motivated',
  '["fitness:building-muscle","fitness"]',
  1,
  '{"growth_path":"fitness:building-muscle","allowMessages":true}',
  datetime('now', '-5 hours'),
  datetime('now', '-5 hours')
),
(
  'journal-circle-seed-03',
  'dense-u-003',
  NULL,
  'Stretching before bed felt silly until my shoulders dropped. I wrote one sentence about what I am grateful for: people who notice effort, not only results. That is enough for tonight.',
  'grateful',
  '["fitness:flexibility","wellness"]',
  1,
  '{"growth_path":"fitness:flexibility","allowMessages":true}',
  datetime('now', '-1 day'),
  datetime('now', '-1 day')
),
(
  'journal-circle-seed-04',
  'demo-core-user',
  NULL,
  'Shared this with my circle because I want accountability, not applause. If you read this: ask me tomorrow whether I drank water before coffee. That tiny check-in keeps me honest.',
  'calm',
  '["fitness:cardio","discipline"]',
  1,
  '{"growth_path":"fitness:cardio","allowMessages":true}',
  datetime('now', '-3 hours'),
  datetime('now', '-3 hours')
),
(
  'journal-circle-seed-05',
  'demo-core-instructor',
  NULL,
  'Coaching tip I needed myself: rest is part of the plan, not a failure of discipline. Tomorrow we lift. Tonight we sleep like it matters — because it does.',
  'peaceful',
  '["fitness:building-muscle","mindset"]',
  1,
  '{"growth_path":"fitness:building-muscle","allowMessages":true}',
  datetime('now', '-8 hours'),
  datetime('now', '-8 hours')
),
(
  'journal-circle-seed-06',
  'user_muzm8ofd_xhzvo65',
  NULL,
  'Training after a long day felt heavy until the third round. Then something clicked — not power, but patience. I am learning to stay with discomfort without making it dramatic.',
  'determined',
  '["fitness:losing-weight","martial-arts:taekwondo"]',
  1,
  '{"growth_path":"fitness:losing-weight","allowMessages":true}',
  datetime('now', '-6 hours'),
  datetime('now', '-6 hours')
),
(
  'journal-circle-seed-07',
  'dense-u-004',
  NULL,
  'Meal prep Sunday looked boring on paper. Opening the fridge tomorrow and seeing color waiting for me feels like a quiet win. Small systems beat big motivation.',
  'hopeful',
  '["nutrition:meal-planning","fitness:flexibility"]',
  1,
  '{"growth_path":"nutrition:meal-planning","allowMessages":true}',
  datetime('now', '-10 hours'),
  datetime('now', '-10 hours')
),
(
  'journal-circle-seed-08',
  'seed-u-yoga',
  NULL,
  'Ten minutes on the mat. No playlist, no performance. Just breath and the reminder that flexibility is also emotional — learning to bend without breaking the day.',
  'peaceful',
  '["fitness:flexibility","wellness:self-care"]',
  1,
  '{"growth_path":"fitness:flexibility","allowMessages":true}',
  datetime('now', '-14 hours'),
  datetime('now', '-14 hours')
),
(
  'journal-circle-seed-09',
  'seed-u-runner',
  NULL,
  'Rain run. Slow miles, loud thoughts, then quiet ones. I finished colder and clearer. That is the kind of progress no screenshot can capture.',
  'proud',
  '["fitness:cardio","discipline:habit-building"]',
  1,
  '{"growth_path":"fitness:cardio","allowMessages":true}',
  datetime('now', '-20 hours'),
  datetime('now', '-20 hours')
),
(
  'journal-circle-seed-10',
  'dense-u-018',
  NULL,
  'Strength day was ugly reps and honest form. I left without a PR and still felt stronger — because I showed up when the excuse was louder than the plan.',
  'motivated',
  '["fitness:strength","fitness"]',
  1,
  '{"growth_path":"fitness:strength","allowMessages":true}',
  datetime('now', '-26 hours'),
  datetime('now', '-26 hours')
);

-- Sample public sentence replies (requires journal_entry_replies from migration 0019).
INSERT OR IGNORE INTO journal_entry_replies (
  id, entry_id, user_id, quote_text, body, visibility, created_at
) VALUES
(
  'jreply-seed-01',
  'journal-circle-seed-01',
  'dense-u-002',
  'Somewhere around kilometer three I remembered why I started — not to beat anyone, just to keep a promise to myself.',
  'This line landed. Promises to yourself are the ones that stick when nobody is watching.',
  'public',
  datetime('now', '-90 minutes')
),
(
  'jreply-seed-02',
  'journal-circle-seed-02',
  'dense-u-001',
  'Progress is rarely glamorous. It is usually just returning.',
  'Saving this. Returning is the whole game.',
  'public',
  datetime('now', '-4 hours')
),
(
  'jreply-seed-03',
  'journal-circle-seed-04',
  'demo-core-instructor',
  'That tiny check-in keeps me honest.',
  'I’ll ask you tomorrow. Water before coffee — locked in.',
  'public',
  datetime('now', '-2 hours')
),
(
  'jreply-seed-04',
  'journal-circle-seed-05',
  'demo-core-user',
  'rest is part of the plan, not a failure of discipline.',
  'Needed this reminder tonight. Sleeping on purpose.',
  'public',
  datetime('now', '-7 hours')
);

-- Ensure demo + dense authors are friends with Xhuliana so Circle populates for her account.
INSERT OR IGNORE INTO user_relationships (id, user_id, target_user_id, type, created_at)
VALUES
  ('jr-rel-xhul-d1a', 'user_muzuvyw9_i8a3a70', 'dense-u-001', 'friend', datetime('now')),
  ('jr-rel-xhul-d1b', 'dense-u-001', 'user_muzuvyw9_i8a3a70', 'friend', datetime('now')),
  ('jr-rel-xhul-d2a', 'user_muzuvyw9_i8a3a70', 'dense-u-002', 'friend', datetime('now')),
  ('jr-rel-xhul-d2b', 'dense-u-002', 'user_muzuvyw9_i8a3a70', 'friend', datetime('now')),
  ('jr-rel-xhul-d3a', 'user_muzuvyw9_i8a3a70', 'dense-u-003', 'friend', datetime('now')),
  ('jr-rel-xhul-d3b', 'dense-u-003', 'user_muzuvyw9_i8a3a70', 'friend', datetime('now')),
  ('jr-rel-xhul-d4a', 'user_muzuvyw9_i8a3a70', 'dense-u-004', 'friend', datetime('now')),
  ('jr-rel-xhul-d4b', 'dense-u-004', 'user_muzuvyw9_i8a3a70', 'friend', datetime('now')),
  ('jr-rel-xhul-d18a', 'user_muzuvyw9_i8a3a70', 'dense-u-018', 'friend', datetime('now')),
  ('jr-rel-xhul-d18b', 'dense-u-018', 'user_muzuvyw9_i8a3a70', 'friend', datetime('now')),
  ('jr-rel-xhul-dua', 'user_muzuvyw9_i8a3a70', 'demo-core-user', 'friend', datetime('now')),
  ('jr-rel-xhul-dub', 'demo-core-user', 'user_muzuvyw9_i8a3a70', 'friend', datetime('now')),
  ('jr-rel-xhul-dia', 'user_muzuvyw9_i8a3a70', 'demo-core-instructor', 'friend', datetime('now')),
  ('jr-rel-xhul-dib', 'demo-core-instructor', 'user_muzuvyw9_i8a3a70', 'friend', datetime('now')),
  ('jr-rel-xhul-yoga-a', 'user_muzuvyw9_i8a3a70', 'seed-u-yoga', 'friend', datetime('now')),
  ('jr-rel-xhul-yoga-b', 'seed-u-yoga', 'user_muzuvyw9_i8a3a70', 'friend', datetime('now')),
  ('jr-rel-xhul-run-a', 'user_muzuvyw9_i8a3a70', 'seed-u-runner', 'friend', datetime('now')),
  ('jr-rel-xhul-run-b', 'seed-u-runner', 'user_muzuvyw9_i8a3a70', 'friend', datetime('now')),
  ('jr-rel-xhul-v89a', 'user_muzuvyw9_i8a3a70', 'user_muzm8ofd_xhzvo65', 'friend', datetime('now')),
  ('jr-rel-xhul-v89b', 'user_muzm8ofd_xhzvo65', 'user_muzuvyw9_i8a3a70', 'friend', datetime('now'));
