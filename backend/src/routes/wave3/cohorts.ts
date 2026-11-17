/**
 * Wave 5 — Group (cohort) plans: one coach guides 2–150 members together.
 * No payments: "No payment through Grow! yet — agree payment directly with your coach."
 *
 *   POST   /cohorts                               coach creates { title, path?, description?, weeks, start_date, capacity }
 *   GET    /cohorts                               → { coaching, member, invites }
 *   GET    /cohorts/preview?code=                 → { cohort } (summary to show before joining)
 *   GET    /cohorts/:id                           → { cohort, members, group, mine? }
 *   PATCH  /cohorts/:id                           coach edits / archives
 *   POST   /cohorts/:id/invite-code               coach rotates the code → { invite_code, invite_link }
 *   POST   /cohorts/join                          { code } | { cohort_id } (direct invite) → { cohort }
 *   POST   /cohorts/:id/leave                     member leaves
 *   DELETE /cohorts/:id/members/:userId           coach removes a member
 *   GET    /cohorts/:id/invite-candidates         coach: clients + friends not in the group
 *   POST   /cohorts/:id/invites                   coach invites { user_ids } (clients / friends only)
 *   POST   /cohorts/:id/decline                   invitee declines a direct invite
 *
 *   GET    /cohorts/:id/posts?before=&limit=      updates feed
 *   POST   /cohorts/:id/posts                     coach broadcast { body, media_url? } → members notified (one statement)
 *   DELETE /cohorts/:id/posts/:postId             coach
 *   GET    /cohorts/:id/posts/:postId/replies
 *   POST   /cohorts/:id/posts/:postId/replies     { body } (one level)
 *   POST   /cohorts/:id/posts/:postId/react       toggles ❤️ → { hearts, hearted_by_me }
 *
 *   GET    /cohorts/:id/homework                  coach: grid members × assignments; member: own + group %
 *   POST   /cohorts/:id/homework                  coach assigns { title, description?, due_at?, proof_kind? } → fan-out
 *   DELETE /cohorts/:id/homework/:hwId            coach
 *   POST   /cohorts/:id/homework/complete         member { member_assignment_id, status, proof_id?, proof_kind? }
 *   POST   /cohorts/:id/homework/seen             coach bulk { member_assignment_ids? | assignment_id? }
 *
 *   GET    /cohorts/:id/progress                  coach weekly summary
 *
 * Privacy: members see each other's name/avatar and group posts — never each other's
 * homework records, proofs or check-ins. Only the coach sees per-member completions;
 * members get their own records plus a group completion %.
 *
 * Member homework ids are prefixed `cohort_asg_`; proofs reference them as
 * context { type: 'assignment', id }. `cohortCoachCanSeeProof` lets the proofs module
 * grant the group's coach access to those proofs.
 */
import { z } from 'zod';
import type { Env } from '../../types';
import { json, error } from '../../utils/response';
import { getRequestContext } from '../../utils/auth';
import { withIdempotency } from '../../utils/idempotency';
import { generateId } from '../../utils/id';
import { addDays, localDay, safeTimeZone } from '../../utils/days';
import { generateInviteCode, normalizeInviteCode } from '../../utils/invites';
import { createUserNotification, type NotificationType } from '../../utils/notifications';

export const COHORT_MIN_CAPACITY = 2;
export const COHORT_MAX_CAPACITY = 150;
export const COHORT_MAX_WEEKS = 12;
export const MAX_ACTIVE_COHORTS = 30;
export const POST_MAX = 2000;
export const REPLY_MAX = 600;
export const INVITE_BATCH_MAX = 50;
export const SEEN_BATCH_MAX = 300;
export const INACTIVE_DAYS = 5;
export const IN_CHUNK = 90;
export const COHORT_DEEP_LINK = 'growl://cohort/';
export const COHORT_BILLING_NOTE = 'No payment through Grow! yet — agree payment directly with your coach.';
const PROOF_KINDS = ['note', 'timer', 'number', 'photo', 'voice'] as const;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = '[A-Za-z0-9_.:-]{1,128}';

// ---------------------------------------------------------------------------
// Schemas

const daySchema = z.string().regex(DAY_RE, 'Use YYYY-MM-DD');

const createSchema = z.object({
  title: z.string().trim().min(2).max(80),
  path: z.string().trim().max(40).nullish(),
  description: z.string().trim().max(1000).nullish(),
  weeks: z.number().int().min(1).max(COHORT_MAX_WEEKS),
  start_date: daySchema,
  capacity: z.number().int().min(COHORT_MIN_CAPACITY).max(COHORT_MAX_CAPACITY),
  visibility: z.literal('invite').optional(),
});

const patchSchema = z
  .object({
    title: z.string().trim().min(2).max(80),
    path: z.string().trim().max(40).nullable(),
    description: z.string().trim().max(1000).nullable(),
    weeks: z.number().int().min(1).max(COHORT_MAX_WEEKS),
    start_date: daySchema,
    capacity: z.number().int().min(COHORT_MIN_CAPACITY).max(COHORT_MAX_CAPACITY),
    status: z.enum(['active', 'archived']),
  })
  .partial();

const joinSchema = z
  .object({ code: z.string().max(32).optional(), cohort_id: z.string().max(128).optional() })
  .refine((v) => !!(v.code || v.cohort_id), { message: 'code or cohort_id is required' });

const inviteSchema = z.object({ user_ids: z.array(z.string().min(1).max(128)).min(1).max(INVITE_BATCH_MAX) });

const postSchema = z.object({
  body: z.string().trim().min(1).max(POST_MAX),
  media_url: z.string().trim().url().max(600).nullish(),
});

const replySchema = z.object({ body: z.string().trim().min(1).max(REPLY_MAX) });

const homeworkSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullish(),
  due_at: daySchema.nullish(),
  proof_kind: z.enum(PROOF_KINDS).nullish(),
});

const completeSchema = z.object({
  member_assignment_id: z.string().min(1).max(128),
  status: z.enum(['done', 'partly', 'assigned']),
  proof_id: z.string().min(1).max(128).nullish(),
  proof_kind: z.enum(PROOF_KINDS).nullish(),
});

const seenSchema = z
  .object({
    member_assignment_ids: z.array(z.string().min(1).max(128)).max(SEEN_BATCH_MAX).optional(),
    assignment_id: z.string().min(1).max(128).optional(),
  })
  .refine((v) => !!(v.member_assignment_ids?.length || v.assignment_id), {
    message: 'member_assignment_ids or assignment_id is required',
  });

// ---------------------------------------------------------------------------
// Types

type CohortRow = {
  id: string;
  coach_id: string;
  title: string;
  path: string | null;
  description: string | null;
  weeks: number;
  start_date: string;
  capacity: number;
  visibility: string;
  invite_code: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type Role = 'coach' | 'member';

export type PublicUser = { id: string; username: string; display_name: string | null; avatar_url: string | null };

type UserInfo = PublicUser & { tz: string };

type Me = { userId: string; isInstructor: boolean; tz: string };

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)

