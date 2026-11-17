import { z } from 'zod';
import type { Env } from '../../types';
import { json, error } from '../../utils/response';
import { getRequestContext } from '../../utils/auth';
import { generateId } from '../../utils/id';
import { withIdempotency } from '../../utils/idempotency';
import { createUserNotification, resolveUsername } from '../../utils/notifications';
import { diffDays, isDayKey, localDay, safeTimeZone } from '../../utils/days';
import { awardPoints } from '../../utils/points';
import { checkRateLimit } from '../../utils/rateLimit';
import { areFriends, isBlocked } from '../friends';
import { PROOF_KEY_PREFIX, sniffContentType } from '../media';
import { cohortCoachCanSeeProof } from './cohorts';

/**
 * Wave 5 — proof of progress (migration 0044). Optional, never required for a
 * check-in or a streak; private by default.
 *
 *   POST   /proofs                 create (Idempotency-Key) → { proof, points_awarded }
 *   GET    /proofs?user_id=&context_type=&context_id=&from=&to=&limit=  → { proofs }
 *   GET    /proofs/:id             → { proof }            (anyone who may see it)
 *   PATCH  /proofs/:id             owner: { share_with_coach?, share_with_friends? }
 *   DELETE /proofs/:id             owner (deletes the file too)
 *   GET    /proofs/:id/media       private stream (Authorization), Cache-Control: private, no-store
 *   POST   /proofs/:id/cheer       friend / buddy / coach who can see it; toggles
 *   POST   /proofs/:id/seen        coach → { seen_by_coach_at }
 *
 * Who can see a proof:
 *   - the owner, always;
 *   - their coach, only while a plan is ACTIVE and the owner shared the proof
 *     (shared_with_coach) AND — for check-in / weekly proofs — Today check-in
 *     sharing is on for that plan (share_checkins); homework proofs need the
 *     assignment to belong to that plan;
 *   - friends / path buddies only when the owner turned on shared_with_friends.
 * Anyone else gets 404 (existence is not revealed). Media under proof/ is never
 * served by GET /media/:key.
 */

export const PROOF_KINDS = ['note', 'timer', 'number', 'photo', 'voice'] as const;
export type ProofKind = (typeof PROOF_KINDS)[number];
export const PROOF_CONTEXTS = ['checkin', 'assignment', 'weekly'] as const;
export type ProofContext = (typeof PROOF_CONTEXTS)[number];

export const PROOF_TEXT_MAX = 140;
export const PROOF_UNIT_MAX = 16;
export const PROOF_VOICE_MAX_S = 60;
/** Bonus per proof and daily cap — small on purpose; never needed for a streak. */
export const PROOF_POINTS = 1;
export const PROOF_POINTS_DAILY_MAX = 2;
export const PROOF_LIST_DEFAULT = 30;
export const PROOF_LIST_MAX = 100;
/** Media retention: personal proofs 365 days; coach-shared 90 days after the plan ended. */
export const PERSONAL_MEDIA_TTL_DAYS = 365;
export const COACH_MEDIA_TTL_DAYS = 90;
export const EXPIRY_BATCH = 50;
export const EXPIRY_MAX_BATCHES = 4;
const ID_CHUNK = 90;
/** Per-member group homework ids (wave3/cohorts.ts). */
const COHORT_ASG_PREFIX = 'cohort_asg_';
/** Orphan sweep: uploads under proof/ never attached to a proof are removed after 48 h. */
export const ORPHAN_MIN_AGE_MS = 48 * 3_600_000;
export const ORPHAN_LIST_LIMIT = 200;
export const ORPHAN_CURSOR_KEY = 'proofs:orphan_sweep_cursor';

export type ProofRow = {
  id: string;
  user_id: string;
  kind: ProofKind;
  text: string | null;
  number: number | null;
  unit: string | null;
  minutes: number | null;
  duration_s: number | null;
  media_key: string | null;
  media_type: string | null;
  media_expired_at: string | null;
  context_type: ProofContext;
  context_id: string;
  contract_id: string | null;
  path: string | null;
  day: string;
  shared_with_coach: number;
  shared_with_friends: number;
  seen_by_coach_at: string | null;
  points: number;
  created_at: string;
};

export type Proof = {
  id: string;
  user_id: string;
  kind: ProofKind;
  text: string | null;
  number: number | null;
  unit: string | null;
  minutes: number | null;
  duration_s: number | null;
  media_url: string | null;
  media_type: string | null;
  media_expired: boolean;
  context_type: ProofContext;
  context_id: string;
  path: string | null;
  day: string;
  shared_with_coach: boolean;
  shared_with_friends: boolean;
  seen_by_coach_at: string | null;
  cheers: number;
  cheered_by_me: boolean;
  created_at: string;
};

