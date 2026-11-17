-- App Store / Play review account (QA + production store binary).
--
--   cd backend && npm run seed:review:qa
--   cd backend && npm run seed:review:production
--
-- Email:    review@growl.app
-- Password: GrowlReview123!
--
-- IMPORTANT: use INSERT OR IGNORE + UPDATE (never INSERT OR REPLACE).
-- REPLACE deletes the row and CASCADE-wipes friendships / engagement.

PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO users (
  id, email, password_hash, points, is_instructor, is_business, metadata,
  email_verified, email_verification_token_hash, email_verification_expires_at,
  created_at, updated_at
) VALUES (
  'user_app_review_qa',
  'review@growl.app',
  '5e634b271896ec777f064d38177dbbd13057e6a6a13e0c8a873bea141c219f77',
  50,
  0,
  0,
  '{"username":"AppReview","avatar":"https://randomuser.me/api/portraits/men/11.jpg","bio":"Apple / Play review account.","status":"Exploring Grow!","categories":["fitness:building-muscle","nutrition:healthy-eating"]}',
  1,
  NULL,
  NULL,
  datetime('now'),
  datetime('now')
);

UPDATE users SET
  email = 'review@growl.app',
  password_hash = '5e634b271896ec777f064d38177dbbd13057e6a6a13e0c8a873bea141c219f77',
  points = 50,
  is_instructor = 0,
  is_business = 0,
  metadata = '{"username":"AppReview","avatar":"https://randomuser.me/api/portraits/men/11.jpg","bio":"Apple / Play review account.","status":"Exploring Grow!","categories":["fitness:building-muscle","nutrition:healthy-eating"]}',
  email_verified = 1,
  email_verification_token_hash = NULL,
  email_verification_expires_at = NULL,
  updated_at = datetime('now')
WHERE id = 'user_app_review_qa';
