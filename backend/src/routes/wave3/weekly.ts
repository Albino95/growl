import { z } from 'zod';
import type { Env } from '../../types';
import { json, error } from '../../utils/response';
import { getRequestContext } from '../../utils/auth';
import { generateId } from '../../utils/id';
import { createUserNotification, resolveUsername } from '../../utils/notifications';
import { addDays, dayRange, isDayKey, isoWeek, isoWeekStart, localDay, safeTimeZone, weekStart } from '../../utils/days';
import { withIdempotency } from '../../utils/idempotency';
import { awardPoints } from '../../utils/points';

/**
 * Wave 5 · weekly rituals (migration 0046). All paths under `{api}/weekly/…`.
 *
 * Sunday check-in (open Saturday 12:00 → Monday 12:00, user's local time):
 *   GET  /weekly/current                → { window, form, checkin, has_coach }
 *   GET  /weekly/form                   → { form, my_form, default_questions, is_coach }
 *   PUT  /weekly/form                   → coach: { questions } (≤ 5; [] / null resets) → { my_form }
 *   POST /weekly/checkins               → { week?, answers } (idempotent, upsert) → { checkin, created }
 *   GET  /weekly/checkins?week=&user_id=&limit=   → { user_id, checkins } (owner, or coach with an active plan)
 *   GET  /weekly/coach/checkins?week=   → coach: { week, clients: [{ user, contract_id, checkin|null }] }
 *
 * Weekly commitment (opt-in, never touches the growth streak):
 *   GET    /weekly/commitment            → { week, today, commitment|null, last_result|null }
 *   PUT    /weekly/commitment            → { target_days 3–7 } → { commitment }
 *   DELETE /weekly/commitment            → { removed }
 *   POST   /weekly/commitment/pass       → { day } → { commitment }   (2 rest passes per week)
 *   DELETE /weekly/commitment/pass/:day  → { commitment }
 *   GET    /weekly/commitments?limit=8   → { commitments }
 *
 * Cron (hourly): Saturday ≥ 12:00 local "Your week in 2 minutes" nudge (sent-marker
 * per user+week), and batched coach pings (≤ 1 per coach per hour).
 */

export const MAX_QUESTIONS = 5;
export const TEXT_MAX = 280;
export const CHIP_TEXT_MAX = 140;
export const PROMPT_MAX = 120;
export const COMMITMENT_MIN = 3;
export const COMMITMENT_MAX = 7;
export const REST_PASSES = 2;
export const COMMITMENT_POINTS = 10;
export const WINDOW_OPEN_HOUR = 12;
export const COACH_PING_GAP_MS = 60 * 60 * 1000;
const HISTORY_MAX = 26;
const NUDGE_BATCH = 2000;

// ---------------------------------------------------------------------------
// Questions & forms

export type QuestionType = 'scale' | 'text' | 'chips';
export type Question = {
  id: string;
  type: QuestionType;
  prompt: string;
  options?: string[];
  allow_text?: boolean;
  low_label?: string;
  high_label?: string;
  /** Default form only: shown only when the user has an active coach. */
  coach_only?: boolean;
};

export type Answer = number | string | { chips: string[]; text?: string };
export type Answers = Record<string, Answer>;

export const DEFAULT_QUESTIONS: Question[] = [
  { id: 'feel', type: 'scale', prompt: 'How did this week feel?', low_label: 'Heavy', high_label: 'Great' },
  { id: 'went_well', type: 'text', prompt: 'What went well?' },
  {
    id: 'in_the_way',
    type: 'chips',
    prompt: 'What got in the way?',
    options: ['Time', 'Energy', 'Motivation', 'Health', 'Other'],
    allow_text: true,
  },
  { id: 'focus', type: 'text', prompt: 'One focus for next week' },
  { id: 'for_coach', type: 'text', prompt: 'Anything for your coach?', coach_only: true },
];

export type WeeklyForm = {
  source: 'default' | 'coach';
  coach: { id: string; username: string } | null;
  questions: Question[];
};

const ShortText = (max: number) => z.string().trim().min(1).max(max);

const QuestionInput = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^[a-z0-9_]{1,24}$/i)
      .optional(),
    type: z.enum(['scale', 'text', 'chips']),
    prompt: ShortText(PROMPT_MAX),
    options: z.array(ShortText(24)).max(8).optional(),
    allow_text: z.boolean().optional(),
    low_label: z.string().trim().max(20).optional(),
    high_label: z.string().trim().max(20).optional(),
  })
  .strip();

const FormInput = z.object({
  questions: z.array(QuestionInput).max(MAX_QUESTIONS).nullable(),
});

/** Validate + normalise a coach's custom questions. Returns an error message or the list. */
export function normalizeCoachQuestions(raw: unknown): { questions: Question[] } | { error: string } {
  const parsed = FormInput.safeParse(raw);
  if (!parsed.success) {
    const tooMany = parsed.error.issues.some((i) => i.code === 'too_big' && i.path.length === 1);
    return { error: tooMany ? `Up to ${MAX_QUESTIONS} questions` : 'Check your questions and try again' };
  }
  const list = parsed.data.questions ?? [];
  const used = new Set<string>();
  const out: Question[] = [];
  list.forEach((q, i) => {
    let id = q.id && !used.has(q.id) ? q.id : `q${i + 1}`;
    while (used.has(id)) id = `${id}_`;
    used.add(id);
    const item: Question = { id, type: q.type, prompt: q.prompt };
    if (q.type === 'chips') {
      const opts = [...new Set(q.options ?? [])];
      if (opts.length < 2) return; // marked invalid below
      item.options = opts;
      if (q.allow_text) item.allow_text = true;
    }
    if (q.type === 'scale') {
      if (q.low_label) item.low_label = q.low_label;
      if (q.high_label) item.high_label = q.high_label;
    }
    out.push(item);
  });
  if (out.length !== list.length) return { error: 'Choice questions need at least 2 options' };
  return { questions: out };
}

