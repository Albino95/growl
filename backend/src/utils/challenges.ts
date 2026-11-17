import type { Env } from '../types';
import { addDays, dayRange } from './days';
import { awardBadge, type BadgeEarned } from './badges';
import { awardPoints, POINTS } from './points';
import { createUserNotification } from './notifications';

/**
 * Path challenges (docs/GROWTH_SYSTEM.md §4 "Challenges"). Progress = distinct local
 * days in [joined_at, ends_at] whose user_activity_days.paths contains the path.
 */
export type Challenge = {
  id: string;
  path: string;
  title: string;
  description: string;
  target_days: number;
  duration_days: number;
  emoji: string;
};

export const CHALLENGES: readonly Challenge[] = [
  { id: 'fitness-move-7', path: 'fitness', title: '7-Day Move', description: 'Move your body on 7 days — any workout counts.', target_days: 7, duration_days: 10, emoji: '🏃' },
  { id: 'fitness-strong-month', path: 'fitness', title: 'Strong Month', description: 'Train on 12 days within a month.', target_days: 12, duration_days: 30, emoji: '💪' },
  { id: 'art-sketch-week', path: 'art', title: 'Create Daily', description: 'Make something — a sketch, a song, a scale — on 5 days.', target_days: 5, duration_days: 7, emoji: '🎨' },
  { id: 'art-practice-14', path: 'art', title: 'Practice Run', description: 'Practice your craft on 10 of the next 14 days.', target_days: 10, duration_days: 14, emoji: '🎼' },
  { id: 'nutrition-cook-5', path: 'nutrition', title: 'Home Cooked', description: 'Cook or plan a nourishing meal on 5 days.', target_days: 5, duration_days: 7, emoji: '🥗' },
  { id: 'nutrition-mindful-14', path: 'nutrition', title: 'Mindful Plate', description: 'Share a mindful food choice on 10 days.', target_days: 10, duration_days: 14, emoji: '🍎' },
  { id: 'mindset-pause-7', path: 'mindset', title: 'Daily Pause', description: 'Take a mindful moment on 7 days.', target_days: 7, duration_days: 10, emoji: '🧘' },
  { id: 'mindset-gratitude-14', path: 'mindset', title: 'Gratitude Trail', description: 'Reflect on something good on 10 days.', target_days: 10, duration_days: 14, emoji: '🙏' },
  { id: 'discipline-routine-7', path: 'discipline', title: 'Keep the Routine', description: 'Show up for your routine on 7 days.', target_days: 7, duration_days: 10, emoji: '⏰' },
  { id: 'discipline-focus-21', path: 'discipline', title: 'Focus 21', description: 'Protect focused time on 15 of 21 days.', target_days: 15, duration_days: 21, emoji: '🎯' },
  { id: 'martial-arts-drill-5', path: 'martial-arts', title: 'Drill Week', description: 'Drill your technique on 5 days.', target_days: 5, duration_days: 7, emoji: '🥋' },
  { id: 'martial-arts-dojo-14', path: 'martial-arts', title: 'Mat Time', description: 'Train on 8 of the next 14 days.', target_days: 8, duration_days: 14, emoji: '🥊' },
  { id: 'language-words-7', path: 'language', title: 'Word a Day', description: 'Learn or practice on 7 days.', target_days: 7, duration_days: 10, emoji: '🗣️' },
  { id: 'language-fluent-30', path: 'language', title: 'Fluency Month', description: 'Practice your language on 20 days this month.', target_days: 20, duration_days: 30, emoji: '📚' },
  { id: 'coding-ship-7', path: 'coding', title: 'Code Daily', description: 'Write some code on 5 days.', target_days: 5, duration_days: 7, emoji: '💻' },
  { id: 'coding-build-14', path: 'coding', title: 'Build Sprint', description: 'Work on a project on 10 of 14 days.', target_days: 10, duration_days: 14, emoji: '🛠️' },
  { id: 'sustainability-green-7', path: 'sustainability', title: 'Green Week', description: 'Take a small green action on 5 days.', target_days: 5, duration_days: 7, emoji: '♻️' },
  { id: 'sustainability-habit-21', path: 'sustainability', title: 'Planet Habit', description: 'Keep a sustainable habit on 14 of 21 days.', target_days: 14, duration_days: 21, emoji: '🌍' },
  { id: 'wellness-rest-7', path: 'wellness', title: 'Wellness Week', description: 'Care for yourself on 7 days.', target_days: 7, duration_days: 10, emoji: '🛁' },
  { id: 'wellness-sleep-14', path: 'wellness', title: 'Better Rest', description: 'Look after your sleep on 10 of 14 days.', target_days: 10, duration_days: 14, emoji: '😴' },
  { id: 'finance-track-7', path: 'finance', title: 'Money Check', description: 'Track or review your money on 5 days.', target_days: 5, duration_days: 7, emoji: '💶' },
  { id: 'finance-save-30', path: 'finance', title: 'Saving Month', description: 'Take a saving step on 12 days this month.', target_days: 12, duration_days: 30, emoji: '🐷' },
];

