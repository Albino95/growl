-- Core demo accounts: consumer, instructor, business (local + remote D1)
--
--   cd backend && npx wrangler d1 execute growl-db --local --file=scripts/seed-demo-core-accounts.sql
--   cd backend && npx wrangler d1 execute growl-db --remote --file=scripts/seed-demo-core-accounts.sql
--
-- Sign-in password (plain over HTTPS):  GrowlDemo123!
-- SHA-256 hex of password (legacy verify path — matches verifyPassword in Workers)

PRAGMA foreign_keys = ON;

-- password_hash = SHA-256 hex of "GrowlDemo123!" (legacy verify path on Worker)

INSERT OR REPLACE INTO users (
  id, email, password_hash, points, is_instructor, is_business, metadata,
  email_verified, email_verification_token_hash, email_verification_expires_at,
  created_at, updated_at
)
VALUES
  (
    'demo-core-user',
    'demo@growl.app',
    'c6a3adce6cd856fa75127da95f56d4ed862510fc0a1d5078d65f9c66fb90f09a',
    120,
    0,
    0,
    '{"username":"Demo User","avatar":"https://randomuser.me/api/portraits/men/32.jpg","bio":"Exploring fitness and mindful growth with the community.","status":"Logging small wins this week.","categories":["fitness:building-muscle","fitness:cardio","fitness:flexibility"]}',
    1,
    NULL,
    NULL,
    datetime('now'),
    datetime('now')
  ),
  (
    'demo-core-instructor',
    'instructor@growl.app',
    'c6a3adce6cd856fa75127da95f56d4ed862510fc0a1d5078d65f9c66fb90f09a',
    350,
    1,
    0,
    '{"username":"Demo Instructor","avatar":"https://randomuser.me/api/portraits/women/44.jpg","bio":"Peer-endorsed instructor. Form, consistency, and calm coaching.","status":"Hosting a form clinic this weekend.","categories":["fitness:building-muscle","mindset:meditation"]}',
    1,
    NULL,
    NULL,
    datetime('now'),
    datetime('now')
  ),
  (
    'demo-core-business',
    'business@growl.app',
    'c6a3adce6cd856fa75127da95f56d4ed862510fc0a1d5078d65f9c66fb90f09a',
    500,
    1,
    1,
    '{"username":"Demo Business","avatar":"https://randomuser.me/api/portraits/men/75.jpg","bio":"Growth gear and community programs for everyday progress.","status":"New arrivals dropping in the shop.","categories":["fitness:building-muscle"],"account_type":"business"}',
    1,
    NULL,
    NULL,
    datetime('now'),
    datetime('now')
  );