export function chunks<T>(items: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** 1-based program week for `today`, clamped to [0, weeks + 1] (0 = not started, weeks+1 = finished). */
export function programWeek(startDate: string, weeks: number, today: string): number {
  if (today < startDate) return 0;
  const a = Date.parse(`${startDate}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  const w = Math.floor((b - a) / (7 * 86400000)) + 1;
  return Math.min(w, weeks + 1);
}

export function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/** Whole days between two YYYY-MM-DD keys (b − a). */
export function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** Media must come from our own public 'post' upload purpose (…/media/post/…). */
export function isPostMediaUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    return /\/media\/post\//.test(decodeURIComponent(u.pathname));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Data access

async function requireMe(request: Request, env: Env): Promise<Me | Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) return error('UNAUTHORIZED', 'Authentication required', 401);
  const u = ctx.user as unknown as { is_instructor?: unknown; timezone?: unknown } | undefined;
  return { userId: ctx.userId, isInstructor: !!Number(u?.is_instructor ?? 0), tz: safeTimeZone(u?.timezone) };
}

async function readJson(request: Request): Promise<unknown | Response> {
  try {
    return await request.json();
  } catch {
    return error('INVALID_JSON', 'Invalid JSON in request body', 400);
  }
}

function invalid(err: z.ZodError): Response {
  return error('VALIDATION_ERROR', 'Invalid request data', 400, err.errors);
}

function changes(res: unknown): number {
  return Number((res as { meta?: { changes?: number } })?.meta?.changes ?? 0);
}

function parseMeta(raw: unknown): Record<string, unknown> {
  try {
    const m = JSON.parse(String(raw || '{}'));
    return m && typeof m === 'object' ? (m as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

async function loadUsers(env: Env, ids: string[]): Promise<Map<string, UserInfo>> {
  const out = new Map<string, UserInfo>();
  for (const part of chunks([...new Set(ids.filter(Boolean))])) {
    const ph = part.map(() => '?').join(', ');
    const res = await env.DB.prepare(`SELECT id, metadata, timezone FROM users WHERE id IN (${ph})`)
      .bind(...part)
      .all<Record<string, unknown>>();
    for (const r of res.results || []) {
      const meta = parseMeta(r.metadata);
      const id = String(r.id);
      out.set(id, {
        id,
        username: str(meta.username) || id.slice(0, 8),
        display_name: str(meta.display_name) || str(meta.name),
        avatar_url: str(meta.avatar) || str(meta.avatar_url),
        tz: safeTimeZone(r.timezone),
      });
    }
  }
  return out;
}

function publicUser(u: UserInfo | undefined, fallbackId: string): PublicUser {
  if (!u) return { id: fallbackId, username: 'Someone', display_name: null, avatar_url: null };
  return { id: u.id, username: u.username, display_name: u.display_name, avatar_url: u.avatar_url };
}

function nameOf(u: UserInfo | undefined): string {
  return u?.display_name || u?.username || 'Someone';
}

async function getCohort(env: Env, id: string): Promise<CohortRow | null> {
  return env.DB.prepare(`SELECT * FROM cohorts WHERE id = ?`).bind(id).first<CohortRow>();
}

async function roleOf(env: Env, cohort: CohortRow, userId: string): Promise<Role | null> {
  if (cohort.coach_id === userId) return 'coach';
  const row = await env.DB.prepare(
    `SELECT 1 AS ok FROM cohort_members WHERE cohort_id = ? AND user_id = ? AND status = 'active'`
  )
    .bind(cohort.id, userId)
    .first();
  return row ? 'member' : null;
}

async function isInvited(env: Env, cohortId: string, userId: string): Promise<boolean> {
  const row = await env.DB.prepare(`SELECT 1 AS ok FROM cohort_invites WHERE cohort_id = ? AND user_id = ?`)
    .bind(cohortId, userId)
    .first();
  return !!row;
}

async function activeCount(env: Env, cohortId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM cohort_members WHERE cohort_id = ? AND status = 'active'`
  )
    .bind(cohortId)
    .first<{ n: number }>();
  return Number(row?.n) || 0;
}

async function isBlockedPair(env: Env, a: string, b: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 AS ok FROM user_relationships
     WHERE type = 'block' AND ((user_id = ? AND target_user_id = ?) OR (user_id = ? AND target_user_id = ?))
     LIMIT 1`
  )
    .bind(a, b, b, a)
    .first();
  return !!row;
}

async function touchMember(env: Env, cohortId: string, userId: string): Promise<void> {
  try {
    await env.DB.prepare(
      `UPDATE cohort_members SET last_active_at = datetime('now') WHERE cohort_id = ? AND user_id = ? AND status = 'active'`
    )
      .bind(cohortId, userId)
      .run();
  } catch (err) {
    console.error('[cohorts] touch', err);
  }
}

/** Group completion over all active members' homework records. */
async function groupCompletion(env: Env, cohortId: string): Promise<{ done: number; total: number; pct: number }> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN ma.status IN ('done','partly') THEN 1 ELSE 0 END) AS done
     FROM cohort_member_assignments ma
     JOIN cohort_members m ON m.cohort_id = ma.cohort_id AND m.user_id = ma.user_id AND m.status = 'active'
     WHERE ma.cohort_id = ?`
  )
    .bind(cohortId)
    .first<{ total: number | null; done: number | null }>();
  const total = Number(row?.total) || 0;
  const done = Number(row?.done) || 0;
  return { done, total, pct: pct(done, total) };
}

function serializeCohort(
  c: CohortRow,
  role: Role | 'invited',
  memberCount: number,
  coach: PublicUser,
  today: string
) {
  const isCoach = role === 'coach';
  return {
    id: c.id,
    title: c.title,
    path: c.path,
    description: c.description,
    weeks: Number(c.weeks),
    start_date: c.start_date,
    end_date: addDays(c.start_date, Number(c.weeks) * 7 - 1),
    current_week: programWeek(c.start_date, Number(c.weeks), today),
    capacity: Number(c.capacity),
    visibility: c.visibility,
    status: c.status,
    member_count: memberCount,
    spots_left: Math.max(0, Number(c.capacity) - memberCount),
    role,
    coach,
    invite_code: isCoach ? c.invite_code : null,
    invite_link: isCoach && c.invite_code ? `${COHORT_DEEP_LINK}${c.invite_code}` : null,
    billing_note: COHORT_BILLING_NOTE,
    created_at: c.created_at,
  };
}

async function countsFor(env: Env, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const part of chunks([...new Set(ids)])) {
    const ph = part.map(() => '?').join(', ');
    const res = await env.DB.prepare(
      `SELECT cohort_id, COUNT(*) AS n FROM cohort_members
       WHERE cohort_id IN (${ph}) AND status = 'active' GROUP BY cohort_id`
    )
      .bind(...part)
      .all<{ cohort_id: string; n: number }>();
    for (const r of res.results || []) out.set(r.cohort_id, Number(r.n) || 0);
  }
  return out;
}

async function allocateCode(env: Env, cohortId: string): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateInviteCode();
    try {
      await env.DB.prepare(`UPDATE cohorts SET invite_code = ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(code, cohortId)
        .run();
      return code;
    } catch (err) {
      if (/UNIQUE|constraint/i.test(String((err as Error)?.message ?? err))) continue;
      throw err;
    }
  }
  throw new Error('Could not allocate a cohort code');
}

/**
 * Batched in-app notification to every active member (one INSERT … SELECT, constant
 * params at any group size). Members with an unread notification of the same type
 * for this group in the last `coalesceMinutes` are skipped.
 */
async function notifyMembers(
  env: Env,
  cohort: CohortRow,
  input: { actorId: string; type: NotificationType; title: string; body: string | null; coalesceMinutes?: number }
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO user_notifications (id, user_id, actor_id, type, title, body, ref_type, ref_id, created_at)
       SELECT 'unotif_' || lower(hex(randomblob(12))), m.user_id, ?, ?, ?, ?, 'cohort', ?, datetime('now')
       FROM cohort_members m
       WHERE m.cohort_id = ? AND m.status = 'active' AND m.user_id != ?
         AND NOT EXISTS (
           SELECT 1 FROM user_notifications n
           WHERE n.user_id = m.user_id AND n.type = ? AND n.ref_id = ? AND n.read_at IS NULL
             AND n.created_at > datetime('now', ?)
         )`
    )
      .bind(
        input.actorId,
        input.type,
        input.title,
        input.body,
        cohort.id,
        cohort.id,
        input.actorId,
        input.type,
        cohort.id,
        `-${Math.max(0, Math.floor(input.coalesceMinutes ?? 0))} minutes`
      )
      .run();
  } catch (err) {
    console.error('[cohorts] notify members', err);
  }
}

/** Notify the coach at most once per window per group (any member as actor). */
async function notifyCoach(
  env: Env,
  cohort: CohortRow,
  input: { actorId: string; type: NotificationType; title: string; body: string | null; windowMinutes: number }
): Promise<void> {
  try {
    const recent = await env.DB.prepare(
      `SELECT 1 AS ok FROM user_notifications
       WHERE user_id = ? AND type = ? AND ref_id = ? AND read_at IS NULL AND created_at > datetime('now', ?)
       LIMIT 1`
    )
      .bind(cohort.coach_id, input.type, cohort.id, `-${input.windowMinutes} minutes`)
      .first();
    if (recent) return;
  } catch {
    /* fall through */
  }
  await createUserNotification(env, {
    userId: cohort.coach_id,
    actorId: input.actorId,
    type: input.type,
    title: input.title,
    body: input.body,
    refType: 'cohort',
    refId: cohort.id,
  });
}