function parseQuestions(raw: string | null | undefined): Question[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) && v.length ? (v as Question[]) : null;
  } catch {
    return null;
  }
}

/** Default questions for a user (the coach question only with an active coach). */
export function defaultQuestionsFor(hasCoach: boolean): Question[] {
  return DEFAULT_QUESTIONS.filter((q) => hasCoach || !q.coach_only).map((q) => ({ ...q }));
}

type CoachRow = { instructor_id: string; contract_id: string; started_at: string; questions: string | null };

/**
 * Pure: pick the form for a client. Coaches are ordered newest plan first; the
 * first coach with a custom form wins, otherwise the default form.
 */
export function selectForm(
  coaches: Array<{ coach_id: string; username: string; questions: Question[] | null }>
): WeeklyForm {
  for (const c of coaches) {
    if (c.questions && c.questions.length) {
      return { source: 'coach', coach: { id: c.coach_id, username: c.username }, questions: c.questions };
    }
  }
  const first = coaches[0];
  return {
    source: 'default',
    coach: first ? { id: first.coach_id, username: first.username } : null,
    questions: defaultQuestionsFor(coaches.length > 0),
  };
}

/** Pure: validate answers against the questions; drops empty values and unknown ids. */
export function validateAnswers(questions: Question[], raw: unknown): { answers: Answers } | { error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'answers must be an object' };
  const src = raw as Record<string, unknown>;
  const out: Answers = {};
  for (const q of questions) {
    const v = src[q.id];
    if (v === undefined || v === null || v === '') continue;
    if (q.type === 'scale') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 5) return { error: `“${q.prompt}” takes 1 to 5` };
      out[q.id] = n;
    } else if (q.type === 'text') {
      if (typeof v !== 'string') return { error: `“${q.prompt}” must be text` };
      const t = v.trim();
      if (t.length > TEXT_MAX) return { error: `Keep “${q.prompt}” under ${TEXT_MAX} characters` };
      if (t) out[q.id] = t;
    } else {
      if (typeof v !== 'object' || Array.isArray(v)) return { error: `“${q.prompt}” needs chips` };
      const o = v as { chips?: unknown; text?: unknown };
      const chips = Array.isArray(o.chips) ? o.chips.filter((c): c is string => typeof c === 'string') : [];
      const opts = q.options ?? [];
      const bad = chips.find((c) => !opts.includes(c));
      if (bad) return { error: `“${bad}” isn't an option` };
      const text = q.allow_text && typeof o.text === 'string' ? o.text.trim() : '';
      if (text.length > CHIP_TEXT_MAX) return { error: `Keep it under ${CHIP_TEXT_MAX} characters` };
      const uniq = [...new Set(chips)];
      if (!uniq.length && !text) continue;
      out[q.id] = text ? { chips: uniq, text } : { chips: uniq };
    }
  }
  if (!Object.keys(out).length) return { error: 'Answer at least one question' };
  return { answers: out };
}

// ---------------------------------------------------------------------------
// Local clock & the check-in window

const clockCache = new Map<string, Intl.DateTimeFormat>();
const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Local day key, hour and weekday (0 = Sunday) for an instant in a timezone. */
export function localClock(tz: string | null | undefined, at: Date): { day: string; hour: number; dow: number } {
  const zone = safeTimeZone(tz);
  let f = clockCache.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      weekday: 'short',
      hour: '2-digit',
      hourCycle: 'h23',
    });
    clockCache.set(zone, f);
  }
  const parts = f.formatToParts(at);
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  return { day: localDay(zone, at), hour, dow: DOW[wd] ?? 1 };
}

export type CheckinWindow = {
  open: boolean;
  /** Week being reflected on (open), or the next week to open. */
  week: string;
  week_start: string;
  /** Saturday (local) the window opens at 12:00. */
  opens_on: string;
  /** Monday (local) the window closes at 12:00. */
  closes_on: string;
  /** Most recent week whose window has opened (current when open, else last week). */
  latest_week: string;
};

/** Pure: Saturday 12:00 → Monday 12:00 local belongs to that Saturday's ISO week. */
export function checkinWindow(tz: string | null | undefined, at: Date): CheckinWindow {
  const { day, hour, dow } = localClock(tz, at);
  let open = false;
  let ref = day;
  if ((dow === 6 && hour >= WINDOW_OPEN_HOUR) || dow === 0) open = true;
  else if (dow === 1 && hour < WINDOW_OPEN_HOUR) {
    open = true;
    ref = addDays(day, -1);
  }
  const monday = weekStart(ref);
  const week = isoWeek(monday);
  return {
    open,
    week,
    week_start: monday,
    opens_on: addDays(monday, 5),
    closes_on: addDays(monday, 7),
    latest_week: open ? week : isoWeek(addDays(monday, -7)),
  };
}