const PROOF_COLUMNS = `p.id, p.user_id, p.kind, p.text, p.number, p.unit, p.minutes, p.duration_s,
  p.media_key, p.media_type, p.media_expired_at, p.context_type, p.context_id, p.contract_id,
  p.path, p.day, p.shared_with_coach, p.shared_with_friends, p.seen_by_coach_at, p.points, p.created_at`;

// ---------------------------------------------------------------------------
// Router

export async function handle(
  request: Request,
  env: Env,
  path: string,
  apiPrefix: string,
): Promise<Response | null> {
  const base = `${apiPrefix}/proofs`;
  if (path !== base && !path.startsWith(`${base}/`)) return null;
  const method = request.method;
  const mediaBase = `${new URL(request.url).origin}${apiPrefix}`;

  if (path === base) {
    if (method === 'GET') return listProofs(request, env, mediaBase);
    if (method === 'POST') return withIdempotency(request, env, () => createProof(request, env, mediaBase));
    return null;
  }
  const m = path.slice(base.length + 1).match(/^([^/]+)(?:\/(media|cheer|seen))?$/);
  if (!m) return null;
  const id = decodeURIComponent(m[1]);
  const action = m[2];
  if (!action) {
    if (method === 'GET') return getOne(request, env, id, mediaBase);
    if (method === 'PATCH') return patchProof(request, env, id, mediaBase);
    if (method === 'DELETE') return deleteProof(request, env, id);
    return null;
  }
  if (action === 'media' && (method === 'GET' || method === 'HEAD')) return streamMedia(request, env, id);
  if (action === 'cheer' && method === 'POST') return toggleCheer(request, env, id);
  if (action === 'seen' && method === 'POST') return markSeen(request, env, id);
  return null;
}

// ---------------------------------------------------------------------------
// Helpers

type Me = { userId: string; tz: string };

async function auth(request: Request, env: Env): Promise<Me | null> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) return null;
  const tz = safeTimeZone((ctx.user as { timezone?: string } | null | undefined)?.timezone);
  return { userId: ctx.userId, tz };
}

async function readBody(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** One line, trimmed, capped. */
export function cleanProofText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, PROOF_TEXT_MAX);
  return t || null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(', ');
}

function nowIso(): string {
  return new Date().toISOString();
}

export function formatProof(
  row: ProofRow,
  mediaBase: string,
  cheers = 0,
  cheeredByMe = false,
): Proof {
  return {
    id: row.id,
    user_id: row.user_id,
    kind: row.kind,
    text: row.text ?? null,
    number: row.number == null ? null : Number(row.number),
    unit: row.unit ?? null,
    minutes: row.minutes == null ? null : Number(row.minutes),
    duration_s: row.duration_s == null ? null : Number(row.duration_s),
    media_url: row.media_key ? `${mediaBase}/proofs/${encodeURIComponent(row.id)}/media` : null,
    media_type: row.media_key ? row.media_type ?? null : null,
    media_expired: !row.media_key && !!row.media_expired_at,
    context_type: row.context_type,
    context_id: row.context_id,
    path: row.path ?? null,
    day: row.day,
    shared_with_coach: !!Number(row.shared_with_coach),
    shared_with_friends: !!Number(row.shared_with_friends),
    seen_by_coach_at: row.seen_by_coach_at ?? null,
    cheers,
    cheered_by_me: cheeredByMe,
    created_at: row.created_at,
  };
}

async function cheerStats(
  env: Env,
  ids: string[],
  viewerId: string,
): Promise<Map<string, { n: number; mine: boolean }>> {
  const out = new Map<string, { n: number; mine: boolean }>();
  for (const part of chunk(ids, ID_CHUNK)) {
    if (!part.length) continue;
    const rows = await env.DB.prepare(
      `SELECT proof_id, COUNT(*) AS n, SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS mine
       FROM proof_cheers WHERE proof_id IN (${placeholders(part.length)}) GROUP BY proof_id`
    )
      .bind(viewerId, ...part)
      .all<{ proof_id: string; n: number; mine: number }>();
    for (const r of rows.results || []) {
      out.set(r.proof_id, { n: Number(r.n) || 0, mine: Number(r.mine) > 0 });
    }
  }
  return out;
}

async function formatMany(env: Env, rows: ProofRow[], viewerId: string, mediaBase: string): Promise<Proof[]> {
  const stats = await cheerStats(env, rows.map((r) => r.id), viewerId);
  return rows.map((r) => {
    const s = stats.get(r.id);
    return formatProof(r, mediaBase, s?.n ?? 0, s?.mine ?? false);
  });
}

async function loadProof(env: Env, id: string): Promise<ProofRow | null> {
  return env.DB.prepare(`SELECT ${PROOF_COLUMNS} FROM proofs p WHERE p.id = ?`).bind(id).first<ProofRow>();
}

