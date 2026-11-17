import type { Env } from '../types';
import { addDays, dayRange, isoWeek, localDayOf, topLevelPath } from './days';
import { getBadge } from './badges';

/** Weekly recap (docs/GROWTH_SYSTEM.md §4 "Weekly recap"). */
export type WeeklyRecap = {
  week: string;
  start: string;
  end: string;
  is_first_week: boolean;
  empty: boolean;
  active_days: number;
  days: { day: string; active: boolean; rest: boolean }[];
  current_streak: number;
  posts: number;
  reels: number;
  stories: number;
  journal_entries: number;
  checkins: number;
  encouragement_received: number;
  new_friends: number;
  top_path: string | null;
  badges_earned: string[];
  avg_mood: number | null;
  reflection: string;
};

export const EMPTY_WEEK_REFLECTION = 'A quiet week is still part of growing.';

function pathLabel(p: string): string {
  return p
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function recapReflection(r: Omit<WeeklyRecap, 'reflection'>): string {
  if (r.empty) return EMPTY_WEEK_REFLECTION;
  if (r.is_first_week) {
    return `Your first week on Grow! — you showed up on ${plural(r.active_days, 'day', 'days')}. Every path starts just like this.`;
  }
  if (r.active_days >= 7) return 'Seven days out of seven. That’s real momentum — be proud of it.';
  if (r.active_days >= 5) {
    return `${r.active_days} active days this week. Your consistency is quietly turning into a habit.`;
  }
  if (r.badges_earned.length) {
    const name = getBadge(r.badges_earned[0])?.name ?? 'a new badge';
    return `You earned ${name} this week — a milestone worth celebrating.`;
  }
  if (r.avg_mood != null && r.avg_mood >= 4) {
    return 'You felt good this week. Notice what helped — and keep it close.';
  }
  if (r.top_path) {
    return `Most of your growth went into ${pathLabel(r.top_path)} this week. Small steps add up.`;
  }
  return `${plural(r.active_days, 'day', 'days')} of growth this week. Every step counts.`;
}

type EventRow = { kind: string; ts: string; a: string | null; b: string | null };

function isReel(metadata: string | null): boolean {
  try {
    const m = JSON.parse(metadata || '{}') as { format?: unknown; media_type?: unknown };
    return m.format === 'reel' || m.media_type === 'video';
  } catch {
    return false;
  }
}

/**
 * Compute a recap for the local week [start, start+6]. Four small queries; UTC
 * timestamps are fetched with a ±1-day margin and bucketed by the user's local day.
 */
export async function computeRecap(
  env: Env,
  userId: string,
  opts: { tz: string; start: string; currentStreak: number; userCreatedAt: string | null }
): Promise<WeeklyRecap> {
  const { tz, start } = opts;
  const end = addDays(start, 6);
  const lo = addDays(start, -1); // string bounds work for both "YYYY-MM-DD HH:MM:SS" and ISO
  const hi = addDays(end, 2);

  // Cloudflare D1 caps compound SELECTs, so each event source is its own
  // query (run in parallel) instead of one 7-way UNION ALL.
  const eventQuery = (sql: string) =>
    env.DB.prepare(sql).bind(userId, lo, hi).all<EventRow>();
  const eventsPromise = Promise.all([
    eventQuery(
      `SELECT 'post' AS kind, created_at AS ts, category AS a, metadata AS b
         FROM posts WHERE user_id = ?1 AND created_at >= ?2 AND created_at < ?3`
    ),
    eventQuery(
      `SELECT 'story' AS kind, created_at AS ts, NULL AS a, NULL AS b
         FROM stories WHERE user_id = ?1 AND created_at >= ?2 AND created_at < ?3`
    ),
    eventQuery(
      `SELECT 'journal' AS kind, created_at AS ts, NULL AS a, NULL AS b
         FROM journal_entries WHERE user_id = ?1 AND created_at >= ?2 AND created_at < ?3`
    ),
    eventQuery(
      `SELECT 'encourage' AS kind, e.created_at AS ts, NULL AS a, NULL AS b
         FROM post_engagement e JOIN posts p ON p.id = e.post_id
         WHERE p.user_id = ?1 AND e.type = 'like' AND e.user_id != ?1
           AND e.created_at >= ?2 AND e.created_at < ?3`
    ),
    eventQuery(
      `SELECT 'encourage' AS kind, r.created_at AS ts, NULL AS a, NULL AS b
         FROM journal_reactions r JOIN journal_entries j ON j.id = r.entry_id
         WHERE j.user_id = ?1 AND r.user_id != ?1 AND r.created_at >= ?2 AND r.created_at < ?3`
    ),
    eventQuery(
      `SELECT 'friend' AS kind, created_at AS ts, NULL AS a, NULL AS b
         FROM user_relationships
         WHERE user_id = ?1 AND type = 'friend' AND source = 'manual'
           AND created_at >= ?2 AND created_at < ?3`
    ),
    eventQuery(
      `SELECT 'badge' AS kind, earned_at AS ts, badge_id AS a, NULL AS b
         FROM user_badges WHERE user_id = ?1 AND earned_at >= ?2 AND earned_at < ?3`
    ),
  ]).then((parts) => ({ results: parts.flatMap((p) => p.results || []) }));

  const [eventsRes, daysRes, checkinsRes, priorRow] = await Promise.all([
    eventsPromise,
    env.DB.prepare(
      `SELECT day, kinds, is_rest FROM user_activity_days WHERE user_id = ? AND day >= ? AND day <= ?`
    )
      .bind(userId, start, end)
      .all<{ day: string; kinds: number; is_rest: number }>(),
    env.DB.prepare(
      `SELECT day, mood, path, rest FROM daily_checkins WHERE user_id = ? AND day >= ? AND day <= ?`
    )
      .bind(userId, start, end)
      .all<{ day: string; mood: number | null; path: string | null; rest: number }>(),
    env.DB.prepare(
      `SELECT EXISTS (SELECT 1 FROM user_activity_days WHERE user_id = ? AND day < ? AND is_rest = 0) AS prior`
    )
      .bind(userId, start)
      .first<{ prior: number }>(),
  ]);

  let posts = 0;
  let reels = 0;
  let stories = 0;
  let journal = 0;
  let encouragement = 0;
  let friends = 0;
  const badges: string[] = [];
  const pathCounts = new Map<string, number>();
  for (const e of eventsRes.results || []) {
    const d = localDayOf(e.ts, tz);
    if (!d || d < start || d > end) continue;
    switch (e.kind) {
      case 'post': {
        if (isReel(e.b)) reels += 1;
        else posts += 1;
        const p = topLevelPath(e.a);
        if (p) pathCounts.set(p, (pathCounts.get(p) || 0) + 1);
        break;
      }
      case 'story':
        stories += 1;
        break;
      case 'journal':
        journal += 1;
        break;
      case 'encourage':
        encouragement += 1;
        break;
      case 'friend':
        friends += 1;
        break;
      case 'badge':
        if (e.a && getBadge(e.a)) badges.push(e.a);
        break;
    }
  }

  let checkins = 0;
  let moodSum = 0;
  let moodN = 0;
  for (const c of checkinsRes.results || []) {
    if (c.mood != null) {
      moodSum += Number(c.mood);
      moodN += 1;
    }
    if (Number(c.rest)) continue;
    checkins += 1;
    const p = topLevelPath(c.path);
    if (p) pathCounts.set(p, (pathCounts.get(p) || 0) + 1);
  }

  const dayMap = new Map((daysRes.results || []).map((r) => [r.day, r]));
  const days = dayRange(start, end).map((day) => {
    const r = dayMap.get(day);
    const active = !!r && !Number(r.is_rest) && Number(r.kinds) > 0;
    return { day, active, rest: !!r && !!Number(r.is_rest) && !active };
  });
  const activeDays = days.filter((d) => d.active).length;

  let topPath: string | null = null;
  let topN = 0;
  for (const [p, n] of [...pathCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (n > topN) {
      topPath = p;
      topN = n;
    }
  }

  const createdDay = localDayOf(opts.userCreatedAt, tz);
  const isFirstWeek = !Number(priorRow?.prior ?? 0) && !!createdDay && createdDay >= addDays(start, -7);

  const base: Omit<WeeklyRecap, 'reflection'> = {
    week: isoWeek(start),
    start,
    end,
    is_first_week: isFirstWeek,
    empty: activeDays === 0,
    active_days: activeDays,
    days,
    current_streak: opts.currentStreak,
    posts,
    reels,
    stories,
    journal_entries: journal,
    checkins,
    encouragement_received: encouragement,
    new_friends: friends,
    top_path: topPath,
    badges_earned: badges,
    avg_mood: moodN ? Math.round((moodSum / moodN) * 10) / 10 : null,
  };
  return { ...base, reflection: recapReflection(base) };
}
