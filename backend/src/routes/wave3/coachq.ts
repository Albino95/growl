import type { Env } from '../../types';
import { json, error } from '../../utils/response';
import { getRequestContext } from '../../utils/auth';
import { createUserNotification } from '../../utils/notifications';
import { buildBrandedEmailHtml } from '../../utils/emailTemplates';
import { addDays, diffDays, isoWeek, localDay, parseDbTimestamp, safeTimeZone } from '../../utils/days';
import { formatProof, PROOF_KINDS, type Proof, type ProofKind, type ProofRow } from './proofx';

/**
 * Wave 5 coach supervision (coachq). All paths under `{api}/instructor/x/…`:
 *
 *   GET  /instructor/x/queue                         → attention queue over ACTIVE contracts
 *   POST /instructor/x/queue/:contractId/handled     → { days?: 7 } snooze current reasons (0 clears)
 *   POST /instructor/x/queue/:contractId/override    → { status: red|amber|green|null, reason } (7 days)
 *   GET  /instructor/x/review                        → finished homework without feedback + unseen proofs
 *   GET  /instructor/x/templates                     → { templates } saved quick replies
 *   PUT  /instructor/x/templates                     → { templates: string[] } (max 20)
 *   GET  /instructor/x/settings                      → { email_digest }
 *   PUT  /instructor/x/settings                      → { email_digest: boolean }
 *
 * Signals use only what the client shares: check-in based signals need share_checkins=1;
 * homework and assignment proofs are always visible to the coach of that plan.
 * Wording stays neutral — never medical, never "failed".
 *
 * runCron (hourly): Monday 07:00+ local → coach summary + client weekly recap (idempotent).
 */

// ---------------------------------------------------------------------------
// Constants

export const TEMPLATES_MAX = 20;
export const TEMPLATE_LEN = 200;
export const OVERRIDE_DAYS = 7;
export const STREAK_MILESTONES = [7, 14, 21, 30, 50, 75, 100, 150, 200, 365];
const DEFAULT_TEMPLATES = [
  'Great work this week!',
  'Love the consistency 👏',
  'Great form!',
  'Proud of you for showing up.',
  'Let’s adjust next week — what got in the way?',
];
/** D1 allows 100 bound params; keep IN-lists well under it. */
const IN_CHUNK = 90;
const MS_DAY = 86_400_000;

export type QueueStatus = 'red' | 'amber' | 'green';
export type Reason = { code: string; label: string; snoozed?: boolean };

/** Normalise a requested proof kind from the client ('none'/''/null → null). */
export function parseProofKind(raw: unknown): ProofKind | null | 'invalid' {
  if (raw == null || raw === '' || raw === 'none') return null;
  if (typeof raw === 'string' && (PROOF_KINDS as readonly string[]).includes(raw)) return raw as ProofKind;
  return 'invalid';
}

// ---------------------------------------------------------------------------
// Pure signal computation

export type SignalCheckin = { day: string; mood: number | null; followup: string | null };
export type SignalAssignment = {
  id: string;
  title: string | null;
  due_at: string | null;
  status: string;
  completed_at: string | null;
  proof_kind: string | null;
  coach_feedback_at: string | null;
};
export type SignalProof = { id: string; context_type: string; context_id: string; created_at: string };

export type SignalInput = {
  now: Date;
  /** Client's local day (YYYY-MM-DD). */
  today: string;
  share_checkins: boolean;
  /** Check-ins of the last ~28 days (ignored when share_checkins is false). */
  checkins: SignalCheckin[];
  assignments: SignalAssignment[];
  /** Proofs the coach may see (already filtered by consent / contract). */
  proofs: SignalProof[];
  /** Earliest proof the coach could ever see from this client. */
  first_proof_at: string | null;
  streak_current: number | null;
  contract: { started_at: string; ends_at: string; weeks: number };
  /** Latest message between coach and client, if any. */
  last_message: { from: 'client' | 'coach'; at: string } | null;
  last_coach_message_at: string | null;
};

export type WeekStats = {
  days_checked_in: number | null;
  mood_avg: number | null;
  mood_trend: 'up' | 'down' | 'flat' | null;
  yes_rate: number | null;
  proofs: number;
  homework_done: number;
  homework_overdue: number;
};

export type Signals = {
  status: QueueStatus;
  reasons: Reason[];
  wins: Array<{ code: string; label: string }>;
  week: WeekStats;
  last_contact_at: string | null;
};

const RED_CODES = new Set(['no_checkins', 'mood_lower', 'low_moods', 'homework_overdue', 'dm_unanswered']);

function avg(nums: number[]): number | null {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}
function round1(n: number | null): number | null {
  return n == null ? null : Math.round(n * 10) / 10;
}
function ms(ts: string | null | undefined): number | null {
  const d = parseDbTimestamp(ts);
  return d ? d.getTime() : null;
}
function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function statusForReasons(reasons: Reason[]): QueueStatus {
  const live = reasons.filter((r) => !r.snoozed);
  if (live.some((r) => RED_CODES.has(r.code))) return 'red';
  return live.length ? 'amber' : 'green';
}