type ActivePlan = { id: string; share_checkins: number };

/** Active coaching plans where `coachId` coaches `clientId` (normally 0 or 1). */
async function activePlans(env: Env, coachId: string, clientId: string): Promise<ActivePlan[]> {
  if (coachId === clientId) return [];
  const rows = await env.DB.prepare(
    `SELECT id, share_checkins FROM coaching_contracts
     WHERE instructor_id = ? AND client_id = ? AND status = 'active' AND ends_at >= ?`
  )
    .bind(coachId, clientId, nowIso())
    .all<ActivePlan>();
  return rows.results || [];
}

/** The client's current active plan (latest), if any. */
async function activePlanForClient(env: Env, clientId: string): Promise<{ id: string; instructor_id: string } | null> {
  return env.DB.prepare(
    `SELECT id, instructor_id FROM coaching_contracts
     WHERE client_id = ? AND status = 'active' AND ends_at >= ?
     ORDER BY started_at DESC LIMIT 1`
  )
    .bind(clientId, nowIso())
    .first<{ id: string; instructor_id: string }>();
}

async function areBuddies(env: Env, a: string, b: string): Promise<boolean> {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const row = await env.DB.prepare(
    `SELECT 1 AS ok FROM path_buddies WHERE user_lo = ? AND user_hi = ? AND status = 'active' LIMIT 1`
  )
    .bind(lo, hi)
    .first<{ ok: number }>();
  return !!row;
}

/** Friend or active path buddy, and nobody blocked anybody. */
async function isCircle(env: Env, a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  if (await isBlocked(env, a, b)) return false;
  return (await areFriends(env, a, b)) || (await areBuddies(env, a, b));
}

export type ProofAccess = { owner: boolean; coach: boolean; friend: boolean };

/** What `viewerId` may do with `row`. All false → treat as not found. */
export async function proofAccess(env: Env, viewerId: string, row: ProofRow): Promise<ProofAccess> {
  if (row.user_id === viewerId) return { owner: true, coach: false, friend: false };
  let coach = false;
  if (Number(row.shared_with_coach)) {
    if (row.context_type === 'assignment' && row.context_id.startsWith(COHORT_ASG_PREFIX)) {
      // Group-plan homework: only that group's coach (checked before 1:1 plans).
      coach = await cohortCoachCanSeeProof(env, viewerId, row.user_id, row.context_id);
      const friend = !!Number(row.shared_with_friends) && (await isCircle(env, viewerId, row.user_id));
      return { owner: false, coach, friend };
    }
    const plans = await activePlans(env, viewerId, row.user_id);
    if (plans.length) {
      if (row.context_type === 'assignment') {
        const a = await env.DB.prepare(`SELECT contract_id FROM coaching_assignments WHERE id = ?`)
          .bind(row.context_id)
          .first<{ contract_id: string }>();
        coach = !!a && plans.some((p) => p.id === a.contract_id);
      } else {
        coach = plans.some((p) => !!Number(p.share_checkins));
      }
    }
  }
  const friend = !!Number(row.shared_with_friends) && (await isCircle(env, viewerId, row.user_id));
  return { owner: false, coach, friend };
}

const canSee = (a: ProofAccess) => a.owner || a.coach || a.friend;

// ---------------------------------------------------------------------------
// Create

const createSchema = z.object({
  kind: z.enum(PROOF_KINDS),
  text: z.string().max(1000).nullish(),
  number: z.number().finite().min(-1e9).max(1e9).nullish(),
  unit: z.string().max(40).nullish(),
  minutes: z.number().int().min(1).max(720).nullish(),
  duration_s: z.number().int().min(1).max(PROOF_VOICE_MAX_S + 1).nullish(),
  media_key: z.string().min(1).max(256).nullish(),
  context_type: z.enum(PROOF_CONTEXTS),
  context_id: z.string().min(1).max(80),
  path: z.string().max(80).nullish(),
  share_with_coach: z.boolean().optional(),
  share_with_friends: z.boolean().optional(),
});
export type CreateProofInput = z.infer<typeof createSchema>;

/** Pure: which fields a kind needs. Returns an error message or null. */
export function validateProofShape(input: CreateProofInput): string | null {
  const text = cleanProofText(input.text);
  switch (input.kind) {
    case 'note':
      if (!text) return 'Write one line first';
      break;
    case 'timer':
      if (input.minutes == null) return 'A timer proof needs minutes';
      break;
    case 'number':
      if (input.number == null) return 'Add a number first';
      break;
    case 'photo':
    case 'voice':
      if (!input.media_key) return input.kind === 'photo' ? 'Add a photo first' : 'Record a voice note first';
      break;
  }
  if (input.media_key && input.kind !== 'photo' && input.kind !== 'voice') {
    return 'Only photo and voice proofs carry a file';
  }
  return null;
}

