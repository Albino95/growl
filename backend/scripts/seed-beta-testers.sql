-- Investor / beta testers — email verified (bypass verification).
-- Password for all: GrowlDemo123!
--
--   cd backend && npm run seed:testers:qa
--   cd backend && npm run seed:testers:production   # optional for TestFlight prod API
--
-- Orgesa Agolli · Erald Jaupi · Olisa Shameti

PRAGMA foreign_keys = ON;

INSERT OR REPLACE INTO users (
  id, email, password_hash, points, is_instructor, is_business, metadata,
  email_verified, email_verification_token_hash, email_verification_expires_at,
  created_at, updated_at
) VALUES
  (
    'user_tester_orgesa',
    'orgesa.agolli@growl.app',
    'c6a3adce6cd856fa75127da95f56d4ed862510fc0a1d5078d65f9c66fb90f09a',
    80,
    0,
    0,
    '{"username":"Orgesa Agolli","avatar":"https://randomuser.me/api/portraits/women/65.jpg","bio":"Growing with purpose.","status":"Here for the community.","categories":["fitness:flexibility","mindset:meditation"]}',
    1,
    NULL,
    NULL,
    datetime('now'),
    datetime('now')
  ),
  (
    'user_tester_erald',
    'erald.jaupi@growl.app',
    'c6a3adce6cd856fa75127da95f56d4ed862510fc0a1d5078d65f9c66fb90f09a',
    80,
    0,
    0,
    '{"username":"Erald Jaupi","avatar":"https://randomuser.me/api/portraits/men/41.jpg","bio":"Training and sharing progress.","status":"Consistency over intensity.","categories":["fitness:building-muscle","fitness:cardio"]}',
    1,
    NULL,
    NULL,
    datetime('now'),
    datetime('now')
  ),
  (
    'user_tester_olisa',
    'olisa.shameti@growl.app',
    'c6a3adce6cd856fa75127da95f56d4ed862510fc0a1d5078d65f9c66fb90f09a',
    80,
    0,
    0,
    '{"username":"Olisa Shameti","avatar":"https://randomuser.me/api/portraits/women/22.jpg","bio":"Mindset + movement.","status":"Building better habits.","categories":["mindset:meditation","nutrition:healthy-eating"]}',
    1,
    NULL,
    NULL,
    datetime('now'),
    datetime('now')
  );