/** Pure: everything the queue says about one client this week. */
export function computeSignals(input: SignalInput): Signals {
  const { now, today } = input;
  const nowMs = now.getTime();
  const weekAgoMs = nowMs - 7 * MS_DAY;
  const reasons: Reason[] = [];
  const wins: Array<{ code: string; label: string }> = [];

  // --- Check-in signals (consent only) -----------------------------------
  let daysChecked: number | null = null;
  let moodAvg7: number | null = null;
  let moodTrend: WeekStats['mood_trend'] = null;
  let yesRate: number | null = null;
  if (input.share_checkins) {
    const from7 = addDays(today, -6);
    const from28 = addDays(today, -27);
    const rows = input.checkins.filter((c) => c.day >= from28 && c.day <= today);
    const week = rows.filter((c) => c.day >= from7);
    daysChecked = new Set(week.map((c) => c.day)).size;

    // Usually checks in (≥4 of the 14 days before the gap) but nothing for 3+ days.
    const gapFrom = addDays(today, -2);
    const inGap = rows.some((c) => c.day >= gapFrom);
    if (!inGap) {
      const baseFrom = addDays(today, -16);
      const baseTo = addDays(today, -3);
      const baseline = new Set(rows.filter((c) => c.day >= baseFrom && c.day <= baseTo).map((c) => c.day)).size;
      if (baseline >= 4) {
        const last = rows.reduce<string | null>((m, c) => (!m || c.day > m ? c.day : m), null);
        const gap = last ? diffDays(last, today) : 3;
        reasons.push({ code: 'no_checkins', label: `No check-in for ${plural(Math.max(3, gap), 'day')}` });
      }
    }

    const moods7 = week.filter((c) => c.mood != null).map((c) => Number(c.mood));
    const moods28 = rows.filter((c) => c.mood != null).map((c) => Number(c.mood));
    moodAvg7 = avg(moods7);
    const moodAvg28 = avg(moods28);
    let moodFlagged = false;
    if (moodAvg7 != null && moodAvg28 != null && moods7.length >= 3 && moods28.length >= 7) {
      if (moodAvg7 <= moodAvg28 - 1) {
        reasons.push({ code: 'mood_lower', label: 'Mood’s been lower this week' });
        moodFlagged = true;
      }
    }
    if (moodAvg7 != null && moodAvg28 != null && moods7.length >= 2 && moods28.length >= 5) {
      const d = moodAvg7 - moodAvg28;
      moodTrend = d >= 0.3 ? 'up' : d <= -0.3 ? 'down' : 'flat';
    }
    // Three low moods in a row (most recent mood entries, within the week).
    const recent = week
      .filter((c) => c.mood != null)
      .sort((a, b) => (a.day < b.day ? 1 : -1))
      .slice(0, 3);
    if (!moodFlagged && recent.length === 3 && recent.every((c) => Number(c.mood) <= 2)) {
      reasons.push({ code: 'low_moods', label: 'A few harder days in a row' });
    }

    const answers = week.filter((c) => c.followup === 'yes' || c.followup === 'partly' || c.followup === 'no');
    if (answers.length) {
      // "Partly counts" — half credit, never zero.
      const score = answers.reduce((s, c) => s + (c.followup === 'yes' ? 1 : c.followup === 'partly' ? 0.5 : 0), 0);
      yesRate = Math.round((score / answers.length) * 100) / 100;
      if (answers.length >= 3 && yesRate < 0.5) {
        reasons.push({ code: 'low_follow_through', label: 'Follow-through under half this week' });
      }
    }

    const streak = Number(input.streak_current) || 0;
    const milestone = [...STREAK_MILESTONES].reverse().find((m) => m <= streak && m > streak - 7);
    if (milestone) wins.push({ code: 'streak', label: `${milestone}-day streak` });
  }

  // --- Homework -----------------------------------------------------------
  const proofByAssignment = new Set(
    input.proofs.filter((p) => p.context_type === 'assignment').map((p) => p.context_id)
  );
  let overdueCount = 0;
  let maxOverdue = 0;
  let homeworkDone = 0;
  let missingProof = 0;
  for (const a of input.assignments) {
    if (a.status === 'assigned' && a.due_at) {
      const due = String(a.due_at).slice(0, 10);
      const late = diffDays(due, today);
      if (late >= 1) overdueCount++;
      if (late >= 2) maxOverdue = Math.max(maxOverdue, late);
    }
    const doneMs = a.status === 'done' ? ms(a.completed_at) : null;
    if (doneMs != null && doneMs >= weekAgoMs) {
      homeworkDone++;
      if (a.proof_kind && !proofByAssignment.has(a.id)) missingProof++;
    }
  }
  if (maxOverdue >= 2) {
    reasons.push({ code: 'homework_overdue', label: `Homework ${plural(maxOverdue, 'day')} overdue` });
  }
  if (missingProof) {
    reasons.push({
      code: 'proof_missing',
      label: missingProof === 1 ? 'Homework done without the proof you asked for' : `${missingProof} homework done without proof`,
    });
  }

  // --- Messages / contact -------------------------------------------------
  const lastMsgMs = input.last_message ? ms(input.last_message.at) : null;
  if (input.last_message?.from === 'client' && lastMsgMs != null && nowMs - lastMsgMs >= 48 * 3600_000) {
    reasons.push({ code: 'dm_unanswered', label: 'Message waiting for your reply' });
  }
  const feedbackMs = input.assignments
    .map((a) => ms(a.coach_feedback_at))
    .filter((x): x is number => x != null);
  const contactCandidates = [ms(input.last_coach_message_at), ...feedbackMs].filter(
    (x): x is number => x != null
  );
  const lastContactMs = contactCandidates.length ? Math.max(...contactCandidates) : null;
  const startedMs = ms(input.contract.started_at) ?? nowMs;
  if (nowMs - startedMs >= 7 * MS_DAY && (lastContactMs == null || nowMs - lastContactMs >= 7 * MS_DAY)) {
    const days = lastContactMs == null ? null : Math.floor((nowMs - lastContactMs) / MS_DAY);
    reasons.push({
      code: 'no_contact',
      label: days == null ? 'No contact from you yet' : `No contact for ${plural(days, 'day')}`,
    });
  }

  // --- Plan timing --------------------------------------------------------
  const endsMs = ms(input.contract.ends_at);
  if (endsMs != null) {
    const left = Math.ceil((endsMs - nowMs) / MS_DAY);
    if (left <= 0) reasons.push({ code: 'plan_ending', label: 'Plan has ended — time to wrap up' });
    else if (left <= 7) reasons.push({ code: 'plan_ending', label: `Plan ends in ${plural(left, 'day')}` });
  }

  // --- Proofs & wins ------------------------------------------------------
  const weekProofs = input.proofs.filter((p) => (ms(p.created_at) ?? 0) >= weekAgoMs);
  const firstMs = ms(input.first_proof_at);
  if (firstMs != null && firstMs >= weekAgoMs) wins.push({ code: 'first_proof', label: 'First proof shared' });

  const weeksIn = Math.floor((nowMs - startedMs) / (7 * MS_DAY));
  const weeksTotal = Math.max(1, Number(input.contract.weeks) || 1);
  if (weeksIn >= 1 && weeksIn <= weeksTotal) {
    // Only celebrate a week with something in it.
    const engaged = homeworkDone > 0 || weekProofs.length > 0 || (daysChecked ?? 0) >= 4;
    if (engaged) wins.push({ code: 'plan_week', label: `Finished week ${weeksIn} of ${weeksTotal}` });
  }

  return {
    status: statusForReasons(reasons),
    reasons,
    wins,
    week: {
      days_checked_in: daysChecked,
      mood_avg: round1(moodAvg7),
      mood_trend: moodTrend,
      yes_rate: yesRate,
      proofs: weekProofs.length,
      homework_done: homeworkDone,
      homework_overdue: overdueCount,
    },
    last_contact_at: lastContactMs == null ? null : new Date(lastContactMs).toISOString(),
  };
}

