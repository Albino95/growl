-- Mirror production discoverability for friend accounts on QA only.
-- Password on QA: GrowlDemo123! (not the production password — search/profile only).
--   cd backend && npx wrangler d1 execute growl-db-qa --env qa --remote --file=scripts/seed-qa-mirror-vasi-accounts.sql

PRAGMA foreign_keys = ON;

INSERT OR REPLACE INTO users (
  id, email, password_hash, points, is_instructor, is_business, metadata,
  email_verified, email_verification_token_hash, email_verification_expires_at,
  created_at, updated_at
)
VALUES
  (
    'user_muzm8ofd_xhzvo65',
    'vasianndreu89@gmail.com',
    'c6a3adce6cd856fa75127da95f56d4ed862510fc0a1d5078d65f9c66fb90f09a',
    0,
    0,
    0,
    '{"username":"vasianndreu89","categories":["fitness:losing-weight","mindset","martial-arts:taekwondo"],"engagementHistory":[],"instructorVotes":[],"purchaseHistory":[],"timePreferences":[],"blockedUsers":[],"mutedUsers":[]}',
    1,
    NULL,
    NULL,
    datetime('now'),
    datetime('now')
  ),
  (
    'user_muzm7m37_9nkwp4u',
    'vasianndreu@gmail.com',
    'c6a3adce6cd856fa75127da95f56d4ed862510fc0a1d5078d65f9c66fb90f09a',
    0,
    0,
    0,
    '{"username":"vasianndreu","categories":[],"engagementHistory":[],"instructorVotes":[],"purchaseHistory":[],"timePreferences":[],"blockedUsers":[],"mutedUsers":[]}',
    1,
    NULL,
    NULL,
    datetime('now'),
    datetime('now')
  );
