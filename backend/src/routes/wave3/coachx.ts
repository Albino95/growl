import type { Env } from '../../types';
import { json, error } from '../../utils/response';
import { getRequestContext } from '../../utils/auth';
import { generateId } from '../../utils/id';
import { createUserNotification, resolveUsername } from '../../utils/notifications';
import { addDays, localDay, safeTimeZone } from '../../utils/days';
import { withIdempotency } from '../../utils/idempotency';

/**
 * Wave 4 coaching module (coachx). Return a Response for owned paths, else null.
 * All paths live under `{api}/instructor/x/…` so they never collide with the
 * existing `/instructor/instructors/:id` style matchers in the main router.
 *
 *   GET    /instructor/x/contracts/:id/notes      → private session notes (coach only)
 *   POST   /instructor/x/contracts/:id/notes      → add a note { body }
 *   DELETE /instructor/x/notes/:noteId            → delete own note
 *   PUT    /instructor/x/contracts/:id/sharing    → client toggles Today check-in sharing { share_checkins }
 *   GET    /instructor/x/contracts/:id/checkins   → last-7-days summary (coach needs consent; client sees own)
 *   POST   /instructor/x/assignments/:id/feedback → coach feedback on homework { body }
 *
 * No payments anywhere: coaching money terms are written agreements only.
 */
export async function handle(
  request: Request,
  env: Env,
  path: string,
  apiPrefix: string,
): Promise<Response | null> {
  const base = `${apiPrefix}/instructor/x/`;
  if (!path.startsWith(base)) return null;
  const rest = path.slice(base.length);
  const method = request.method;

  let m = rest.match(/^contracts\/([^/]+)\/(notes|sharing|checkins)$/);
  if (m) {
    const contractId = decodeURIComponent(m[1]);
    if (m[2] === 'notes' && method === 'GET') return listNotes(request, env, contractId);
    if (m[2] === 'notes' && method === 'POST') {
      return withIdempotency(request, env, () => addNote(request, env, contractId));
    }
    if (m[2] === 'sharing' && method === 'PUT') return setSharing(request, env, contractId);
    if (m[2] === 'checkins' && method === 'GET') return checkinSummary(request, env, contractId);
    return null;
  }
  m = rest.match(/^notes\/([^/]+)$/);
  if (m && method === 'DELETE') return deleteNote(request, env, decodeURIComponent(m[1]));
  m = rest.match(/^assignments\/([^/]+)\/feedback$/);
  if (m && method === 'POST') return homeworkFeedback(request, env, decodeURIComponent(m[1]));
  return null;
}

export const NOTE_MAX = 1000;
export const FEEDBACK_MAX = 600;
export const NOTES_LIMIT = 50;

type ContractLite = {
  id: string;
  instructor_id: string;
  client_id: string;
  status: string;
  share_checkins: number | null;
};

async function auth(request: Request, env: Env) {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) return null;
  return ctx;
}

async function loadContract(env: Env, id: string): Promise<ContractLite | null> {
  return env.DB.prepare(
    `SELECT id, instructor_id, client_id, status, share_checkins FROM coaching_contracts WHERE id = ?`
  )
    .bind(id)
    .first<ContractLite>();
}

async function readBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Session notes (private to the instructor)

async function listNotes(request: Request, env: Env, contractId: string): Promise<Response> {
  const ctx = await auth(request, env);
  if (!ctx) return error('UNAUTHORIZED', 'Authentication required', 401);
  const c = await loadContract(env, contractId);
  if (!c) return error('NOT_FOUND', 'Plan not found', 404);
  if (c.instructor_id !== ctx.userId) return error('FORBIDDEN', 'Session notes are private to the coach', 403);
  const rows = await env.DB.prepare(
    `SELECT id, body, created_at, updated_at FROM coaching_session_notes
     WHERE contract_id = ? AND instructor_id = ?
     ORDER BY created_at DESC LIMIT ${NOTES_LIMIT}`
  )
    .bind(contractId, ctx.userId)
    .all<{ id: string; body: string; created_at: string; updated_at: string }>();
  return json({ notes: rows.results || [] });
}