/** Loaded through `SELECT *` so this module never depends on the proofs table's exact columns. */
async function loadProofs(env: Env, ids: string[]): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  try {
    for (const part of chunks([...new Set(ids.filter(Boolean))])) {
      const ph = part.map(() => '?').join(', ');
      const res = await env.DB.prepare(`SELECT * FROM proofs WHERE id IN (${ph})`)
        .bind(...part)
        .all<Record<string, unknown>>();
      for (const r of res.results || []) out.set(String(r.id), r);
    }
  } catch {
    /* proofs table not deployed yet */
  }
  return out;
}

type CellRow = {
  id: string;
  assignment_id: string;
  user_id: string;
  status: string;
  completed_at: string | null;
  proof_id: string | null;
  proof_kind: string | null;
  seen_at: string | null;
};

/** Proof object (shared contract) for a member homework record, or null. */
function proofFor(
  cell: CellRow,
  row: Record<string, unknown> | undefined,
  base: string
): Record<string, unknown> | null {
  if (!cell.proof_id) return null;
  const kind = (row?.kind as string) || cell.proof_kind || 'note';
  const hasMedia = row ? !!(row.media_key || row.media_url) : kind === 'photo' || kind === 'voice';
  const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
  return {
    id: cell.proof_id,
    user_id: cell.user_id,
    kind,
    text: (row?.text as string) ?? null,
    number: num(row?.number),
    unit: (row?.unit as string) ?? null,
    minutes: num(row?.minutes),
    duration_s: num(row?.duration_s),
    media_url: hasMedia ? `${base}/proofs/${encodeURIComponent(cell.proof_id)}/media` : null,
    media_expired: !!row?.media_expired_at,
    context_type: 'assignment',
    context_id: cell.id,
    path: (row?.path as string) ?? null,
    shared_with_coach: true,
    seen_by_coach_at: cell.seen_at,
    cheers: Number(row?.cheers) || 0,
    cheered_by_me: false,
    created_at: (row?.created_at as string) ?? cell.completed_at,
  };
}

/**
 * For the proofs module: may `viewerId` (a group coach) see a proof by `ownerId` for
 * homework record `contextId`? True only when the record belongs to the owner, the
 * viewer coaches that group, and the owner is still an active member.
 */
export async function cohortCoachCanSeeProof(
  env: Env,
  viewerId: string,
  ownerId: string,
  contextId: string
): Promise<boolean> {
  if (!contextId.startsWith('cohort_asg_')) return false;
  try {
    const row = await env.DB.prepare(
      `SELECT 1 AS ok FROM cohort_member_assignments ma
       JOIN cohorts c ON c.id = ma.cohort_id
       JOIN cohort_members m ON m.cohort_id = ma.cohort_id AND m.user_id = ma.user_id AND m.status = 'active'
       WHERE ma.id = ? AND ma.user_id = ? AND c.coach_id = ?`
    )
      .bind(contextId, ownerId, viewerId)
      .first();
    return !!row;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Cohort CRUD

async function createCohort(request: Request, env: Env, me: Me): Promise<Response> {
  if (!me.isInstructor) return error('NOT_A_COACH', 'Only coaches can start a group plan.', 403);
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;

  const open = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM cohorts WHERE coach_id = ? AND status = 'active'`
  )
    .bind(me.userId)
    .first<{ n: number }>();
  if ((Number(open?.n) || 0) >= MAX_ACTIVE_COHORTS) {
    return error('COHORT_LIMIT', `You can run up to ${MAX_ACTIVE_COHORTS} groups at a time. Archive one first.`, 409);
  }

  const id = generateId('cohort');
  await env.DB.prepare(
    `INSERT INTO cohorts (id, coach_id, title, path, description, weeks, start_date, capacity, visibility, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'invite', 'active', datetime('now'), datetime('now'))`
  )
    .bind(id, me.userId, d.title, d.path || null, d.description || null, d.weeks, d.start_date, d.capacity)
    .run();
  await allocateCode(env, id);

  const row = (await getCohort(env, id))!;
  const users = await loadUsers(env, [me.userId]);
  return json({ cohort: serializeCohort(row, 'coach', 0, publicUser(users.get(me.userId), me.userId), localDay(me.tz)) }, 201);
}

async function listCohorts(env: Env, me: Me): Promise<Response> {
  const coached = await env.DB.prepare(
    `SELECT * FROM cohorts WHERE coach_id = ? ORDER BY status = 'archived', created_at DESC LIMIT 100`
  )
    .bind(me.userId)
    .all<CohortRow>();
  const joined = await env.DB.prepare(
    `SELECT c.* FROM cohort_members m JOIN cohorts c ON c.id = m.cohort_id
     WHERE m.user_id = ? AND m.status = 'active'
     ORDER BY c.status = 'archived', m.joined_at DESC LIMIT 100`
  )
    .bind(me.userId)
    .all<CohortRow>();
  const invited = await env.DB.prepare(
    `SELECT c.*, i.invited_by AS invited_by, i.created_at AS invited_at FROM cohort_invites i
     JOIN cohorts c ON c.id = i.cohort_id
     WHERE i.user_id = ? AND c.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM cohort_members m WHERE m.cohort_id = c.id AND m.user_id = i.user_id AND m.status = 'active')
     ORDER BY i.created_at DESC LIMIT 30`
  )
    .bind(me.userId)
    .all<CohortRow & { invited_by: string; invited_at: string }>();

  const all = [...(coached.results || []), ...(joined.results || []), ...(invited.results || [])];
  const counts = await countsFor(env, all.map((c) => c.id));
  const users = await loadUsers(env, all.map((c) => c.coach_id));
  const today = localDay(me.tz);
  const ser = (c: CohortRow, role: Role | 'invited') =>
    serializeCohort(c, role, counts.get(c.id) ?? 0, publicUser(users.get(c.coach_id), c.coach_id), today);

  return json({
    coaching: (coached.results || []).map((c) => ser(c, 'coach')),
    member: (joined.results || []).map((c) => ser(c, 'member')),
    invites: (invited.results || []).map((c) => ({ cohort: ser(c, 'invited'), invited_at: c.invited_at })),
  });
}

async function previewByCode(env: Env, me: Me, url: URL): Promise<Response> {
  const code = normalizeInviteCode(url.searchParams.get('code'));
  if (!code) return error('INVALID_CODE', 'That code doesn’t look right — it has 8 letters and numbers.', 400);
  const c = await env.DB.prepare(`SELECT * FROM cohorts WHERE invite_code = ?`).bind(code).first<CohortRow>();
  if (!c || c.status !== 'active') return error('NOT_FOUND', 'We couldn’t find a group with that code.', 404);
  const role = (await roleOf(env, c, me.userId)) ?? 'invited';
  const users = await loadUsers(env, [c.coach_id]);
  const cohort = serializeCohort(c, role, await activeCount(env, c.id), publicUser(users.get(c.coach_id), c.coach_id), localDay(me.tz));
  return json({ cohort: { ...cohort, invite_code: null, invite_link: null } });
}

async function getDetail(env: Env, me: Me, id: string): Promise<Response> {
  const c = await getCohort(env, id);
  if (!c) return error('NOT_FOUND', 'Group not found', 404);
  const role = await roleOf(env, c, me.userId);
  const today = localDay(me.tz);

  if (!role) {
    // Invited people may look before joining (no member list).
    if (c.status === 'active' && (await isInvited(env, c.id, me.userId))) {
      const users = await loadUsers(env, [c.coach_id]);
      return json({
        cohort: serializeCohort(c, 'invited', await activeCount(env, c.id), publicUser(users.get(c.coach_id), c.coach_id), today),
        members: [],
        group: null,
        mine: null,
      });
    }
    return error('NOT_FOUND', 'Group not found', 404);
  }

  const res = await env.DB.prepare(
    `SELECT user_id, joined_at, last_active_at FROM cohort_members
     WHERE cohort_id = ? AND status = 'active' ORDER BY joined_at ASC LIMIT ${COHORT_MAX_CAPACITY}`
  )
    .bind(c.id)
    .all<{ user_id: string; joined_at: string; last_active_at: string | null }>();
  const rows = res.results || [];
  const users = await loadUsers(env, [c.coach_id, ...rows.map((r) => r.user_id)]);
  const members = rows.map((r) => ({
    user: publicUser(users.get(r.user_id), r.user_id),
    joined_at: r.joined_at,
    // Activity detail is coach-only.
    ...(role === 'coach' ? { last_active_at: r.last_active_at } : {}),
  }));

  const group = await groupCompletion(env, c.id);
  let mine: { done: number; total: number; pct: number } | null = null;
  if (role === 'member') {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN status IN ('done','partly') THEN 1 ELSE 0 END) AS done
       FROM cohort_member_assignments WHERE cohort_id = ? AND user_id = ?`
    )
      .bind(c.id, me.userId)
      .first<{ total: number | null; done: number | null }>();
    const total = Number(row?.total) || 0;
    const done = Number(row?.done) || 0;
    mine = { done, total, pct: pct(done, total) };
  }

  return json({
    cohort: serializeCohort(c, role, rows.length, publicUser(users.get(c.coach_id), c.coach_id), today),
    members,
    group: { completion_pct: group.pct },
    mine,
  });
}

