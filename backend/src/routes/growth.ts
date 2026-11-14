/**
 * Grow! growth system routes (docs/GROWTH_SYSTEM.md §4): streak, Today check-in,
 * badges & level, weekly recap, progress charts, path challenges and invites.
 */
import type { Env } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { generateId } from '../utils/id';
import {
  validateRequest,
  todayCheckinSchema,
  badgesSeenSchema,
  inviteRedeemSchema,
} from '../utils/validation';
import {
  addDays,
  dayRange,
  diffDays,
  isDayKey,
  isoWeek,
  isoWeekStart,
  localDay,
  safeTimeZone,
  topLevelPath,
} from '../utils/days';
import { lifeModePayload } from '../utils/lifeMode';
import {
  buildStreakPayload,
  getStreakPayload,
  getStreakState,
  recordActivity,
  recordRest,
} from '../utils/activity';
import {
  BADGES,
  badgeProgress,
  checkBadges,
  loadEarnedBadges,
  nextBadge,
  type BadgeEarned,
} from '../utils/badges';
import { awardPoints, growthLevel, POINTS } from '../utils/points';
import { isKnownGrowthPath } from '../utils/categories';
import { computeRecap, type WeeklyRecap } from '../utils/recap';
import {
  CHALLENGES,
  challengeDays,
  challengeEndsAt,
  completeChallenge,
  getChallenge,
  pathLikePattern,
  progressFromRows,
  type Challenge,
} from '../utils/challenges';
import {
  ensureInviteCode,
  findInviterByCode,
  INVITE_URL_BASE,
  normalizeInviteCode,
  redeemInvite,
} from '../utils/invites';
import { isBlocked } from './friends';
import { checkRateLimit, clientIp } from '../utils/rateLimit';

type Authed = { userId: string; tz: string; points: number; createdAt: string | null };

async function requireUser(request: Request, env: Env): Promise<Authed | Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId || !ctx.user) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }
  const u = ctx.user as typeof ctx.user & { timezone?: string };
  return {
    userId: ctx.userId,
    tz: safeTimeZone(u.timezone),
    points: Number(u.points) || 0,
    createdAt: u.created_at ?? null,
  };
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Client-supplied days are accepted only within ±1 day of the server's UTC date. */
function isAcceptableClientDay(day: string): boolean {
  return isDayKey(day) && Math.abs(diffDays(utcToday(), day)) <= 1;
}

// ---------------------------------------------------------------------------
// Streak & Today
// ---------------------------------------------------------------------------

type CheckinRow = {
  day: string;
  mood: number | null;
  path: string | null;
  intention: string | null;
  rest: number;
  followup: 'yes' | 'partly' | 'no' | null;
  created_at: string;
};

function formatCheckin(r: CheckinRow) {
  return {
    day: r.day,
    mood: r.mood == null ? null : Number(r.mood),
    path: r.path ?? null,
    intention: r.intention ?? null,
    rest: !!Number(r.rest),
    followup: r.followup ?? null,
    created_at: r.created_at,
  };
}

async function loadCheckin(env: Env, userId: string, day: string): Promise<CheckinRow | null> {
  return env.DB.prepare(
    `SELECT day, mood, path, intention, rest, followup, created_at
     FROM daily_checkins WHERE user_id = ? AND day = ?`
  )
    .bind(userId, day)
    .first<CheckinRow>();
}

/** GET /me/streak */
export async function getMyStreak(request: Request, env: Env): Promise<Response> {
  const me = await requireUser(request, env);
  if (me instanceof Response) return me;
  const streak = await getStreakPayload(env, me.userId);
  if (!streak) return error('NOT_FOUND', 'User not found', 404);
  return json(streak);
}

/** GET /me/today[?day=YYYY-MM-DD] */
export async function getToday(request: Request, env: Env): Promise<Response> {
  const me = await requireUser(request, env);
  if (me instanceof Response) return me;
  const got = await getStreakState(env, me.userId);
  if (!got) return error('NOT_FOUND', 'User not found', 404);
  const streak = await buildStreakPayload(env, me.userId, got.state, got.today);
  const asked = new URL(request.url).searchParams.get('day');
  const day = asked && isAcceptableClientDay(asked) ? asked : streak.today;
  const row = await loadCheckin(env, me.userId, day);
  return json({
    checkin: row ? formatCheckin(row) : null,
    streak,
    life_mode: lifeModePayload(got.lifeMode, got.today),
  });
}

