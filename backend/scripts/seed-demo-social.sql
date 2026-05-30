-- Demo users, posts, stories, sample engagement, and friend edges for Growl (D1 / SQLite).
--
-- Apply locally (from repo root):
--   cd backend && npx wrangler d1 execute growl-db --local --file=scripts/seed-demo-social.sql
-- Or absolute:
--   cd /path/to/growl_rn_ts_twrnc_sdk54_v5/backend && npx wrangler d1 execute growl-db --local --file=scripts/seed-demo-social.sql
-- Remote (production Worker DB binding uses database_name = growl-db):
--   cd backend && npx wrangler d1 execute growl-db --remote --file=scripts/seed-demo-social.sql
--
-- Sign-in: plain password over HTTPS — password for every account below: growlseed123
-- Emails: demo-fitness@growl.seed, demo-art@growl.seed, demo-violin@growl.seed, demo-mind@growl.seed, demo-nutrition@growl.seed
--         demo-runner@growl.seed, demo-yoga@growl.seed, demo-reader@growl.seed, demo-creator@growl.seed, demo-coder@growl.seed

PRAGMA foreign_keys = ON;

-- Shared password hash (SHA-256 hex of "growlseed123")
INSERT OR REPLACE INTO users (
  id, email, password_hash, points, is_instructor, is_business, metadata,
  email_verified, email_verification_token_hash, email_verification_expires_at,
  created_at, updated_at
)
VALUES
  ('seed-u-fitness', 'demo-fitness@growl.seed', 'ae68d3ddb474a3769a06f7c5e5a34bd24f5c8d42a19c1b02fcf06b3f84082beb', 420, 1, 0,
   '{"username":"Jordan Miles","avatar":"https://i.pravatar.cc/150?img=12","categories":["fitness:losing-weight"]}',
   1, NULL, NULL, datetime('now'), datetime('now')),
  ('seed-u-art', 'demo-art@growl.seed', 'ae68d3ddb474a3769a06f7c5e5a34bd24f5c8d42a19c1b02fcf06b3f84082beb', 310, 1, 0,
   '{"username":"River Keys","avatar":"https://i.pravatar.cc/150?img=33","categories":["art:piano"]}',
   1, NULL, NULL, datetime('now'), datetime('now')),
  ('seed-u-violin', 'demo-violin@growl.seed', 'ae68d3ddb474a3769a06f7c5e5a34bd24f5c8d42a19c1b02fcf06b3f84082beb', 280, 0, 0,
   '{"username":"Casey Strings","avatar":"https://i.pravatar.cc/150?img=47","categories":["art:violin"]}',
   1, NULL, NULL, datetime('now'), datetime('now')),
  ('seed-u-mind', 'demo-mind@growl.seed', 'ae68d3ddb474a3769a06f7c5e5a34bd24f5c8d42a19c1b02fcf06b3f84082beb', 195, 0, 0,
   '{"username":"Morgan Calm","avatar":"https://i.pravatar.cc/150?img=5","categories":["mindset:meditation"]}',
   1, NULL, NULL, datetime('now'), datetime('now')),
  ('seed-u-nutrition', 'demo-nutrition@growl.seed', 'ae68d3ddb474a3769a06f7c5e5a34bd24f5c8d42a19c1b02fcf06b3f84082beb', 240, 0, 0,
   '{"username":"Sam Prep","avatar":"https://i.pravatar.cc/150?img=56","categories":["nutrition:meal-planning"]}',
   1, NULL, NULL, datetime('now'), datetime('now')),
  ('seed-u-runner', 'demo-runner@growl.seed', 'ae68d3ddb474a3769a06f7c5e5a34bd24f5c8d42a19c1b02fcf06b3f84082beb', 268, 0, 0,
   '{"username":"Avery Pace","avatar":"https://i.pravatar.cc/150?img=21","categories":["fitness:cardio","mindset:discipline"]}',
   1, NULL, NULL, datetime('now'), datetime('now')),
  ('seed-u-yoga', 'demo-yoga@growl.seed', 'ae68d3ddb474a3769a06f7c5e5a34bd24f5c8d42a19c1b02fcf06b3f84082beb', 332, 1, 0,
   '{"username":"Nina Flow","avatar":"https://i.pravatar.cc/150?img=31","categories":["fitness:flexibility","mindset:meditation"]}',
   1, NULL, NULL, datetime('now'), datetime('now')),
  ('seed-u-reader', 'demo-reader@growl.seed', 'ae68d3ddb474a3769a06f7c5e5a34bd24f5c8d42a19c1b02fcf06b3f84082beb', 180, 0, 0,
   '{"username":"Leo Notes","avatar":"https://i.pravatar.cc/150?img=36","categories":["mindset:focus","art:writing"]}',
   1, NULL, NULL, datetime('now'), datetime('now')),
  ('seed-u-creator', 'demo-creator@growl.seed', 'ae68d3ddb474a3769a06f7c5e5a34bd24f5c8d42a19c1b02fcf06b3f84082beb', 226, 0, 0,
   '{"username":"Mia Canvas","avatar":"https://i.pravatar.cc/150?img=42","categories":["art:drawing","art:piano"]}',
   1, NULL, NULL, datetime('now'), datetime('now')),
  ('seed-u-coder', 'demo-coder@growl.seed', 'ae68d3ddb474a3769a06f7c5e5a34bd24f5c8d42a19c1b02fcf06b3f84082beb', 410, 0, 0,
   '{"username":"Kai Build","avatar":"https://i.pravatar.cc/150?img=62","categories":["mindset:discipline","nutrition:healthy-eating"]}',
   1, NULL, NULL, datetime('now'), datetime('now'));