// ---------------------------------------------------------------------------
// Commitment math

export type CommitmentDayStatus = 'active' | 'pass' | 'today' | 'future' | 'open';
export type CommitmentStatus = 'active' | 'kept' | 'partly';

export type CommitmentRow = {
  id: string;
  week: string;
  week_start: string;
  target_days: number;
  pass_days: string;
  status: string;
  covered_days: number | null;
  points_awarded: number;
  settled_at: string | null;
  created_at: string;
};

export type CommitmentProgress = {
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
  /** Still reachable with the days and passes left (always false once settled). */
  reachable: boolean;
  status: CommitmentStatus;
  points_awarded: number;
  settled_at: string | null;
  days: Array<{ day: string; status: CommitmentDayStatus }>;
};

export function parsePassDays(s: string | null | undefined): string[] {
  return String(s || '')
    .split(',')
    .map((d) => d.trim())
    .filter((d) => isDayKey(d));
}

/**
 * Pure: progress of a commitment given the user's active days (any day keys) and
 * their local `today`. Pass days count only when that day wasn't active anyway.
 */
export function commitmentProgress(row: CommitmentRow, activeDays: Set<string>, today: string): CommitmentProgress {
  const monday = row.week_start;
  const days = dayRange(monday, addDays(monday, 6));
  const passes = parsePassDays(row.pass_days).filter((d) => d >= monday && d <= addDays(monday, 6));
  const passSet = new Set(passes);
  let active = 0;
  let covered = 0;
  let openAhead = 0;
  const out = days.map((day) => {
    let status: CommitmentDayStatus;
    if (activeDays.has(day)) {
      status = 'active';
      active++;
      covered++;
    } else if (passSet.has(day)) {
      status = 'pass';
      covered++;
    } else if (day === today) {
      status = 'today';
      openAhead++;
    } else if (day > today) {
      status = 'future';
      openAhead++;
    } else status = 'open';
    return { day, status };
  });
  const target = Number(row.target_days);
  const settled = row.status === 'kept' || row.status === 'partly';
  const passesLeft = Math.max(0, REST_PASSES - passSet.size);
  const remaining = Math.max(0, target - covered);
  // Days still to come can be shown up for; open past days can still take a pass.
  const openPast = out.filter((d) => d.status === 'open').length;
  const reachable = !settled && covered + openAhead + Math.min(passesLeft, openPast) >= target;
  return {
    id: row.id,
    week: row.week,
    week_start: monday,
    target_days: target,
    passes_total: REST_PASSES,
    passes_used: passSet.size,
    pass_days: [...passSet].sort(),
    active_days: active,
    covered,
    remaining,
    reachable,
    status: settled ? (row.status as CommitmentStatus) : 'active',
    points_awarded: Number(row.points_awarded) || 0,
    settled_at: row.settled_at,
    days: out,
  };
}

// ---------------------------------------------------------------------------
// Routing

export async function handle(request: Request, env: Env, path: string, apiPrefix: string): Promise<Response | null> {
  const base = `${apiPrefix}/weekly/`;
  if (!path.startsWith(base)) return null;
  const rest = path.slice(base.length).replace(/\/+$/, '');
  const method = request.method;

  if (rest === 'current' && method === 'GET') return getCurrent(request, env);
  if (rest === 'form') {
    if (method === 'GET') return getForm(request, env);
    if (method === 'PUT') return putForm(request, env);
    return null;
  }
  if (rest === 'checkins') {
    if (method === 'GET') return listCheckins(request, env);
    if (method === 'POST') return withIdempotency(request, env, () => submitCheckin(request, env));
    return null;
  }
  if (rest === 'coach/checkins' && method === 'GET') return coachCheckins(request, env);
  if (rest === 'commitment') {
    if (method === 'GET') return getCommitment(request, env);
    if (method === 'PUT') return putCommitment(request, env);
    if (method === 'DELETE') return deleteCommitment(request, env);
    return null;
  }
  if (rest === 'commitment/pass' && method === 'POST') return usePass(request, env);
  const m = rest.match(/^commitment\/pass\/(\d{4}-\d{2}-\d{2})$/);
  if (m && method === 'DELETE') return undoPass(request, env, m[1]);
  if (rest === 'commitments' && method === 'GET') return listCommitments(request, env);
  return null;
}

async function authed(request: Request, env: Env): Promise<string | null> {
  const ctx = await getRequestContext(request, env);
  return ctx.isAuthenticated && ctx.userId ? ctx.userId : null;
}

async function readJson(request: Request): Promise<unknown | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function unauthorized(): Response {
  return error('UNAUTHORIZED', 'Authentication required', 401);
}

async function userTz(env: Env, userId: string): Promise<string> {
  const row = await env.DB.prepare(`SELECT timezone FROM users WHERE id = ?`).bind(userId).first<{ timezone: string | null }>();
  return safeTimeZone(row?.timezone);
}

function parseMeta(raw: string | null | undefined): { username: string; avatar: string | null } {
  try {
    const m = JSON.parse(raw || '{}') as { username?: unknown; avatar?: unknown };
    return {
      username: typeof m.username === 'string' && m.username.trim() ? m.username.trim() : 'Someone',
      avatar: typeof m.avatar === 'string' ? m.avatar : null,
    };
  } catch {
    return { username: 'Someone', avatar: null };
  }
}