export type QueueMark = {
  handled_until: string | null;
  handled_codes: string | null;
  override_status: string | null;
  override_reason: string | null;
  override_until: string | null;
};

/** Pure: apply the coach's "Handled" snooze and status override (both expire). */
export function applyMark(
  s: Signals,
  mark: QueueMark | null,
  now: Date
): Signals & { handled_until: string | null; override?: { status: QueueStatus; reason: string; until: string } } {
  const nowMs = now.getTime();
  let reasons = s.reasons;
  let handledUntil: string | null = null;
  if (mark?.handled_until && (ms(mark.handled_until) ?? 0) > nowMs) {
    handledUntil = mark.handled_until;
    let codes: string[] = [];
    try {
      const parsed = JSON.parse(mark.handled_codes || '[]');
      if (Array.isArray(parsed)) codes = parsed.map(String);
    } catch {
      codes = [];
    }
    // Reasons present when handled stay quiet; anything new still surfaces.
    reasons = reasons.map((r) => (codes.includes(r.code) ? { ...r, snoozed: true } : r));
  }
  let status = statusForReasons(reasons);
  let override: { status: QueueStatus; reason: string; until: string } | undefined;
  if (
    mark?.override_status &&
    mark.override_until &&
    (ms(mark.override_until) ?? 0) > nowMs &&
    ['red', 'amber', 'green'].includes(mark.override_status)
  ) {
    status = mark.override_status as QueueStatus;
    override = { status, reason: mark.override_reason || '', until: mark.override_until };
  }
  return { ...s, reasons, status, handled_until: handledUntil, ...(override ? { override } : {}) };
}

/** Rough coach minutes per week to work this queue (red 10, amber 5, green 2, wins 1). */
export function estimateWeeklyMinutes(counts: { red: number; amber: number; green: number; wins: number }): number {
  return Math.round(counts.red * 10 + counts.amber * 5 + counts.green * 2 + counts.wins * 1);
}

// ---------------------------------------------------------------------------
// Data loading

type Person = { id: string; username: string; display_name: string | null; avatar_url: string | null };

function personFromMeta(id: string, metadata: string | null | undefined): Person {
  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(metadata || '{}') as Record<string, unknown>;
  } catch {
    meta = {};
  }
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return {
    id,
    username: str(meta.username) || 'User',
    display_name: str(meta.display_name) || str(meta.name) || str(meta.full_name),
    avatar_url: str(meta.avatar_url) || str(meta.avatar),
  };
}

