import type { Env } from '../types';
import { addDays, dayRange, localDay, safeTimeZone, topLevelPath, weekStart } from './days';
import { checkBadges, type BadgeEarned } from './badges';
import { checkChallengeCompletion } from './challenges';
import { rewardPendingInvite } from './invites';
import { isLifeModeDay, NO_LIFE_MODE, parseLifeMode, type LifeModeState } from './lifeMode';

/**
 * Unified growth streak (docs/GROWTH_SYSTEM.md §3).
 *
 * - One user_activity_days row per local day with activity (or an is_rest row).
 * - user_streaks is an incremental summary: every local day ≤ settled_through has
 *   been folded into current/longest/total/tokens. Today is folded in as soon as
 *   it has activity; missed days are settled lazily (on read and on record).
 * - A missed day while a streak is running consumes a rest token (an is_rest row is
 *   written) if one is left; otherwise current resets to 0 (longest is kept).
 * - Every 7 active days earns a rest token (max 2). Rest days don't add to current.
 * - Life mode (utils/lifeMode.ts): a missed day inside an active life-mode window is
 *   a protected day (is_rest = 2): the streak continues and no rest token is used.
 *   Protected rows are persisted when settled so later replays keep them.
 * - Anything that rewrites the past (back-dated activity, a rest day turning active)
 *   falls back to a full replay of the user's rows, which is the source of truth.
 */

export type ActivityKind = 'post' | 'story' | 'journal' | 'checkin';

export const KIND_BITS: Record<ActivityKind, number> = { post: 1, story: 2, journal: 4, checkin: 8 };

export const MAX_REST_TOKENS = 2;
export const ACTIVE_DAYS_PER_TOKEN = 7;
/** user_activity_days.is_rest values: 1 = rest day (used a token), 2 = life-mode protected. */
export const REST_TOKEN = 1;
export const REST_PROTECTED = 2;

export type StreakState = {
  current: number;
  longest: number;
  total_days: number;
  rest_tokens: number;
  active_since_token: number;
  last_active_day: string | null;
  settled_through: string | null;
};

export type DayRow = { day: string; kinds: number; is_rest: number; paths?: string };

export type StreakPayload = {
  current: number;
  longest: number;
  total_days: number;
  rest_days_left: number;
  last_active_day: string | null;
  today_done: boolean;
  today: string;
  week: { day: string; status: 'active' | 'rest' | 'missed' | 'future' | 'today' }[];
};

export const INITIAL_STREAK: StreakState = {
  current: 0,
  longest: 0,
  total_days: 0,
  rest_tokens: 1,
  active_since_token: 0,
  last_active_day: null,
  settled_through: null,
};

export function isActiveRow(r: { kinds: number; is_rest: number } | null | undefined): boolean {
  return !!r && !Number(r.is_rest) && Number(r.kinds) > 0;
}

/**
 * Pure fold of days [from, through] into the streak state. Returns the new state and
 * the gap days that consumed a rest token (caller persists them as is_rest rows).
 */
export function advanceStreak(
  prev: StreakState,
  rows: Map<string, DayRow>,
  from: string,
  through: string,
  opts: { isProtected?: (day: string) => boolean } = {}
): { state: StreakState; restDays: string[]; protectedDays: string[] } {
  const s: StreakState = { ...prev };
  const restDays: string[] = [];
  const protectedDays: string[] = [];
  if (from > through) return { state: s, restDays, protectedDays };
  for (const d of dayRange(from, through)) {
    const r = rows.get(d);
    if (isActiveRow(r)) {
      s.current += 1;
      s.total_days += 1;
      s.active_since_token += 1;
      if (s.active_since_token >= ACTIVE_DAYS_PER_TOKEN) {
        s.active_since_token = 0;
        s.rest_tokens = Math.min(MAX_REST_TOKENS, s.rest_tokens + 1);
      }
      s.longest = Math.max(s.longest, s.current);
      s.last_active_day = d;
    } else if (r && Number(r.is_rest) === REST_PROTECTED) {
      // Life-mode protected day: streak continues, no token used.
    } else if (r && Number(r.is_rest)) {
      // Rest day (explicit or previously settled): uses a token, streak continues.
      s.rest_tokens = Math.max(0, s.rest_tokens - 1);
    } else if (opts.isProtected?.(d)) {
      if (s.current > 0) protectedDays.push(d);
    } else if (s.current > 0 && s.rest_tokens > 0) {
      s.rest_tokens -= 1;
      restDays.push(d);
    } else {
      s.current = 0;
    }
  }
  s.settled_through = through;
  return { state: s, restDays, protectedDays };
}

