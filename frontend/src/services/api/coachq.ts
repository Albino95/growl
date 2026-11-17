/**
 * Wave 5 coach supervision APIs (backend: routes/wave3/coachq.ts, all under /instructor/x/).
 * Attention queue, batch review, saved quick replies, Monday email setting, and the
 * homework proof request. Every call degrades to `null` on 404 so older backends just
 * hide the feature.
 */
import { ApiError, request } from './http';
import { newIdempotencyKey } from './idempotency';
import { createConversation, sendMessage } from './messages';
import type { Proof, ProofKind } from './proofs';
import type { CoachingAssignment } from './instructor';

type Envelope<T> = { success: boolean; data: T };

export type QueueStatus = 'red' | 'amber' | 'green';
export type QueueSegment = QueueStatus | 'wins';

export type QueueReason = { code: string; label: string; snoozed?: boolean };
export type QueueWin = { code: string; label: string };

export type QueuePerson = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type QueueWeek = {
  days_checked_in: number | null;
  mood_avg: number | null;
  mood_trend: 'up' | 'down' | 'flat' | null;
  yes_rate: number | null;
  proofs: number;
  homework_done: number;
  homework_overdue: number;
};

export type QueueClient = {
  contract_id: string;
  client: QueuePerson;
  status: QueueStatus;
  reasons: QueueReason[];
  wins: QueueWin[];
  week: QueueWeek;
  last_contact_at: string | null;
  handled_until: string | null;
  override?: { status: QueueStatus; reason: string; until: string };
  recent_proofs?: Proof[];
};

export type CoachQueue = {
  generated_at: string;
  counts: { red: number; amber: number; green: number; wins: number };
  active_clients?: number;
  est_weekly_minutes?: number;
  clients: QueueClient[];
};

export type ReviewItem = {
  id: string;
  type: 'homework' | 'proof';
  contract_id: string;
  client: QueuePerson;
  created_at: string;
  homework?: {
    id: string;
    title: string;
    completed_at: string | null;
    due_at: string | null;
    proof_kind: HomeworkProofKind | null;
    note: string | null;
    photo_url: string | null;
  };
  proofs: Proof[];
};

/** What the coach can ask for when assigning homework. */
export type HomeworkProofKind = ProofKind;
export const HOMEWORK_PROOF_OPTIONS: Array<{ key: HomeworkProofKind | 'none'; label: string; icon: string }> = [
  { key: 'none', label: 'None', icon: 'remove-circle-outline' },
  { key: 'photo', label: 'Photo', icon: 'camera-outline' },
  { key: 'timer', label: 'Timer', icon: 'timer-outline' },
  { key: 'number', label: 'Number', icon: 'stats-chart-outline' },
  { key: 'note', label: 'Note', icon: 'create-outline' },
  { key: 'voice', label: 'Voice', icon: 'mic-outline' },
];

/** Assignment as returned once the backend knows about proof requests. */
export type AssignmentWithProof = CoachingAssignment & {
  proof_kind?: HomeworkProofKind | null;
  proofs?: Proof[];
};

const BASE = '/instructor/x';

function isMissing(e: unknown): boolean {
  return e instanceof ApiError && e.status === 404;
}

/** null when the backend has no queue yet (feature hidden). */
export async function getCoachQueue(): Promise<CoachQueue | null> {
  try {
    const res = await request<Envelope<CoachQueue>>(`${BASE}/queue`);
    return res.data ?? null;
  } catch (e) {
    if (isMissing(e)) return null;
    throw e;
  }
}

export async function markQueueHandled(contractId: string, days = 7): Promise<string | null> {
  const res = await request<Envelope<{ handled_until: string | null }>>(
    `${BASE}/queue/${encodeURIComponent(contractId)}/handled`,
    { method: 'POST', body: JSON.stringify({ days }) }
  );
  return res.data?.handled_until ?? null;
}

export async function setQueueOverride(
  contractId: string,
  status: QueueStatus | null,
  reason = ''
): Promise<void> {
  await request(`${BASE}/queue/${encodeURIComponent(contractId)}/override`, {
    method: 'POST',
    body: JSON.stringify({ status, reason }),
  });
}

export async function getReviewItems(): Promise<{ items: ReviewItem[]; total: number } | null> {
  try {
    const res = await request<Envelope<{ items: ReviewItem[]; total: number }>>(`${BASE}/review`);
    return res.data ?? { items: [], total: 0 };
  } catch (e) {
    if (isMissing(e)) return null;
    throw e;
  }
}

export async function getReplyTemplates(): Promise<string[]> {
  try {
    const res = await request<Envelope<{ templates: string[] }>>(`${BASE}/templates`);
    return res.data?.templates ?? [];
  } catch (e) {
    if (isMissing(e)) return [];
    throw e;
  }
}

export async function saveReplyTemplates(templates: string[]): Promise<string[]> {
  const res = await request<Envelope<{ templates: string[] }>>(`${BASE}/templates`, {
    method: 'PUT',
    body: JSON.stringify({ templates }),
  });
  return res.data?.templates ?? templates;
}

export async function getCoachSettings(): Promise<{ email_digest: boolean } | null> {
  try {
    const res = await request<Envelope<{ email_digest: boolean }>>(`${BASE}/settings`);
    return { email_digest: !!res.data?.email_digest };
  } catch (e) {
    if (isMissing(e)) return null;
    throw e;
  }
}

export async function setCoachEmailDigest(on: boolean): Promise<boolean> {
  const res = await request<Envelope<{ email_digest: boolean }>>(`${BASE}/settings`, {
    method: 'PUT',
    body: JSON.stringify({ email_digest: on }),
  });
  return !!res.data?.email_digest;
}

/** Send a quick reply to a client as a normal DM (opens the conversation if needed). */
export async function sendQuickDm(userId: string, body: string): Promise<string> {
  const conv = await createConversation(userId);
  const id = conv.data.conversation.id;
  await sendMessage(id, body, { idempotencyKey: newIdempotencyKey() });
  return id;
}
