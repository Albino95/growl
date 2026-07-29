-- QA-only App Store / Play review account. Do NOT seed on production.
--
--   cd backend && npm run seed:review:qa
--
-- Email:    review@growl.app
-- Password: GrowlReview123!

PRAGMA foreign_keys = ON;

INSERT OR REPLACE INTO users (
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
  '{"username":"AppReview","categories":["fitness","mindfulness"]}',
  1,
  NULL,
  NULL,
  datetime('now'),
  datetime('now')
);