function chunks<T>(items: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
function qs(n: number): string {
  return Array(n).fill('?').join(',');
}

async function allChunked<R>(
  env: Env,
  ids: string[],
  build: (placeholders: string) => string,
  pre: unknown[] = [],
  post: unknown[] = [],
  size = IN_CHUNK
): Promise<R[]> {
  const out: R[] = [];
  for (const part of chunks(ids, size)) {
    const res = await env.DB.prepare(build(qs(part.length)))
      .bind(...pre, ...part, ...post)
      .all<R>();
    out.push(...((res.results || []) as R[]));
  }
  return out;
}

type ContractRow = {
  id: string;
  client_id: string;
  share_checkins: number | null;
  started_at: string;
  ends_at: string;
  weeks: number;
  metadata: string | null;
  timezone: string | null;
};

type AssignmentRow = SignalAssignment & {
  contract_id: string;
  seed_id: string;
  created_at: string;
  coach_feedback: string | null;
};

const PROOF_COLS = `id, user_id, kind, text, number, unit, minutes, duration_s, media_key, media_type,
  media_expired_at, context_type, context_id, contract_id, path, day, shared_with_coach, shared_with_friends,
  seen_by_coach_at, points, created_at`;

export type ProofOut = Proof;

/** Absolute API base (origin + /api/v1) for proof media links. */
export function apiBaseFor(request: Request, apiPrefix: string): string {
  try {
    return `${new URL(request.url).origin}${apiPrefix}`;
  } catch {
    return apiPrefix;
  }
}

/**
 * Assignment proofs grouped by assignment id. `coachView` keeps only proofs the client
 * shared with the coach (same rule as GET /proofs/:id/media). Empty if no proofs table.
 */
export async function loadAssignmentProofs(
  env: Env,
  assignmentIds: string[],
  apiBase: string,
  coachView = false
): Promise<Map<string, ProofOut[]>> {
  const out = new Map<string, ProofOut[]>();
  if (!assignmentIds.length) return out;
  try {
    const rows = await allChunked<ProofRow>(
      env,
      assignmentIds,
      (ph) =>
        `SELECT ${PROOF_COLS} FROM proofs WHERE context_type = 'assignment' AND context_id IN (${ph})
         ${coachView ? 'AND shared_with_coach = 1' : ''} ORDER BY created_at ASC`
    );
    for (const r of rows) {
      const list = out.get(r.context_id) || [];
      list.push(formatProof(r, apiBase));
      out.set(r.context_id, list);
    }
  } catch {
    /* proofs (migration 0044) not applied yet */
  }
  return out;
}

/**
 * Coach may see a proof the client shared with them: assignment proofs of this plan,
 * other proofs only while check-in sharing is on (mirrors proofx.proofAccess).
 */
function coachCanSee(p: ProofRow, shareCheckins: boolean, assignmentIds: Set<string>): boolean {
  if (!Number(p.shared_with_coach)) return false;
  if (p.context_type === 'assignment') return assignmentIds.has(p.context_id);
  return shareCheckins;
}

async function loadActiveContracts(env: Env, coachId: string): Promise<ContractRow[]> {
  const res = await env.DB.prepare(
    `SELECT c.id, c.client_id, c.share_checkins, c.started_at, c.ends_at, c.weeks, u.metadata, u.timezone
     FROM coaching_contracts c JOIN users u ON u.id = c.client_id
     WHERE c.instructor_id = ? AND c.status = 'active'
     ORDER BY c.started_at ASC`
  )
    .bind(coachId)
    .all<ContractRow>();
  return res.results || [];
}

export type QueueClient = {
  contract_id: string;
  client: Person;
  status: QueueStatus;
  reasons: Reason[];
  wins: Array<{ code: string; label: string }>;
  week: WeekStats;
  last_contact_at: string | null;
  handled_until: string | null;
  override?: { status: QueueStatus; reason: string; until: string };
  recent_proofs: ProofOut[];
};

export type Queue = {
  generated_at: string;
  counts: { red: number; amber: number; green: number; wins: number };
  active_clients: number;
  est_weekly_minutes: number;
  clients: QueueClient[];
};

/** Build the attention queue for one coach (chunked; ≤100 params per statement). */
export async function buildQueue(env: Env, coachId: string, now: Date, apiBase: string): Promise<Queue> {
  const contracts = await loadActiveContracts(env, coachId);
  const empty: Queue = {
    generated_at: now.toISOString(),
    counts: { red: 0, amber: 0, green: 0, wins: 0 },
    active_clients: 0,
    est_weekly_minutes: 0,
    clients: [],
  };
  if (!contracts.length) return empty;

  const contractIds = contracts.map((c) => c.id);
  const clientIds = [...new Set(contracts.map((c) => c.client_id))];
  const sharedClientIds = [...new Set(contracts.filter((c) => c.share_checkins).map((c) => c.client_id))];
  const sinceDay = addDays(now.toISOString().slice(0, 10), -29);
  const since28 = new Date(now.getTime() - 28 * MS_DAY).toISOString();

  const checkins = sharedClientIds.length
    ? await allChunked<SignalCheckin & { user_id: string }>(
        env,
        sharedClientIds,
        (ph) => `SELECT user_id, day, mood, followup FROM daily_checkins WHERE user_id IN (${ph}) AND day >= ?`,
        [],
        [sinceDay]
      )
    : [];

  const assignments = await allChunked<AssignmentRow>(
    env,
    contractIds,
    (ph) =>
      `SELECT id, contract_id, seed_id, title, due_at, status, completed_at, proof_kind, coach_feedback,
              coach_feedback_at, created_at
       FROM coaching_assignments WHERE contract_id IN (${ph})`
  );

  let proofs: ProofRow[] = [];
  const firstProof = new Map<string, string>();
  try {
    proofs = await allChunked<ProofRow>(
      env,
      clientIds,
      (ph) =>
        `SELECT ${PROOF_COLS} FROM proofs WHERE user_id IN (${ph}) AND created_at >= ? ORDER BY created_at DESC`,
      [],
      [since28]
    );
    const firsts = await allChunked<{ user_id: string; first_at: string }>(
      env,
      clientIds,
      (ph) =>
        `SELECT user_id, MIN(created_at) AS first_at FROM proofs
         WHERE user_id IN (${ph}) AND shared_with_coach = 1
         GROUP BY user_id`
    );
    for (const f of firsts) firstProof.set(f.user_id, f.first_at);
  } catch {
    /* proofs (migration 0044) not applied yet */
  }

  // Conversations between this coach and each client (coach id bound twice → chunk 45).
  const convByClient = new Map<string, string>();
  for (const part of chunks(clientIds, 45)) {
    const p = qs(part.length);
    const res = await env.DB.prepare(
      `SELECT id, user_a, user_b FROM conversations
       WHERE (user_a = ? AND user_b IN (${p})) OR (user_b = ? AND user_a IN (${p}))`
    )
      .bind(coachId, ...part, coachId, ...part)
      .all<{ id: string; user_a: string; user_b: string }>();
    for (const r of res.results || []) convByClient.set(r.user_a === coachId ? r.user_b : r.user_a, r.id);
  }
  const convIds = [...convByClient.values()];
  const lastMsg = new Map<string, { sender_id: string; created_at: string }>();
  const lastCoachMsg = new Map<string, string>();
  if (convIds.length) {
    const latest = await allChunked<{ conversation_id: string; sender_id: string; created_at: string }>(
      env,
      convIds,
      (ph) =>
        `SELECT m.conversation_id, m.sender_id, m.created_at FROM messages m
         WHERE m.conversation_id IN (${ph}) AND m.deleted_at IS NULL
           AND m.created_at = (SELECT MAX(m2.created_at) FROM messages m2
                               WHERE m2.conversation_id = m.conversation_id AND m2.deleted_at IS NULL)`
    );
    for (const r of latest) lastMsg.set(r.conversation_id, r);
    const coachLatest = await allChunked<{ conversation_id: string; at: string }>(
      env,
      convIds,
      (ph) =>
        `SELECT conversation_id, MAX(created_at) AS at FROM messages
         WHERE conversation_id IN (${ph}) AND sender_id = ? AND deleted_at IS NULL
         GROUP BY conversation_id`,
      [],
      [coachId]
    );
    for (const r of coachLatest) lastCoachMsg.set(r.conversation_id, r.at);
  }

  const streaks = new Map<string, number>();
  if (sharedClientIds.length) {
    const rows = await allChunked<{ user_id: string; current: number }>(
      env,
      sharedClientIds,
      (ph) => `SELECT user_id, current FROM user_streaks WHERE user_id IN (${ph})`
    );
    for (const r of rows) streaks.set(r.user_id, Number(r.current) || 0);
  }

  const marksRes = await env.DB.prepare(
    `SELECT contract_id, handled_until, handled_codes, override_status, override_reason, override_until
     FROM coach_queue_marks WHERE instructor_id = ?`
  )
    .bind(coachId)
    .all<QueueMark & { contract_id: string }>();
  const marks = new Map((marksRes.results || []).map((m) => [m.contract_id, m]));

  const checkinsBy = new Map<string, SignalCheckin[]>();
  for (const c of checkins) {
    const list = checkinsBy.get(c.user_id) || [];
    list.push(c);
    checkinsBy.set(c.user_id, list);
  }
  const assignmentsBy = new Map<string, AssignmentRow[]>();
  for (const a of assignments) {
    const list = assignmentsBy.get(a.contract_id) || [];
    list.push(a);
    assignmentsBy.set(a.contract_id, list);
  }
  const proofsBy = new Map<string, ProofRow[]>();
  for (const p of proofs) {
    const list = proofsBy.get(p.user_id) || [];
    list.push(p);
    proofsBy.set(p.user_id, list);
  }

  const clients: QueueClient[] = contracts.map((c) => {
    const share = !!c.share_checkins;
    const myAssignments = assignmentsBy.get(c.id) || [];
    const assignmentIds = new Set(myAssignments.map((a) => a.id));
    const visible = (proofsBy.get(c.client_id) || []).filter((p) => coachCanSee(p, share, assignmentIds));
    const convId = convByClient.get(c.client_id);
    const lm = convId ? lastMsg.get(convId) : undefined;
    const first = firstProof.get(c.client_id) ?? null;
    const signals = computeSignals({
      now,
      today: localDay(safeTimeZone(c.timezone), now),
      share_checkins: share,
      checkins: share ? checkinsBy.get(c.client_id) || [] : [],
      assignments: myAssignments,
      proofs: visible,
      // Only trust "first" when the earliest proof is one the coach can see this month.
      first_proof_at: first && visible.some((p) => p.created_at === first) ? first : null,
      streak_current: share ? streaks.get(c.client_id) ?? null : null,
      contract: { started_at: c.started_at, ends_at: c.ends_at, weeks: c.weeks },
      last_message: lm ? { from: lm.sender_id === coachId ? 'coach' : 'client', at: lm.created_at } : null,
      last_coach_message_at: convId ? lastCoachMsg.get(convId) ?? null : null,
    });
    const applied = applyMark(signals, marks.get(c.id) ?? null, now);
    return {
      contract_id: c.id,
      client: personFromMeta(c.client_id, c.metadata),
      status: applied.status,
      reasons: applied.reasons,
      wins: applied.wins,
      week: applied.week,
      last_contact_at: applied.last_contact_at,
      handled_until: applied.handled_until,
      ...(applied.override ? { override: applied.override } : {}),
      recent_proofs: visible.slice(0, 3).map((p) => formatProof(p, apiBase)),
    };
  });

  const rank: Record<QueueStatus, number> = { red: 0, amber: 1, green: 2 };
  clients.sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      b.reasons.filter((r) => !r.snoozed).length - a.reasons.filter((r) => !r.snoozed).length ||
      a.client.username.localeCompare(b.client.username)
  );
  const counts = {
    red: clients.filter((c) => c.status === 'red').length,
    amber: clients.filter((c) => c.status === 'amber').length,
    green: clients.filter((c) => c.status === 'green').length,
    wins: clients.filter((c) => c.wins.length > 0).length,
  };
  return {
    generated_at: now.toISOString(),
    counts,
    active_clients: contracts.length,
    est_weekly_minutes: estimateWeeklyMinutes(counts),
    clients,
  };
}

