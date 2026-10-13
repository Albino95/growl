-- Demo inbox threads: Friends + Coach + Shop (filterable by peer flags).
-- Targets review + Xhuliana + demo-core-user so TestFlight / review aren't hollow.
--   cd backend && npx wrangler d1 execute growl-db-prod --env production --remote --file=scripts/seed-inbox-demo-threads.sql
--   cd backend && npx wrangler d1 execute growl-db-qa --env qa --remote --file=scripts/seed-inbox-demo-threads.sql

PRAGMA foreign_keys = ON;

-- Ensure shop/coach lane filters work
UPDATE users SET is_instructor = 1, updated_at = datetime('now') WHERE id = 'demo-core-instructor';
UPDATE users SET is_business = 1, updated_at = datetime('now') WHERE id = 'demo-core-business';

-- Friendships so messaging is allowed
INSERT OR IGNORE INTO user_relationships (id, user_id, target_user_id, type, created_at) VALUES
  ('inbox-rel-review-inst-a', 'user_app_review_qa', 'demo-core-instructor', 'friend', datetime('now')),
  ('inbox-rel-review-inst-b', 'demo-core-instructor', 'user_app_review_qa', 'friend', datetime('now')),
  ('inbox-rel-review-biz-a', 'user_app_review_qa', 'demo-core-business', 'friend', datetime('now')),
  ('inbox-rel-review-biz-b', 'demo-core-business', 'user_app_review_qa', 'friend', datetime('now')),
  ('inbox-rel-review-d1-a', 'user_app_review_qa', 'dense-u-001', 'friend', datetime('now')),
  ('inbox-rel-review-d1-b', 'dense-u-001', 'user_app_review_qa', 'friend', datetime('now')),
  ('inbox-rel-xhul-inst-a', 'user_muzuvyw9_i8a3a70', 'demo-core-instructor', 'friend', datetime('now')),
  ('inbox-rel-xhul-inst-b', 'demo-core-instructor', 'user_muzuvyw9_i8a3a70', 'friend', datetime('now')),
  ('inbox-rel-xhul-biz-a', 'user_muzuvyw9_i8a3a70', 'demo-core-business', 'friend', datetime('now')),
  ('inbox-rel-xhul-biz-b', 'demo-core-business', 'user_muzuvyw9_i8a3a70', 'friend', datetime('now')),
  ('inbox-rel-demo-inst-a', 'demo-core-user', 'demo-core-instructor', 'friend', datetime('now')),
  ('inbox-rel-demo-inst-b', 'demo-core-instructor', 'demo-core-user', 'friend', datetime('now')),
  ('inbox-rel-demo-biz-a', 'demo-core-user', 'demo-core-business', 'friend', datetime('now')),
  ('inbox-rel-demo-biz-b', 'demo-core-business', 'demo-core-user', 'friend', datetime('now'));

-- Conversations (user_a < user_b lexicographically where possible — ids are fixed)
INSERT OR IGNORE INTO conversations (id, user_a, user_b, created_at, updated_at, last_message_at) VALUES
  ('inbox-conv-review-friend', 'dense-u-001', 'user_app_review_qa', datetime('now', '-2 days'), datetime('now', '-45 minutes'), datetime('now', '-45 minutes')),
  ('inbox-conv-review-coach', 'demo-core-instructor', 'user_app_review_qa', datetime('now', '-3 days'), datetime('now', '-2 hours'), datetime('now', '-2 hours')),
  ('inbox-conv-review-shop', 'demo-core-business', 'user_app_review_qa', datetime('now', '-4 days'), datetime('now', '-5 hours'), datetime('now', '-5 hours')),
  ('inbox-conv-xhul-friend', 'dense-u-002', 'user_muzuvyw9_i8a3a70', datetime('now', '-1 day'), datetime('now', '-20 minutes'), datetime('now', '-20 minutes')),
  ('inbox-conv-xhul-coach', 'demo-core-instructor', 'user_muzuvyw9_i8a3a70', datetime('now', '-2 days'), datetime('now', '-3 hours'), datetime('now', '-3 hours')),
  ('inbox-conv-xhul-shop', 'demo-core-business', 'user_muzuvyw9_i8a3a70', datetime('now', '-2 days'), datetime('now', '-6 hours'), datetime('now', '-6 hours')),
  ('inbox-conv-demo-coach', 'demo-core-instructor', 'demo-core-user', datetime('now', '-1 day'), datetime('now', '-1 hour'), datetime('now', '-1 hour')),
  ('inbox-conv-demo-shop', 'demo-core-business', 'demo-core-user', datetime('now', '-1 day'), datetime('now', '-4 hours'), datetime('now', '-4 hours'));

