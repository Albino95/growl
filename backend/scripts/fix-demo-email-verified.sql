-- Mark all seeded demo emails as verified (safe to re-run)
UPDATE users SET email_verified = 1, email_verification_token_hash = NULL, email_verification_expires_at = NULL
WHERE email LIKE '%@growl.seed' OR email IN ('demo@growl.app', 'instructor@growl.app', 'business@growl.app');