// ---------------------------------------------------------------------------
// Review items

export type ReviewItem = {
  id: string;
  type: 'homework' | 'proof';
  contract_id: string;
  client: Person;
  created_at: string;
  homework?: {
    id: string;
    title: string;
    completed_at: string | null;
    due_at: string | null;
    proof_kind: string | null;
    note: string | null;
    photo_url: string | null;
  };
  proofs: ProofOut[];
};

const REVIEW_LIMIT = 60;

export async function buildReview(env: Env, coachId: string, now: Date, apiBase: string) {
  const contracts = await loadActiveContracts(env, coachId);
  if (!contracts.length) return { items: [] as ReviewItem[], total: 0 };
  const byId = new Map(contracts.map((c) => [c.id, c]));
  const contractIds = contracts.map((c) => c.id);
  const since30 = new Date(now.getTime() - 30 * MS_DAY).toISOString();

  const homework = await allChunked<{
    id: string;
    contract_id: string;
    seed_id: string;
    title: string | null;
    seed_title: string | null;
    due_at: string | null;
    completed_at: string | null;
    proof_kind: string | null;
    last_note: string | null;
    last_photo: string | null;
  }>(
    env,
    contractIds,
    (ph) =>
      `SELECT a.id, a.contract_id, a.seed_id, a.title, s.title AS seed_title, a.due_at, a.completed_at, a.proof_kind,
        (SELECT note FROM growth_seed_events e WHERE e.seed_id = a.seed_id AND e.action = 'check_in'
           AND e.note IS NOT NULL ORDER BY e.created_at DESC LIMIT 1) AS last_note,
        (SELECT photo_url FROM growth_seed_events e WHERE e.seed_id = a.seed_id AND e.photo_url IS NOT NULL
           ORDER BY e.created_at DESC LIMIT 1) AS last_photo
       FROM coaching_assignments a LEFT JOIN growth_seeds s ON s.id = a.seed_id
       WHERE a.contract_id IN (${ph}) AND a.status = 'done' AND a.coach_feedback IS NULL
         AND (a.completed_at IS NULL OR a.completed_at >= ?)`,
    [],
    [since30.slice(0, 19).replace('T', ' ')]
  );

  const allAssignments = await allChunked<{ id: string; contract_id: string }>(
    env,
    contractIds,
    (ph) => `SELECT id, contract_id FROM coaching_assignments WHERE contract_id IN (${ph})`
  );
  const assignmentContract = new Map(allAssignments.map((a) => [a.id, a.contract_id]));

  const hwProofs = await loadAssignmentProofs(env, homework.map((h) => h.id), apiBase, true);
  const items: ReviewItem[] = homework.map((h) => {
    const c = byId.get(h.contract_id)!;
    return {
      id: `hw:${h.id}`,
      type: 'homework',
      contract_id: h.contract_id,
      client: personFromMeta(c.client_id, c.metadata),
      created_at: h.completed_at || now.toISOString(),
      homework: {
        id: h.id,
        title: h.title || h.seed_title || 'Homework',
        completed_at: h.completed_at,
        due_at: h.due_at,
        proof_kind: h.proof_kind ?? null,
        note: h.last_note,
        photo_url: h.last_photo,
      },
      proofs: hwProofs.get(h.id) || [],
    };
  });
  const listedHomework = new Set(homework.map((h) => h.id));

  // Unseen proofs the coach may see (not already inside a homework item above).
  try {
    const contractByClient = new Map<string, ContractRow[]>();
    for (const c of contracts) {
      const l = contractByClient.get(c.client_id) || [];
      l.push(c);
      contractByClient.set(c.client_id, l);
    }
    const rows = await allChunked<ProofRow>(
      env,
      [...contractByClient.keys()],
      (ph) =>
        `SELECT ${PROOF_COLS} FROM proofs WHERE user_id IN (${ph}) AND shared_with_coach = 1
           AND seen_by_coach_at IS NULL AND created_at >= ?
         ORDER BY created_at ASC`,
      [],
      [since30]
    );
    for (const p of rows) {
      if (p.context_type === 'assignment' && listedHomework.has(p.context_id)) continue;
      let contract: ContractRow | undefined;
      if (p.context_type === 'assignment') {
        const cid = assignmentContract.get(p.context_id);
        contract = cid ? byId.get(cid) : undefined;
      } else {
        contract = (contractByClient.get(p.user_id) || []).find((c) => !!c.share_checkins);
      }
      if (!contract) continue;
      items.push({
        id: `proof:${p.id}`,
        type: 'proof',
        contract_id: contract.id,
        client: personFromMeta(contract.client_id, contract.metadata),
        created_at: p.created_at,
        proofs: [formatProof(p, apiBase)],
      });
    }
  } catch {
    /* proofs (migration 0044) not applied yet */
  }

  items.sort((a, b) => (ms(a.created_at) ?? 0) - (ms(b.created_at) ?? 0));
  return { items: items.slice(0, REVIEW_LIMIT), total: items.length };
}

