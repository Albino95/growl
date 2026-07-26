import type { Env } from '../types';

export const POINTS = {
  CREATE_POST: 10,
  RECEIVE_ENDORSEMENT: 25,
  GIVE_ENDORSEMENT: 5,
  CLAIM_INSTRUCTOR: 50,
} as const;

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

  await env.DB.prepare('UPDATE users SET points = points + ?, updated_at = datetime("now") WHERE id = ?')
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
 * Consecutive calendar-day posting streak ending today or yesterday (UTC date strings).
 * Returns 0 if no post in the last 2 days.
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