async function createProof(request: Request, env: Env, mediaBase: string): Promise<Response> {
  const me = await auth(request, env);
  if (!me) return error('UNAUTHORIZED', 'Authentication required', 401);
  const raw = await readBody(request);
  if (!raw) return error('INVALID_JSON', 'Invalid JSON in request body', 400);
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return error('VALIDATION_ERROR', 'Invalid proof', 400, parsed.error.flatten());
  }
  const input = parsed.data;
  const shapeErr = validateProofShape(input);
  if (shapeErr) return error('VALIDATION_ERROR', shapeErr, 400);

  const { allowed } = await checkRateLimit(env, `proof:${me.userId}`, 60, 3600);
  if (!allowed) return error('RATE_LIMITED', 'Too many proofs right now. Try again later.', 429);

  const today = localDay(me.tz);

  // Context
  let contractId: string | null = null;
  let shareCoach = false;
  const wantCoach = input.share_with_coach;
  if (input.context_type === 'checkin') {
    if (!isDayKey(input.context_id) || Math.abs(diffDays(today, input.context_id)) > 1) {
      return error('VALIDATION_ERROR', 'Proof can only be added to today’s check-in', 400);
    }
  } else if (input.context_type === 'assignment' && input.context_id.startsWith(COHORT_ASG_PREFIX)) {
    // Group-plan homework: the caller's own per-member record.
    const own = await env.DB.prepare(`SELECT 1 AS ok FROM cohort_member_assignments WHERE id = ? AND user_id = ?`)
      .bind(input.context_id, me.userId)
      .first<{ ok: number }>();
    if (!own) return error('NOT_FOUND', 'Homework not found', 404);
    shareCoach = wantCoach !== false;
  } else if (input.context_type === 'assignment') {
    const a = await env.DB.prepare(
      `SELECT a.id, a.contract_id, c.client_id FROM coaching_assignments a
       JOIN coaching_contracts c ON c.id = a.contract_id WHERE a.id = ?`
    )
      .bind(input.context_id)
      .first<{ id: string; contract_id: string; client_id: string }>();
    if (!a || a.client_id !== me.userId) return error('NOT_FOUND', 'Homework not found', 404);
    contractId = a.contract_id;
    // Homework proof is for the coach unless the client says otherwise.
    shareCoach = wantCoach !== false;
  } else if (!/^[A-Za-z0-9:_-]{1,64}$/.test(input.context_id)) {
    return error('VALIDATION_ERROR', 'Invalid week', 400);
  }
  if (input.context_type !== 'assignment' && wantCoach === true) {
    const plan = await activePlanForClient(env, me.userId);
    if (plan) {
      contractId = plan.id;
      shareCoach = true;
    }
  }

  // Media
  let mediaKey: string | null = null;
  let mediaType: string | null = null;
  if (input.media_key) {
    if (!env.R2) return error('MEDIA_NOT_CONFIGURED', 'Media storage is not configured', 503);
    const key = input.media_key.replace(/^\/+/, '');
    if (!key.startsWith(`${PROOF_KEY_PREFIX}${me.userId}/`) || key.includes('..')) {
      return error('VALIDATION_ERROR', 'Upload the file with purpose “proof” first', 400);
    }
    const head = await env.R2.head(key);
    if (!head) return error('VALIDATION_ERROR', 'That upload was not found — try again', 400);
    const ct = sniffContentType(key, head.httpMetadata?.contentType);
    const want = input.kind === 'photo' ? 'image/' : 'audio/';
    if (!ct.startsWith(want)) {
      return error('VALIDATION_ERROR', input.kind === 'photo' ? 'That file is not a photo' : 'That file is not a voice note', 400);
    }
    const taken = await env.DB.prepare(`SELECT id FROM proofs WHERE media_key = ?`).bind(key).first<{ id: string }>();
    if (taken) return error('CONFLICT', 'That file is already attached to a proof', 409);
    mediaKey = key;
    mediaType = ct;
  }

  // Small bonus: +1, at most twice per local day. Never part of the streak.
  const earned = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM proofs WHERE user_id = ? AND day = ? AND points > 0`
  )
    .bind(me.userId, today)
    .first<{ n: number }>();
  const points = Number(earned?.n ?? 0) < PROOF_POINTS_DAILY_MAX ? PROOF_POINTS : 0;

  const unit = typeof input.unit === 'string' ? input.unit.trim().slice(0, PROOF_UNIT_MAX) || null : null;
  const pathKey = typeof input.path === 'string' ? input.path.trim().slice(0, 80) || null : null;
  const row: ProofRow = {
    id: generateId('prf'),
    user_id: me.userId,
    kind: input.kind,
    text: cleanProofText(input.text),
    number: input.kind === 'number' ? input.number ?? null : null,
    unit: input.kind === 'number' ? unit : null,
    minutes: input.minutes ?? null,
    duration_s: input.kind === 'voice' ? Math.min(PROOF_VOICE_MAX_S, input.duration_s ?? 0) || null : null,
    media_key: mediaKey,
    media_type: mediaType,
    media_expired_at: null,
    context_type: input.context_type,
    context_id: input.context_id,
    contract_id: contractId,
    path: pathKey,
    day: today,
    shared_with_coach: shareCoach ? 1 : 0,
    shared_with_friends: input.share_with_friends ? 1 : 0,
    seen_by_coach_at: null,
    points,
    created_at: nowIso(),
  };
  await env.DB.prepare(
    `INSERT INTO proofs (id, user_id, kind, text, number, unit, minutes, duration_s, media_key, media_type,
       context_type, context_id, contract_id, path, day, shared_with_coach, shared_with_friends, points, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      row.id, row.user_id, row.kind, row.text, row.number, row.unit, row.minutes, row.duration_s,
      row.media_key, row.media_type, row.context_type, row.context_id, row.contract_id, row.path,
      row.day, row.shared_with_coach, row.shared_with_friends, row.points, row.created_at
    )
    .run();
  if (points) await awardPoints(env, me.userId, points);
  return json({ proof: formatProof(row, mediaBase), points_awarded: points }, 201);
}