// ---------------------------------------------------------------------------
// Settings & templates

type SettingsRow = { templates: string | null; email_digest: number | null };

async function loadSettings(env: Env, coachId: string): Promise<SettingsRow | null> {
  return env.DB.prepare(`SELECT templates, email_digest FROM coach_settings WHERE instructor_id = ?`)
    .bind(coachId)
    .first<SettingsRow>();
}

export function parseTemplates(raw: string | null | undefined): string[] {
  if (raw == null) return [...DEFAULT_TEMPLATES];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string').slice(0, TEMPLATES_MAX) : [];
  } catch {
    return [...DEFAULT_TEMPLATES];
  }
}

/** Trim, drop empties/duplicates, cap length; null if not a string array or more than 20. */
export function cleanTemplates(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const out: string[] = [];
  for (const t of input) {
    if (typeof t !== 'string') return null;
    const s = t.trim().slice(0, TEMPLATE_LEN);
    if (s && !out.includes(s)) out.push(s);
  }
  return out.length > TEMPLATES_MAX ? null : out;
}

// ---------------------------------------------------------------------------
// HTTP

async function auth(request: Request, env: Env) {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) return null;
  return ctx;
}

async function readBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export async function handle(
  request: Request,
  env: Env,
  path: string,
  apiPrefix: string
): Promise<Response | null> {
  const base = `${apiPrefix}/instructor/x/`;
  if (!path.startsWith(base)) return null;
  const rest = path.slice(base.length);
  const method = request.method;

  const owned =
    rest === 'queue' ||
    rest === 'review' ||
    rest === 'templates' ||
    rest === 'settings' ||
    /^queue\/[^/]+\/(handled|override)$/.test(rest);
  if (!owned) return null;

  const ctx = await auth(request, env);
  if (!ctx) return error('UNAUTHORIZED', 'Authentication required', 401);
  const me = ctx.userId!;
  const now = new Date();
  const apiBase = apiBaseFor(request, apiPrefix);

  try {
    if (rest === 'queue' && method === 'GET') return json(await buildQueue(env, me, now, apiBase));
    if (rest === 'review' && method === 'GET') return json(await buildReview(env, me, now, apiBase));
    if (rest === 'templates' && method === 'GET') {
      const s = await loadSettings(env, me);
      return json({ templates: parseTemplates(s?.templates), max: TEMPLATES_MAX });
    }
    if (rest === 'templates' && method === 'PUT') {
      const body = await readBody<{ templates?: unknown }>(request);
      const list = cleanTemplates(body?.templates);
      if (!list) return error('VALIDATION_ERROR', `Up to ${TEMPLATES_MAX} short replies`, 400);
      await env.DB.prepare(
        `INSERT INTO coach_settings (instructor_id, templates, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(instructor_id) DO UPDATE SET templates = excluded.templates, updated_at = excluded.updated_at`
      )
        .bind(me, JSON.stringify(list), now.toISOString())
        .run();
      return json({ templates: list, max: TEMPLATES_MAX });
    }
    if (rest === 'settings' && method === 'GET') {
      const s = await loadSettings(env, me);
      return json({ email_digest: !!s?.email_digest });
    }
    if (rest === 'settings' && method === 'PUT') {
      const body = await readBody<{ email_digest?: unknown }>(request);
      if (!body || typeof body.email_digest !== 'boolean') {
        return error('VALIDATION_ERROR', 'email_digest must be true or false', 400);
      }
      await env.DB.prepare(
        `INSERT INTO coach_settings (instructor_id, email_digest, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(instructor_id) DO UPDATE SET email_digest = excluded.email_digest, updated_at = excluded.updated_at`
      )
        .bind(me, body.email_digest ? 1 : 0, now.toISOString())
        .run();
      return json({ email_digest: body.email_digest });
    }

    const m = rest.match(/^queue\/([^/]+)\/(handled|override)$/);
    if (m && method === 'POST') {
      const contractId = decodeURIComponent(m[1]);
      const c = await env.DB.prepare(`SELECT id, instructor_id, status FROM coaching_contracts WHERE id = ?`)
        .bind(contractId)
        .first<{ id: string; instructor_id: string; status: string }>();
      if (!c) return error('NOT_FOUND', 'Plan not found', 404);
      if (c.instructor_id !== me) return error('FORBIDDEN', 'Only the coach can do this', 403);
      return m[2] === 'handled'
        ? markHandled(request, env, me, contractId, now, apiBase)
        : setOverride(request, env, me, contractId, now);
    }
    return error('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  } catch (err) {
    console.error('[coachq]', err);
    return error('DATABASE_ERROR', 'Something went wrong', 500);
  }
}

async function markHandled(
  request: Request,
  env: Env,
  coachId: string,
  contractId: string,
  now: Date,
  apiBase: string
): Promise<Response> {
  const body = (await readBody<{ days?: unknown }>(request)) || {};
  const raw = body.days === undefined ? 7 : Number(body.days);
  if (!Number.isFinite(raw) || raw < 0 || raw > 30) {
    return error('VALIDATION_ERROR', 'days must be between 0 and 30', 400);
  }
  const days = Math.floor(raw);
  if (days === 0) {
    await env.DB.prepare(
      `UPDATE coach_queue_marks SET handled_until = NULL, handled_codes = NULL, updated_at = ? WHERE contract_id = ?`
    )
      .bind(now.toISOString(), contractId)
      .run();
    return json({ contract_id: contractId, handled_until: null });
  }
  // Snooze exactly the reasons showing right now; new ones still surface.
  const queue = await buildQueue(env, coachId, now, apiBase);
  const entry = queue.clients.find((c) => c.contract_id === contractId);
  const codes = (entry?.reasons || []).map((r) => r.code);
  const until = new Date(now.getTime() + days * MS_DAY).toISOString();
  await env.DB.prepare(
    `INSERT INTO coach_queue_marks (contract_id, instructor_id, handled_until, handled_codes, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(contract_id) DO UPDATE SET handled_until = excluded.handled_until,
       handled_codes = excluded.handled_codes, updated_at = excluded.updated_at`
  )
    .bind(contractId, coachId, until, JSON.stringify(codes), now.toISOString())
    .run();
  return json({ contract_id: contractId, handled_until: until, snoozed: codes });
}

async function setOverride(
  request: Request,
  env: Env,
  coachId: string,
  contractId: string,
  now: Date
): Promise<Response> {
  const body = await readBody<{ status?: unknown; reason?: unknown }>(request);
  if (!body) return error('VALIDATION_ERROR', 'Invalid JSON', 400);
  if (body.status === null) {
    await env.DB.prepare(
      `UPDATE coach_queue_marks SET override_status = NULL, override_reason = NULL, override_until = NULL,
         updated_at = ? WHERE contract_id = ?`
    )
      .bind(now.toISOString(), contractId)
      .run();
    return json({ contract_id: contractId, override: null });
  }
  if (body.status !== 'red' && body.status !== 'amber' && body.status !== 'green') {
    return error('VALIDATION_ERROR', 'status must be red, amber or green', 400);
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : '';
  if (!reason) return error('VALIDATION_ERROR', 'Add a short reason', 400);
  const until = new Date(now.getTime() + OVERRIDE_DAYS * MS_DAY).toISOString();
  await env.DB.prepare(
    `INSERT INTO coach_queue_marks (contract_id, instructor_id, override_status, override_reason, override_until, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(contract_id) DO UPDATE SET override_status = excluded.override_status,
       override_reason = excluded.override_reason, override_until = excluded.override_until,
       updated_at = excluded.updated_at`
  )
    .bind(contractId, coachId, body.status, reason, until, now.toISOString())
    .run();
  return json({ contract_id: contractId, override: { status: body.status, reason, until } });
}

// ---------------------------------------------------------------------------
// Monday summary (hourly cron; each user's Monday 07:00+ local, once per ISO week)

const SUMMARY_HOUR = 7;
const hourFormatters = new Map<string, Intl.DateTimeFormat>();

/** Local weekday (0 Sun..6 Sat) and hour for an instant in a timezone. */
export function localClock(timeZone: string, at: Date): { day: string; weekday: number; hour: number } {
  const tz = safeTimeZone(timeZone);
  let f = hourFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' });
    hourFormatters.set(tz, f);
  }
  const hour = Number(f.formatToParts(at).find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const day = localDay(tz, at);
  return { day, weekday: new Date(`${day}T00:00:00Z`).getUTCDay(), hour };
}

/** True when it is Monday at/after 07:00 in this timezone. */
export function isSummaryTime(timeZone: string | null | undefined, at: Date): boolean {
  const c = localClock(safeTimeZone(timeZone), at);
  return c.weekday === 1 && c.hour >= SUMMARY_HOUR;
}

/** Claim the (user, week, kind) marker; true only for the first caller. */
async function claimSent(env: Env, userId: string, week: string, kind: string, now: Date): Promise<boolean> {
  const res = await env.DB.prepare(
    `INSERT OR IGNORE INTO coach_weekly_sent (user_id, week, kind, sent_at) VALUES (?, ?, ?, ?)`
  )
    .bind(userId, week, kind, now.toISOString())
    .run();
  return Number(res.meta?.changes ?? 0) > 0;
}

async function alreadySent(env: Env, ids: string[], week: string, kind: string): Promise<Set<string>> {
  const rows = await allChunked<{ user_id: string }>(
    env,
    ids,
    (ph) => `SELECT user_id FROM coach_weekly_sent WHERE week = ? AND kind = ? AND user_id IN (${ph})`,
    [week, kind]
  );
  return new Set(rows.map((r) => r.user_id));
}

export function coachSummaryTitle(counts: Queue['counts']): string {
  return `Your week: ${counts.red} need${counts.red === 1 ? 's' : ''} you, ${counts.green} on track, ${plural(counts.wins, 'win')}`;
}

async function sendDigestEmail(env: Env, to: string, title: string, body: string): Promise<void> {
  const key = (env.RESEND_API_KEY || '').trim();
  const appBase = env.APP_PUBLIC_URL || 'https://letsgrow.lu';
  const html = buildBrandedEmailHtml({
    previewText: title,
    headline: title,
    greeting: 'Hi coach,',
    bodyHtml: `<p style="margin:0;">${body.replace(/[<>&]/g, '')}</p>`,
    cta: { label: 'Open Grow!', href: appBase },
    footerNote: 'You get this because Monday email is on in your coach queue. Turn it off there anytime.',
  });
  if (!key) {
    if (env.ENVIRONMENT !== 'production') console.log(`[coachq] digest (dev, no key) to ${to}: ${title}`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM || 'Grow! <noreply@letsgrow.lu>', to: [to], subject: title, html }),
  });
  if (!res.ok) console.error('[coachq] digest email failed', res.status);
}