-- Posts (real HTTPS images — good for feed / reels / explore)
INSERT OR IGNORE INTO posts (id, user_id, image_url, caption, category, subcategory, engagement_score, metadata, created_at, updated_at)
VALUES
  ('seed-post-001', 'seed-u-fitness', 'https://images.unsplash.com/photo-1571019613454-1cb2f99b84d4?w=900&q=80',
   'Leg day checkpoint — slow reps, clean form.', 'fitness', 'losing-weight', 42, '{}', datetime('now', '-2 hours'), datetime('now', '-2 hours')),
  ('seed-post-002', 'seed-u-fitness', 'https://images.unsplash.com/photo-1517836357483-507a3093906b?w=900&q=80',
   'Morning mobility stack before work.', 'fitness', 'flexibility', 28, '{}', datetime('now', '-14 hours'), datetime('now', '-14 hours')),
  ('seed-post-003', 'seed-u-art', 'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=900&q=80',
   'Recording a practice loop — left hand finally relaxed.', 'art', 'piano', 55, '{}', datetime('now', '-5 hours'), datetime('now', '-5 hours')),
  ('seed-post-004', 'seed-u-art', 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=900&q=80',
   'Sketch warm-ups before studio time.', 'art', 'drawing', 19, '{}', datetime('now', '-30 hours'), datetime('now', '-30 hours')),
  ('seed-post-005', 'seed-u-violin', 'https://images.unsplash.com/photo-1465821185615-75bee83ea78f?w=900&q=80',
   'Intonation drills — boring but it compounds.', 'art', 'violin', 33, '{}', datetime('now', '-8 hours'), datetime('now', '-8 hours')),
  ('seed-post-006', 'seed-u-mind', 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=900&q=80',
   'Ten mindful breaths between meetings.', 'mindset', 'meditation', 61, '{}', datetime('now', '-1 hours'), datetime('now', '-1 hours')),
  ('seed-post-007', 'seed-u-mind', 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=900&q=80',
   'Evening wind-down stretch + journaling.', 'mindset', 'stress-management', 22, '{}', datetime('now', '-40 hours'), datetime('now', '-40 hours')),
  ('seed-post-008', 'seed-u-nutrition', 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=900&q=80',
   'Batch roasted veg for the week — less delivery guilt.', 'nutrition', 'meal-planning', 37, '{}', datetime('now', '-3 hours'), datetime('now', '-3 hours')),
  ('seed-post-009', 'seed-u-nutrition', 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=900&q=80',
   'High-protein bowl template I rotate.', 'nutrition', 'healthy-eating', 44, '{}', datetime('now', '-18 hours'), datetime('now', '-18 hours')),
  ('seed-post-010', 'seed-u-fitness', 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=900&q=80',
   'Easy interval run — staying conversational.', 'fitness', 'cardio', 31, '{}', datetime('now', '-50 hours'), datetime('now', '-50 hours')),
  ('seed-post-011', 'seed-u-runner', 'https://images.unsplash.com/photo-1517963879433-6ad2b056d712?w=900&q=80',
   'Tempo run before sunrise. 5k negative split.', 'fitness', 'cardio', 36, '{}', datetime('now', '-4 hours'), datetime('now', '-4 hours')),
  ('seed-post-012', 'seed-u-yoga', 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=900&q=80',
   'Mobility + breathwork circuit for desk workers.', 'fitness', 'flexibility', 41, '{}', datetime('now', '-6 hours'), datetime('now', '-6 hours')),
  ('seed-post-013', 'seed-u-reader', 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=900&q=80',
   '25 minutes deep reading, phone in another room.', 'mindset', 'focus', 24, '{}', datetime('now', '-7 hours'), datetime('now', '-7 hours')),
  ('seed-post-014', 'seed-u-creator', 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=900&q=80',
   'Gesture sketches to loosen the wrist.', 'art', 'drawing', 29, '{}', datetime('now', '-9 hours'), datetime('now', '-9 hours')),
  ('seed-post-015', 'seed-u-coder', 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=900&q=80',
   'Batch-cooked lunch + code sprint. Better energy all day.', 'nutrition', 'healthy-eating', 38, '{}', datetime('now', '-11 hours'), datetime('now', '-11 hours')),
  ('seed-post-016', 'demo-core-user', 'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?w=900&q=80',
   'Back to consistency: 20 min training + 10 min journal.', 'fitness', 'building-muscle', 47, '{}', datetime('now', '-2.5 hours'), datetime('now', '-2.5 hours')),
  ('seed-post-017', 'demo-core-user', 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=900&q=80',
   'Meal prep Sunday done. Future me says thanks.', 'nutrition', 'meal-planning', 34, '{}', datetime('now', '-16 hours'), datetime('now', '-16 hours'));