// ---------------------------------------------------------------------------
// Read

async function listProofs(request: Request, env: Env, mediaBase: string): Promise<Response> {
  const me = await auth(request, env);
  if (!me) return error('UNAUTHORIZED', 'Authentication required', 401);
  const q = new URL(request.url).searchParams;
  const ownerId = (q.get('user_id') || '').trim() || me.userId;
  const where: string[] = ['p.user_id = ?'];
  const binds: unknown[] = [ownerId];

  if (ownerId !== me.userId) {
    const plans = await activePlans(env, me.userId, ownerId);
    const circle = await isCircle(env, me.userId, ownerId);
    const ors: string[] = [];
    if (plans.length) {
      const sharesCheckins = plans.some((p) => !!Number(p.share_checkins)) ? 1 : 0;
      ors.push(
        `(p.shared_with_coach = 1 AND ((p.context_type IN ('checkin', 'weekly') AND ? = 1)
          OR (p.context_type = 'assignment' AND p.context_id IN
              (SELECT id FROM coaching_assignments WHERE contract_id IN (${placeholders(plans.length)})))))`
      );
      binds.push(sharesCheckins, ...plans.map((p) => p.id));
    }
    if (circle) ors.push('p.shared_with_friends = 1');
    if (!ors.length) return error('FORBIDDEN', 'These proofs are private', 403);
    where.push(`(${ors.join(' OR ')})`);
  }

  const ctxType = q.get('context_type');
  if (ctxType) {
    if (!(PROOF_CONTEXTS as readonly string[]).includes(ctxType)) {
      return error('VALIDATION_ERROR', 'Invalid context_type', 400);
    }
    where.push('p.context_type = ?');
    binds.push(ctxType);
  }
  const ctxId = q.get('context_id');
  if (ctxId) {
    where.push('p.context_id = ?');
    binds.push(ctxId.slice(0, 80));
  }
  const from = q.get('from');
  if (from) {
    if (!isDayKey(from)) return error('VALIDATION_ERROR', 'from must be YYYY-MM-DD', 400);
    where.push('p.day >= ?');
    binds.push(from);
  }
  const to = q.get('to');
  if (to) {
    if (!isDayKey(to)) return error('VALIDATION_ERROR', 'to must be YYYY-MM-DD', 400);
    where.push('p.day <= ?');
    binds.push(to);
  }
  const limitRaw = Number(q.get('limit'));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(PROOF_LIST_MAX, Math.floor(limitRaw)) : PROOF_LIST_DEFAULT;

  const rows = await env.DB.prepare(
    `SELECT ${PROOF_COLUMNS} FROM proofs p WHERE ${where.join(' AND ')}
     ORDER BY p.created_at DESC LIMIT ${limit}`
  )
    .bind(...binds)
    .all<ProofRow>();
  return json({ proofs: await formatMany(env, rows.results || [], me.userId, mediaBase) });
}

/** Today's proofs for GET /me/today (check-in proofs for `day` + anything made that day). */
export async function listProofsForDay(
  env: Env,
  userId: string,
  day: string,
  mediaBase: string,
): Promise<Proof[]> {
  const rows = await env.DB.prepare(
    `SELECT ${PROOF_COLUMNS} FROM proofs p
     WHERE p.user_id = ? AND (p.day = ? OR (p.context_type = 'checkin' AND p.context_id = ?))
     ORDER BY p.created_at ASC LIMIT 20`
  )
    .bind(userId, day, day)
    .all<ProofRow>();
  return formatMany(env, rows.results || [], userId, mediaBase);
}