const MAX_PER_RUN = 200;

export async function runCron(env: Env, now: Date = new Date()): Promise<void> {
  await runCoachSummaries(env, now);
  await runClientRecaps(env, now);
}

export async function runCoachSummaries(env: Env, now: Date): Promise<number> {
  const res = await env.DB.prepare(
    `SELECT DISTINCT c.instructor_id AS id, u.timezone, u.email, s.email_digest
     FROM coaching_contracts c JOIN users u ON u.id = c.instructor_id
     LEFT JOIN coach_settings s ON s.instructor_id = c.instructor_id
     WHERE c.status = 'active'`
  ).all<{ id: string; timezone: string | null; email: string | null; email_digest: number | null }>();
  const due = (res.results || []).filter((r) => isSummaryTime(r.timezone, now));
  let sent = 0;
  // Group by ISO week of each user's local day (same Monday for everyone due now).
  const byWeek = new Map<string, typeof due>();
  for (const r of due) {
    const week = isoWeek(localDay(safeTimeZone(r.timezone), now));
    byWeek.set(week, [...(byWeek.get(week) || []), r]);
  }
  for (const [week, rows] of byWeek) {
    const done = await alreadySent(env, rows.map((r) => r.id), week, 'coach');
    for (const r of rows) {
      if (sent >= MAX_PER_RUN) return sent;
      if (done.has(r.id)) continue;
      if (!(await claimSent(env, r.id, week, 'coach', now))) continue;
      const q = await buildQueue(env, r.id, now, '');
      const title = coachSummaryTitle(q.counts);
      const body =
        q.counts.amber > 0
          ? `${plural(q.counts.amber, 'client')} to check in with this week. Open Today to start with the reds.`
          : 'Open Today to see who needs you first.';
      await createUserNotification(env, {
        userId: r.id,
        type: 'coach_weekly_summary',
        title,
        body,
        refType: 'coach_queue',
        refId: r.id,
      });
      if (r.email_digest && r.email && !r.email.endsWith('@growl.invalid')) {
        try {
          await sendDigestEmail(env, r.email, title, body);
        } catch (err) {
          console.error('[coachq] digest', err);
        }
      }
      sent++;
    }
  }
  return sent;
}