async function patchCohort(request: Request, env: Env, me: Me, id: string): Promise<Response> {
  const c = await getCohort(env, id);
  if (!c || c.coach_id !== me.userId) return error('NOT_FOUND', 'Group not found', 404);
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;

  if (d.capacity !== undefined) {
    const n = await activeCount(env, c.id);
    if (d.capacity < n) {
      return error('CAPACITY_BELOW_MEMBERS', `The group already has ${n} members — capacity can’t go below that.`, 409);
    }
  }
  if (d.status === 'active' && c.status !== 'active') {
    const open = await env.DB.prepare(`SELECT COUNT(*) AS n FROM cohorts WHERE coach_id = ? AND status = 'active'`)
      .bind(me.userId)
      .first<{ n: number }>();
    if ((Number(open?.n) || 0) >= MAX_ACTIVE_COHORTS) {
      return error('COHORT_LIMIT', `You can run up to ${MAX_ACTIVE_COHORTS} groups at a time.`, 409);
    }
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  const add = (col: string, v: unknown) => {
    sets.push(`${col} = ?`);
    vals.push(v);
  };
  if (d.title !== undefined) add('title', d.title);
  if (d.path !== undefined) add('path', d.path || null);
  if (d.description !== undefined) add('description', d.description || null);
  if (d.weeks !== undefined) add('weeks', d.weeks);
  if (d.start_date !== undefined) add('start_date', d.start_date);
  if (d.capacity !== undefined) add('capacity', d.capacity);
  if (d.status !== undefined) add('status', d.status);
  if (sets.length) {
    await env.DB.prepare(`UPDATE cohorts SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`)
      .bind(...vals, c.id)
      .run();
  }
  return getDetail(env, me, c.id);
}

async function rotateCode(env: Env, me: Me, id: string): Promise<Response> {
  const c = await getCohort(env, id);
  if (!c || c.coach_id !== me.userId) return error('NOT_FOUND', 'Group not found', 404);
  const code = await allocateCode(env, c.id);
  return json({ invite_code: code, invite_link: `${COHORT_DEEP_LINK}${code}` });
}

// ---------------------------------------------------------------------------
// Membership

async function joinCohort(request: Request, env: Env, me: Me): Promise<Response> {
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const parsed = joinSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);

  let c: CohortRow | null = null;
  let viaInvite = false;
  if (parsed.data.code) {
    const code = normalizeInviteCode(parsed.data.code);
    if (!code) return error('INVALID_CODE', 'That code doesn’t look right — it has 8 letters and numbers.', 400);
    c = await env.DB.prepare(`SELECT * FROM cohorts WHERE invite_code = ?`).bind(code).first<CohortRow>();
    if (!c) return error('NOT_FOUND', 'We couldn’t find a group with that code.', 404);
    viaInvite = await isInvited(env, c.id, me.userId);
  } else {
    c = await getCohort(env, parsed.data.cohort_id!);
    viaInvite = !!c && (await isInvited(env, c.id, me.userId));
    if (!c || !viaInvite) return error('NOT_FOUND', 'Group not found', 404);
  }

  if (c.status !== 'active') return error('COHORT_CLOSED', 'This group isn’t taking new members.', 409);
  if (c.coach_id === me.userId) return error('IS_COACH', 'You’re the coach of this group.', 409);
  if (await isBlockedPair(env, me.userId, c.coach_id)) return error('NOT_FOUND', 'We couldn’t find a group with that code.', 404);

  const existing = await env.DB.prepare(`SELECT status FROM cohort_members WHERE cohort_id = ? AND user_id = ?`)
    .bind(c.id, me.userId)
    .first<{ status: string }>();
  if (existing?.status !== 'active') {
    if (existing?.status === 'removed' && !viaInvite) {
      return error('COHORT_REMOVED', 'Ask the coach to invite you again to rejoin this group.', 403);
    }
    // Capacity check and insert in one statement (no race past the cap).
    const res = await env.DB.prepare(
      `INSERT INTO cohort_members (cohort_id, user_id, status, joined_at)
       SELECT ?, ?, 'active', datetime('now')
       WHERE (SELECT COUNT(*) FROM cohort_members WHERE cohort_id = ? AND status = 'active') < ?
       ON CONFLICT(cohort_id, user_id) DO UPDATE SET status = 'active', joined_at = datetime('now'), left_at = NULL`
    )
      .bind(c.id, me.userId, c.id, Number(c.capacity))
      .run();
    if (changes(res) < 1) return error('COHORT_FULL', 'This group is full. Ask the coach about the next one.', 409);

    // Late joiners get the homework that is still open.
    const today = localDay(me.tz);
    await env.DB.prepare(
      `INSERT OR IGNORE INTO cohort_member_assignments (id, assignment_id, cohort_id, user_id, status, created_at)
       SELECT 'cohort_asg_' || lower(hex(randomblob(10))), a.id, a.cohort_id, ?, 'assigned', datetime('now')
       FROM cohort_assignments a WHERE a.cohort_id = ? AND (a.due_at IS NULL OR a.due_at >= ?)`
    )
      .bind(me.userId, c.id, today)
      .run();

    const users = await loadUsers(env, [me.userId]);
    await notifyCoach(env, c, {
      actorId: me.userId,
      type: 'cohort_join',
      title: `${nameOf(users.get(me.userId))} joined ${c.title}`,
      body: null,
      windowMinutes: 30,
    });
  }
  await env.DB.prepare(`DELETE FROM cohort_invites WHERE cohort_id = ? AND user_id = ?`).bind(c.id, me.userId).run();
  return getDetail(env, me, c.id);
}

async function leaveCohort(env: Env, me: Me, id: string): Promise<Response> {
  const c = await getCohort(env, id);
  if (!c) return error('NOT_FOUND', 'Group not found', 404);
  if (c.coach_id === me.userId) return error('IS_COACH', 'Coaches archive a group instead of leaving it.', 409);
  const res = await env.DB.prepare(
    `UPDATE cohort_members SET status = 'left', left_at = datetime('now') WHERE cohort_id = ? AND user_id = ? AND status = 'active'`
  )
    .bind(c.id, me.userId)
    .run();
  if (changes(res) < 1) return error('NOT_FOUND', 'Group not found', 404);
  return json({ ok: true });
}

async function removeMember(env: Env, me: Me, id: string, userId: string): Promise<Response> {
  const c = await getCohort(env, id);
  if (!c || c.coach_id !== me.userId) return error('NOT_FOUND', 'Group not found', 404);
  const res = await env.DB.prepare(
    `UPDATE cohort_members SET status = 'removed', left_at = datetime('now') WHERE cohort_id = ? AND user_id = ? AND status = 'active'`
  )
    .bind(c.id, userId)
    .run();
  if (changes(res) < 1) return error('NOT_FOUND', 'Member not found', 404);
  return json({ ok: true });
}

/** Coach's clients (any contract) + friends, minus blocks. */
async function candidateIds(env: Env, coachId: string): Promise<Map<string, 'client' | 'friend'>> {
  const out = new Map<string, 'client' | 'friend'>();
  const clients = await env.DB.prepare(
    `SELECT DISTINCT client_id AS id FROM coaching_contracts WHERE instructor_id = ? LIMIT 500`
  )
    .bind(coachId)
    .all<{ id: string }>();
  for (const r of clients.results || []) out.set(r.id, 'client');
  const friends = await env.DB.prepare(
    `SELECT target_user_id AS id FROM user_relationships WHERE user_id = ? AND type = 'friend' LIMIT 1000`
  )
    .bind(coachId)
    .all<{ id: string }>();
  for (const r of friends.results || []) if (!out.has(r.id)) out.set(r.id, 'friend');
  const blocks = await env.DB.prepare(
    `SELECT CASE WHEN user_id = ? THEN target_user_id ELSE user_id END AS id
     FROM user_relationships WHERE type = 'block' AND (user_id = ? OR target_user_id = ?)`
  )
    .bind(coachId, coachId, coachId)
    .all<{ id: string }>();
  for (const r of blocks.results || []) out.delete(r.id);
  out.delete(coachId);
  return out;
}