async function getOne(request: Request, env: Env, id: string, mediaBase: string): Promise<Response> {
  const me = await auth(request, env);
  if (!me) return error('UNAUTHORIZED', 'Authentication required', 401);
  const row = await loadProof(env, id);
  if (!row || !canSee(await proofAccess(env, me.userId, row))) return error('NOT_FOUND', 'Proof not found', 404);
  const [proof] = await formatMany(env, [row], me.userId, mediaBase);
  return json({ proof });
}

// ---------------------------------------------------------------------------
// Owner edits

const patchSchema = z.object({
  share_with_coach: z.boolean().optional(),
  share_with_friends: z.boolean().optional(),
});

async function patchProof(request: Request, env: Env, id: string, mediaBase: string): Promise<Response> {
  const me = await auth(request, env);
  if (!me) return error('UNAUTHORIZED', 'Authentication required', 401);
  const parsed = patchSchema.safeParse(await readBody(request));
  if (!parsed.success) return error('VALIDATION_ERROR', 'Invalid sharing settings', 400);
  const row = await loadProof(env, id);
  if (!row || row.user_id !== me.userId) return error('NOT_FOUND', 'Proof not found', 404);
  const next = { ...row };
  if (parsed.data.share_with_friends !== undefined) next.shared_with_friends = parsed.data.share_with_friends ? 1 : 0;
  if (parsed.data.share_with_coach !== undefined) {
    if (!parsed.data.share_with_coach) {
      next.shared_with_coach = 0;
    } else if (row.context_type === 'assignment') {
      next.shared_with_coach = 1;
    } else {
      const plan = row.contract_id ? { id: row.contract_id } : await activePlanForClient(env, me.userId);
      next.shared_with_coach = plan ? 1 : 0;
      next.contract_id = plan?.id ?? null;
    }
  }
  await env.DB.prepare(
    `UPDATE proofs SET shared_with_coach = ?, shared_with_friends = ?, contract_id = ? WHERE id = ?`
  )
    .bind(next.shared_with_coach, next.shared_with_friends, next.contract_id, id)
    .run();
  const [proof] = await formatMany(env, [next], me.userId, mediaBase);
  return json({ proof });
}

async function deleteProof(request: Request, env: Env, id: string): Promise<Response> {
  const me = await auth(request, env);
  if (!me) return error('UNAUTHORIZED', 'Authentication required', 401);
  const row = await loadProof(env, id);
  if (!row) return error('NOT_FOUND', 'Proof not found', 404);
  if (row.user_id !== me.userId) {
    return canSee(await proofAccess(env, me.userId, row))
      ? error('FORBIDDEN', 'Only the owner can delete a proof', 403)
      : error('NOT_FOUND', 'Proof not found', 404);
  }
  if (row.media_key && env.R2) {
    try {
      await env.R2.delete(row.media_key);
    } catch (err) {
      console.error('[proofs] delete media', err);
    }
  }
  await env.DB.prepare(`DELETE FROM proof_cheers WHERE proof_id = ?`).bind(id).run();
  await env.DB.prepare(`DELETE FROM proofs WHERE id = ?`).bind(id).run();
  // Refund the bonus so delete + re-add can't farm points.
  if (Number(row.points) > 0) await awardPoints(env, me.userId, -Number(row.points));
  return json({ deleted: true });
}

// ---------------------------------------------------------------------------
// Private media