type StreakCtx = { tz: string; streak: StreakState | null; lifeMode: LifeModeState };

const CTX_SELECT = `s.current, s.longest, s.total_days, s.rest_tokens,
            s.active_since_token, s.last_active_day, s.settled_through, s.user_id AS s_user
     FROM users u LEFT JOIN user_streaks s ON s.user_id = u.id
     WHERE u.id = ?`;

async function loadCtx(env: Env, userId: string): Promise<StreakCtx | null> {
  let row: Record<string, unknown> | null;
  try {
    row = await env.DB.prepare(
      `SELECT u.timezone AS tz, u.life_mode, u.life_mode_since, u.life_mode_until, ${CTX_SELECT}`
    )
      .bind(userId)
      .first<Record<string, unknown>>();
  } catch {
    // Life-mode columns missing (migration 0036 not applied yet).
    row = await env.DB.prepare(`SELECT u.timezone AS tz, ${CTX_SELECT}`)
      .bind(userId)
      .first<Record<string, unknown>>();
  }
  if (!row) return null;
  const tz = safeTimeZone(row.tz);
  const lifeMode = 'life_mode' in row ? parseLifeMode(row) : NO_LIFE_MODE;
  if (!row.s_user || !row.settled_through) return { tz, streak: null, lifeMode };
  return {
    tz,
    lifeMode,
    streak: {
      current: Number(row.current) || 0,
      longest: Number(row.longest) || 0,
      total_days: Number(row.total_days) || 0,
      rest_tokens: Number(row.rest_tokens) || 0,
      active_since_token: Number(row.active_since_token) || 0,
      last_active_day: (row.last_active_day as string | null) ?? null,
      settled_through: (row.settled_through as string | null) ?? null,
    },
  };
}

async function insertRestRows(
  env: Env,
  userId: string,
  days: string[],
  kind: typeof REST_TOKEN | typeof REST_PROTECTED = REST_TOKEN
): Promise<void> {
  // 2 bound params per row → 40 rows per statement stays well under D1's 100.
  for (let i = 0; i < days.length; i += 40) {
    const chunk = days.slice(i, i + 40);
    await env.DB.prepare(
      `INSERT OR IGNORE INTO user_activity_days (user_id, day, kinds, paths, is_rest)
       VALUES ${chunk.map(() => `(?, ?, 0, '', ${kind})`).join(', ')}`
    )
      .bind(...chunk.flatMap((d) => [userId, d]))
      .run();
  }
}

/**
 * Persist the state. With `expectSettled` the write only applies if nobody else
 * advanced the row meanwhile (optimistic check); returns false on a lost race.
 */
async function saveState(
  env: Env,
  userId: string,
  s: StreakState,
  expectSettled?: string | null
): Promise<boolean> {
  if (expectSettled !== undefined) {
    const res = await env.DB.prepare(
      `UPDATE user_streaks SET current = ?, longest = ?, total_days = ?, rest_tokens = ?,
         active_since_token = ?, last_active_day = ?, settled_through = ?, updated_at = datetime('now')
       WHERE user_id = ? AND settled_through IS ?`
    )
      .bind(
        s.current,
        s.longest,
        s.total_days,
        s.rest_tokens,
        s.active_since_token,
        s.last_active_day,
        s.settled_through,
        userId,
        expectSettled
      )
      .run();
    return Number((res as { meta?: { changes?: number } } | null)?.meta?.changes ?? 0) === 1;
  }
  await env.DB.prepare(
    `INSERT INTO user_streaks (user_id, current, longest, total_days, rest_tokens, active_since_token,
       last_active_day, settled_through, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET current = excluded.current, longest = excluded.longest,
       total_days = excluded.total_days, rest_tokens = excluded.rest_tokens,
       active_since_token = excluded.active_since_token, last_active_day = excluded.last_active_day,
       settled_through = excluded.settled_through, updated_at = excluded.updated_at`
  )
    .bind(
      userId,
      s.current,
      s.longest,
      s.total_days,
      s.rest_tokens,
      s.active_since_token,
      s.last_active_day,
      s.settled_through
    )
    .run();
  return true;
}

