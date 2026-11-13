import type { Env } from '../types';

export const POINTS = {
  CREATE_POST: 10,
  RECEIVE_ENDORSEMENT: 25,
  GIVE_ENDORSEMENT: 5,
  CLAIM_INSTRUCTOR: 50,
  /** First Today check-in of a local day (not edits, not rest days). */
  DAILY_CHECKIN: 2,
  /** Completing a path challenge (on top of the one-time Finisher badge). */
  CHALLENGE_COMPLETE: 100,
  /** Inviter reward when an invited friend records their first activity. */
  INVITE_REWARD: 50,
} as const;

/** Growth levels by lifetime points. Points can't be spent and have no money value. */
export const GROWTH_LEVELS = [
  { n: 1, name: 'Seed', at: 0 },
  { n: 2, name: 'Sprout', at: 50 },
  { n: 3, name: 'Sapling', at: 150 },
  { n: 4, name: 'Bloom', at: 400 },
  { n: 5, name: 'Tree', at: 1000 },
  { n: 6, name: 'Grove', at: 2500 },
] as const;

export type GrowthLevel = { n: number; name: string; points: number; next_at: number | null };

export function growthLevel(points: number | null | undefined): GrowthLevel {
  const p = Math.max(0, Math.floor(Number(points) || 0));
  let idx = 0;
  for (let i = 0; i < GROWTH_LEVELS.length; i++) {
    if (p >= GROWTH_LEVELS[i].at) idx = i;
  }
  const lvl = GROWTH_LEVELS[idx];
  const next = GROWTH_LEVELS[idx + 1];
  return { n: lvl.n, name: lvl.name, points: p, next_at: next ? next.at : null };
}

/** Atomically award growth points; returns the new total (or null if user missing). */
export async function awardPoints(
  env: Env,
  userId: string,
  delta: number
): Promise<number | null> {
  if (!delta) {
    const row = await env.DB.prepare('SELECT points FROM users WHERE id = ?')
      .bind(userId)
      .first<{ points: number }>();
    return row ? Number(row.points) : null;
  }

  await env.DB.prepare("UPDATE users SET points = points + ?, updated_at = datetime('now') WHERE id = ?")
    .bind(delta, userId)
    .run();

  const row = await env.DB.prepare('SELECT points FROM users WHERE id = ?')
    .bind(userId)
    .first<{ points: number }>();

  return row ? Number(row.points) : null;
}

/** Count endorsements this user has given to others. */
export async function countEndorsementsGiven(env: Env, userId: string): Promise<number> {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM instructor_votes WHERE user_id = ?'
  )
    .bind(userId)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

/**
 * @deprecated Legacy post-only UTC streak. Profile now reports the unified growth
 * streak (utils/activity.ts getStreakState). Kept for any remaining imports.
 */
export async function computePostStreak(env: Env, userId: string): Promise<number> {
  const rows = await env.DB.prepare(
    `SELECT DISTINCT date(created_at) AS d
     FROM posts
     WHERE user_id = ?
     ORDER BY d DESC
     LIMIT 60`
  )
    .bind(userId)
    .all<{ d: string }>();

  const days = (rows.results || []).map((r) => r.d).filter(Boolean);
  if (days.length === 0) return 0;

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const yday = new Date(today);
  yday.setUTCDate(yday.getUTCDate() - 1);
  const ydayStr = yday.toISOString().slice(0, 10);

  if (days[0] !== todayStr && days[0] !== ydayStr) return 0;

  let streak = 1;
  let cursor = new Date(days[0] + 'T00:00:00.000Z');
  for (let i = 1; i < days.length; i++) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    const expect = cursor.toISOString().slice(0, 10);
    if (days[i] !== expect) break;
    streak += 1;
  }
  return streak;
}