async function streamMedia(request: Request, env: Env, id: string): Promise<Response> {
  const me = await auth(request, env);
  if (!me) return error('UNAUTHORIZED', 'Authentication required', 401);
  if (!env.R2) return error('MEDIA_NOT_CONFIGURED', 'Media storage is not configured', 503);
  const row = await loadProof(env, id);
  if (!row || !canSee(await proofAccess(env, me.userId, row))) return error('NOT_FOUND', 'Proof not found', 404);
  if (!row.media_key) {
    return row.media_expired_at
      ? error('MEDIA_EXPIRED', 'This proof’s file was removed after its keep period', 410)
      : error('NOT_FOUND', 'This proof has no file', 404);
  }
  const rangeHeader = request.headers.get('Range');
  const obj = rangeHeader
    ? await env.R2.get(row.media_key, { range: request.headers })
    : await env.R2.get(row.media_key);
  if (!obj) return error('NOT_FOUND', 'Media not found', 404);

  const headers = new Headers();
  headers.set('Content-Type', sniffContentType(row.media_key, obj.httpMetadata?.contentType));
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Vary', 'Authorization');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Accept-Ranges', 'bytes');
  const body = request.method === 'HEAD' ? null : obj.body;
  const size = obj.size;
  if (rangeHeader && obj.range && typeof obj.range === 'object' && 'offset' in obj.range) {
    const offset = Number((obj.range as { offset: number }).offset) || 0;
    const len = (obj.range as { length?: number }).length;
    const length = typeof len === 'number' ? len : Math.max(0, size - offset);
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${size}`);
    headers.set('Content-Length', String(length));
    return new Response(body, { status: 206, headers });
  }
  if (typeof size === 'number' && size >= 0) headers.set('Content-Length', String(size));
  return new Response(body, { status: 200, headers });
}

// ---------------------------------------------------------------------------
// Witness

async function toggleCheer(request: Request, env: Env, id: string): Promise<Response> {
  const me = await auth(request, env);
  if (!me) return error('UNAUTHORIZED', 'Authentication required', 401);
  const row = await loadProof(env, id);
  if (!row) return error('NOT_FOUND', 'Proof not found', 404);
  const access = await proofAccess(env, me.userId, row);
  if (access.owner) return error('FORBIDDEN', 'Cheers come from the people you share with', 403);
  if (!canSee(access)) return error('NOT_FOUND', 'Proof not found', 404);

  const existing = await env.DB.prepare(`SELECT 1 AS ok FROM proof_cheers WHERE proof_id = ? AND user_id = ?`)
    .bind(id, me.userId)
    .first<{ ok: number }>();
  if (existing) {
    await env.DB.prepare(`DELETE FROM proof_cheers WHERE proof_id = ? AND user_id = ?`).bind(id, me.userId).run();
  } else {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO proof_cheers (proof_id, user_id, created_at) VALUES (?, ?, ?)`
    )
      .bind(id, me.userId, nowIso())
      .run();
    const name = await resolveUsername(env, me.userId);
    await createUserNotification(env, {
      userId: row.user_id,
      actorId: me.userId,
      type: 'proof_cheer',
      title: `${name} cheered your proof 👏`,
      refType: 'proof',
      refId: id,
      oncePerActorAndRef: true,
    });
  }
  const stats = await cheerStats(env, [id], me.userId);
  const s = stats.get(id);
  return json({ cheers: s?.n ?? 0, cheered_by_me: s?.mine ?? false });
}

async function markSeen(request: Request, env: Env, id: string): Promise<Response> {
  const me = await auth(request, env);
  if (!me) return error('UNAUTHORIZED', 'Authentication required', 401);
  const row = await loadProof(env, id);
  if (!row) return error('NOT_FOUND', 'Proof not found', 404);
  const access = await proofAccess(env, me.userId, row);
  if (!access.coach) {
    return canSee(access)
      ? error('FORBIDDEN', 'Only the coach can mark a proof seen', 403)
      : error('NOT_FOUND', 'Proof not found', 404);
  }
  if (row.seen_by_coach_at) return json({ seen_by_coach_at: row.seen_by_coach_at });
  const at = nowIso();
  await env.DB.prepare(`UPDATE proofs SET seen_by_coach_at = COALESCE(seen_by_coach_at, ?) WHERE id = ?`)
    .bind(at, id)
    .run();
  const name = await resolveUsername(env, me.userId);
  await createUserNotification(env, {
    userId: row.user_id,
    actorId: me.userId,
    type: 'proof_seen',
    title: `${name} saw your proof ✓`,
    refType: 'proof',
    refId: id,
    oncePerActorAndRef: true,
  });
  return json({ seen_by_coach_at: at });
}

// ---------------------------------------------------------------------------
// Cron: media retention (hourly, bounded)

function dayKeyUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Pure: the cut-off days for media retention at `now`.
 * Personal proofs keep their file 365 days; coach-shared ones 90 days after the plan ended.
 */
export function expiryCutoffs(now: Date): { personal: string; coach: string } {
  const day = 86_400_000;
  return {
    personal: dayKeyUtc(new Date(now.getTime() - PERSONAL_MEDIA_TTL_DAYS * day)),
    coach: dayKeyUtc(new Date(now.getTime() - COACH_MEDIA_TTL_DAYS * day)),
  };
}