export async function runClientRecaps(env: Env, now: Date): Promise<number> {
  const res = await env.DB.prepare(
    `SELECT c.id AS contract_id, c.client_id, c.instructor_id, cu.timezone, iu.metadata AS coach_meta
     FROM coaching_contracts c
     JOIN users cu ON cu.id = c.client_id
     JOIN users iu ON iu.id = c.instructor_id
     WHERE c.status = 'active'`
  ).all<{ contract_id: string; client_id: string; instructor_id: string; timezone: string | null; coach_meta: string | null }>();
  const byClient = new Map<string, Array<{ contract_id: string; instructor_id: string; timezone: string | null; coach_meta: string | null }>>();
  for (const r of res.results || []) {
    if (!isSummaryTime(r.timezone, now)) continue;
    byClient.set(r.client_id, [...(byClient.get(r.client_id) || []), r]);
  }
  let sent = 0;
  const ids = [...byClient.keys()];
  if (!ids.length) return 0;
  const weekOf = (tz: string | null) => isoWeek(localDay(safeTimeZone(tz), now));
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const w = weekOf(byClient.get(id)![0].timezone);
    groups.set(w, [...(groups.get(w) || []), id]);
  }
  for (const [week, clientIds] of groups) {
    const done = await alreadySent(env, clientIds, week, 'client');
    for (const clientId of clientIds) {
      if (sent >= MAX_PER_RUN) return sent;
      if (done.has(clientId)) continue;
      if (!(await claimSent(env, clientId, week, 'client', now))) continue;
      const plans = byClient.get(clientId)!;
      const today = localDay(safeTimeZone(plans[0].timezone), now);
      // Recap covers the 7 local days before this Monday.
      const from = addDays(today, -7);
      const to = addDays(today, -1);
      const checkins = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM daily_checkins WHERE user_id = ? AND day >= ? AND day <= ?`
      )
        .bind(clientId, from, to)
        .first<{ n: number }>();
      const contractIds = plans.map((p) => p.contract_id);
      const since = new Date(now.getTime() - 7 * MS_DAY).toISOString().slice(0, 19).replace('T', ' ');
      const hw = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM coaching_assignments
         WHERE contract_id IN (${qs(contractIds.length)}) AND status = 'done' AND completed_at >= ?`
      )
        .bind(...contractIds, since)
        .first<{ n: number }>();
      let proofs = 0;
      try {
        const p = await env.DB.prepare(
          `SELECT COUNT(*) AS n FROM proofs WHERE user_id = ? AND created_at >= ?`
        )
          .bind(clientId, new Date(now.getTime() - 7 * MS_DAY).toISOString())
          .first<{ n: number }>();
        proofs = Number(p?.n) || 0;
      } catch {
        proofs = 0;
      }
      const coachName = plans.length === 1 ? personFromMeta(plans[0].instructor_id, plans[0].coach_meta).username : null;
      const parts = [
        plural(Number(checkins?.n) || 0, 'check-in'),
        `${Number(hw?.n) || 0} homework done`,
        ...(proofs ? [plural(proofs, 'proof')] : []),
      ];
      await createUserNotification(env, {
        userId: clientId,
        type: 'coaching_weekly_recap',
        title: coachName ? `Your week with ${coachName}` : 'Your coaching week',
        body: `${parts.join(' · ')}. Every bit counts — keep going.`,
        refType: 'coaching_contract',
        refId: plans[0].contract_id,
      });
      sent++;
    }
  }
  return sent;
}
