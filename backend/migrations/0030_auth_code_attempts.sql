-- Count wrong guesses against the current email-verification and
-- password-reset codes. After MAX attempts the code is dead until a new one
-- is issued (signup/resend/forgot reset the counter to 0).
ALTER TABLE users ADD COLUMN email_verification_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN password_reset_attempts INTEGER NOT NULL DEFAULT 0;
