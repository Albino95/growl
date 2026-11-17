/**
 * Weekly rituals (backend: routes/wave3/weekly.ts, all under /weekly/).
 * Sunday check-in (open Saturday 12:00 → Monday 12:00 local, editable until it
 * closes; shared with an active coach) and the opt-in weekly commitment with 2
 * rest passes (never touches the growth streak). Every getter returns null on 404
 * so the UI simply hides on servers without the feature.
 */
import { request, ApiError } from './http';
import { newIdempotencyKey } from './idempotency';

type Envelope<T> = { success: boolean; data: T };

export type WeeklyQuestionType = 'scale' | 'text' | 'chips';

export type WeeklyQuestion = {
  id: string;
  type: WeeklyQuestionType;
  prompt: string;
  options?: string[];
  allow_text?: boolean;
  low_label?: string;
  high_label?: string;
  coach_only?: boolean;
};

export type WeeklyAnswer = number | string | { chips: string[]; text?: string };
export type WeeklyAnswers = Record<string, WeeklyAnswer>;

export type WeeklyForm = {
  source: 'default' | 'coach';
  coach: { id: string; username: string } | null;
  questions: WeeklyQuestion[];
};

export type WeeklyWindow = {
  open: boolean;
  week: string;
  week_start: string;
  opens_on: string;
  closes_on: string;
  latest_week: string;
};

export type WeeklyCheckin = {
  id: string;
  user_id: string;
  week: string;
  week_start: string;
  form_source: 'default' | 'coach';
  coach_id: string | null;
  questions: WeeklyQuestion[];
  answers: WeeklyAnswers;
  shared_with_coach: boolean;
  editable: boolean;
  submitted_at: string;
  updated_at: string;
};

export type WeeklyCurrent = {
  window: WeeklyWindow;
  form: WeeklyForm;
  checkin: WeeklyCheckin | null;
  has_coach: boolean;
};

export type CommitmentDayStatus = 'active' | 'pass' | 'today' | 'future' | 'open';

export type WeeklyCommitment = {
  id: string;
  week: string;
  week_start: string;
  target_days: number;
  passes_total: number;
  passes_used: number;
  pass_days: string[];
  active_days: number;
  covered: number;
  remaining: number;
  reachable: boolean;
  status: 'active' | 'kept' | 'partly';
  points_awarded: number;
  settled_at: string | null;
  days: Array<{ day: string; status: CommitmentDayStatus }>;
};

export type WeeklyCommitmentState = {
  week: string;
  week_start: string;
  today: string;
  commitment: WeeklyCommitment | null;
  last_result: WeeklyCommitment | null;
};

export const COMMITMENT_MIN = 3;
export const COMMITMENT_MAX = 7;

/** null when the server doesn't have the weekly module (404). */
export async function getWeeklyCurrent(): Promise<WeeklyCurrent | null> {
  try {
    const res = await request<Envelope<WeeklyCurrent>>('/weekly/current');
    const d = res?.data;
    if (!d || !d.window || !d.form) return null;
    return {
      window: d.window,
      form: { ...d.form, questions: Array.isArray(d.form.questions) ? d.form.questions : [] },
      checkin: d.checkin ?? null,
      has_coach: !!d.has_coach,
    };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export async function submitWeeklyCheckin(
  week: string,
  answers: WeeklyAnswers,
  idempotencyKey: string = newIdempotencyKey()
): Promise<{ checkin: WeeklyCheckin; created: boolean }> {
  const res = await request<Envelope<{ checkin: WeeklyCheckin; created: boolean }>>('/weekly/checkins', {
    method: 'POST',
    body: JSON.stringify({ week, answers }),
    idempotencyKey,
  });
  if (!res.data?.checkin) throw new Error('Could not save your week');
  return res.data;
}

/** Own history, or a client's shared answers when you're their active coach. */
export async function listWeeklyCheckins(
  opts: { userId?: string; week?: string; limit?: number } = {}
): Promise<WeeklyCheckin[]> {
  const q = new URLSearchParams();
  if (opts.userId) q.set('user_id', opts.userId);
  if (opts.week) q.set('week', opts.week);
  if (opts.limit) q.set('limit', String(opts.limit));
  const qs = q.toString();
  const res = await request<Envelope<{ checkins: WeeklyCheckin[] }>>(`/weekly/checkins${qs ? `?${qs}` : ''}`);
  return res.data?.checkins ?? [];
}

export type WeeklyFormState = {
  form: WeeklyForm;
  my_form: WeeklyQuestion[] | null;
  default_questions: WeeklyQuestion[];
  is_coach: boolean;
  max_questions: number;
};

export async function getWeeklyForm(): Promise<WeeklyFormState | null> {
  try {
    const res = await request<Envelope<WeeklyFormState>>('/weekly/form');
    return res.data ?? null;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** Coach: save up to 5 custom questions for clients (empty list = back to default). */
export async function saveWeeklyForm(
  questions: Array<Omit<WeeklyQuestion, 'id' | 'coach_only'> & { id?: string }>
): Promise<WeeklyQuestion[] | null> {
  const res = await request<Envelope<{ my_form: WeeklyQuestion[] | null }>>('/weekly/form', {
    method: 'PUT',
    body: JSON.stringify({ questions }),
  });
  return res.data?.my_form ?? null;
}

// ---------------------------------------------------------------------------
// Commitment

export async function getWeeklyCommitment(): Promise<WeeklyCommitmentState | null> {
  try {
    const res = await request<Envelope<WeeklyCommitmentState>>('/weekly/commitment');
    const d = res?.data;
    if (!d || typeof d.week !== 'string') return null;
    return { ...d, commitment: d.commitment ?? null, last_result: d.last_result ?? null };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export async function setWeeklyCommitment(targetDays: number): Promise<WeeklyCommitment> {
  const res = await request<Envelope<{ commitment: WeeklyCommitment | null }>>('/weekly/commitment', {
    method: 'PUT',
    body: JSON.stringify({ target_days: targetDays }),
  });
  if (!res.data?.commitment) throw new Error('Could not set your goal');
  return res.data.commitment;
}

export async function removeWeeklyCommitment(): Promise<void> {
  await request('/weekly/commitment', { method: 'DELETE' });
}

export async function applyRestPass(day: string): Promise<WeeklyCommitment> {
  const res = await request<Envelope<{ commitment: WeeklyCommitment }>>('/weekly/commitment/pass', {
    method: 'POST',
    body: JSON.stringify({ day }),
  });
  return res.data.commitment;
}

export async function undoRestPass(day: string): Promise<WeeklyCommitment> {
  const res = await request<Envelope<{ commitment: WeeklyCommitment }>>(
    `/weekly/commitment/pass/${encodeURIComponent(day)}`,
    { method: 'DELETE' }
  );
  return res.data.commitment;
}

export async function listWeeklyCommitments(limit = 8): Promise<WeeklyCommitment[]> {
  const res = await request<Envelope<{ commitments: WeeklyCommitment[] }>>(`/weekly/commitments?limit=${limit}`);
  return res.data?.commitments ?? [];
}
