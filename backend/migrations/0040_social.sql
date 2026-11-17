-- Wave 3 social: unsend (soft delete) for direct messages.
-- deleted_at set => body cleared server-side; list returns a { id, deleted: true } placeholder.
ALTER TABLE messages ADD COLUMN deleted_at TEXT;

-- Widget "circle today": friends' check-ins in a recent window, newest first.
CREATE INDEX IF NOT EXISTS idx_checkins_user_created ON daily_checkins(user_id, created_at);