/** PUT /me/today */
export async function putToday(request: Request, env: Env): Promise<Response> {
  const me = await requireUser(request, env);
  if (me instanceof Response) return me;
  const v = await validateRequest(request, todayCheckinSchema);
  if (!v.success) return v.response;
  const body = v.data;

  if (!isAcceptableClientDay(body.day)) {
    return error('INVALID_DAY', 'Check-ins can only be saved for today.', 400);
  }

  const existing = await loadCheckin(env, me.userId, body.day);
  const pick = <K extends 'mood' | 'path' | 'intention' | 'followup'>(k: K) =>
    body[k] !== undefined ? body[k] : (existing?.[k] ?? null);
  const merged = {
    mood: pick('mood') as number | null,
    path: ((pick('path') as string | null) || null)?.toLowerCase() ?? null,
    intention: (pick('intention') as string | null) || null,
    rest: body.rest !== undefined ? body.rest : !!Number(existing?.rest ?? 0),
    followup: pick('followup') as CheckinRow['followup'],
  };

  if (!merged.rest && merged.mood == null) {
    return error('VALIDATION_ERROR', 'Pick a mood to check in.', 400);
  }
  if (merged.path && !isKnownGrowthPath(merged.path)) {
    return error('VALIDATION_ERROR', 'Unknown path', 400);
  }
  if (merged.followup && !merged.intention) {
    return error('VALIDATION_ERROR', 'A follow-up needs an intention first.', 400);
  }

  const wasRest = !!Number(existing?.rest ?? 0);
  if (merged.rest && !wasRest) {
    const r = await recordRest(env, me.userId, body.day);
    if (!r) return error('NOT_FOUND', 'User not found', 404);
    if (r.status === 'no_rest_left') {
      return error(
        'NO_REST_LEFT',
        'No rest days left right now — you earn one every 7 active days. Even a tiny step today counts.',
        409
      );
    }
    if (r.status === 'already_active') {
      return error('ALREADY_ACTIVE', 'You’ve already grown today — no rest day needed.', 409);
    }
  }

  const ins = await env.DB.prepare(
    `INSERT INTO daily_checkins (id, user_id, day, tz, mood, path, intention, rest, followup, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(user_id, day) DO NOTHING`
  )
    .bind(
      generateId('checkin'),
      me.userId,
      body.day,
      me.tz,
      merged.mood,
      merged.path,
      merged.intention,
      merged.rest ? 1 : 0,
      merged.followup
    )
    .run();
  const inserted = Number((ins as { meta?: { changes?: number } }).meta?.changes ?? 0) === 1;
  if (!inserted) {
    await env.DB.prepare(
      `UPDATE daily_checkins SET mood = ?, path = ?, intention = ?, rest = ?, followup = ?, tz = ?,
         updated_at = datetime('now')
       WHERE user_id = ? AND day = ?`
    )
      .bind(
        merged.mood,
        merged.path,
        merged.intention,
        merged.rest ? 1 : 0,
        merged.followup,
        me.tz,
        me.userId,
        body.day
      )
      .run();
  }

  let pointsAwarded = 0;
  let newBadges: BadgeEarned[] = [];
  if (!merged.rest) {
    if (inserted) {
      await awardPoints(env, me.userId, POINTS.DAILY_CHECKIN);
      pointsAwarded = POINTS.DAILY_CHECKIN;
    }
    const rec = await recordActivity(env, me.userId, 'checkin', { path: merged.path, day: body.day });
    newBadges = rec.newBadges;
  }

  const [row, streak] = await Promise.all([
    loadCheckin(env, me.userId, body.day),
    getStreakPayload(env, me.userId),
  ]);
  return json({
    checkin: formatCheckin(row as CheckinRow),
    streak,
    points_awarded: pointsAwarded,
    new_badges: newBadges,
  });
}

// ---------------------------------------------------------------------------
// Badges & level
// ---------------------------------------------------------------------------