-- Sample likes so Explore / feed engagement signals are non-zero
INSERT OR IGNORE INTO post_engagement (id, post_id, user_id, type, content, created_at)
VALUES
  ('seed-pe-like-1', 'seed-post-001', 'seed-u-art', 'like', NULL, datetime('now', '-1 hours')),
  ('seed-pe-like-2', 'seed-post-001', 'seed-u-violin', 'like', NULL, datetime('now', '-1 hours')),
  ('seed-pe-like-3', 'seed-post-003', 'seed-u-fitness', 'like', NULL, datetime('now', '-2 hours')),
  ('seed-pe-like-4', 'seed-post-006', 'seed-u-nutrition', 'like', NULL, datetime('now', '-30 minutes')),
  ('seed-pe-like-5', 'seed-post-006', 'seed-u-art', 'like', NULL, datetime('now', '-25 minutes')),
  ('seed-pe-like-6', 'seed-post-011', 'demo-core-user', 'like', NULL, datetime('now', '-2 hours')),
  ('seed-pe-like-7', 'seed-post-012', 'demo-core-user', 'like', NULL, datetime('now', '-90 minutes')),
  ('seed-pe-like-8', 'seed-post-016', 'seed-u-fitness', 'like', NULL, datetime('now', '-70 minutes')),
  ('seed-pe-like-9', 'seed-post-016', 'seed-u-yoga', 'like', NULL, datetime('now', '-62 minutes')),
  ('seed-pe-like-10', 'seed-post-017', 'seed-u-nutrition', 'like', NULL, datetime('now', '-40 minutes')),
  ('seed-pe-like-11', 'seed-post-015', 'demo-core-user', 'like', NULL, datetime('now', '-30 minutes')),
  ('seed-pe-cmt-1', 'seed-post-003', 'seed-u-violin', 'comment', 'Love this progress!', datetime('now', '-4 hours')),
  ('seed-pe-cmt-2', 'seed-post-016', 'seed-u-fitness', 'comment', 'Strong comeback. Keep stacking days.', datetime('now', '-55 minutes')),
  ('seed-pe-cmt-3', 'seed-post-017', 'seed-u-coder', 'comment', 'Meal prep is the hidden superpower.', datetime('now', '-35 minutes'));