const CHALLENGE_BY_ID = new Map(CHALLENGES.map((c) => [c.id, c]));

export function getChallenge(id: string): Challenge | undefined {
  return CHALLENGE_BY_ID.get(id);
}

export function challengeEndsAt(c: Challenge, joinedAt: string): string {
  return addDays(joinedAt, c.duration_days - 1);
}

export function dayHasPath(paths: string | null | undefined, path: string): boolean {
  if (!paths) return false;
  return paths.split(',').some((p) => p.trim() === path);
}

/** SQL LIKE pattern matching `path` inside a comma list stored as ','||paths||','. */
export function pathLikePattern(path: string): string {
  return `%,${path.replace(/[%_\\]/g, '')},%`;
}

/** Days in [joinedAt, endsAt] with activity on the path, from activity rows. */
export function progressFromRows(
  rows: { day: string; paths: string }[],
  path: string,
  joinedAt: string,
  endsAt: string
): { progress: number; doneDays: Set<string> } {
  const doneDays = new Set<string>();
  for (const r of rows) {
    if (r.day >= joinedAt && r.day <= endsAt && dayHasPath(r.paths, path)) doneDays.add(r.day);
  }
  return { progress: doneDays.size, doneDays };
}

export function challengeDays(joinedAt: string, endsAt: string, doneDays: Set<string>) {
  return dayRange(joinedAt, endsAt).map((day) => ({ day, done: doneDays.has(day) }));
}

/**
 * Mark a participation complete (once, guarded by completed_at IS NULL), then
 * +100 points, the Finisher badge and a `challenge_completed` notification.
 */
export async function completeChallenge(
  env: Env,
  userId: string,
  c: Challenge
): Promise<{ completed: boolean; newBadges: BadgeEarned[] }> {
  const res = await env.DB.prepare(
    `UPDATE challenge_participants SET completed_at = datetime('now')
     WHERE user_id = ? AND challenge_id = ? AND completed_at IS NULL`
  )
    .bind(userId, c.id)
    .run();
  const changes = Number((res as { meta?: { changes?: number } } | null)?.meta?.changes ?? 0);
  if (changes !== 1) return { completed: false, newBadges: [] };
  await awardPoints(env, userId, POINTS.CHALLENGE_COMPLETE);
  await createUserNotification(env, {
    userId,
    type: 'challenge_completed',
    title: `You finished ${c.title} ${c.emoji}`,
    body: `${c.target_days} days on your ${c.path} path. +${POINTS.CHALLENGE_COMPLETE} points.`,
    refType: 'challenge',
    refId: c.id,
  });
  const badge = await awardBadge(env, userId, 'challenge_complete');
  return { completed: true, newBadges: badge ? [badge] : [] };
}

/**
 * After activity on `paths` (top-level) on `day`: complete any running challenge on
 * those paths that has reached its target. Two queries when the user has open ones.
 */
export async function checkChallengeCompletion(
  env: Env,
  userId: string,
  paths: string[],
  day: string
): Promise<BadgeEarned[]> {
  if (!paths.length) return [];
  const open = await env.DB.prepare(
    `SELECT challenge_id, joined_at, ends_at FROM challenge_participants
     WHERE user_id = ? AND completed_at IS NULL AND joined_at <= ? AND ends_at >= ?`
  )
    .bind(userId, day, day)
    .all<{ challenge_id: string; joined_at: string; ends_at: string }>();
  const relevant = (open.results || [])
    .map((r) => ({ ...r, c: getChallenge(r.challenge_id) }))
    .filter((r): r is typeof r & { c: Challenge } => !!r.c && paths.includes(r.c.path));
  if (!relevant.length) return [];

  const from = relevant.reduce((m, r) => (r.joined_at < m ? r.joined_at : m), relevant[0].joined_at);
  const rows = await env.DB.prepare(
    `SELECT day, paths FROM user_activity_days WHERE user_id = ? AND day >= ? AND day <= ? AND is_rest = 0`
  )
    .bind(userId, from, day)
    .all<{ day: string; paths: string }>();
  const out: BadgeEarned[] = [];
  for (const r of relevant) {
    const { progress } = progressFromRows(rows.results || [], r.c.path, r.joined_at, r.ends_at);
    if (progress >= r.c.target_days) {
      const res = await completeChallenge(env, userId, r.c);
      out.push(...res.newBadges);
    }
  }
  return out;
}
