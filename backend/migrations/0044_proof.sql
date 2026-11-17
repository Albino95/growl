-- Wave 5: proof of progress (routes/wave3/proofx.ts). Optional, never required for a
-- check-in or a streak. Private by default: the owner sees it; their coach only with
-- an active plan + consent; friends/buddies only when the owner shares it.
-- Media lives in R2 under proof/{userId}/… and is served only via GET /proofs/:id/media.
-- Additive only: older app builds never touch these tables.
CREATE TABLE IF NOT EXISTS proofs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('note', 'timer', 'number', 'photo', 'voice')),
  text TEXT,                                   -- one line (≤ 140)
  number REAL,
  unit TEXT,
  minutes INTEGER,
  duration_s INTEGER,                          -- voice length (≤ 60)
  media_key TEXT,                              -- R2 key, NULL once expired / none
  media_type TEXT,                             -- stored content type
  media_expired_at TEXT,
  context_type TEXT NOT NULL CHECK (context_type IN ('checkin', 'assignment', 'weekly')),
  context_id TEXT NOT NULL,                    -- checkin: local day · assignment: id · weekly: week key
  contract_id TEXT,                            -- coaching plan the proof was shared under (expiry)
  path TEXT,
  day TEXT NOT NULL,                           -- owner's local day when created
  shared_with_coach INTEGER NOT NULL DEFAULT 0,
  shared_with_friends INTEGER NOT NULL DEFAULT 0,
  seen_by_coach_at TEXT,
  points INTEGER NOT NULL DEFAULT 0,           -- bonus awarded (0/1), refunded on delete
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_proofs_user_created ON proofs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proofs_user_day ON proofs(user_id, day);
CREATE INDEX IF NOT EXISTS idx_proofs_context ON proofs(context_type, context_id);
CREATE INDEX IF NOT EXISTS idx_proofs_contract ON proofs(contract_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_proofs_media_key ON proofs(media_key) WHERE media_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proofs_media_live ON proofs(created_at) WHERE media_key IS NOT NULL;

-- Witness: a friend / buddy / coach who can see the proof cheers it (toggle).
CREATE TABLE IF NOT EXISTS proof_cheers (
  proof_id TEXT NOT NULL REFERENCES proofs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (proof_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_proof_cheers_user ON proof_cheers(user_id);