-- Stories (24h window on feed ring for others; profile uses longer window for owner)
INSERT OR IGNORE INTO stories (id, user_id, image_url, caption, views, expires_at, created_at, updated_at)
VALUES
  ('seed-story-001', 'seed-u-fitness', 'https://images.unsplash.com/photo-1517836357483-507a3093906b?w=800&q=80',
   'Mobility stack', 0, datetime('now', '+20 hours'), datetime('now', '-1 hours'), datetime('now', '-1 hours')),
  ('seed-story-002', 'seed-u-fitness', 'https://images.unsplash.com/photo-1576678927484-cc907957088c?w=800&q=80',
   'Post-run shake', 0, datetime('now', '+18 hours'), datetime('now', '-20 minutes'), datetime('now', '-20 minutes')),
  ('seed-story-003', 'seed-u-art', 'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=800&q=80',
   'Studio tonight', 0, datetime('now', '+22 hours'), datetime('now', '-3 hours'), datetime('now', '-3 hours')),
  ('seed-story-004', 'seed-u-violin', 'https://images.unsplash.com/photo-1465821185615-75bee83ea78f?w=800&q=80',
   'Bow rosined ✓', 0, datetime('now', '+21 hours'), datetime('now', '-45 minutes'), datetime('now', '-45 minutes')),
  ('seed-story-005', 'seed-u-mind', 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&q=80',
   'Reset breaths', 0, datetime('now', '+23 hours'), datetime('now', '-2 hours'), datetime('now', '-2 hours')),
  ('seed-story-006', 'seed-u-nutrition', 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80',
   'Lunch prep done', 0, datetime('now', '+19 hours'), datetime('now', '-90 minutes'), datetime('now', '-90 minutes')),
  ('seed-story-007', 'seed-u-runner', 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&q=80',
   'Track session complete', 0, datetime('now', '+20 hours'), datetime('now', '-50 minutes'), datetime('now', '-50 minutes')),
  ('seed-story-008', 'seed-u-yoga', 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&q=80',
   'Sunset flow', 0, datetime('now', '+21 hours'), datetime('now', '-35 minutes'), datetime('now', '-35 minutes')),
  ('seed-story-009', 'demo-core-user', 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800&q=80',
   'Consistency > intensity', 0, datetime('now', '+22 hours'), datetime('now', '-28 minutes'), datetime('now', '-28 minutes'));

-- Mutual friends (cohort overlap: art↔art, fitness↔nutrition, demo user↔fitness seed)
INSERT OR IGNORE INTO user_relationships (id, user_id, target_user_id, type, created_at)
VALUES
  ('seed-rel-friend-1', 'seed-u-art', 'seed-u-violin', 'friend', datetime('now')),
  ('seed-rel-friend-2', 'seed-u-violin', 'seed-u-art', 'friend', datetime('now')),
  ('seed-rel-friend-3', 'seed-u-fitness', 'seed-u-nutrition', 'friend', datetime('now')),
  ('seed-rel-friend-4', 'seed-u-nutrition', 'seed-u-fitness', 'friend', datetime('now')),
  ('seed-rel-demo-fit-a', 'demo-core-user', 'seed-u-fitness', 'friend', datetime('now')),
  ('seed-rel-demo-fit-b', 'seed-u-fitness', 'demo-core-user', 'friend', datetime('now')),
  ('seed-rel-demo-nut-a', 'demo-core-user', 'seed-u-nutrition', 'friend', datetime('now')),
  ('seed-rel-demo-nut-b', 'seed-u-nutrition', 'demo-core-user', 'friend', datetime('now')),
  ('seed-rel-demo-run-a', 'demo-core-user', 'seed-u-runner', 'friend', datetime('now')),
  ('seed-rel-demo-run-b', 'seed-u-runner', 'demo-core-user', 'friend', datetime('now')),
  ('seed-rel-demo-yoga-a', 'demo-core-user', 'seed-u-yoga', 'friend', datetime('now')),
  ('seed-rel-demo-yoga-b', 'seed-u-yoga', 'demo-core-user', 'friend', datetime('now')),
  ('seed-rel-demo-reader-a', 'demo-core-user', 'seed-u-reader', 'friend', datetime('now')),
  ('seed-rel-demo-reader-b', 'seed-u-reader', 'demo-core-user', 'friend', datetime('now')),
  ('seed-rel-demo-creator-a', 'demo-core-user', 'seed-u-creator', 'friend', datetime('now')),
  ('seed-rel-demo-creator-b', 'seed-u-creator', 'demo-core-user', 'friend', datetime('now')),
  ('seed-rel-demo-coder-a', 'demo-core-user', 'seed-u-coder', 'friend', datetime('now')),
  ('seed-rel-demo-coder-b', 'seed-u-coder', 'demo-core-user', 'friend', datetime('now')),
  ('seed-rel-run-yoga-a', 'seed-u-runner', 'seed-u-yoga', 'friend', datetime('now')),
  ('seed-rel-run-yoga-b', 'seed-u-yoga', 'seed-u-runner', 'friend', datetime('now')),
  ('seed-rel-creator-reader-a', 'seed-u-creator', 'seed-u-reader', 'friend', datetime('now')),
  ('seed-rel-creator-reader-b', 'seed-u-reader', 'seed-u-creator', 'friend', datetime('now'));