async function inviteCandidates(env: Env, me: Me, id: string): Promise<Response> {
  const c = await getCohort(env, id);
  if (!c || c.coach_id !== me.userId) return error('NOT_FOUND', 'Group not found', 404);
  const cands = await candidateIds(env, me.userId);
  const members = await env.DB.prepare(`SELECT user_id FROM cohort_members WHERE cohort_id = ? AND status = 'active'`)
    .bind(c.id)
    .all<{ user_id: string }>();
  for (const r of members.results || []) cands.delete(r.user_id);
  const invited = await env.DB.prepare(`SELECT user_id FROM cohort_invites WHERE cohort_id = ?`)
    .bind(c.id)
    .all<{ user_id: string }>();
  const invitedSet = new Set((invited.results || []).map((r) => r.user_id));
  const ids = [...cands.keys()].slice(0, 300);
  const users = await loadUsers(env, ids);
  const list = ids
    .filter((uid) => users.has(uid))
    .map((uid) => ({ user: publicUser(users.get(uid), uid), source: cands.get(uid)!, invited: invitedSet.has(uid) }))
    .sort(
      (a, b) =>
        (a.source === b.source ? 0 : a.source === 'client' ? -1 : 1) ||
        (a.user.display_name || a.user.username).localeCompare(b.user.display_name || b.user.username)
    );
  return json({ candidates: list });
}

async function inviteUsers(request: Request, env: Env, me: Me, id: string): Promise<Response> {
  const c = await getCohort(env, id);
  if (!c || c.coach_id !== me.userId) return error('NOT_FOUND', 'Group not found', 404);
  if (c.status !== 'active') return error('COHORT_CLOSED', 'This group is archived.', 409);
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);

  const cands = await candidateIds(env, me.userId);
  const wanted = [...new Set(parsed.data.user_ids)];
  const allowed = wanted.filter((u) => cands.has(u));
  const already = new Set<string>();
  for (const part of chunks(allowed)) {
    const ph = part.map(() => '?').join(', ');
    const res = await env.DB.prepare(
      `SELECT user_id FROM cohort_members WHERE cohort_id = ? AND status = 'active' AND user_id IN (${ph})`
    )
      .bind(c.id, ...part)
      .all<{ user_id: string }>();
    for (const r of res.results || []) already.add(r.user_id);
  }
  const targets = allowed.filter((u) => !already.has(u));
  const coachName = nameOf((await loadUsers(env, [me.userId])).get(me.userId));
  let invited = 0;
  for (const uid of targets) {
    const res = await env.DB.prepare(
      `INSERT OR IGNORE INTO cohort_invites (cohort_id, user_id, invited_by, created_at) VALUES (?, ?, ?, datetime('now'))`
    )
      .bind(c.id, uid, me.userId)
      .run();
    if (changes(res) < 1) continue;
    invited += 1;
    await createUserNotification(env, {
      userId: uid,
      actorId: me.userId,
      type: 'cohort_invite',
      title: `${coachName} invited you to the group “${c.title}”`,
      body: 'Grow together with a small group and your coach.',
      refType: 'cohort',
      refId: c.id,
      oncePerActorAndRef: true,
    });
  }
  return json({ invited, skipped: wanted.length - invited });
}

async function declineInvite(env: Env, me: Me, id: string): Promise<Response> {
  await env.DB.prepare(`DELETE FROM cohort_invites WHERE cohort_id = ? AND user_id = ?`).bind(id, me.userId).run();
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Updates feed

type PostRow = {
  id: string;
  cohort_id: string;
  author_id: string;
  body: string;
  media_url: string | null;
  hearts: number;
  reply_count: number;
  created_at: string;
};

type ReplyRow = { id: string; post_id: string; author_id: string; body: string; created_at: string };

async function access(env: Env, me: Me, id: string): Promise<{ c: CohortRow; role: Role } | Response> {
  const c = await getCohort(env, id);
  if (!c) return error('NOT_FOUND', 'Group not found', 404);
  const role = await roleOf(env, c, me.userId);
  if (!role) return error('NOT_FOUND', 'Group not found', 404);
  return { c, role };
}

async function listPosts(env: Env, me: Me, id: string, url: URL): Promise<Response> {
  const a = await access(env, me, id);
  if (a instanceof Response) return a;
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 50);
  const before = url.searchParams.get('before');
  const res = await env.DB.prepare(
    `SELECT * FROM cohort_posts WHERE cohort_id = ? ${before ? 'AND created_at < ?' : ''}
     ORDER BY created_at DESC, id DESC LIMIT ?`
  )
    .bind(...(before ? [a.c.id, before, limit + 1] : [a.c.id, limit + 1]))
    .all<PostRow>();
  const rows = (res.results || []).slice(0, limit);
  const hasMore = (res.results || []).length > limit;
  const ids = rows.map((r) => r.id);

  const hearted = new Set<string>();
  const latest = new Map<string, ReplyRow[]>();
  for (const part of chunks(ids)) {
    const ph = part.map(() => '?').join(', ');
    const h = await env.DB.prepare(
      `SELECT post_id FROM cohort_post_reactions WHERE user_id = ? AND post_id IN (${ph})`
    )
      .bind(me.userId, ...part)
      .all<{ post_id: string }>();
    for (const r of h.results || []) hearted.add(r.post_id);
    const rep = await env.DB.prepare(
      `SELECT id, post_id, author_id, body, created_at FROM (
         SELECT r.*, ROW_NUMBER() OVER (PARTITION BY post_id ORDER BY created_at DESC) AS rn
         FROM cohort_post_replies r WHERE post_id IN (${ph})
       ) WHERE rn <= 3 ORDER BY created_at ASC`
    )
      .bind(...part)
      .all<ReplyRow>();
    for (const r of rep.results || []) {
      const list = latest.get(r.post_id) ?? [];
      list.push(r);
      latest.set(r.post_id, list);
    }
  }
  const users = await loadUsers(env, [
    ...rows.map((r) => r.author_id),
    ...[...latest.values()].flat().map((r) => r.author_id),
  ]);
  const posts = rows.map((r) => serializePost(r, users, hearted.has(r.id), latest.get(r.id) ?? []));
  return json({ posts, next_cursor: hasMore && rows.length ? rows[rows.length - 1].created_at : null, role: a.role });
}

function serializeReply(r: ReplyRow, users: Map<string, UserInfo>) {
  return { id: r.id, post_id: r.post_id, author: publicUser(users.get(r.author_id), r.author_id), body: r.body, created_at: r.created_at };
}

function serializePost(r: PostRow, users: Map<string, UserInfo>, heartedByMe: boolean, replies: ReplyRow[]) {
  return {
    id: r.id,
    cohort_id: r.cohort_id,
    author: publicUser(users.get(r.author_id), r.author_id),
    body: r.body,
    media_url: r.media_url,
    hearts: Number(r.hearts) || 0,
    hearted_by_me: heartedByMe,
    reply_count: Number(r.reply_count) || 0,
    replies: replies.map((x) => serializeReply(x, users)),
    created_at: r.created_at,
  };
}

async function createPost(request: Request, env: Env, me: Me, id: string): Promise<Response> {
  const a = await access(env, me, id);
  if (a instanceof Response) return a;
  if (a.role !== 'coach') return error('FORBIDDEN', 'Only the coach can post updates to the group.', 403);
  if (a.c.status !== 'active') return error('COHORT_CLOSED', 'This group is archived.', 409);
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const mediaUrl = parsed.data.media_url || null;
  if (mediaUrl && !isPostMediaUrl(mediaUrl)) {
    return error('VALIDATION_ERROR', 'Photos must be uploaded through Grow!.', 400);
  }

  const postId = generateId('cpost');
  await env.DB.prepare(
    `INSERT INTO cohort_posts (id, cohort_id, author_id, body, media_url, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`
  )
    .bind(postId, a.c.id, me.userId, parsed.data.body, mediaUrl)
    .run();

  const users = await loadUsers(env, [me.userId]);
  const preview = parsed.data.body.length > 120 ? `${parsed.data.body.slice(0, 117)}…` : parsed.data.body;
  await notifyMembers(env, a.c, {
    actorId: me.userId,
    type: 'cohort_update',
    title: `${nameOf(users.get(me.userId))} posted in ${a.c.title}`,
    body: preview,
    coalesceMinutes: 30,
  });

  const row = await env.DB.prepare(`SELECT * FROM cohort_posts WHERE id = ?`).bind(postId).first<PostRow>();
  return json({ post: serializePost(row!, users, false, []) }, 201);
}