INSERT OR IGNORE INTO messages (id, conversation_id, sender_id, body, created_at) VALUES
  ('inbox-msg-rf-1', 'inbox-conv-review-friend', 'dense-u-001', 'Hey — saw your cardio path. Want to compare notes this week?', datetime('now', '-2 hours')),
  ('inbox-msg-rf-2', 'inbox-conv-review-friend', 'user_app_review_qa', 'Yes. I am keeping walks short but consistent.', datetime('now', '-45 minutes')),
  ('inbox-msg-rc-1', 'inbox-conv-review-coach', 'demo-core-instructor', 'Welcome. For this week: three short sessions, sleep before screens.', datetime('now', '-1 day')),
  ('inbox-msg-rc-2', 'inbox-conv-review-coach', 'user_app_review_qa', 'Got it — I will check in after session two.', datetime('now', '-2 hours')),
  ('inbox-msg-rs-1', 'inbox-conv-review-shop', 'demo-core-business', 'Thanks for browsing Grow Shop. Message here if you need sizing help.', datetime('now', '-1 day')),
  ('inbox-msg-rs-2', 'inbox-conv-review-shop', 'user_app_review_qa', 'Perfect — I will ask before I order.', datetime('now', '-5 hours')),
  ('inbox-msg-xf-1', 'inbox-conv-xhul-friend', 'dense-u-002', 'Your last post hit. How is training feeling today?', datetime('now', '-1 hour')),
  ('inbox-msg-xf-2', 'inbox-conv-xhul-friend', 'user_muzuvyw9_i8a3a70', 'Heavy but good. Stretching tonight.', datetime('now', '-20 minutes')),
  ('inbox-msg-xc-1', 'inbox-conv-xhul-coach', 'demo-core-instructor', 'Quick form cue: brace before the pull, not after.', datetime('now', '-5 hours')),
  ('inbox-msg-xc-2', 'inbox-conv-xhul-coach', 'user_muzuvyw9_i8a3a70', 'Noted — that was the missing piece.', datetime('now', '-3 hours')),
  ('inbox-msg-xs-1', 'inbox-conv-xhul-shop', 'demo-core-business', 'Your cart items ship from LU. Ping us for delivery windows.', datetime('now', '-8 hours')),
  ('inbox-msg-xs-2', 'inbox-conv-xhul-shop', 'user_muzuvyw9_i8a3a70', 'Thanks — I will confirm tomorrow.', datetime('now', '-6 hours')),
  ('inbox-msg-dc-1', 'inbox-conv-demo-coach', 'demo-core-instructor', 'Accountability check: did you rest yesterday?', datetime('now', '-3 hours')),
  ('inbox-msg-dc-2', 'inbox-conv-demo-coach', 'demo-core-user', 'Yes — sleep was the win.', datetime('now', '-1 hour')),
  ('inbox-msg-ds-1', 'inbox-conv-demo-shop', 'demo-core-business', 'Order updates and product questions live in this thread.', datetime('now', '-6 hours')),
  ('inbox-msg-ds-2', 'inbox-conv-demo-shop', 'demo-core-user', 'Great — keeping this for support.', datetime('now', '-4 hours'));