/** Active coaches of a client, newest plan first, with their custom form (if any). */
async function activeCoaches(env: Env, clientId: string) {
  const res = await env.DB.prepare(
    `SELECT c.instructor_id, c.id AS contract_id, c.started_at, f.questions, u.metadata
     FROM coaching_contracts c
     LEFT JOIN weekly_forms f ON f.coach_id = c.instructor_id
     LEFT JOIN users u ON u.id = c.instructor_id
     WHERE c.client_id = ? AND c.status = 'active'
     ORDER BY c.started_at DESC LIMIT 10`
  )
    .bind(clientId)
    .all<CoachRow & { metadata: string | null }>();
  const seen = new Set<string>();
  const out: Array<{ coach_id: string; contract_id: string; username: string; questions: Question[] | null }> = [];
  for (const r of res.results || []) {
    if (seen.has(r.instructor_id)) continue;
    seen.add(r.instructor_id);
    out.push({
      coach_id: r.instructor_id,
      contract_id: r.contract_id,
      username: parseMeta(r.metadata).username,
      questions: parseQuestions(r.questions),
    });
  }
  return out;
}

async function isCoachOf(env: Env, coachId: string, clientId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 AS ok FROM coaching_contracts WHERE instructor_id = ? AND client_id = ? AND status = 'active' LIMIT 1`
  )
    .bind(coachId, clientId)
    .first();
  return !!row;
}

type CheckinRow = {
  id: string;
  user_id: string;
  week: string;
  week_start: string;
  form_source: string;
  coach_id: string | null;
  questions: string;
  answers: string;
  shared_with_coach: number;
  submitted_at: string;
  updated_at: string;
};

export type Checkin = {
  id: string;
  user_id: string;
  week: string;
  week_start: string;
  form_source: 'default' | 'coach';
  coach_id: string | null;
  questions: Question[];
  answers: Answers;
  shared_with_coach: boolean;
  editable: boolean;
  submitted_at: string;
  updated_at: string;
};

const CHECKIN_COLS = `id, user_id, week, week_start, form_source, coach_id, questions, answers,
  shared_with_coach, submitted_at, updated_at`;

function toCheckin(r: CheckinRow, openWeek: string | null): Checkin {
  let answers: Answers = {};
  try {
    const v = JSON.parse(r.answers);
    if (v && typeof v === 'object' && !Array.isArray(v)) answers = v as Answers;
  } catch {
    /* keep empty */
  }
  return {
    id: r.id,
    user_id: r.user_id,
    week: r.week,
    week_start: r.week_start,
    form_source: r.form_source === 'coach' ? 'coach' : 'default',
    coach_id: r.coach_id,
    questions: parseQuestions(r.questions) ?? [],
    answers,
    shared_with_coach: !!Number(r.shared_with_coach),
    editable: openWeek === r.week,
    submitted_at: r.submitted_at,
    updated_at: r.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Check-in handlers

async function getCurrent(request: Request, env: Env): Promise<Response> {
  const me = await authed(request, env);
  if (!me) return unauthorized();
  const tz = await userTz(env, me);
  const window = checkinWindow(tz, new Date());
  const coaches = await activeCoaches(env, me);
  const row = await env.DB.prepare(`SELECT ${CHECKIN_COLS} FROM weekly_checkins WHERE user_id = ? AND week = ?`)
    .bind(me, window.week)
    .first<CheckinRow>();
  const checkin = row ? toCheckin(row, window.open ? window.week : null) : null;
  // Once answered, keep showing the questions the user actually answered.
  const form: WeeklyForm =
    checkin && checkin.questions.length
      ? {
          source: checkin.form_source,
          coach: selectForm(coaches).coach,
          questions: checkin.questions,
        }
      : selectForm(coaches);
  return json({ window, form, checkin, has_coach: coaches.length > 0 });
}

async function isInstructor(env: Env, userId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT CASE WHEN is_instructor = 1 OR EXISTS (SELECT 1 FROM coaching_contracts WHERE instructor_id = users.id)
       THEN 1 ELSE 0 END AS ok FROM users WHERE id = ?`
  )
    .bind(userId)
    .first<{ ok: number }>();
  return !!Number(row?.ok);
}

async function getForm(request: Request, env: Env): Promise<Response> {
  const me = await authed(request, env);
  if (!me) return unauthorized();
  const coaches = await activeCoaches(env, me);
  const coach = await isInstructor(env, me);
  let myForm: Question[] | null = null;
  if (coach) {
    const row = await env.DB.prepare(`SELECT questions FROM weekly_forms WHERE coach_id = ?`)
      .bind(me)
      .first<{ questions: string }>();
    myForm = parseQuestions(row?.questions);
  }
  return json({
    form: selectForm(coaches),
    my_form: myForm,
    default_questions: defaultQuestionsFor(true),
    is_coach: coach,
    max_questions: MAX_QUESTIONS,
  });
}