/** Full replay of the user's activity rows (lazy init after backfill; history rewrites). */
export async function rebuildStreak(
  env: Env,
  userId: string,
  today: string,
  lifeMode: LifeModeState = NO_LIFE_MODE
): Promise<StreakState> {
  const res = await env.DB.prepare(
    `SELECT day, kinds, is_rest FROM user_activity_days WHERE user_id = ? ORDER BY day ASC`
  )
    .bind(userId)
    .all<DayRow>();
  const rows = res.results || [];
  const yesterday = addDays(today, -1);
  // Existing rest rows (explicit or settled earlier) stay rest days; the replay only
  // adds rest rows for gaps it newly bridges.
  const map = new Map(rows.map((r) => [r.day, r]));
  let state: StreakState = { ...INITIAL_STREAK, settled_through: yesterday };
  if (rows.length) {
    const first = rows[0].day;
    const last = rows[rows.length - 1].day;
    const through = last > yesterday ? last : yesterday;
    const out = advanceStreak(INITIAL_STREAK, map, first, through, {
      isProtected: (d) => isLifeModeDay(lifeMode, d),
    });
    state = out.state;
    await insertRestRows(env, userId, out.restDays);
    await insertRestRows(env, userId, out.protectedDays, REST_PROTECTED);
  }
  await saveState(env, userId, state);
  return state;
}

/** Fold (settled_through, through] into the stored state. Rebuilds on a lost race. */
async function advanceStored(
  env: Env,
  userId: string,
  prev: StreakState,
  through: string,
  today: string,
  lifeMode: LifeModeState = NO_LIFE_MODE
): Promise<StreakState> {
  const from = addDays(prev.settled_through as string, 1);
  if (from > through) return prev;
  const res = await env.DB.prepare(
    `SELECT day, kinds, is_rest FROM user_activity_days WHERE user_id = ? AND day >= ? AND day <= ?`
  )
    .bind(userId, from, through)
    .all<DayRow>();
  const map = new Map((res.results || []).map((r) => [r.day, r]));
  const { state, restDays, protectedDays } = advanceStreak(prev, map, from, through, {
    isProtected: (d) => isLifeModeDay(lifeMode, d),
  });
  await insertRestRows(env, userId, restDays);
  await insertRestRows(env, userId, protectedDays, REST_PROTECTED);
  const ok = await saveState(env, userId, state, prev.settled_through);
  if (!ok) return rebuildStreak(env, userId, today, lifeMode);
  return state;
}

/** Settled streak state for the user's current local day (lazy init / settle). */
export async function getStreakState(
  env: Env,
  userId: string
): Promise<{ state: StreakState; today: string; tz: string; lifeMode: LifeModeState } | null> {
  const ctx = await loadCtx(env, userId);
  if (!ctx) return null;
  const today = localDay(ctx.tz);
  if (!ctx.streak) {
    const state = await rebuildStreak(env, userId, today, ctx.lifeMode);
    return { state, today, tz: ctx.tz, lifeMode: ctx.lifeMode };
  }
  const yesterday = addDays(today, -1);
  const state = await advanceStored(env, userId, ctx.streak, yesterday, today, ctx.lifeMode);
  return { state, today, tz: ctx.tz, lifeMode: ctx.lifeMode };
}

/** GET /me/streak shape (settles first). */
export async function getStreakPayload(env: Env, userId: string): Promise<StreakPayload | null> {
  const got = await getStreakState(env, userId);
  if (!got) return null;
  return buildStreakPayload(env, userId, got.state, got.today);
}

export async function buildStreakPayload(
  env: Env,
  userId: string,
  s: StreakState,
  today: string
): Promise<StreakPayload> {
  const monday = weekStart(today);
  const sunday = addDays(monday, 6);
  const res = await env.DB.prepare(
    `SELECT day, kinds, is_rest FROM user_activity_days WHERE user_id = ? AND day >= ? AND day <= ?`
  )
    .bind(userId, monday, sunday)
    .all<DayRow>();
  const map = new Map((res.results || []).map((r) => [r.day, r]));
  const status = (d: string): StreakPayload['week'][number]['status'] => {
    const r = map.get(d);
    if (isActiveRow(r)) return 'active';
    if (r && Number(r.is_rest)) return 'rest';
    if (d > today) return 'future';
    if (d === today) return 'today';
    return 'missed';
  };
  const todayRow = map.get(today);
  return {
    current: s.current,
    longest: s.longest,
    total_days: s.total_days,
    rest_days_left: s.rest_tokens,
    last_active_day: s.last_active_day,
    today_done: isActiveRow(todayRow) || !!(todayRow && Number(todayRow.is_rest)),
    today,
    week: dayRange(monday, sunday).map((day) => ({ day, status: status(day) })),
  };
}