async function deletePost(env: Env, me: Me, id: string, postId: string): Promise<Response> {
  const a = await access(env, me, id);
  if (a instanceof Response) return a;
  if (a.role !== 'coach') return error('FORBIDDEN', 'Only the coach can remove updates.', 403);
  const res = await env.DB.prepare(`DELETE FROM cohort_posts WHERE id = ? AND cohort_id = ?`).bind(postId, a.c.id).run();
  if (changes(res) < 1) return error('NOT_FOUND', 'Update not found', 404);
  await env.DB.prepare(`DELETE FROM cohort_post_replies WHERE post_id = ?`).bind(postId).run();
  await env.DB.prepare(`DELETE FROM cohort_post_reactions WHERE post_id = ?`).bind(postId).run();
  return json({ ok: true });
}

async function getPost(env: Env, cohortId: string, postId: string): Promise<PostRow | null> {
  return env.DB.prepare(`SELECT * FROM cohort_posts WHERE id = ? AND cohort_id = ?`).bind(postId, cohortId).first<PostRow>();
}

async function listReplies(env: Env, me: Me, id: string, postId: string): Promise<Response> {
  const a = await access(env, me, id);
  if (a instanceof Response) return a;
  if (!(await getPost(env, a.c.id, postId))) return error('NOT_FOUND', 'Update not found', 404);
  const res = await env.DB.prepare(
    `SELECT id, post_id, author_id, body, created_at FROM cohort_post_replies WHERE post_id = ? ORDER BY created_at ASC LIMIT 300`
  )
    .bind(postId)
    .all<ReplyRow>();
  const rows = res.results || [];
  const users = await loadUsers(env, rows.map((r) => r.author_id));
  return json({ replies: rows.map((r) => serializeReply(r, users)) });
}

async function addReply(request: Request, env: Env, me: Me, id: string, postId: string): Promise<Response> {
  const a = await access(env, me, id);
  if (a instanceof Response) return a;
  if (a.c.status !== 'active') return error('COHORT_CLOSED', 'This group is archived.', 409);
  const post = await getPost(env, a.c.id, postId);
  if (!post) return error('NOT_FOUND', 'Update not found', 404);
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const parsed = replySchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);

  const replyId = generateId('creply');
  await env.DB.prepare(
    `INSERT INTO cohort_post_replies (id, post_id, cohort_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`
  )
    .bind(replyId, postId, a.c.id, me.userId, parsed.data.body)
    .run();
  await env.DB.prepare(`UPDATE cohort_posts SET reply_count = reply_count + 1 WHERE id = ?`).bind(postId).run();
  if (a.role === 'member') await touchMember(env, a.c.id, me.userId);

  const users = await loadUsers(env, [me.userId]);
  if (post.author_id !== me.userId) {
    await notifyCoach(env, a.c, {
      actorId: me.userId,
      type: 'cohort_reply',
      title: `New replies in ${a.c.title}`,
      body: `${nameOf(users.get(me.userId))}: ${parsed.data.body.slice(0, 100)}`,
      windowMinutes: 30,
    });
  }
  const row = await env.DB.prepare(
    `SELECT id, post_id, author_id, body, created_at FROM cohort_post_replies WHERE id = ?`
  )
    .bind(replyId)
    .first<ReplyRow>();
  return json({ reply: serializeReply(row!, users) }, 201);
}

async function reactPost(env: Env, me: Me, id: string, postId: string): Promise<Response> {
  const a = await access(env, me, id);
  if (a instanceof Response) return a;
  if (!(await getPost(env, a.c.id, postId))) return error('NOT_FOUND', 'Update not found', 404);
  const ins = await env.DB.prepare(
    `INSERT OR IGNORE INTO cohort_post_reactions (post_id, user_id, emoji, created_at) VALUES (?, ?, '❤️', datetime('now'))`
  )
    .bind(postId, me.userId)
    .run();
  let hearted = true;
  if (changes(ins) < 1) {
    await env.DB.prepare(`DELETE FROM cohort_post_reactions WHERE post_id = ? AND user_id = ?`).bind(postId, me.userId).run();
    hearted = false;
  }
  await env.DB.prepare(
    `UPDATE cohort_posts SET hearts = (SELECT COUNT(*) FROM cohort_post_reactions WHERE post_id = ?) WHERE id = ?`
  )
    .bind(postId, postId)
    .run();
  if (hearted && a.role === 'member') await touchMember(env, a.c.id, me.userId);
  const row = await env.DB.prepare(`SELECT hearts FROM cohort_posts WHERE id = ?`).bind(postId).first<{ hearts: number }>();
  return json({ hearts: Number(row?.hearts) || 0, hearted_by_me: hearted });
}

// ---------------------------------------------------------------------------
// Group homework

type AssignmentRow = {
  id: string;
  cohort_id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  proof_kind: string | null;
  created_at: string;
};

function serializeAssignment(r: AssignmentRow) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    due_at: r.due_at,
    proof_kind: r.proof_kind,
    created_at: r.created_at,
  };
}

/** Per-assignment done/total among active members. */
async function assignmentStats(env: Env, cohortId: string): Promise<Map<string, { done: number; partly: number; total: number }>> {
  const res = await env.DB.prepare(
    `SELECT ma.assignment_id AS id, COUNT(*) AS total,
            SUM(CASE WHEN ma.status = 'done' THEN 1 ELSE 0 END) AS done,
            SUM(CASE WHEN ma.status = 'partly' THEN 1 ELSE 0 END) AS partly
     FROM cohort_member_assignments ma
     JOIN cohort_members m ON m.cohort_id = ma.cohort_id AND m.user_id = ma.user_id AND m.status = 'active'
     WHERE ma.cohort_id = ? GROUP BY ma.assignment_id`
  )
    .bind(cohortId)
    .all<{ id: string; total: number; done: number; partly: number }>();
  const out = new Map<string, { done: number; partly: number; total: number }>();
  for (const r of res.results || []) {
    out.set(r.id, { done: Number(r.done) || 0, partly: Number(r.partly) || 0, total: Number(r.total) || 0 });
  }
  return out;
}

async function listHomework(env: Env, me: Me, id: string, apiBase: string): Promise<Response> {
  const a = await access(env, me, id);
  if (a instanceof Response) return a;
  const res = await env.DB.prepare(
    `SELECT * FROM cohort_assignments WHERE cohort_id = ? ORDER BY created_at DESC LIMIT 30`
  )
    .bind(a.c.id)
    .all<AssignmentRow>();
  const assignments = res.results || [];
  const stats = await assignmentStats(env, a.c.id);
  const withStats = assignments.map((r) => {
    const s = stats.get(r.id) ?? { done: 0, partly: 0, total: 0 };
    return { ...serializeAssignment(r), done: s.done, partly: s.partly, total: s.total, completion_pct: pct(s.done + s.partly, s.total) };
  });

  if (a.role === 'member') {
    const mine = await env.DB.prepare(
      `SELECT id, assignment_id, user_id, status, completed_at, proof_id, proof_kind, seen_at
       FROM cohort_member_assignments WHERE cohort_id = ? AND user_id = ?`
    )
      .bind(a.c.id, me.userId)
      .all<CellRow>();
    const byAsg = new Map((mine.results || []).map((r) => [r.assignment_id, r]));
    return json({
      role: 'member',
      assignments: withStats
        .filter((x) => byAsg.has(x.id))
        .map(({ done: _d, partly: _p, total: _t, ...x }) => {
          const m = byAsg.get(x.id)!;
          return {
            ...x,
            mine: {
              id: m.id,
              status: m.status,
              completed_at: m.completed_at,
              proof_id: m.proof_id,
              proof_kind: m.proof_kind,
              seen_at: m.seen_at,
            },
          };
        }),
    });
  }

  // Coach: members × assignments grid (active members only).
  const membersRes = await env.DB.prepare(
    `SELECT user_id FROM cohort_members WHERE cohort_id = ? AND status = 'active' ORDER BY joined_at ASC LIMIT ${COHORT_MAX_CAPACITY}`
  )
    .bind(a.c.id)
    .all<{ user_id: string }>();
  const memberIds = (membersRes.results || []).map((r) => r.user_id);
  const cellsRes = await env.DB.prepare(
    `SELECT ma.id, ma.assignment_id, ma.user_id, ma.status, ma.completed_at, ma.proof_id, ma.proof_kind, ma.seen_at
     FROM cohort_member_assignments ma
     JOIN cohort_members m ON m.cohort_id = ma.cohort_id AND m.user_id = ma.user_id AND m.status = 'active'
     WHERE ma.cohort_id = ?
       AND ma.assignment_id IN (SELECT id FROM cohort_assignments WHERE cohort_id = ? ORDER BY created_at DESC LIMIT 30)`
  )
    .bind(a.c.id, a.c.id)
    .all<CellRow>();
  const cells = cellsRes.results || [];
  const proofs = await loadProofs(env, cells.map((c) => c.proof_id || ''));
  const users = await loadUsers(env, memberIds);
  return json({
    role: 'coach',
    assignments: withStats,
    members: memberIds.map((uid) => publicUser(users.get(uid), uid)),
    cells: cells.map((cell) => ({
      id: cell.id,
      assignment_id: cell.assignment_id,
      user_id: cell.user_id,
      status: cell.status,
      completed_at: cell.completed_at,
      seen_at: cell.seen_at,
      proof: proofFor(cell, cell.proof_id ? proofs.get(cell.proof_id) : undefined, apiBase),
    })),
  });
}

