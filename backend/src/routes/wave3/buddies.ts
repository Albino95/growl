/**
 * Wave 3 — Path Buddies: a shared streak with a friend (max 5 buddies per user).
 *
 * GET    /buddies              → { buddies, invites_in, invites_out }
 * POST   /buddies/invite       { user_id } → 201 { buddy }   (friends only; 409 if exists / cap)
 * POST   /buddies/:id/accept   → { buddy }
 * POST   /buddies/:id/decline  → { ok: true }
 * DELETE /buddies/:id          → { ok: true }   (either side; also cancels an invite)
 *
 * A buddy day counts when BOTH people "showed up": an activity day, a rest day or a
 * life-mode protected day (user_activity_days rows with kinds > 0 or is_rest > 0, or
 * a day inside the person's life-mode window). So a rest never breaks a buddy streak.
 * Each person's growth streak is settled first, so missed days their own streak
 * bridged with a rest token count as rest here too.
 *
 * Streak = consecutive counted days ending today (if both already showed up) or
 * yesterday, never earlier than the day the pair started (since_day). Day keys use
 * the viewer's local day; lookback is bounded to 120 days and the all-time best is
 * persisted on the pair row.
 */
import { z } from 'zod';
import type { Env } from '../../types';
import { json, error } from '../../utils/response';
import { getRequestContext } from '../../utils/auth';
import { withIdempotency } from '../../utils/idempotency';
import { generateId } from '../../utils/id';
import { addDays, localDay, safeTimeZone } from '../../utils/days';
import { getStreakState } from '../../utils/activity';
import { isLifeModeDay, NO_LIFE_MODE, parseLifeMode, type LifeModeState } from '../../utils/lifeMode';
import { createUserNotification, type NotificationType } from '../../utils/notifications';

export const MAX_BUDDIES = 5;
export const LOOKBACK_DAYS = 120;
const IN_CHUNK = 90;
const MAX_INVITES_LISTED = 30;

export const BUDDY_MILESTONES: { days: number; name: string }[] = [
  { days: 3, name: 'Sprout pair' },
  { days: 7, name: 'Seedling pair' },
  { days: 14, name: 'Sapling pair' },
  { days: 30, name: 'Young tree pair' },
  { days: 60, name: 'Grove pair' },
  { days: 100, name: 'Old growth pair' },
];

const inviteSchema = z.object({ user_id: z.string().min(1).max(128) });

type BuddyRow = {
  id: string;
  inviter_id: string;
  invitee_id: string;
  status: 'pending' | 'active';
  since_day: string | null;
  best: number;
  created_at: string;
  accepted_at: string | null;
};

type UserInfo = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  tz: string;
  lifeMode: LifeModeState;
};

export type PublicUser = { id: string; username: string; display_name: string | null; avatar_url: string | null };

// ---------------------------------------------------------------------------
// Pure streak math (exported for tests)

export type DayCounts = (day: string) => boolean;

export function milestoneFor(streak: number): { days: number; name: string } | null {
  let hit: { days: number; name: string } | null = null;
  for (const m of BUDDY_MILESTONES) if (streak >= m.days) hit = m;
  return hit;
}

export function nextMilestone(streak: number): { days: number; name: string } | null {
  return BUDDY_MILESTONES.find((m) => m.days > streak) ?? null;
}

/**
 * Shared streak for a pair. `me`/`them` say whether that person counted a day.
 * Returns the current run (ending today or yesterday) and the best run inside the
 * lookback window.
 */
export function computeBuddyStreak(
  me: DayCounts,
  them: DayCounts,
  today: string,
  sinceDay: string | null,
  lookback = LOOKBACK_DAYS
): { streak: number; best: number; today: { me: boolean; them: boolean } } {
  const both = (d: string) => me(d) && them(d);
  const floorDay = addDays(today, -(lookback - 1));
  const start = sinceDay && sinceDay > floorDay ? sinceDay : floorDay;
  const todayState = { me: me(today), them: them(today) };
  if (start > today) return { streak: 0, best: 0, today: todayState };

  const end = both(today) ? today : addDays(today, -1);
  let streak = 0;
  for (let d = end; d >= start; d = addDays(d, -1)) {
    if (!both(d)) break;
    streak += 1;
  }

  let best = 0;
  let run = 0;
  for (let d = start; d <= today; d = addDays(d, 1)) {
    if (both(d)) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return { streak, best: Math.max(best, streak), today: todayState };
}

// ---------------------------------------------------------------------------
// Data access

type Me = { userId: string };

async function requireMe(request: Request, env: Env): Promise<Me | Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }
  return { userId: ctx.userId };
}

