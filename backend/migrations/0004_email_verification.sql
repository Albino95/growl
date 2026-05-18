-- Email verification + stronger auth metadata on users

ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN email_verification_token_hash TEXT;
ALTER TABLE users ADD COLUMN email_verification_expires_at TEXT;

-- Grandfather accounts that existed before verification columns were added
UPDATE users SET email_verified = 1
WHERE email_verification_token_hash IS NULL OR email_verification_token_hash = '';