async function putForm(request: Request, env: Env): Promise<Response> {
  const me = await authed(request, env);
  if (!me) return unauthorized();
  if (!(await isInstructor(env, me))) return error('FORBIDDEN', 'Only coaches can customise the weekly form', 403);
  const body = await readJson(request);
  if (body === undefined) return error('VALIDATION_ERROR', 'Invalid JSON', 400);
  const norm = normalizeCoachQuestions(body);
  if ('error' in norm) return error('VALIDATION_ERROR', norm.error, 400);
  if (!norm.questions.length) {
    await env.DB.prepare(`DELETE FROM weekly_forms WHERE coach_id = ?`).bind(me).run();
    return json({ my_form: null });
  }
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO weekly_forms (coach_id, questions, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(coach_id) DO UPDATE SET questions = excluded.questions, updated_at = excluded.updated_at`
  )
    .bind(me, JSON.stringify(norm.questions), now)
    .run();
  return json({ my_form: norm.questions });
}

const SubmitInput = z.object({
  week: z.string().optional(),
  answers: z.unknown(),
});

async function submitCheckin(request: Request, env: Env): Promise<Response> {
  const me = await authed(request, env);
  if (!me) return unauthorized();
  const parsed = SubmitInput.safeParse(await readJson(request));
  if (!parsed.success) return error('VALIDATION_ERROR', 'Invalid body', 400);
  const tz = await userTz(env, me);
  const now = new Date();
  const window = checkinWindow(tz, now);
  if (!window.open || (parsed.data.week && parsed.data.week !== window.week)) {
    return error('WINDOW_CLOSED', 'The weekly check-in opens Saturday at noon and closes Monday at noon.', 409);
  }
  const existing = await env.DB.prepare(`SELECT ${CHECKIN_COLS} FROM weekly_checkins WHERE user_id = ? AND week = ?`)
    .bind(me, window.week)
    .first<CheckinRow>();
  const coaches = await activeCoaches(env, me);
  const form = selectForm(coaches);
  const questions = existing ? (parseQuestions(existing.questions) ?? form.questions) : form.questions;
  const valid = validateAnswers(questions, parsed.data.answers);
  if ('error' in valid) return error('VALIDATION_ERROR', valid.error, 400);
  const stamp = now.toISOString();
  const answers = JSON.stringify(valid.answers);

  if (existing) {
    await env.DB.prepare(`UPDATE weekly_checkins SET answers = ?, updated_at = ? WHERE id = ?`)
      .bind(answers, stamp, existing.id)
      .run();
    const row = { ...existing, answers, updated_at: stamp };
    return json({ checkin: toCheckin(row, window.week), created: false });
  }

  const shared = coaches.length > 0 ? 1 : 0;
  const row: CheckinRow = {
    id: generateId('wchk'),
    user_id: me,
    week: window.week,
    week_start: window.week_start,
    form_source: form.source,
    coach_id: form.coach?.id ?? null,
    questions: JSON.stringify(questions),
    answers,
    shared_with_coach: shared,
    submitted_at: stamp,
    updated_at: stamp,
  };
  const ins = await env.DB.prepare(
    `INSERT OR IGNORE INTO weekly_checkins (${CHECKIN_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      row.id,
      row.user_id,
      row.week,
      row.week_start,
      row.form_source,
      row.coach_id,
      row.questions,
      row.answers,
      row.shared_with_coach,
      row.submitted_at,
      row.updated_at
    )
    .run();
  if (Number((ins as { meta?: { changes?: number } }).meta?.changes ?? 0) !== 1) {
    // Lost a race with a parallel first submit: apply as an edit.
    await env.DB.prepare(`UPDATE weekly_checkins SET answers = ?, updated_at = ? WHERE user_id = ? AND week = ?`)
      .bind(answers, stamp, me, window.week)
      .run();
    const again = await env.DB.prepare(`SELECT ${CHECKIN_COLS} FROM weekly_checkins WHERE user_id = ? AND week = ?`)
      .bind(me, window.week)
      .first<CheckinRow>();
    return json({ checkin: toCheckin(again ?? row, window.week), created: false });
  }
  if (shared) {
    for (const c of coaches) {
      try {
        await flushCoachPing(env, c.coach_id, now);
      } catch (err) {
        console.error('[weekly] coach ping', err);
      }
    }
  }
  return json({ checkin: toCheckin(row, window.week), created: true }, 201);
}

async function listCheckins(request: Request, env: Env): Promise<Response> {
  const me = await authed(request, env);
  if (!me) return unauthorized();
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id') || me;
  const week = url.searchParams.get('week');
  const limit = Math.min(HISTORY_MAX, Math.max(1, Number(url.searchParams.get('limit')) || 8));
  if (week && !isoWeekStart(week)) return error('VALIDATION_ERROR', 'week must look like 2026-W46', 400);
  const own = userId === me;
  if (!own && !(await isCoachOf(env, me, userId))) {
    return error('FORBIDDEN', "Only this person's active coach can see their weekly check-ins", 403);
  }
  const tz = await userTz(env, userId);
  const window = checkinWindow(tz, new Date());
  const where = [`user_id = ?`];
  const binds: unknown[] = [userId];
  if (!own) where.push(`shared_with_coach = 1`);
  if (week) {
    where.push(`week = ?`);
    binds.push(week);
  }
  const res = await env.DB.prepare(
    `SELECT ${CHECKIN_COLS} FROM weekly_checkins WHERE ${where.join(' AND ')} ORDER BY week_start DESC LIMIT ${limit}`
  )
    .bind(...binds)
    .all<CheckinRow>();
  const openWeek = own && window.open ? window.week : null;
  return json({ user_id: userId, checkins: (res.results || []).map((r) => toCheckin(r, openWeek)) });
}

async function coachCheckins(request: Request, env: Env): Promise<Response> {
  const me = await authed(request, env);
  if (!me) return unauthorized();
  const url = new URL(request.url);
  let week = url.searchParams.get('week');
  if (week && !isoWeekStart(week)) return error('VALIDATION_ERROR', 'week must look like 2026-W46', 400);
  if (!week) week = checkinWindow(await userTz(env, me), new Date()).latest_week;
  const res = await env.DB.prepare(
    `SELECT c.id AS contract_id, c.client_id, u.metadata,
            w.id, w.user_id, w.week, w.week_start, w.form_source, w.coach_id, w.questions, w.answers,
            w.shared_with_coach, w.submitted_at, w.updated_at
     FROM coaching_contracts c
     JOIN users u ON u.id = c.client_id
     LEFT JOIN weekly_checkins w ON w.user_id = c.client_id AND w.week = ? AND w.shared_with_coach = 1
     WHERE c.instructor_id = ? AND c.status = 'active'
     ORDER BY w.submitted_at IS NULL, w.submitted_at DESC
     LIMIT 300`
  )
    .bind(week, me)
    .all<CheckinRow & { contract_id: string; client_id: string; metadata: string | null }>();
  const seen = new Set<string>();
  const clients = [];
  for (const r of res.results || []) {
    if (seen.has(r.client_id)) continue;
    seen.add(r.client_id);
    const meta = parseMeta(r.metadata);
    clients.push({
      user: { id: r.client_id, username: meta.username, avatar: meta.avatar },
      contract_id: r.contract_id,
      checkin: r.id ? toCheckin(r, null) : null,
    });
  }
  return json({ week, clients });
}

// ---------------------------------------------------------------------------
// Coach pings (batched: ≤ 1 per coach per hour)

/** Notify a coach about client check-ins submitted since their last ping. */
export async function flushCoachPing(env: Env, coachId: string, now: Date): Promise<boolean> {
  const ping = await env.DB.prepare(`SELECT last_sent_at FROM weekly_coach_pings WHERE coach_id = ?`)
    .bind(coachId)
    .first<{ last_sent_at: string }>();
  const last = ping?.last_sent_at ?? null;
  if (last && now.getTime() - Date.parse(last) < COACH_PING_GAP_MS) return false;
  const since = last ?? new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const agg = await env.DB.prepare(
    `SELECT COUNT(DISTINCT w.user_id) AS n, MIN(w.user_id) AS one, MAX(w.week) AS week
     FROM weekly_checkins w
     JOIN coaching_contracts c ON c.client_id = w.user_id AND c.instructor_id = ? AND c.status = 'active'
     WHERE w.shared_with_coach = 1 AND w.submitted_at > ? AND w.submitted_at <= ?`
  )
    .bind(coachId, since, now.toISOString())
    .first<{ n: number; one: string | null; week: string | null }>();
  const n = Number(agg?.n) || 0;
  if (!n) return false;
  const stamp = now.toISOString();
  // Claim the slot atomically so parallel submits/cron can't double-notify.
  const claim = await env.DB.prepare(
    `INSERT INTO weekly_coach_pings (coach_id, last_sent_at) VALUES (?, ?)
     ON CONFLICT(coach_id) DO UPDATE SET last_sent_at = excluded.last_sent_at
       WHERE weekly_coach_pings.last_sent_at IS ?`
  )
    .bind(coachId, stamp, last)
    .run();
  if (Number((claim as { meta?: { changes?: number } }).meta?.changes ?? 0) !== 1) return false;
  const name = n === 1 && agg?.one ? await resolveUsername(env, agg.one) : null;
  await createUserNotification(env, {
    userId: coachId,
    actorId: n === 1 ? agg?.one ?? null : null,
    type: 'system',
    title: name ? `${name} sent their week` : `${n} clients sent their week`,
    body: 'Their Sunday check-in is ready to read.',
    refType: 'weekly_coach',
    refId: agg?.week ?? null,
  });
  return true;
}

// ---------------------------------------------------------------------------
// Commitment handlers

const COMMIT_COLS = `id, week, week_start, target_days, pass_days, status, covered_days, points_awarded,
  settled_at, created_at`;

async function activeDaysIn(env: Env, userId: string, from: string, to: string): Promise<Set<string>> {
  const res = await env.DB.prepare(
    `SELECT day FROM user_activity_days
     WHERE user_id = ? AND day >= ? AND day <= ? AND is_rest = 0 AND kinds > 0`
  )
    .bind(userId, from, to)
    .all<{ day: string }>();
  return new Set((res.results || []).map((r) => r.day));
}

/** Settle finished weeks: kept → +10 points once; otherwise "partly" (no penalty). */
export async function settleCommitments(env: Env, userId: string, today: string): Promise<void> {
  const monday = weekStart(today);
  const res = await env.DB.prepare(
    `SELECT ${COMMIT_COLS} FROM weekly_commitments
     WHERE user_id = ? AND status = 'active' AND week_start < ? ORDER BY week_start ASC LIMIT 20`
  )
    .bind(userId, monday)
    .all<CommitmentRow>();
  const rows = res.results || [];
  if (!rows.length) return;
  const active = await activeDaysIn(env, userId, rows[0].week_start, addDays(rows[rows.length - 1].week_start, 6));
  const stamp = new Date().toISOString();
  for (const r of rows) {
    const p = commitmentProgress(r, active, today);
    const kept = p.covered >= p.target_days;
    const upd = await env.DB.prepare(
      `UPDATE weekly_commitments SET status = ?, covered_days = ?, points_awarded = ?, settled_at = ?, updated_at = ?
       WHERE id = ? AND status = 'active'`
    )
      .bind(kept ? 'kept' : 'partly', p.covered, kept ? COMMITMENT_POINTS : 0, stamp, stamp, r.id)
      .run();
    if (kept && Number((upd as { meta?: { changes?: number } }).meta?.changes ?? 0) === 1) {
      await awardPoints(env, userId, COMMITMENT_POINTS);
    }
  }
}

async function commitmentCtx(env: Env, userId: string) {
  const tz = await userTz(env, userId);
  const today = localDay(tz);
  const monday = weekStart(today);
  return { tz, today, monday, week: isoWeek(monday) };
}

async function loadCommitment(env: Env, userId: string, week: string): Promise<CommitmentRow | null> {
  return env.DB.prepare(`SELECT ${COMMIT_COLS} FROM weekly_commitments WHERE user_id = ? AND week = ?`)
    .bind(userId, week)
    .first<CommitmentRow>();
}

async function progressFor(env: Env, userId: string, row: CommitmentRow, today: string): Promise<CommitmentProgress> {
  const active = await activeDaysIn(env, userId, row.week_start, addDays(row.week_start, 6));
  return commitmentProgress(row, active, today);
}

async function getCommitment(request: Request, env: Env): Promise<Response> {
  const me = await authed(request, env);
  if (!me) return unauthorized();
  const c = await commitmentCtx(env, me);
  await settleCommitments(env, me, c.today);
  const row = await loadCommitment(env, me, c.week);
  const prev = await loadCommitment(env, me, isoWeek(addDays(c.monday, -7)));
  return json({
    week: c.week,
    week_start: c.monday,
    today: c.today,
    commitment: row ? await progressFor(env, me, row, c.today) : null,
    last_result: prev && prev.status !== 'active' ? await progressFor(env, me, prev, c.today) : null,
  });
}

const CommitInput = z.object({
  target_days: z.number().int().min(COMMITMENT_MIN).max(COMMITMENT_MAX),
});

async function putCommitment(request: Request, env: Env): Promise<Response> {
  const me = await authed(request, env);
  if (!me) return unauthorized();
  const parsed = CommitInput.safeParse(await readJson(request));
  if (!parsed.success) {
    return error('VALIDATION_ERROR', `Choose ${COMMITMENT_MIN} to ${COMMITMENT_MAX} days`, 400);
  }
  const c = await commitmentCtx(env, me);
  const stamp = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO weekly_commitments (id, user_id, week, week_start, target_days, pass_days, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '', 'active', ?, ?)
     ON CONFLICT(user_id, week) DO UPDATE SET target_days = excluded.target_days, updated_at = excluded.updated_at`
  )
    .bind(generateId('wcom'), me, c.week, c.monday, parsed.data.target_days, stamp, stamp)
    .run();
  const row = await loadCommitment(env, me, c.week);
  return json({ commitment: row ? await progressFor(env, me, row, c.today) : null });
}

async function deleteCommitment(request: Request, env: Env): Promise<Response> {
  const me = await authed(request, env);
  if (!me) return unauthorized();
  const c = await commitmentCtx(env, me);
  const res = await env.DB.prepare(`DELETE FROM weekly_commitments WHERE user_id = ? AND week = ? AND status = 'active'`)
    .bind(me, c.week)
    .run();
  return json({ removed: Number((res as { meta?: { changes?: number } }).meta?.changes ?? 0) > 0 });
}

const PassInput = z.object({ day: z.string() });

async function usePass(request: Request, env: Env): Promise<Response> {
  const me = await authed(request, env);
  if (!me) return unauthorized();
  const parsed = PassInput.safeParse(await readJson(request));
  if (!parsed.success || !isDayKey(parsed.data.day)) return error('VALIDATION_ERROR', 'day must be YYYY-MM-DD', 400);
  const day = parsed.data.day;
  const c = await commitmentCtx(env, me);
  const row = await loadCommitment(env, me, c.week);
  if (!row) return error('NOT_FOUND', 'Set a weekly goal first', 404);
  if (day < c.monday || day > c.today) {
    return error('VALIDATION_ERROR', 'Rest passes are for today or earlier this week', 400);
  }
  const passes = parsePassDays(row.pass_days);
  if (!passes.includes(day)) {
    const active = await activeDaysIn(env, me, day, day);
    if (active.has(day)) return error('ALREADY_ACTIVE', 'You already showed up that day', 409);
    if (passes.length >= REST_PASSES) return error('NO_PASSES_LEFT', 'Both rest passes are used this week', 409);
    const next = [...passes, day].sort().join(',');
    const upd = await env.DB.prepare(
      `UPDATE weekly_commitments SET pass_days = ?, updated_at = ? WHERE id = ? AND pass_days = ?`
    )
      .bind(next, new Date().toISOString(), row.id, row.pass_days)
      .run();
    if (Number((upd as { meta?: { changes?: number } }).meta?.changes ?? 0) !== 1) {
      return error('CONFLICT', 'Something changed — try again', 409);
    }
  }
  const fresh = await loadCommitment(env, me, c.week);
  return json({ commitment: await progressFor(env, me, fresh ?? row, c.today) });
}

async function undoPass(request: Request, env: Env, day: string): Promise<Response> {
  const me = await authed(request, env);
  if (!me) return unauthorized();
  const c = await commitmentCtx(env, me);
  const row = await loadCommitment(env, me, c.week);
  if (!row) return error('NOT_FOUND', 'No weekly goal this week', 404);
  const next = parsePassDays(row.pass_days).filter((d) => d !== day).join(',');
  await env.DB.prepare(`UPDATE weekly_commitments SET pass_days = ?, updated_at = ? WHERE id = ?`)
    .bind(next, new Date().toISOString(), row.id)
    .run();
  return json({ commitment: await progressFor(env, me, { ...row, pass_days: next }, c.today) });
}

async function listCommitments(request: Request, env: Env): Promise<Response> {
  const me = await authed(request, env);
  if (!me) return unauthorized();
  const url = new URL(request.url);
  const limit = Math.min(HISTORY_MAX, Math.max(1, Number(url.searchParams.get('limit')) || 8));
  const c = await commitmentCtx(env, me);
  await settleCommitments(env, me, c.today);
  const res = await env.DB.prepare(
    `SELECT ${COMMIT_COLS} FROM weekly_commitments WHERE user_id = ? ORDER BY week_start DESC LIMIT ${limit}`
  )
    .bind(me)
    .all<CommitmentRow>();
  const rows = res.results || [];
  if (!rows.length) return json({ commitments: [] });
  const active = await activeDaysIn(env, me, rows[rows.length - 1].week_start, addDays(rows[0].week_start, 6));
  return json({ commitments: rows.map((r) => commitmentProgress(r, active, c.today)) });
}

// ---------------------------------------------------------------------------
// Cron (hourly)

export const NUDGE_TITLE = 'Your week in 2 minutes';
export const NUDGE_BODY = 'A few quick questions to close your week. Skip anything you like.';

/** Saturday ≥ 12:00 (or Sunday, catching up) local: one nudge per user per week. */
export async function sendSaturdayNudges(env: Env, now: Date): Promise<number> {
  const tzRes = await env.DB.prepare(`SELECT DISTINCT timezone FROM users LIMIT 1000`).all<{ timezone: string | null }>();
  let sent = 0;
  for (const { timezone } of tzRes.results || []) {
    const w = checkinWindow(timezone, now);
    const { dow } = localClock(timezone, now);
    // Nudge only Saturday noon → Sunday night (not Monday morning).
    if (!w.open || dow === 1) continue;
    const runId = `${now.toISOString()}#${Math.random().toString(36).slice(2, 8)}`;
    await env.DB.prepare(
      `INSERT OR IGNORE INTO weekly_nudges (user_id, week, kind, sent_at)
       SELECT u.id, ?, 'saturday', ? FROM users u
       WHERE u.timezone IS ? AND u.email_verified = 1
         AND NOT EXISTS (SELECT 1 FROM weekly_nudges n WHERE n.user_id = u.id AND n.week = ? AND n.kind = 'saturday')
         AND NOT EXISTS (SELECT 1 FROM weekly_checkins c WHERE c.user_id = u.id AND c.week = ?)
       LIMIT ${NUDGE_BATCH}`
    )
      .bind(w.week, runId, timezone, w.week, w.week)
      .run();
    const res = await env.DB.prepare(
      `INSERT INTO user_notifications (id, user_id, actor_id, type, title, body, ref_type, ref_id, created_at)
       SELECT 'unotif_' || lower(hex(randomblob(10))), n.user_id, NULL, 'system', ?, ?, 'weekly_checkin', ?, datetime('now')
       FROM weekly_nudges n WHERE n.week = ? AND n.kind = 'saturday' AND n.sent_at = ?`
    )
      .bind(NUDGE_TITLE, NUDGE_BODY, w.week, w.week, runId)
      .run();
    sent += Number((res as { meta?: { changes?: number } }).meta?.changes ?? 0);
  }
  return sent;
}

/** Coaches with client check-ins not yet pinged (each guarded by its 1-hour gap). */
export async function flushCoachPings(env: Env, now: Date): Promise<number> {
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const res = await env.DB.prepare(
    `SELECT DISTINCT c.instructor_id AS coach_id
     FROM weekly_checkins w
     JOIN coaching_contracts c ON c.client_id = w.user_id AND c.status = 'active'
     LEFT JOIN weekly_coach_pings p ON p.coach_id = c.instructor_id
     WHERE w.shared_with_coach = 1 AND w.submitted_at > ?
       AND (p.last_sent_at IS NULL OR w.submitted_at > p.last_sent_at)
     LIMIT 500`
  )
    .bind(since)
    .all<{ coach_id: string }>();
  let n = 0;
  for (const r of res.results || []) {
    try {
      if (await flushCoachPing(env, r.coach_id, now)) n++;
    } catch (err) {
      console.error('[weekly] coach ping', err);
    }
  }
  return n;
}

export async function runCron(env: Env, now: Date): Promise<void> {
  try {
    await sendSaturdayNudges(env, now);
  } catch (err) {
    console.error('[weekly] saturday nudges', err);
  }
  try {
    await flushCoachPings(env, now);
  } catch (err) {
    console.error('[weekly] coach pings', err);
  }
}