function chunks<T>(items: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
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
  const unique = [...new Set(ids)];
  for (const part of chunks(unique)) {
    const ph = part.map(() => '?').join(', ');
    let rows: Record<string, unknown>[];
    try {
      const res = await env.DB.prepare(
        `SELECT id, metadata, timezone, life_mode, life_mode_since, life_mode_until FROM users WHERE id IN (${ph})`
      )
        .bind(...part)
        .all<Record<string, unknown>>();
      rows = res.results || [];
    } catch {
      // Life-mode columns missing (migration 0036 not applied yet).
      const res = await env.DB.prepare(`SELECT id, metadata, timezone FROM users WHERE id IN (${ph})`)
        .bind(...part)
        .all<Record<string, unknown>>();
      rows = res.results || [];
    }
    for (const r of rows) {
      const meta = parseMeta(r.metadata);
      const id = String(r.id);
      out.set(id, {
        id,
        username: str(meta.username) || id.slice(0, 8),
        display_name: str(meta.display_name) || str(meta.name),
        avatar_url: str(meta.avatar) || str(meta.avatar_url),
        tz: safeTimeZone(r.timezone),
        lifeMode: 'life_mode' in r ? parseLifeMode(r) : NO_LIFE_MODE,
      });
    }
  }
  return out;
}

function publicUser(u: UserInfo | undefined, fallbackId: string): PublicUser {
  if (!u) return { id: fallbackId, username: 'Someone', display_name: null, avatar_url: null };
  return { id: u.id, username: u.username, display_name: u.display_name, avatar_url: u.avatar_url };
}

/** Days per user (in [from, to]) that count: active or rest/protected rows. */
async function loadCountedDays(
  env: Env,
  userIds: string[],
  from: string,
  to: string
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  for (const id of userIds) out.set(id, new Set());
  for (const part of chunks([...new Set(userIds)])) {
    const ph = part.map(() => '?').join(', ');
    const res = await env.DB.prepare(
      `SELECT user_id, day FROM user_activity_days
       WHERE user_id IN (${ph}) AND day >= ? AND day <= ? AND (kinds > 0 OR is_rest > 0)`
    )
      .bind(...part, from, to)
      .all<{ user_id: string; day: string }>();
    for (const r of res.results || []) out.get(r.user_id)?.add(r.day);
  }
  return out;
}

async function areFriends(env: Env, a: string, b: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 AS ok FROM user_relationships
     WHERE type = 'friend' AND ((user_id = ? AND target_user_id = ?) OR (user_id = ? AND target_user_id = ?))
     LIMIT 1`
  )
    .bind(a, b, b, a)
    .first();
  return !!row;
}

async function isBlocked(env: Env, a: string, b: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 AS ok FROM user_relationships
     WHERE type = 'block' AND ((user_id = ? AND target_user_id = ?) OR (user_id = ? AND target_user_id = ?))
     LIMIT 1`
  )
    .bind(a, b, b, a)
    .first();
  return !!row;
}