async function addNote(request: Request, env: Env, contractId: string): Promise<Response> {
  const ctx = await auth(request, env);
  if (!ctx) return error('UNAUTHORIZED', 'Authentication required', 401);
  const body = await readBody<{ body?: unknown }>(request);
  if (!body) return error('VALIDATION_ERROR', 'Invalid JSON', 400);
  const text = typeof body.body === 'string' ? body.body.trim().slice(0, NOTE_MAX) : '';
  if (!text) return error('VALIDATION_ERROR', 'Write something first', 400);
  const c = await loadContract(env, contractId);
  if (!c) return error('NOT_FOUND', 'Plan not found', 404);
  if (c.instructor_id !== ctx.userId) return error('FORBIDDEN', 'Only the coach can add session notes', 403);
  const id = generateId('cnote');
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO coaching_session_notes (id, contract_id, instructor_id, body, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(id, contractId, ctx.userId, text, now, now)
    .run();
  return json({ note: { id, body: text, created_at: now, updated_at: now } }, 201);
}

async function deleteNote(request: Request, env: Env, noteId: string): Promise<Response> {
  const ctx = await auth(request, env);
  if (!ctx) return error('UNAUTHORIZED', 'Authentication required', 401);
  const row = await env.DB.prepare(`SELECT instructor_id FROM coaching_session_notes WHERE id = ?`)
    .bind(noteId)
    .first<{ instructor_id: string }>();
  if (!row) return error('NOT_FOUND', 'Note not found', 404);
  if (row.instructor_id !== ctx.userId) return error('FORBIDDEN', 'Not your note', 403);
  await env.DB.prepare(`DELETE FROM coaching_session_notes WHERE id = ?`).bind(noteId).run();
  return json({ deleted: true });
}

// ---------------------------------------------------------------------------
// Check-in sharing (client consent, default OFF)

async function setSharing(request: Request, env: Env, contractId: string): Promise<Response> {
  const ctx = await auth(request, env);
  if (!ctx) return error('UNAUTHORIZED', 'Authentication required', 401);
  const body = await readBody<{ share_checkins?: unknown }>(request);
  if (!body || typeof body.share_checkins !== 'boolean') {
    return error('VALIDATION_ERROR', 'share_checkins must be true or false', 400);
  }
  const c = await loadContract(env, contractId);
  if (!c) return error('NOT_FOUND', 'Plan not found', 404);
  if (c.client_id !== ctx.userId) {
    return error('FORBIDDEN', 'Only the client can choose what to share', 403);
  }
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE coaching_contracts SET share_checkins = ?, share_checkins_at = ? WHERE id = ?`
  )
    .bind(body.share_checkins ? 1 : 0, now, contractId)
    .run();
  return json({ share_checkins: body.share_checkins });
}

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

/** Pure: fold raw daily_checkins rows into a 7-day summary ending on `today`. */
export function summarizeCheckins(
  rows: Array<{
    day: string;
    mood: number | null;
    rest: number | null;
    followup: string | null;
    intention: string | null;
  }>,
  today: string,
  span = 7
): CheckinSummary {
  const from = addDays(today, -(span - 1));
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const days: CheckinDay[] = [];
  let moodSum = 0;
  let moodN = 0;
  let checked = 0;
  let rest = 0;
  let followed = 0;
  for (let i = 0; i < span; i++) {
    const day = addDays(from, i);
    const r = byDay.get(day);
    const mood = r && r.mood != null ? Number(r.mood) : null;
    const isRest = !!r?.rest;
    const followup =
      r?.followup === 'yes' || r?.followup === 'partly' || r?.followup === 'no' ? r.followup : null;
    if (r) checked++;
    if (isRest) rest++;
    if (mood != null) {
      moodSum += mood;
      moodN++;
    }
    if (followup === 'yes' || followup === 'partly') followed++;
    days.push({
      day,
      checked_in: !!r,
      mood,
      rest: isRest,
      followup,
      intention: r?.intention ? String(r.intention).slice(0, 140) : null,
    });
  }
  return {
    from,
    to: today,
    days,
    checked_in_days: checked,
    rest_days: rest,
    avg_mood: moodN ? Math.round((moodSum / moodN) * 10) / 10 : null,
    followed_through: followed,
  };
}

async function checkinSummary(request: Request, env: Env, contractId: string): Promise<Response> {
  const ctx = await auth(request, env);
  if (!ctx) return error('UNAUTHORIZED', 'Authentication required', 401);
  const c = await loadContract(env, contractId);
  if (!c) return error('NOT_FOUND', 'Plan not found', 404);
  const isCoach = c.instructor_id === ctx.userId;
  const isClient = c.client_id === ctx.userId;
  if (!isCoach && !isClient) return error('FORBIDDEN', 'Not a party to this plan', 403);
  const shared = !!c.share_checkins;
  // Consent is checked on every read, so turning sharing off hides data immediately.
  if (isCoach && !shared) {
    return json({ shared: false, summary: null });
  }
  const tzRow = await env.DB.prepare(`SELECT timezone FROM users WHERE id = ?`)
    .bind(c.client_id)
    .first<{ timezone: string | null }>();
  const today = localDay(safeTimeZone(tzRow?.timezone));
  const from = addDays(today, -6);
  const rows = await env.DB.prepare(
    `SELECT day, mood, rest, followup, intention FROM daily_checkins
     WHERE user_id = ? AND day >= ? AND day <= ?
     ORDER BY day ASC`
  )
    .bind(c.client_id, from, today)
    .all<{ day: string; mood: number | null; rest: number | null; followup: string | null; intention: string | null }>();
  return json({ shared, summary: summarizeCheckins(rows.results || [], today) });
}

// ---------------------------------------------------------------------------
// Coach feedback on homework

async function homeworkFeedback(request: Request, env: Env, assignmentId: string): Promise<Response> {
  const ctx = await auth(request, env);
  if (!ctx) return error('UNAUTHORIZED', 'Authentication required', 401);
  const body = await readBody<{ body?: unknown }>(request);
  if (!body) return error('VALIDATION_ERROR', 'Invalid JSON', 400);
  const text = typeof body.body === 'string' ? body.body.trim().slice(0, FEEDBACK_MAX) : '';
  if (!text) return error('VALIDATION_ERROR', 'Write some feedback first', 400);
  const row = await env.DB.prepare(
    `SELECT a.id, a.title, a.contract_id, c.instructor_id, c.client_id
     FROM coaching_assignments a JOIN coaching_contracts c ON c.id = a.contract_id
     WHERE a.id = ?`
  )
    .bind(assignmentId)
    .first<{ id: string; title: string | null; contract_id: string; instructor_id: string; client_id: string }>();
  if (!row) return error('NOT_FOUND', 'Homework not found', 404);
  if (row.instructor_id !== ctx.userId) return error('FORBIDDEN', 'Only the coach can leave feedback', 403);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE coaching_assignments SET coach_feedback = ?, coach_feedback_at = ? WHERE id = ?`
  )
    .bind(text, now, assignmentId)
    .run();
  const coachName = await resolveUsername(env, ctx.userId!);
  await createUserNotification(env, {
    userId: row.client_id,
    actorId: ctx.userId,
    type: 'coaching_homework',
    title: `${coachName} left feedback on ${row.title ? `“${row.title.slice(0, 60)}”` : 'your homework'}`,
    body: text.slice(0, 140),
    refType: 'coaching_contract',
    refId: row.contract_id,
  });
  return json({ assignment_id: assignmentId, coach_feedback: text, coach_feedback_at: now });
}