/** Deletes expired proof files (R2) and nulls their keys. ≤ 4 × 50 per run. Returns count. */
export async function expireProofMedia(env: Env, now: Date): Promise<number> {
  if (!env.R2) return 0;
  const { personal, coach } = expiryCutoffs(now);
  let total = 0;
  for (let batch = 0; batch < EXPIRY_MAX_BATCHES; batch++) {
    const rows = await env.DB.prepare(
      `SELECT p.id, p.media_key FROM proofs p
       LEFT JOIN coaching_contracts c ON c.id = p.contract_id
       WHERE p.media_key IS NOT NULL AND (
         (p.contract_id IS NULL AND substr(p.created_at, 1, 10) < ?)
         OR (p.contract_id IS NOT NULL AND c.id IS NULL AND substr(p.created_at, 1, 10) < ?)
         OR (c.id IS NOT NULL AND substr(COALESCE(c.completed_at, c.ends_at), 1, 10) < ?)
       )
       LIMIT ${EXPIRY_BATCH}`
    )
      .bind(personal, coach, coach)
      .all<{ id: string; media_key: string }>();
    const list = rows.results || [];
    if (!list.length) break;
    try {
      await env.R2.delete(list.map((r) => r.media_key));
    } catch (err) {
      console.error('[proofs] expire media', err);
      break; // retry next hour
    }
    const at = now.toISOString();
    await env.DB.prepare(
      `UPDATE proofs SET media_key = NULL, media_expired_at = ? WHERE id IN (${placeholders(list.length)})`
    )
      .bind(at, ...list.map((r) => r.id))
      .run();
    total += list.length;
    if (list.length < EXPIRY_BATCH) break;
  }
  return total;
}

/**
 * Removes uploads under proof/ that are older than 48 h and not attached to any proof
 * (the client uploaded but never saved). Lists ≤ 200 objects per run and resumes from
 * a KV cursor; the IN lookups are chunked ≤ 90. Returns the number of deleted objects.
 */
export async function sweepOrphanProofUploads(env: Env, now: Date): Promise<number> {
  if (!env.R2) return 0;
  let cursor: string | undefined;
  try {
    cursor = (await env.KV.get(ORPHAN_CURSOR_KEY)) || undefined;
  } catch {
    cursor = undefined;
  }
  let listed: R2Objects;
  try {
    listed = await env.R2.list({ prefix: PROOF_KEY_PREFIX, limit: ORPHAN_LIST_LIMIT, cursor });
  } catch (err) {
    console.error('[proofs] orphan sweep list', err);
    // A stale cursor would wedge the sweep; start over next hour.
    if (cursor) await env.KV.delete(ORPHAN_CURSOR_KEY).catch(() => undefined);
    return 0;
  }
  const cutoff = now.getTime() - ORPHAN_MIN_AGE_MS;
  const old = (listed.objects || [])
    .filter((o) => {
      const t = o.uploaded instanceof Date ? o.uploaded.getTime() : Date.parse(String(o.uploaded));
      return Number.isFinite(t) && t < cutoff;
    })
    .map((o) => o.key);

  const referenced = new Set<string>();
  for (const part of chunk(old, ID_CHUNK)) {
    const rows = await env.DB.prepare(
      `SELECT media_key FROM proofs WHERE media_key IN (${placeholders(part.length)})`
    )
      .bind(...part)
      .all<{ media_key: string }>();
    for (const r of rows.results || []) referenced.add(r.media_key);
  }
  const orphans = old.filter((k) => !referenced.has(k));
  let deleted = 0;
  if (orphans.length) {
    try {
      await env.R2.delete(orphans);
      deleted = orphans.length;
    } catch (err) {
      console.error('[proofs] orphan sweep delete', err);
      return 0; // keep the cursor; retry this page next hour
    }
  }
  try {
    if (listed.truncated && 'cursor' in listed && listed.cursor) {
      await env.KV.put(ORPHAN_CURSOR_KEY, listed.cursor);
    } else {
      await env.KV.delete(ORPHAN_CURSOR_KEY);
    }
  } catch (err) {
    console.error('[proofs] orphan sweep cursor', err);
  }
  return deleted;
}

/** Account deletion: remove every file under proof/{userId}/ (bounded; errors are logged). */
export async function deleteUserProofMedia(env: Env, userId: string): Promise<number> {
  if (!env.R2 || !userId || userId.includes('/')) return 0;
  const prefix = `${PROOF_KEY_PREFIX}${userId}/`;
  let cursor: string | undefined;
  let deleted = 0;
  for (let page = 0; page < 10; page++) {
    try {
      const listed = await env.R2.list({ prefix, limit: 500, cursor });
      const keys = (listed.objects || []).map((o) => o.key).filter((k) => k.startsWith(prefix));
      if (keys.length) {
        await env.R2.delete(keys);
        deleted += keys.length;
      }
      if (!listed.truncated || !('cursor' in listed) || !listed.cursor) break;
      cursor = listed.cursor;
    } catch (err) {
      console.error('[proofs] delete account media', err);
      break;
    }
  }
  return deleted;
}

/** Hourly: proof media retention + orphan upload sweep (both bounded per run). */
export async function runCron(env: Env, now: Date): Promise<void> {
  await expireProofMedia(env, now);
  try {
    await sweepOrphanProofUploads(env, now);
  } catch (err) {
    console.error('[proofs] orphan sweep', err);
  }
}