/** Active buddies + outgoing pending invites (what counts towards the cap of 5). */
async function slotsUsed(env: Env, userId: string): Promise<{ active: number; slots: number }> {
  const row = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
       SUM(CASE WHEN status = 'active' OR inviter_id = ? THEN 1 ELSE 0 END) AS slots
     FROM path_buddies WHERE inviter_id = ? OR invitee_id = ?`
  )
    .bind(userId, userId, userId)
    .first<{ active: number | null; slots: number | null }>();
  return { active: Number(row?.active) || 0, slots: Number(row?.slots) || 0 };
}

async function getRow(env: Env, id: string): Promise<BuddyRow | null> {
  return env.DB.prepare(
    `SELECT id, inviter_id, invitee_id, status, since_day, best, created_at, accepted_at
     FROM path_buddies WHERE id = ?`
  )
    .bind(id)
    .first<BuddyRow>();
}

function otherId(row: BuddyRow, me: string): string {
  return row.inviter_id === me ? row.invitee_id : row.inviter_id;
}

type BuddyEntry = {
  id: string;
  user: PublicUser;
  streak: number;
  best: number;
  today: { me: boolean; them: boolean };
  since: string | null;
  milestone: { days: number; name: string } | null;
  next_milestone: { days: number; name: string } | null;
};

type InviteEntry = { id: string; user: PublicUser; created_at: string };

/** Builds full entries for active pairs (settles growth streaks, one activity query). */
async function buildEntries(env: Env, me: string, rows: BuddyRow[]): Promise<BuddyEntry[]> {
  if (!rows.length) return [];
  const ids = [me, ...rows.map((r) => otherId(r, me))];

  // Settle each person's growth streak so token-bridged missed days exist as rest rows.
  for (const id of new Set(ids)) {
    try {
      await getStreakState(env, id);
    } catch (err) {
      console.error('[buddies] settle', err);
    }
  }

  const users = await loadUsers(env, ids);
  const meInfo = users.get(me);
  const today = localDay(meInfo?.tz ?? 'UTC');
  const from = addDays(today, -(LOOKBACK_DAYS - 1));
  const days = await loadCountedDays(env, ids, from, today);

  const counter = (id: string): DayCounts => {
    const set = days.get(id) ?? new Set<string>();
    const lm = users.get(id)?.lifeMode ?? NO_LIFE_MODE;
    return (d) => set.has(d) || isLifeModeDay(lm, d);
  };

  const entries: BuddyEntry[] = [];
  for (const r of rows) {
    const them = otherId(r, me);
    const calc = computeBuddyStreak(counter(me), counter(them), today, r.since_day);
    const best = Math.max(Number(r.best) || 0, calc.best);
    if (best > (Number(r.best) || 0)) {
      try {
        await env.DB.prepare(`UPDATE path_buddies SET best = ? WHERE id = ? AND best < ?`)
          .bind(best, r.id, best)
          .run();
      } catch (err) {
        console.error('[buddies] best', err);
      }
    }
    entries.push({
      id: r.id,
      user: publicUser(users.get(them), them),
      streak: calc.streak,
      best,
      today: calc.today,
      since: r.since_day,
      milestone: milestoneFor(calc.streak),
      next_milestone: nextMilestone(calc.streak),
    });
  }
  entries.sort((a, b) => b.streak - a.streak || a.user.username.localeCompare(b.user.username));
  return entries;
}

// ---------------------------------------------------------------------------
// Handlers

async function listBuddies(request: Request, env: Env): Promise<Response> {
  const auth = await requireMe(request, env);
  if (auth instanceof Response) return auth;
  const me = auth.userId;

  const res = await env.DB.prepare(
    `SELECT id, inviter_id, invitee_id, status, since_day, best, created_at, accepted_at
     FROM path_buddies WHERE inviter_id = ? OR invitee_id = ?
     ORDER BY created_at DESC LIMIT 200`
  )
    .bind(me, me)
    .all<BuddyRow>();
  const rows = res.results || [];
  const active = rows.filter((r) => r.status === 'active');
  const inRows = rows.filter((r) => r.status === 'pending' && r.invitee_id === me).slice(0, MAX_INVITES_LISTED);
  const outRows = rows.filter((r) => r.status === 'pending' && r.inviter_id === me).slice(0, MAX_INVITES_LISTED);

  const buddies = await buildEntries(env, me, active);
  const inviteUsers = await loadUsers(env, [...inRows, ...outRows].map((r) => otherId(r, me)));
  const invite = (r: BuddyRow): InviteEntry => ({
    id: r.id,
    user: publicUser(inviteUsers.get(otherId(r, me)), otherId(r, me)),
    created_at: r.created_at,
  });

  return json({
    buddies,
    invites_in: inRows.map(invite),
    invites_out: outRows.map(invite),
    max: MAX_BUDDIES,
  });
}

async function inviteBuddy(request: Request, env: Env): Promise<Response> {
  const auth = await requireMe(request, env);
  if (auth instanceof Response) return auth;
  const me = auth.userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error('INVALID_JSON', 'Invalid JSON in request body', 400);
  }
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) return error('VALIDATION_ERROR', 'Invalid request data', 400, parsed.error.errors);
  const target = parsed.data.user_id;
  if (target === me) return error('VALIDATION_ERROR', 'You can’t be your own buddy.', 400);

  const exists = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(target).first();
  if (!exists || (await isBlocked(env, me, target))) return error('NOT_FOUND', 'User not found', 404);
  if (!(await areFriends(env, me, target))) {
    return error('NOT_FRIENDS', 'Buddies need to be friends first.', 403);
  }

  const lo = me < target ? me : target;
  const hi = me < target ? target : me;
  const existing = await env.DB.prepare(
    `SELECT id, status, inviter_id FROM path_buddies WHERE user_lo = ? AND user_hi = ?`
  )
    .bind(lo, hi)
    .first<{ id: string; status: string; inviter_id: string }>();
  if (existing) {
    return error('BUDDY_EXISTS', existing.status === 'active' ? 'You’re already buddies.' : 'There’s already an invite between you.', 409, {
      id: existing.id,
      status: existing.status,
      incoming: existing.inviter_id === target,
    });
  }

  if ((await slotsUsed(env, me)).slots >= MAX_BUDDIES) {
    return error('BUDDY_LIMIT', `You can grow with up to ${MAX_BUDDIES} buddies at a time.`, 409);
  }
  if ((await slotsUsed(env, target)).active >= MAX_BUDDIES) {
    return error('BUDDY_LIMIT_THEIRS', 'They already have a full set of buddies.', 409);
  }

  const id = generateId('buddy');
  const res = await env.DB.prepare(
    `INSERT OR IGNORE INTO path_buddies (id, inviter_id, invitee_id, user_lo, user_hi, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))`
  )
    .bind(id, me, target, lo, hi)
    .run();
  if (Number((res as { meta?: { changes?: number } })?.meta?.changes ?? 0) !== 1) {
    return error('BUDDY_EXISTS', 'There’s already an invite between you.', 409);
  }

  const users = await loadUsers(env, [me, target]);
  const mine = users.get(me);
  await createUserNotification(env, {
    userId: target,
    actorId: me,
    type: 'buddy_invite' as NotificationType,
    title: `${mine?.display_name || mine?.username || 'A friend'} wants to be your path buddy`,
    body: 'Show up on the same days and grow a streak together.',
    refType: 'buddy',
    refId: id,
  });

  const row = await getRow(env, id);
  return json(
    { buddy: { id, status: 'pending', user: publicUser(users.get(target), target), created_at: row?.created_at ?? null } },
    201
  );
}

async function acceptBuddy(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireMe(request, env);
  if (auth instanceof Response) return auth;
  const me = auth.userId;

  const row = await getRow(env, id);
  if (!row || (row.inviter_id !== me && row.invitee_id !== me)) return error('NOT_FOUND', 'Invite not found', 404);
  if (row.status === 'active') {
    const [entry] = await buildEntries(env, me, [row]);
    return json({ buddy: entry });
  }
  if (row.invitee_id !== me) return error('FORBIDDEN', 'Only the invited person can accept.', 403);

  if ((await slotsUsed(env, me)).active >= MAX_BUDDIES) {
    return error('BUDDY_LIMIT', `You can grow with up to ${MAX_BUDDIES} buddies at a time.`, 409);
  }
  if ((await slotsUsed(env, row.inviter_id)).active >= MAX_BUDDIES) {
    return error('BUDDY_LIMIT_THEIRS', 'They already have a full set of buddies.', 409);
  }

  const users = await loadUsers(env, [me, row.inviter_id]);
  const today = localDay(users.get(me)?.tz ?? 'UTC');
  await env.DB.prepare(
    `UPDATE path_buddies SET status = 'active', since_day = ?, accepted_at = datetime('now')
     WHERE id = ? AND status = 'pending'`
  )
    .bind(today, id)
    .run();

  const mine = users.get(me);
  await createUserNotification(env, {
    userId: row.inviter_id,
    actorId: me,
    type: 'buddy_accept' as NotificationType,
    title: `${mine?.display_name || mine?.username || 'Your friend'} is your path buddy now`,
    body: 'Your shared streak starts today.',
    refType: 'buddy',
    refId: id,
  });

  const fresh = await getRow(env, id);
  const [entry] = await buildEntries(env, me, fresh ? [fresh] : []);
  return json({ buddy: entry ?? null });
}

async function declineBuddy(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireMe(request, env);
  if (auth instanceof Response) return auth;
  const me = auth.userId;
  const row = await getRow(env, id);
  if (!row || row.status !== 'pending' || row.invitee_id !== me) return error('NOT_FOUND', 'Invite not found', 404);
  await env.DB.prepare(`DELETE FROM path_buddies WHERE id = ? AND status = 'pending'`).bind(id).run();
  return json({ ok: true });
}

async function endBuddy(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await requireMe(request, env);
  if (auth instanceof Response) return auth;
  const me = auth.userId;
  const row = await getRow(env, id);
  if (!row || (row.inviter_id !== me && row.invitee_id !== me)) return error('NOT_FOUND', 'Buddy not found', 404);
  await env.DB.prepare(`DELETE FROM path_buddies WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}

// ---------------------------------------------------------------------------

export async function handle(
  request: Request,
  env: Env,
  path: string,
  apiPrefix: string,
): Promise<Response | null> {
  const base = `${apiPrefix}/buddies`;
  if (path !== base && !path.startsWith(`${base}/`)) return null;
  const method = request.method.toUpperCase();
  const rest = path.slice(base.length).replace(/\/+$/, '');

  try {
    if (rest === '' && method === 'GET') return await listBuddies(request, env);
    if (rest === '/invite' && method === 'POST') {
      return await withIdempotency(request, env, () => inviteBuddy(request, env));
    }
    const m = rest.match(/^\/([A-Za-z0-9_-]{1,128})(?:\/(accept|decline))?$/);
    if (m) {
      const id = m[1];
      if (m[2] === 'accept' && method === 'POST') return await acceptBuddy(request, env, id);
      if (m[2] === 'decline' && method === 'POST') return await declineBuddy(request, env, id);
      if (!m[2] && method === 'DELETE') return await endBuddy(request, env, id);
    }
  } catch (err) {
    console.error('[buddies]', err);
    return error('INTERNAL_ERROR', 'Something went wrong with buddies.', 500);
  }
  return null;
}
