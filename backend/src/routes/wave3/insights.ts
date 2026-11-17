/**
 * Wave 3 — gentle insights (Daylio/Bearable-style) for the owner's Progress tab.
 *
 *   GET /me/insights?days=30|90
 *     → { ready, checkins_needed, days, insights: [{ id, kind, title, body, strength, data }] }
 *
 * All pattern finding lives in the pure `computeInsights` (unit-tested); the route only
 * loads rows. Wording is always tentative ("tends to", "lately"), never medical, never
 * a judgement of the person. No insight is produced when the data is thin.
 *
 * Mood scale (daily_checkins.mood): 1 Heavy · 2 Tired · 3 Okay · 4 Good · 5 Bright.
 */
import type { Env } from '../../types';
import { json, error } from '../../utils/response';
import { getRequestContext } from '../../utils/auth';
import { addDays, localDay, parseDbTimestamp, safeTimeZone, topLevelPath } from '../../utils/days';

// ---------------------------------------------------------------------------
// Types & thresholds
// ---------------------------------------------------------------------------

export type InsightKind =
  | 'mood_by_path'
  | 'mood_by_weekday'
  | 'mood_trend'
  | 'mood_by_activity'
  | 'rest_bounce'
  | 'intention_follow_through'
  | 'consistency';

export type Insight = {
  id: string;
  kind: InsightKind;
  title: string;
  body: string;
  strength: 'tentative' | 'clear';
  data: Record<string, unknown>;
};

export type InsightsPayload = {
  ready: boolean;
  checkins_needed: number;
  days: number;
  insights: Insight[];
};

export type InsightCheckin = {
  day: string;
  mood: number | null;
  path: string | null;
  intention: string | null;
  rest: boolean;
  followup: 'yes' | 'partly' | 'no' | null;
};

export type InsightActivityDay = { day: string; kinds: number; is_rest: boolean };

/** A post or journal entry; `hour` is the local hour 0–23 (null when unknown). */
export type InsightEvent = { kind: 'post' | 'journal'; path: string | null; hour: number | null };

export type InsightInput = {
  today: string;
  days: number;
  checkins: InsightCheckin[];
  activity: InsightActivityDay[];
  events: InsightEvent[];
};

export const INSIGHT_THRESHOLDS = {
  /** Mood check-ins needed in the window before any insight shows. */
  READY_CHECKINS: 7,
  /** Samples needed on each side of a comparison. */
  MIN_SAMPLES: 4,
  /** Samples on each side for a "clear" comparison. */
  CLEAR_SAMPLES: 8,
  /** Mean difference on the 1–5 scale for a pattern at all / for "clear". */
  MIN_DIFF: 0.5,
  CLEAR_DIFF: 0.75,
  /** Weekday: samples per weekday considered, and for "clear". */
  WEEKDAY_MIN: 3,
  WEEKDAY_CLEAR: 5,
  /** Intention follow-up: answered intentions needed / for "clear"; share followed. */
  FOLLOWUP_MIN: 5,
  FOLLOWUP_CLEAR: 10,
  FOLLOWUP_RATE: 0.5,
  /** Consistency: path touches needed, top count, top share; time-of-day events/share. */
  PATH_TOTAL_MIN: 6,
  PATH_TOP_MIN: 4,
  PATH_SHARE: 0.4,
  PATH_CLEAR_TOTAL: 15,
  TIME_MIN: 5,
  TIME_SHARE: 0.5,
  MAX_INSIGHTS: 3,
} as const;

const T = INSIGHT_THRESHOLDS;

const PATH_LABELS: Record<string, string> = {
  fitness: 'Fitness',
  art: 'Art',
  nutrition: 'Nutrition',
  mindset: 'Mindset',
  discipline: 'Discipline',
  'martial-arts': 'Martial arts',
  language: 'Language',
  coding: 'Coding',
  sustainability: 'Sustainability',
  wellness: 'Wellness',
  finance: 'Finance',
};