async function createHomework(request: Request, env: Env, me: Me, id: string): Promise<Response> {
  const a = await access(env, me, id);
  if (a instanceof Response) return a;
  if (a.role !== 'coach') return error('FORBIDDEN', 'Only the coach can assign group homework.', 403);
  if (a.c.status !== 'active') return error('COHORT_CLOSED', 'This group is archived.', 409);
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const parsed = homeworkSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;

  const hwId = generateId('chw');
  await env.DB.prepare(
    `INSERT INTO cohort_assignments (id, cohort_id, title, description, due_at, proof_kind, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  )
    .bind(hwId, a.c.id, d.title, d.description || null, d.due_at || null, d.proof_kind || null)
    .run();

  // Fan-out: one completion record per active member, in one statement (constant params).
  const fan = await env.DB.prepare(
    `INSERT OR IGNORE INTO cohort_member_assignments (id, assignment_id, cohort_id, user_id, status, created_at)
     SELECT 'cohort_asg_' || lower(hex(randomblob(10))), ?, ?, m.user_id, 'assigned', datetime('now')
     FROM cohort_members m WHERE m.cohort_id = ? AND m.status = 'active'`
  )
    .bind(hwId, a.c.id, a.c.id)
    .run();

  await notifyMembers(env, a.c, {
    actorId: me.userId,
    type: 'cohort_homework',
    title: `New group homework in ${a.c.title}`,
    body: d.title,
    coalesceMinutes: 10,
  });

  const row = await env.DB.prepare(`SELECT * FROM cohort_assignments WHERE id = ?`).bind(hwId).first<AssignmentRow>();
  return json({ assignment: serializeAssignment(row!), assigned: changes(fan) }, 201);
}

async function deleteHomework(env: Env, me: Me, id: string, hwId: string): Promise<Response> {
  const a = await access(env, me, id);
  if (a instanceof Response) return a;
  if (a.role !== 'coach') return error('FORBIDDEN', 'Only the coach can remove homework.', 403);
  const res = await env.DB.prepare(`DELETE FROM cohort_assignments WHERE id = ? AND cohort_id = ?`).bind(hwId, a.c.id).run();
  if (changes(res) < 1) return error('NOT_FOUND', 'Homework not found', 404);
  await env.DB.prepare(`DELETE FROM cohort_member_assignments WHERE assignment_id = ?`).bind(hwId).run();
  return json({ ok: true });
}

async function completeHomework(request: Request, env: Env, me: Me, id: string): Promise<Response> {
  const a = await access(env, me, id);
  if (a instanceof Response) return a;
  if (a.role !== 'member') return error('FORBIDDEN', 'Only members complete group homework.', 403);
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const parsed = completeSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;

  const cell = await env.DB.prepare(
    `SELECT id, assignment_id, user_id, status, completed_at, proof_id, proof_kind, seen_at
     FROM cohort_member_assignments WHERE id = ? AND cohort_id = ? AND user_id = ?`
  )
    .bind(d.member_assignment_id, a.c.id, me.userId)
    .first<CellRow>();
  if (!cell) return error('NOT_FOUND', 'Homework not found', 404);

  let proofKind = d.proof_kind ?? null;
  if (d.proof_id) {
    const proofs = await loadProofs(env, [d.proof_id]);
    const p = proofs.get(d.proof_id);
    if (p) {
      if (String(p.user_id) !== me.userId) return error('VALIDATION_ERROR', 'That proof isn’t yours.', 400);
      if (typeof p.kind === 'string') proofKind = p.kind as typeof proofKind;
    }
  }

  if (d.status === 'assigned') {
    await env.DB.prepare(
      `UPDATE cohort_member_assignments SET status = 'assigned', completed_at = NULL, proof_id = NULL, proof_kind = NULL, seen_at = NULL WHERE id = ?`
    )
      .bind(cell.id)
      .run();
  } else {
    await env.DB.prepare(
      `UPDATE cohort_member_assignments
       SET status = ?, completed_at = COALESCE(completed_at, datetime('now')),
           proof_id = COALESCE(?, proof_id), proof_kind = COALESCE(?, proof_kind)
       WHERE id = ?`
    )
      .bind(d.status, d.proof_id || null, proofKind, cell.id)
      .run();
    await touchMember(env, a.c.id, me.userId);
    if (cell.status === 'assigned') {
      await notifyCoach(env, a.c, {
        actorId: me.userId,
        type: 'cohort_homework_done',
        title: `Homework coming in for ${a.c.title}`,
        body: 'Open the group to see who finished.',
        windowMinutes: 60,
      });
    }
  }
  const fresh = await env.DB.prepare(
    `SELECT id, assignment_id, user_id, status, completed_at, proof_id, proof_kind, seen_at FROM cohort_member_assignments WHERE id = ?`
  )
    .bind(cell.id)
    .first<CellRow>();
  return json({
    mine: {
      id: fresh!.id,
      status: fresh!.status,
      completed_at: fresh!.completed_at,
      proof_id: fresh!.proof_id,
      proof_kind: fresh!.proof_kind,
      seen_at: fresh!.seen_at,
    },
  });
}

async function markSeen(request: Request, env: Env, me: Me, id: string): Promise<Response> {
  const a = await access(env, me, id);
  if (a instanceof Response) return a;
  if (a.role !== 'coach') return error('FORBIDDEN', 'Only the coach can mark homework as seen.', 403);
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const parsed = seenSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  let updated = 0;
  if (parsed.data.assignment_id) {
    const res = await env.DB.prepare(
      `UPDATE cohort_member_assignments SET seen_at = datetime('now')
       WHERE cohort_id = ? AND assignment_id = ? AND status IN ('done','partly') AND seen_at IS NULL`
    )
      .bind(a.c.id, parsed.data.assignment_id)
      .run();
    updated += changes(res);
  }
  for (const part of chunks([...new Set(parsed.data.member_assignment_ids ?? [])])) {
    const ph = part.map(() => '?').join(', ');
    const res = await env.DB.prepare(
      `UPDATE cohort_member_assignments SET seen_at = datetime('now')
       WHERE cohort_id = ? AND id IN (${ph}) AND status IN ('done','partly') AND seen_at IS NULL`
    )
      .bind(a.c.id, ...part)
      .run();
    updated += changes(res);
  }
  if (updated) {
    // Keep the shared proof object in step ("seen ✓" on the member's proof).
    try {
      await env.DB.prepare(
        `UPDATE proofs SET seen_by_coach_at = datetime('now')
         WHERE seen_by_coach_at IS NULL AND id IN (
           SELECT proof_id FROM cohort_member_assignments
           WHERE cohort_id = ? AND proof_id IS NOT NULL AND seen_at IS NOT NULL
         )`
      )
        .bind(a.c.id)
        .run();
    } catch {
      /* proofs table not deployed yet */
    }
  }
  return json({ updated });
}

// ---------------------------------------------------------------------------
// Weekly progress (coach)

async function progress(env: Env, me: Me, id: string): Promise<Response> {
  const a = await access(env, me, id);
  if (a instanceof Response) return a;
  if (a.role !== 'coach') return error('FORBIDDEN', 'Only the coach sees group progress.', 403);
  const today = localDay(me.tz);
  const from = addDays(today, -6);

  const membersRes = await env.DB.prepare(
    `SELECT user_id, joined_at, last_active_at FROM cohort_members WHERE cohort_id = ? AND status = 'active' LIMIT ${COHORT_MAX_CAPACITY}`
  )
    .bind(a.c.id)
    .all<{ user_id: string; joined_at: string; last_active_at: string | null }>();
  const members = membersRes.results || [];
  const ids = members.map((m) => m.user_id);

  // Last app activity day per member (growth activity rows) + last homework completion here.
  const lastApp = new Map<string, string>();
  for (const part of chunks(ids)) {
    const ph = part.map(() => '?').join(', ');
    try {
      const res = await env.DB.prepare(
        `SELECT user_id, MAX(day) AS day FROM user_activity_days WHERE user_id IN (${ph}) AND kinds > 0 GROUP BY user_id`
      )
        .bind(...part)
        .all<{ user_id: string; day: string }>();
      for (const r of res.results || []) if (r.day) lastApp.set(r.user_id, r.day);
    } catch {
      /* activity table missing */
    }
  }
  const lastHw = new Map<string, string>();
  const hwRes = await env.DB.prepare(
    `SELECT user_id, MAX(completed_at) AS at FROM cohort_member_assignments
     WHERE cohort_id = ? AND completed_at IS NOT NULL GROUP BY user_id`
  )
    .bind(a.c.id)
    .all<{ user_id: string; at: string }>();
  for (const r of hwRes.results || []) if (r.at) lastHw.set(r.user_id, r.at.slice(0, 10));

  const users = await loadUsers(env, ids);
  let activeThisWeek = 0;
  const attention: { user: PublicUser; last_active_day: string | null; days_inactive: number }[] = [];
  for (const m of members) {
    const days = [lastApp.get(m.user_id), lastHw.get(m.user_id), m.last_active_at?.slice(0, 10)].filter(
      (d): d is string => !!d && DAY_RE.test(d)
    );
    const last = days.sort().pop() ?? null;
    if (last && last >= from) activeThisWeek += 1;
    const baseline = last && last > m.joined_at.slice(0, 10) ? last : m.joined_at.slice(0, 10);
    const inactive = Math.max(0, dayDiff(baseline, today));
    if (inactive >= INACTIVE_DAYS) {
      attention.push({ user: publicUser(users.get(m.user_id), m.user_id), last_active_day: last, days_inactive: inactive });
    }
  }
  attention.sort((x, y) => y.days_inactive - x.days_inactive);

  // Homework due (or set) this week.
  const wk = await env.DB.prepare(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN ma.status IN ('done','partly') THEN 1 ELSE 0 END) AS done
     FROM cohort_member_assignments ma
     JOIN cohort_assignments a ON a.id = ma.assignment_id
     JOIN cohort_members m ON m.cohort_id = ma.cohort_id AND m.user_id = ma.user_id AND m.status = 'active'
     WHERE ma.cohort_id = ?
       AND ((a.due_at IS NOT NULL AND a.due_at >= ? AND a.due_at <= ?)
         OR (a.due_at IS NULL AND date(a.created_at) >= ?))`
  )
    .bind(a.c.id, from, today, from)
    .first<{ total: number | null; done: number | null }>();
  const weekTotal = Number(wk?.total) || 0;
  const weekDone = Number(wk?.done) || 0;
  const overall = await groupCompletion(env, a.c.id);

  return json({
    week: { from, to: today, current_week: programWeek(a.c.start_date, Number(a.c.weeks), today), weeks: Number(a.c.weeks) },
    members_total: members.length,
    active_this_week: activeThisWeek,
    active_pct: pct(activeThisWeek, members.length),
    completion_pct: pct(weekDone, weekTotal),
    completions_this_week: { done: weekDone, total: weekTotal },
    overall_completion_pct: overall.pct,
    needs_attention: attention.slice(0, 50),
    inactive_days_threshold: INACTIVE_DAYS,
  });
}