function mergePaths(existing: string | null | undefined, add: string[]): string {
  const set = new Set(
    String(existing || '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
  );
  for (const p of add) set.add(p);
  return [...set].slice(0, 20).join(',');
}

export type RecordResult = { newBadges: BadgeEarned[]; state: StreakState | null; day: string | null };

/**
 * Record growth activity for the user's local day (or `opts.day`). Idempotent per
 * day and kind. Never throws — the user's action must not fail because of this.
 */
export async function recordActivity(
  env: Env,
  userId: string,
  kind: ActivityKind,
  opts: { path?: string | null; day?: string } = {}
): Promise<RecordResult> {
  try {
    const ctx = await loadCtx(env, userId);
    if (!ctx) return { newBadges: [], state: null, day: null };
    const today = localDay(ctx.tz);
    const day = opts.day || today;
    const bit = KIND_BITS[kind];
    const top = topLevelPath(opts.path);
    const addPaths = top ? [top] : [];

    const existing = await env.DB.prepare(
      `SELECT day, kinds, paths, is_rest FROM user_activity_days WHERE user_id = ? AND day = ?`
    )
      .bind(userId, day)
      .first<DayRow & { paths: string }>();
    const wasActive = isActiveRow(existing);
    const paths = mergePaths(existing?.paths, addPaths);
    const unchanged = wasActive && (Number(existing!.kinds) & bit) !== 0 && paths === (existing!.paths || '');

    if (!unchanged) {
      await env.DB.prepare(
        `INSERT INTO user_activity_days (user_id, day, kinds, paths, is_rest) VALUES (?, ?, ?, ?, 0)
         ON CONFLICT(user_id, day) DO UPDATE SET kinds = kinds | excluded.kinds,
           paths = excluded.paths, is_rest = 0`
      )
        .bind(userId, day, bit, paths)
        .run();
    }

    let state: StreakState | null = ctx.streak;
    if (!state) {
      state = await rebuildStreak(env, userId, today, ctx.lifeMode);
    } else if (!wasActive) {
      if (state.settled_through && day > state.settled_through) {
        state = await advanceStored(env, userId, state, day, today, ctx.lifeMode);
      } else {
        state = await rebuildStreak(env, userId, today, ctx.lifeMode);
      }
    }

    if (!wasActive) {
      try {
        await rewardPendingInvite(env, userId);
      } catch (err) {
        console.error('[recordActivity] invite reward', err);
      }
    }

    const newBadges: BadgeEarned[] = [];
    if (addPaths.length) {
      try {
        newBadges.push(...(await checkChallengeCompletion(env, userId, addPaths, day)));
      } catch (err) {
        console.error('[recordActivity] challenges', err);
      }
    }
    try {
      const { newBadges: more } = await checkBadges(env, userId);
      for (const b of more) if (!newBadges.some((x) => x.id === b.id)) newBadges.push(b);
    } catch (err) {
      console.error('[recordActivity] badges', err);
    }
    return { newBadges, state, day };
  } catch (err) {
    console.error('[recordActivity]', kind, err);
    return { newBadges: [], state: null, day: null };
  }
}

export type RestResult =
  | { status: 'ok'; state: StreakState }
  | { status: 'no_rest_left' | 'already_active'; state: StreakState };

/**
 * Explicit rest day from a Today check-in: uses a token (streak continues, no points).
 * Inside an active life mode it is a protected day instead (no token used).
 * Idempotent if the day is already a rest day.
 */
export async function recordRest(env: Env, userId: string, day: string): Promise<RestResult | null> {
  const got = await getStreakState(env, userId);
  if (!got) return null;
  let state = got.state;
  const existing = await env.DB.prepare(
    `SELECT day, kinds, is_rest FROM user_activity_days WHERE user_id = ? AND day = ?`
  )
    .bind(userId, day)
    .first<DayRow>();
  if (isActiveRow(existing)) return { status: 'already_active', state };
  if (existing && Number(existing.is_rest)) return { status: 'ok', state };
  const isProtected = isLifeModeDay(got.lifeMode, day);
  if (!isProtected && state.rest_tokens <= 0) return { status: 'no_rest_left', state };
  const kind = isProtected ? REST_PROTECTED : REST_TOKEN;

  await env.DB.prepare(
    `INSERT INTO user_activity_days (user_id, day, kinds, paths, is_rest) VALUES (?, ?, 0, '', ?)
     ON CONFLICT(user_id, day) DO UPDATE SET is_rest = excluded.is_rest WHERE kinds = 0`
  )
    .bind(userId, day, kind)
    .run();
  if (state.settled_through && day > state.settled_through) {
    state = await advanceStored(env, userId, state, day, got.today, got.lifeMode);
  } else {
    state = await rebuildStreak(env, userId, got.today, got.lifeMode);
  }
  return { status: 'ok', state };
}
