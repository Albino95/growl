-- Moderation extensions, appeals, privacy requests (extends existing reports table from 0001)

PRAGMA foreign_keys=OFF;

ALTER TABLE reports ADD COLUMN details TEXT NOT NULL DEFAULT '{}';
ALTER TABLE reports ADD COLUMN workflow_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE reports ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE reports ADD COLUMN assigned_admin_id TEXT;
ALTER TABLE reports ADD COLUMN sla_due_at TEXT;
ALTER TABLE reports ADD COLUMN updated_at TEXT;

UPDATE reports SET workflow_status = COALESCE(status, 'pending'), updated_at = COALESCE(updated_at, created_at) WHERE workflow_status IS NULL OR workflow_status = 'pending';

CREATE TABLE IF NOT EXISTS moderation_actions (
  id TEXT PRIMARY KEY,
  report_id TEXT,
  user_id TEXT NOT NULL,
  admin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason_code TEXT,
  reason_text TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_id) REFERENCES admin_users(id)
);

CREATE TABLE IF NOT EXISTS moderation_appeals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  moderation_action_id TEXT NOT NULL,
  appeal_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'upheld', 'overturned')),
  decided_by_admin_id TEXT,
  decision_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (moderation_action_id) REFERENCES moderation_actions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS privacy_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK(request_type IN ('export', 'delete')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'in_progress', 'completed', 'rejected')),
  assigned_admin_id TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reports_workflow_status ON reports(workflow_status);
CREATE INDEX IF NOT EXISTS idx_reports_priority ON reports(priority);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);
CREATE INDEX IF NOT EXISTS idx_moderation_appeals_status ON moderation_appeals(status);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_status ON privacy_requests(status);

PRAGMA foreign_keys=ON;