/** GET /me/badges — lazily back-fills earned badges (silently, points included). */
export async function getMyBadges(request: Request, env: Env): Promise<Response> {
  const me = await requireUser(request, env);
  if (me instanceof Response) return me;

  await getStreakState(env, me.userId); // lazy streak init so streak badges see history
  const { metrics, earned } = await checkBadges(env, me.userId, { silent: true });
  const [rows, pointsRow] = await Promise.all([
    loadEarnedBadges(env, me.userId),
    env.DB.prepare('SELECT points FROM users WHERE id = ?').bind(me.userId).first<{ points: number }>(),
  ]);

  return json({
    earned: rows.map((r) => ({ id: r.badge_id, earned_at: r.earned_at, seen: !!r.seen_at })),
    catalog: BADGES.map((b) => ({
      id: b.id,
      name: b.name,
      description: b.description,
      category: b.category,
      tier: b.tier,
      points: b.points,
      progress: badgeProgress(b, metrics, earned.has(b.id)),
    })),
    next: nextBadge(metrics, earned),
    level: growthLevel(pointsRow?.points ?? me.points),
  });
}

/** POST /me/badges/seen */
export async function markBadgesSeen(request: Request, env: Env): Promise<Response> {
  const me = await requireUser(request, env);
  if (me instanceof Response) return me;
  const v = await validateRequest(request, badgesSeenSchema);
  if (!v.success) return v.response;
  const ids = [...new Set(v.data.ids)];
  if (ids.length) {
    await env.DB.prepare(
      `UPDATE user_badges SET seen_at = datetime('now')
       WHERE user_id = ? AND seen_at IS NULL AND badge_id IN (${ids.map(() => '?').join(', ')})`
    )
      .bind(me.userId, ...ids)
      .run();
  }
  return json({ ok: true });
}

/** GET /users/:id/badges — earned only; 404 if either side blocked. */
export async function getUserBadges(request: Request, env: Env, targetId: string): Promise<Response> {
  const me = await requireUser(request, env);
  if (me instanceof Response) return me;
  const target = await env.DB.prepare('SELECT id, email, points FROM users WHERE id = ?')
    .bind(targetId)
    .first<{ id: string; email: string; points: number }>();
  if (!target || target.email?.endsWith('@growl.invalid')) {
    return error('NOT_FOUND', 'User not found', 404);
  }
  if (targetId !== me.userId && (await isBlocked(env, me.userId, targetId))) {
    return error('NOT_FOUND', 'User not found', 404);
  }
  const rows = await loadEarnedBadges(env, targetId);
  return json({
    earned: rows.map((r) => ({ id: r.badge_id, earned_at: r.earned_at })),
    level: growthLevel(target.points),
  });
}

// ---------------------------------------------------------------------------
// Weekly recap
// ---------------------------------------------------------------------------

