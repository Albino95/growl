/**
 * Wave 4 coaching APIs (backend: routes/wave3/coachx.ts, all under /instructor/x/).
 * Session notes (coach only), Today check-in sharing (client consent, default off),
 * and coach feedback on homework. No payments — coaching terms are written only.
 */
import { request } from './http';
import { newIdempotencyKey } from './idempotency';

type Envelope<T> = { success: boolean; data: T };

export type SessionNote = {
  id: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export type CheckinDay = {
  day: string;
  checked_in: boolean;
  mood: number | null;
  rest: boolean;
  followup: 'yes' | 'partly' | 'no' | null;
  intention: string | null;
};

export type CheckinSummary = {
  from: string;
  to: string;
  days: CheckinDay[];
  checked_in_days: number;
  rest_days: number;
  avg_mood: number | null;
  followed_through: number;
};

const contractPath = (id: string) => `/instructor/x/contracts/${encodeURIComponent(id)}`;

export async function listSessionNotes(contractId: string): Promise<SessionNote[]> {
  const res = await request<Envelope<{ notes: SessionNote[] }>>(`${contractPath(contractId)}/notes`);
  return res.data?.notes ?? [];
}

export async function addSessionNote(contractId: string, body: string): Promise<SessionNote> {
  const res = await request<Envelope<{ note: SessionNote }>>(`${contractPath(contractId)}/notes`, {
    method: 'POST',
    body: JSON.stringify({ body }),
    idempotencyKey: newIdempotencyKey(),
  });
  if (!res.data?.note) throw new Error('Could not save note');
  return res.data.note;
}

export async function deleteSessionNote(noteId: string): Promise<void> {
  await request(`/instructor/x/notes/${encodeURIComponent(noteId)}`, { method: 'DELETE' });
}

export async function setCheckinSharing(contractId: string, share: boolean): Promise<boolean> {
  const res = await request<Envelope<{ share_checkins: boolean }>>(
    `${contractPath(contractId)}/sharing`,
    { method: 'PUT', body: JSON.stringify({ share_checkins: share }) }
  );
  return !!res.data?.share_checkins;
}

export async function getCheckinSummary(
  contractId: string
): Promise<{ shared: boolean; summary: CheckinSummary | null }> {
  const res = await request<Envelope<{ shared: boolean; summary: CheckinSummary | null }>>(
    `${contractPath(contractId)}/checkins`
  );
  return { shared: !!res.data?.shared, summary: res.data?.summary ?? null };
}

export async function sendHomeworkFeedback(
  assignmentId: string,
  body: string
): Promise<{ coach_feedback: string; coach_feedback_at: string }> {
  const res = await request<Envelope<{ coach_feedback: string; coach_feedback_at: string }>>(
    `/instructor/x/assignments/${encodeURIComponent(assignmentId)}/feedback`,
    { method: 'POST', body: JSON.stringify({ body }) }
  );
  return res.data;
}