// ---------------------------------------------------------------------------
// Router

export async function handle(
  request: Request,
  env: Env,
  path: string,
  apiPrefix: string,
): Promise<Response | null> {
  const base = `${apiPrefix}/cohorts`;
  if (path !== base && !path.startsWith(`${base}/`)) return null;
  const method = request.method.toUpperCase();
  const rest = path.slice(base.length).replace(/\/+$/, '');
  const url = new URL(request.url);

  const run = async (fn: (me: Me) => Promise<Response>, idempotent = false): Promise<Response> => {
    const exec = async () => {
      const me = await requireMe(request, env);
      if (me instanceof Response) return me;
      return fn(me);
    };
    return idempotent ? withIdempotency(request, env, exec) : exec();
  };

  try {
    if (rest === '') {
      if (method === 'GET') return await run((me) => listCohorts(env, me));
      if (method === 'POST') return await run((me) => createCohort(request, env, me), true);
      return null;
    }
    if (rest === '/join' && method === 'POST') return await run((me) => joinCohort(request, env, me));
    if (rest === '/preview' && method === 'GET') return await run((me) => previewByCode(env, me, url));

    const m = rest.match(new RegExp(`^/(${ID_RE})(?:/(.*))?$`));
    if (!m) return null;
    const id = decodeURIComponent(m[1]);
    const sub = m[2] ?? '';
    const apiBase = `${url.origin}${apiPrefix}`;

    if (sub === '') {
      if (method === 'GET') return await run((me) => getDetail(env, me, id));
      if (method === 'PATCH') return await run((me) => patchCohort(request, env, me, id));
      return null;
    }
    if (sub === 'invite-code' && method === 'POST') return await run((me) => rotateCode(env, me, id));
    if (sub === 'leave' && method === 'POST') return await run((me) => leaveCohort(env, me, id));
    if (sub === 'decline' && method === 'POST') return await run((me) => declineInvite(env, me, id));
    if (sub === 'invite-candidates' && method === 'GET') return await run((me) => inviteCandidates(env, me, id));
    if (sub === 'invites' && method === 'POST') return await run((me) => inviteUsers(request, env, me, id));
    if (sub === 'progress' && method === 'GET') return await run((me) => progress(env, me, id));

    let s = sub.match(new RegExp(`^members/(${ID_RE})$`));
    if (s && method === 'DELETE') return await run((me) => removeMember(env, me, id, decodeURIComponent(s![1])));

    if (sub === 'posts') {
      if (method === 'GET') return await run((me) => listPosts(env, me, id, url));
      if (method === 'POST') return await run((me) => createPost(request, env, me, id), true);
      return null;
    }
    s = sub.match(new RegExp(`^posts/(${ID_RE})(?:/(replies|react))?$`));
    if (s) {
      const postId = decodeURIComponent(s[1]);
      if (!s[2] && method === 'DELETE') return await run((me) => deletePost(env, me, id, postId));
      if (s[2] === 'replies' && method === 'GET') return await run((me) => listReplies(env, me, id, postId));
      if (s[2] === 'replies' && method === 'POST') return await run((me) => addReply(request, env, me, id, postId), true);
      if (s[2] === 'react' && method === 'POST') return await run((me) => reactPost(env, me, id, postId));
      return null;
    }

    if (sub === 'homework') {
      if (method === 'GET') return await run((me) => listHomework(env, me, id, apiBase));
      if (method === 'POST') return await run((me) => createHomework(request, env, me, id), true);
      return null;
    }
    if (sub === 'homework/complete' && method === 'POST') return await run((me) => completeHomework(request, env, me, id));
    if (sub === 'homework/seen' && method === 'POST') return await run((me) => markSeen(request, env, me, id));
    s = sub.match(new RegExp(`^homework/(${ID_RE})$`));
    if (s && method === 'DELETE') return await run((me) => deleteHomework(env, me, id, decodeURIComponent(s![1])));
  } catch (err) {
    console.error('[cohorts]', err);
    return error('INTERNAL_ERROR', 'Something went wrong with this group.', 500);
  }
  return null;
}

/** Optional hourly cron work for this module (called from scheduled()). Nothing scheduled yet. */
export async function runCron(_env: Env, _now: Date): Promise<void> {}