/** GET /me/recap?week=YYYY-Www (default = last complete local week) */
export async function getRecap(request: Request, env: Env): Promise<Response> {
  const me = await requireUser(request, env);
  if (me instanceof Response) return me;
  const got = await getStreakState(env, me.userId);
  if (!got) return error('NOT_FOUND', 'User not found', 404);
  const today = got.today;

  const asked = new URL(request.url).searchParams.get('week');
  const week = asked || isoWeek(addDays(today, -7));
  const start = isoWeekStart(week);
  if (!start) return error('VALIDATION_ERROR', 'week must look like 2026-W46', 400);
  if (start > today) return error('VALIDATION_ERROR', 'That week hasn’t started yet', 400);
  const end = addDays(start, 6);
  const ended = end < today;

  if (ended) {
    const stored = await env.DB.prepare('SELECT payload FROM weekly_recaps WHERE user_id = ? AND week = ?')
      .bind(me.userId, week)
      .first<{ payload: string }>();
    if (stored) {
      try {
        return json(JSON.parse(stored.payload) as WeeklyRecap);
      } catch {
        // fall through and recompute
      }
    }
  }

  const recap = await computeRecap(env, me.userId, {
    tz: got.tz,
    start,
    currentStreak: got.state.current,
    userCreatedAt: me.createdAt,
  });
  if (ended) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO weekly_recaps (user_id, week, payload, created_at) VALUES (?, ?, ?, datetime('now'))`
    )
      .bind(me.userId, week, JSON.stringify(recap))
      .run();
  }
  return json(recap);
}

// ---------------------------------------------------------------------------
// Progress charts
// ---------------------------------------------------------------------------

export const MAX_PROGRESS_RANGE = 182;

/** GET /me/progress?range=90 */
export async function getProgress(request: Request, env: Env): Promise<Response> {
  const me = await requireUser(request, env);
  if (me instanceof Response) return me;
  const raw = Number(new URL(request.url).searchParams.get('range') ?? 90);
  const range = Math.max(1, Math.min(MAX_PROGRESS_RANGE, Number.isFinite(raw) ? Math.floor(raw) : 90));

  const got = await getStreakState(env, me.userId);
  if (!got) return error('NOT_FOUND', 'User not found', 404);
  const today = got.today;
  const start = addDays(today, -(range - 1));

  const [daysRes, pathsRes] = await Promise.all([
    env.DB.prepare(
      `SELECT a.day, a.kinds, a.is_rest, c.mood
       FROM user_activity_days a
       LEFT JOIN daily_checkins c ON c.user_id = a.user_id AND c.day = a.day
       WHERE a.user_id = ? AND a.day >= ? AND a.day <= ?`
    )
      .bind(me.userId, start, today)
      .all<{ day: string; kinds: number; is_rest: number; mood: number | null }>(),
    env.DB.prepare(
      `SELECT path, SUM(n) AS count FROM (
         SELECT lower(CASE WHEN instr(category, ':') > 0
                      THEN substr(category, 1, instr(category, ':') - 1) ELSE category END) AS path,
                COUNT(*) AS n
         FROM posts WHERE user_id = ? AND created_at >= ?
         GROUP BY 1
         UNION ALL
         SELECT lower(CASE WHEN instr(path, ':') > 0
                      THEN substr(path, 1, instr(path, ':') - 1) ELSE path END),
                COUNT(*)
         FROM daily_checkins WHERE user_id = ? AND day >= ? AND rest = 0 AND path IS NOT NULL
         GROUP BY 1
       ) WHERE path IS NOT NULL AND path != ''
       GROUP BY path ORDER BY count DESC, path ASC`
    )
      .bind(me.userId, start, me.userId, start)
      .all<{ path: string; count: number }>(),
  ]);

  const map = new Map((daysRes.results || []).map((r) => [r.day, r]));
  const days = dayRange(start, today).map((day) => {
    const r = map.get(day);
    const kinds = Number(r?.kinds ?? 0);
    const active = !!r && !Number(r.is_rest) && kinds > 0;
    return {
      day,
      active,
      rest: !!r && !!Number(r.is_rest) && !active,
      kinds,
      mood: r?.mood == null ? null : Number(r.mood),
    };
  });

  const weeks = new Map<string, { sum: number; n: number }>();
  for (const d of days) {
    const w = isoWeek(d.day);
    const acc = weeks.get(w) ?? { sum: 0, n: 0 };
    if (d.mood != null) {
      acc.sum += d.mood;
      acc.n += 1;
    }
    weeks.set(w, acc);
  }

  return json({
    days,
    by_path: (pathsRes.results || []).map((r) => ({ path: r.path, count: Number(r.count) || 0 })),
    mood_by_week: [...weeks.entries()].map(([week, a]) => ({
      week,
      avg: a.n ? Math.round((a.sum / a.n) * 10) / 10 : null,
    })),
    longest_streak: got.state.longest,
    total_active_days: got.state.total_days,
  });
}

// ---------------------------------------------------------------------------
// Challenges
// ---------------------------------------------------------------------------

type ParticipationRow = {
  challenge_id: string;
  joined_at: string;
  ends_at: string;
  completed_at: string | null;
};

async function activityRowsBetween(env: Env, userId: string, from: string, to: string) {
  const res = await env.DB.prepare(
    `SELECT day, paths FROM user_activity_days
     WHERE user_id = ? AND day >= ? AND day <= ? AND is_rest = 0`
  )
    .bind(userId, from, to)
    .all<{ day: string; paths: string }>();
  return res.results || [];
}

/** GET /challenges?path= */
export async function listChallenges(request: Request, env: Env): Promise<Response> {
  const me = await requireUser(request, env);
  if (me instanceof Response) return me;
  const pathFilter = (new URL(request.url).searchParams.get('path') || '').trim().toLowerCase();
  const top = topLevelPath(pathFilter);
  const list = top ? CHALLENGES.filter((c) => c.path === top) : [...CHALLENGES];
  const today = localDay(me.tz);

  const [mineRes, countsRes] = await Promise.all([
    env.DB.prepare(
      `SELECT challenge_id, joined_at, ends_at, completed_at FROM challenge_participants WHERE user_id = ?`
    )
      .bind(me.userId)
      .all<ParticipationRow>(),
    env.DB.prepare(
      `SELECT challenge_id, COUNT(*) AS n FROM challenge_participants WHERE ends_at >= ? GROUP BY challenge_id`
    )
      .bind(today)
      .all<{ challenge_id: string; n: number }>(),
  ]);
  const mine = new Map((mineRes.results || []).map((r) => [r.challenge_id, r]));
  const counts = new Map((countsRes.results || []).map((r) => [r.challenge_id, Number(r.n) || 0]));

  const joinedRows = list.map((c) => mine.get(c.id)).filter((r): r is ParticipationRow => !!r);
  let rows: { day: string; paths: string }[] = [];
  if (joinedRows.length) {
    const from = joinedRows.reduce((m, r) => (r.joined_at < m ? r.joined_at : m), joinedRows[0].joined_at);
    const to = joinedRows.reduce((m, r) => (r.ends_at > m ? r.ends_at : m), joinedRows[0].ends_at);
    rows = await activityRowsBetween(env, me.userId, from, to);
  }

  const out = [];
  for (const c of list) {
    const p = mine.get(c.id);
    let progress = 0;
    let completed = false;
    if (p) {
      progress = progressFromRows(rows, c.path, p.joined_at, p.ends_at).progress;
      completed = !!p.completed_at;
      if (!completed && progress >= c.target_days) {
        completed = (await completeChallenge(env, me.userId, c)).completed || completed;
      }
    }
    out.push({
      ...c,
      joined: !!p && (p.ends_at >= today || completed),
      progress: Math.min(progress, c.target_days),
      ...(p ? { ends_at: p.ends_at } : {}),
      completed,
      participants: counts.get(c.id) ?? 0,
    });
  }
  return json({ challenges: out });
}

async function challengeDetail(env: Env, me: Authed, c: Challenge) {
  const today = localDay(me.tz);
  const p = await env.DB.prepare(
    `SELECT challenge_id, joined_at, ends_at, completed_at FROM challenge_participants
     WHERE user_id = ? AND challenge_id = ?`
  )
    .bind(me.userId, c.id)
    .first<ParticipationRow>();

  let progress = 0;
  let completed = false;
  let days: { day: string; done: boolean }[] = [];
  if (p) {
    const rows = await activityRowsBetween(env, me.userId, p.joined_at, p.ends_at);
    const res = progressFromRows(rows, c.path, p.joined_at, p.ends_at);
    progress = res.progress;
    completed = !!p.completed_at;
    if (!completed && progress >= c.target_days) {
      completed = (await completeChallenge(env, me.userId, c)).completed || completed;
    }
    days = challengeDays(p.joined_at, p.ends_at, res.doneDays);
  }

  // Friends + me only; progress per participant in one grouped query (6 params).
  const board = await env.DB.prepare(
    `SELECT cp.user_id, u.metadata,
       (SELECT COUNT(*) FROM user_activity_days a
          WHERE a.user_id = cp.user_id AND a.day >= cp.joined_at AND a.day <= cp.ends_at
            AND a.is_rest = 0 AND (',' || a.paths || ',') LIKE ?) AS progress
     FROM challenge_participants cp
     JOIN users u ON u.id = cp.user_id
     WHERE cp.challenge_id = ?
       AND u.email NOT LIKE '%@growl.invalid'
       AND (cp.user_id = ?
         OR cp.user_id IN (SELECT target_user_id FROM user_relationships WHERE user_id = ? AND type = 'friend')
         OR cp.user_id IN (SELECT user_id FROM user_relationships WHERE target_user_id = ? AND type = 'friend'))
     ORDER BY progress DESC, cp.joined_at ASC
     LIMIT 50`
  )
    .bind(pathLikePattern(c.path), c.id, me.userId, me.userId, me.userId)
    .all<{ user_id: string; metadata: string | null; progress: number }>();

  const leaderboard = (board.results || []).map((r) => {
    let meta: { username?: unknown; avatar?: unknown } = {};
    try {
      meta = JSON.parse(r.metadata || '{}');
    } catch {
      meta = {};
    }
    return {
      user_id: r.user_id,
      username: typeof meta.username === 'string' && meta.username.trim() ? meta.username.trim() : 'Someone',
      avatar: typeof meta.avatar === 'string' && meta.avatar.trim() ? meta.avatar.trim() : null,
      progress: Math.min(Number(r.progress) || 0, c.target_days),
      is_me: r.user_id === me.userId,
    };
  });

  return {
    ...c,
    joined: !!p && (p.ends_at >= today || completed),
    progress: Math.min(progress, c.target_days),
    ...(p ? { joined_at: p.joined_at, ends_at: p.ends_at } : {}),
    completed,
    days,
    leaderboard,
  };
}

/** GET /challenges/:id */
export async function getChallengeDetail(request: Request, env: Env, id: string): Promise<Response> {
  const me = await requireUser(request, env);
  if (me instanceof Response) return me;
  const c = getChallenge(id);
  if (!c) return error('NOT_FOUND', 'Challenge not found', 404);
  return json(await challengeDetail(env, me, c));
}

/** POST /challenges/:id/join — idempotent while running; restarts an ended one. */
export async function joinChallenge(request: Request, env: Env, id: string): Promise<Response> {
  const me = await requireUser(request, env);
  if (me instanceof Response) return me;
  const c = getChallenge(id);
  if (!c) return error('NOT_FOUND', 'Challenge not found', 404);
  const today = localDay(me.tz);
  const endsAt = challengeEndsAt(c, today);
  await env.DB.prepare(
    `INSERT INTO challenge_participants (user_id, challenge_id, joined_at, ends_at, completed_at)
     VALUES (?, ?, ?, ?, NULL)
     ON CONFLICT(user_id, challenge_id) DO UPDATE SET
       joined_at = excluded.joined_at, ends_at = excluded.ends_at, completed_at = NULL
     WHERE challenge_participants.ends_at < ?`
  )
    .bind(me.userId, c.id, today, endsAt, today)
    .run();
  return json(await challengeDetail(env, me, c));
}

/** DELETE /challenges/:id/join */
export async function leaveChallenge(request: Request, env: Env, id: string): Promise<Response> {
  const me = await requireUser(request, env);
  if (me instanceof Response) return me;
  if (!getChallenge(id)) return error('NOT_FOUND', 'Challenge not found', 404);
  await env.DB.prepare('DELETE FROM challenge_participants WHERE user_id = ? AND challenge_id = ?')
    .bind(me.userId, id)
    .run();
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

/** GET /me/invite */
export async function getMyInvite(request: Request, env: Env): Promise<Response> {
  const me = await requireUser(request, env);
  if (me instanceof Response) return me;
  const code = await ensureInviteCode(env, me.userId);
  const counts = await env.DB.prepare(
    `SELECT COUNT(*) AS invited, COALESCE(SUM(CASE WHEN status = 'rewarded' THEN 1 ELSE 0 END), 0) AS rewarded
     FROM invite_redemptions WHERE inviter_id = ?`
  )
    .bind(me.userId)
    .first<{ invited: number; rewarded: number }>();
  return json({
    code,
    url: `${INVITE_URL_BASE}${code}`,
    invited_count: Number(counts?.invited ?? 0),
    rewarded_count: Number(counts?.rewarded ?? 0),
  });
}

export const INVITE_LOOKUP_LIMIT = 30;
export const INVITE_LOOKUP_WINDOW_SECONDS = 600;

/** GET /invites/:code — public, rate-limited per IP. */
export async function lookupInvite(request: Request, env: Env, rawCode: string): Promise<Response> {
  const { allowed } = await checkRateLimit(
    env,
    `invite-lookup:${clientIp(request)}`,
    INVITE_LOOKUP_LIMIT,
    INVITE_LOOKUP_WINDOW_SECONDS
  );
  if (!allowed) {
    return error('RATE_LIMITED', 'Too many lookups. Please wait a few minutes and try again.', 429);
  }
  let decoded = rawCode;
  try {
    decoded = decodeURIComponent(rawCode);
  } catch {
    // keep raw
  }
  const code = normalizeInviteCode(decoded);
  const inviter = code ? await findInviterByCode(env, code) : null;
  if (!inviter) return error('NOT_FOUND', 'Invite not found', 404);
  return json({ inviter: { username: inviter.username, avatar: inviter.avatar } });
}

/** POST /me/invite/redeem */
export async function redeemMyInvite(request: Request, env: Env): Promise<Response> {
  const me = await requireUser(request, env);
  if (me instanceof Response) return me;
  const v = await validateRequest(request, inviteRedeemSchema);
  if (!v.success) return v.response;
  const res = await redeemInvite(env, me.userId, v.data.code);
  if (!res.ok) return error(res.code, res.message, res.status);
  return json({
    inviter: { id: res.inviter.id, username: res.inviter.username, avatar: res.inviter.avatar },
    friend: true,
  });
}

