-- Per-user last-read timestamps for conversation unread.

ALTER TABLE conversations ADD COLUMN user_a_last_read_at TEXT;
ALTER TABLE conversations ADD COLUMN user_b_last_read_at TEXT;