export function pathLabel(path: string): string {
  if (PATH_LABELS[path]) return PATH_LABELS[path];
  const s = path.replace(/[-_]+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : path;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export function timeOfDay(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

const TIME_PHRASE: Record<TimeOfDay, string> = {
  morning: 'in the morning',
  afternoon: 'in the afternoon',
  evening: 'in the evening',
  night: 'late at night',
};

// ---------------------------------------------------------------------------
// Pure computation
// ---------------------------------------------------------------------------

const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function weekdayOf(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

function validMood(m: unknown): m is number {
  return typeof m === 'number' && Number.isFinite(m) && m >= 1 && m <= 5;
}

type Compare = { a: number; b: number; na: number; nb: number; diff: number; clear: boolean };

/** Positive-direction comparison of group A over group B, or null when thin / too small. */
function compareGroups(a: number[], b: number[]): Compare | null {
  if (a.length < T.MIN_SAMPLES || b.length < T.MIN_SAMPLES) return null;
  const ma = mean(a);
  const mb = mean(b);
  const diff = ma - mb;
  if (diff < T.MIN_DIFF) return null;
  const clear = a.length >= T.CLEAR_SAMPLES && b.length >= T.CLEAR_SAMPLES && diff >= T.CLEAR_DIFF;
  return { a: ma, b: mb, na: a.length, nb: b.length, diff, clear };
}

type Candidate = Insight & { priority: number };

export function computeInsights(input: InsightInput): InsightsPayload {
  const days = input.days;
  const start = addDays(input.today, -(days - 1));
  const inWindow = (d: string) => d >= start && d <= input.today;

  const checkins = input.checkins.filter((c) => inWindow(c.day));
  // One row per day (the table is UNIQUE(user, day), but stay defensive).
  const byDay = new Map<string, InsightCheckin>();
  for (const c of checkins) byDay.set(c.day, c);
  const moodRows = [...byDay.values()].filter((c) => !c.rest && validMood(c.mood)) as (InsightCheckin & {
    mood: number;
  })[];

  const needed = Math.max(0, T.READY_CHECKINS - moodRows.length);
  if (needed > 0) return { ready: false, checkins_needed: needed, days, insights: [] };

  const out: Candidate[] = [];
  const strength = (clear: boolean): Insight['strength'] => (clear ? 'clear' : 'tentative');
  const windowPhrase = `the last ${days} days`;

  // --- mood_by_path: brighter on <path> days than on other days --------------
  {
    const paths = new Set<string>();
    for (const r of moodRows) {
      const p = topLevelPath(r.path);
      if (p) paths.add(p);
    }
    let best: { path: string; cmp: Compare } | null = null;
    for (const p of paths) {
      const on = moodRows.filter((r) => topLevelPath(r.path) === p).map((r) => r.mood);
      const off = moodRows.filter((r) => topLevelPath(r.path) !== p).map((r) => r.mood);
      const cmp = compareGroups(on, off);
      if (cmp && (!best || cmp.diff > best.cmp.diff || (cmp.diff === best.cmp.diff && p < best.path))) {
        best = { path: p, cmp };
      }
    }
    if (best) {
      const label = pathLabel(best.path);
      out.push({
        priority: 1,
        id: `mood_by_path:${best.path}`,
        kind: 'mood_by_path',
        title: `You tend to feel brighter on ${label} days`,
        body: `Over ${windowPhrase}, check-ins on ${label} days were a little brighter than on other days.`,
        strength: strength(best.cmp.clear),
        data: {
          path: best.path,
          path_mean: round1(best.cmp.a),
          other_mean: round1(best.cmp.b),
          path_samples: best.cmp.na,
          other_samples: best.cmp.nb,
          diff: round1(best.cmp.diff),
        },
      });
    }
  }

  // --- mood_trend: last 14 days vs the 14 before -----------------------------
  {
    const recentStart = addDays(input.today, -13);
    const priorStart = addDays(input.today, -27);
    const recent = moodRows.filter((r) => r.day >= recentStart).map((r) => r.mood);
    const prior = moodRows.filter((r) => r.day >= priorStart && r.day < recentStart).map((r) => r.mood);
    const up = compareGroups(recent, prior);
    const down = up ? null : compareGroups(prior, recent);
    if (up) {
      out.push({
        priority: 2,
        id: 'mood_trend:up',
        kind: 'mood_trend',
        title: 'Your mood has been lifting lately',
        body: 'Your check-ins over the last two weeks have been a little brighter than the two weeks before.',
        strength: strength(up.clear),
        data: {
          direction: 'up',
          recent_mean: round1(up.a),
          prior_mean: round1(up.b),
          recent_samples: up.na,
          prior_samples: up.nb,
        },
      });
    } else if (down) {
      out.push({
        priority: 8,
        id: 'mood_trend:down',
        kind: 'mood_trend',
        title: 'The last two weeks have felt a little heavier',
        body: 'Some stretches are like that. Small steps and rest days both count.',
        strength: strength(down.clear),
        data: {
          direction: 'down',
          recent_mean: round1(down.b),
          prior_mean: round1(down.a),
          recent_samples: down.nb,
          prior_samples: down.na,
        },
      });
    }
  }

  // --- mood_by_weekday: brightest vs heaviest weekday ------------------------
  {
    const groups: number[][] = Array.from({ length: 7 }, () => []);
    for (const r of moodRows) groups[weekdayOf(r.day)].push(r.mood);
    const eligible = groups
      .map((g, wd) => ({ wd, n: g.length, m: g.length ? mean(g) : 0 }))
      .filter((g) => g.n >= T.WEEKDAY_MIN);
    if (eligible.length >= 2) {
      // Ties: earliest weekday (Sunday first) wins, for stable ids.
      const bestDay = eligible.reduce((x, y) => (y.m > x.m ? y : x));
      const hardDay = eligible.reduce((x, y) => (y.m < x.m ? y : x));
      const diff = bestDay.m - hardDay.m;
      if (bestDay.wd !== hardDay.wd && diff >= T.MIN_DIFF) {
        const clear = bestDay.n >= T.WEEKDAY_CLEAR && hardDay.n >= T.WEEKDAY_CLEAR && diff >= T.CLEAR_DIFF;
        out.push({
          priority: 3,
          id: `mood_by_weekday:${bestDay.wd}:${hardDay.wd}`,
          kind: 'mood_by_weekday',
          title: `${WEEKDAYS[bestDay.wd]}s tend to feel brightest`,
          body: `${WEEKDAYS[hardDay.wd]}s tend to be a little heavier, so they might be a good day to go gently.`,
          strength: strength(clear),
          data: {
            best_weekday: bestDay.wd,
            best_mean: round1(bestDay.m),
            best_samples: bestDay.n,
            hardest_weekday: hardDay.wd,
            hardest_mean: round1(hardDay.m),
            hardest_samples: hardDay.n,
          },
        });
      }
    }
  }

  // --- intention_follow_through (evening follow-up on the Today card) --------
  {
    const answered = [...byDay.values()].filter((c) => c.intention && c.followup);
    if (answered.length >= T.FOLLOWUP_MIN) {
      const yes = answered.filter((c) => c.followup === 'yes').length;
      const partly = answered.filter((c) => c.followup === 'partly').length;
      const followed = yes + partly;
      if (followed / answered.length >= T.FOLLOWUP_RATE) {
        out.push({
          priority: 4,
          id: 'intention_follow_through',
          kind: 'intention_follow_through',
          title: 'Your intentions tend to stick',
          body: `You followed through, at least partly, on ${followed} of ${answered.length} intentions lately.`,
          strength: strength(answered.length >= T.FOLLOWUP_CLEAR),
          data: { answered: answered.length, yes, partly, followed },
        });
      }
    }
  }

  // --- mood_by_activity: brighter on days you post or journal ---------------
  {
    const activeDays = new Set(
      input.activity.filter((a) => inWindow(a.day) && (a.kinds & (1 | 4)) !== 0).map((a) => a.day)
    );
    const on = moodRows.filter((r) => activeDays.has(r.day)).map((r) => r.mood);
    const off = moodRows.filter((r) => !activeDays.has(r.day)).map((r) => r.mood);
    const cmp = compareGroups(on, off);
    if (cmp) {
      out.push({
        priority: 5,
        id: 'mood_by_activity',
        kind: 'mood_by_activity',
        title: 'Days you post or journal tend to feel brighter',
        body: 'Your mood tends to be a little higher on days you share a moment or write in your journal.',
        strength: strength(cmp.clear),
        data: {
          active_mean: round1(cmp.a),
          other_mean: round1(cmp.b),
          active_samples: cmp.na,
          other_samples: cmp.nb,
        },
      });
    }
  }

  // --- rest_bounce: brighter the day after a rest day ------------------------
  {
    const restDays = new Set<string>();
    for (const c of byDay.values()) if (c.rest) restDays.add(c.day);
    for (const a of input.activity) if (a.is_rest && inWindow(a.day)) restDays.add(a.day);
    const after = moodRows.filter((r) => restDays.has(addDays(r.day, -1))).map((r) => r.mood);
    const other = moodRows.filter((r) => !restDays.has(addDays(r.day, -1))).map((r) => r.mood);
    const cmp = compareGroups(after, other);
    if (cmp) {
      out.push({
        priority: 6,
        id: 'rest_bounce',
        kind: 'rest_bounce',
        title: 'You tend to feel brighter after a rest day',
        body: 'Check-ins the day after resting tend to be a little brighter. Rest is part of growing.',
        strength: strength(cmp.clear),
        data: {
          after_rest_mean: round1(cmp.a),
          other_mean: round1(cmp.b),
          after_rest_samples: cmp.na,
          other_samples: cmp.nb,
        },
      });
    }
  }

  // --- consistency: steadiest path and/or usual time of day -----------------
  {
    const counts = new Map<string, number>();
    for (const c of byDay.values()) {
      const p = !c.rest ? topLevelPath(c.path) : null;
      if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    for (const e of input.events) {
      const p = e.kind === 'post' ? topLevelPath(e.path) : null;
      if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const ranked = [...counts.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1));
    const [top, second] = ranked;
    const pathOk =
      !!top &&
      total >= T.PATH_TOTAL_MIN &&
      top[1] >= T.PATH_TOP_MIN &&
      top[1] / total >= T.PATH_SHARE &&
      (!second || top[1] > second[1]);

    const hours = input.events.map((e) => e.hour).filter((h): h is number => typeof h === 'number' && h >= 0 && h < 24);
    let time: { tod: TimeOfDay; n: number } | null = null;
    if (hours.length >= T.TIME_MIN) {
      const buckets = new Map<TimeOfDay, number>();
      for (const h of hours) buckets.set(timeOfDay(h), (buckets.get(timeOfDay(h)) ?? 0) + 1);
      const [tod, n] = [...buckets.entries()].sort((x, y) => y[1] - x[1])[0];
      if (n / hours.length >= T.TIME_SHARE) time = { tod, n };
    }

    if (pathOk || time) {
      const label = pathOk ? pathLabel(top[0]) : null;
      const title = label
        ? `${label} has been your steadiest path lately`
        : `You tend to show up ${TIME_PHRASE[time!.tod]}`;
      const parts: string[] = [];
      if (label) parts.push(`${label} came up most often in your check-ins and posts over ${windowPhrase}.`);
      if (label && time) parts.push(`You also tend to show up ${TIME_PHRASE[time.tod]}.`);
      if (!label && time) parts.push('Most of your posts and journal entries lately landed around then.');
      const clear = pathOk
        ? total >= T.PATH_CLEAR_TOTAL
        : hours.length >= T.PATH_CLEAR_TOTAL;
      out.push({
        priority: 7,
        id: label ? `consistency:${top[0]}` : `consistency:time:${time!.tod}`,
        kind: 'consistency',
        title,
        body: parts.join(' '),
        strength: strength(clear),
        data: {
          path: pathOk ? top[0] : null,
          path_count: pathOk ? top[1] : null,
          path_total: total,
          time_of_day: time?.tod ?? null,
          time_count: time?.n ?? null,
          time_total: hours.length,
        },
      });
    }
  }

  const insights = out
    .sort((a, b) => a.priority - b.priority)
    .slice(0, T.MAX_INSIGHTS)
    .map(({ priority: _p, ...rest }) => rest);
  return { ready: true, checkins_needed: 0, days, insights };
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

const hourFormatters = new Map<string, Intl.DateTimeFormat>();

/** Local hour 0–23 of a DB timestamp in a timezone, or null. */
export function localHourOf(ts: string | null | undefined, timeZone: string): number | null {
  const d = parseDbTimestamp(ts);
  if (!d) return null;
  let f = hourFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' });
    hourFormatters.set(timeZone, f);
  }
  const h = Number(f.formatToParts(d).find((p) => p.type === 'hour')?.value);
  return Number.isFinite(h) ? h % 24 : null;
}

const EVENT_LIMIT = 1000;

async function getInsights(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId || !ctx.user) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }
  const userId = ctx.userId;
  const tz = safeTimeZone((ctx.user as { timezone?: string }).timezone);
  const days = new URL(request.url).searchParams.get('days') === '90' ? 90 : 30;
  const today = localDay(tz);
  const start = addDays(today, -(days - 1));
  // UTC lower bound one day early so every local day in the window is covered.
  const utcFrom = addDays(start, -1);

  const [checkinsRes, activityRes, eventsRes] = await Promise.all([
    env.DB.prepare(
      `SELECT day, mood, path, intention, rest, followup
       FROM daily_checkins WHERE user_id = ? AND day >= ? AND day <= ?`
    )
      .bind(userId, start, today)
      .all<{
        day: string;
        mood: number | null;
        path: string | null;
        intention: string | null;
        rest: number;
        followup: 'yes' | 'partly' | 'no' | null;
      }>(),
    env.DB.prepare(
      `SELECT day, kinds, is_rest FROM user_activity_days WHERE user_id = ? AND day >= ? AND day <= ?`
    )
      .bind(userId, start, today)
      .all<{ day: string; kinds: number; is_rest: number }>(),
    env.DB.prepare(
      `SELECT kind, path, created_at FROM (
         SELECT 'post' AS kind, category AS path, created_at FROM posts WHERE user_id = ? AND created_at >= ?
         UNION ALL
         SELECT 'journal', NULL, created_at FROM journal_entries WHERE user_id = ? AND created_at >= ?
       ) ORDER BY created_at DESC LIMIT ?`
    )
      .bind(userId, utcFrom, userId, utcFrom, EVENT_LIMIT)
      .all<{ kind: 'post' | 'journal'; path: string | null; created_at: string }>(),
  ]);

  const events: InsightEvent[] = [];
  for (const r of eventsRes.results || []) {
    const d = parseDbTimestamp(r.created_at);
    if (!d) continue;
    const day = localDay(tz, d);
    if (day < start || day > today) continue;
    events.push({ kind: r.kind, path: r.path, hour: localHourOf(r.created_at, tz) });
  }

  const payload = computeInsights({
    today,
    days,
    checkins: (checkinsRes.results || []).map((r) => ({
      day: r.day,
      mood: r.mood == null ? null : Number(r.mood),
      path: r.path,
      intention: r.intention,
      rest: !!Number(r.rest),
      followup: r.followup ?? null,
    })),
    activity: (activityRes.results || []).map((r) => ({
      day: r.day,
      kinds: Number(r.kinds) || 0,
      is_rest: !!Number(r.is_rest),
    })),
    events,
  });
  return json(payload);
}

export async function handle(
  request: Request,
  env: Env,
  path: string,
  apiPrefix: string,
): Promise<Response | null> {
  if (path === `${apiPrefix}/me/insights`) {
    if (request.method !== 'GET') return error('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
    return getInsights(request, env);
  }
  return null;
}
