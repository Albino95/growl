import type { Env } from '../types';
import { awardPoints } from './points';
import { createUserNotification } from './notifications';

/** Milestone badges (docs/GROWTH_SYSTEM.md §4 "Badges & level"). */

export type BadgeCategory = 'start' | 'consistency' | 'community' | 'explore';
export type BadgeTier = 'common' | 'rare';

export type BadgeMetrics = {
  posts: number;
  journals: number;
  stories: number;
  checkins: number;
  streak: number;
  encouragements: number;
  friends: number;
  paths: number;
  invites: number;
  challenges: number;
};

export type BadgeDef = {
  id: string;
  name: string;
  description: string;
  category: BadgeCategory;
  tier: BadgeTier;
  points: number;
  emoji: string;
  metric: keyof BadgeMetrics;
  target: number;
};

export type BadgeEarned = { id: string; name: string; description: string; points: number };

export const BADGES: readonly BadgeDef[] = [
  { id: 'first_post', name: 'First Sprout', description: 'Shared your first post.', category: 'start', tier: 'common', points: 10, emoji: '🌱', metric: 'posts', target: 1 },
  { id: 'first_journal', name: 'Dear Diary', description: 'Wrote your first journal entry.', category: 'start', tier: 'common', points: 10, emoji: '📓', metric: 'journals', target: 1 },
  { id: 'first_story', name: 'Moment Shared', description: 'Shared your first story.', category: 'start', tier: 'common', points: 5, emoji: '📸', metric: 'stories', target: 1 },
  { id: 'first_checkin', name: 'Checked In', description: 'Did your first Today check-in.', category: 'start', tier: 'common', points: 10, emoji: '☀️', metric: 'checkins', target: 1 },
  { id: 'checkins_7', name: 'Regular', description: 'Checked in on 7 days.', category: 'consistency', tier: 'common', points: 30, emoji: '📅', metric: 'checkins', target: 7 },
  { id: 'checkins_30', name: 'Showing Up', description: 'Checked in on 30 days.', category: 'consistency', tier: 'common', points: 80, emoji: '🗓️', metric: 'checkins', target: 30 },
  { id: 'streak_3', name: 'Taking Root', description: 'Grew 3 days in a row.', category: 'consistency', tier: 'common', points: 15, emoji: '🌱', metric: 'streak', target: 3 },
  { id: 'streak_7', name: 'Steady Stem', description: 'Grew 7 days in a row.', category: 'consistency', tier: 'common', points: 30, emoji: '🌿', metric: 'streak', target: 7 },
  { id: 'streak_30', name: 'Deep Roots', description: 'Grew 30 days in a row.', category: 'consistency', tier: 'common', points: 100, emoji: '🌳', metric: 'streak', target: 30 },
  { id: 'streak_100', name: 'Old Oak', description: 'Grew 100 days in a row.', category: 'consistency', tier: 'rare', points: 300, emoji: '🌳', metric: 'streak', target: 100 },
  { id: 'first_encourage_received', name: 'Seen', description: 'Someone encouraged your growth.', category: 'community', tier: 'common', points: 10, emoji: '💚', metric: 'encouragements', target: 1 },
  { id: 'first_friend', name: 'Grow Together', description: 'Made your first friend.', category: 'community', tier: 'common', points: 15, emoji: '🤝', metric: 'friends', target: 1 },
  { id: 'path_explorer', name: 'Path Explorer', description: 'Posted in 3 different paths.', category: 'explore', tier: 'common', points: 30, emoji: '🧭', metric: 'paths', target: 3 },
  { id: 'first_invite', name: 'Gardener', description: 'A friend joined through your invite.', category: 'community', tier: 'common', points: 50, emoji: '🪴', metric: 'invites', target: 1 },
  { id: 'challenge_complete', name: 'Finisher', description: 'Completed a path challenge.', category: 'explore', tier: 'common', points: 50, emoji: '🏁', metric: 'challenges', target: 1 },
];

const BADGE_BY_ID = new Map(BADGES.map((b) => [b.id, b]));

export function getBadge(id: string): BadgeDef | undefined {
  return BADGE_BY_ID.get(id);
}

function toEarned(b: BadgeDef): BadgeEarned {
  return { id: b.id, name: b.name, description: b.description, points: b.points };
}

/**
 * Idempotent award: INSERT OR IGNORE; points + `badge_earned` notification only when
 * the row was actually inserted. Returns the badge when newly earned, else null.
 */
export async function awardBadge(
  env: Env,
  userId: string,
  badgeId: string,
  opts: { notify?: boolean } = {}
): Promise<BadgeEarned | null> {
  const def = BADGE_BY_ID.get(badgeId);
  if (!def || !userId) return null;
  const res = await env.DB.prepare(
    `INSERT OR IGNORE INTO user_badges (user_id, badge_id, earned_at) VALUES (?, ?, datetime('now'))`
  )
    .bind(userId, badgeId)
    .run();
  const changes = Number((res as { meta?: { changes?: number } } | null)?.meta?.changes ?? 0);
  if (changes !== 1) return null;
  if (def.points) await awardPoints(env, userId, def.points);
  if (opts.notify !== false) {
    await createUserNotification(env, {
      userId,
      type: 'badge_earned',
      title: `You earned ${def.name} ${def.emoji}`,
      body: def.description,
      refType: 'badge',
      refId: def.id,
    });
  }
  return toEarned(def);
}

/** Same as awardBadge but never throws (for hooks inside other features). */
export async function awardBadgeSafe(env: Env, userId: string, badgeId: string): Promise<BadgeEarned | null> {
  try {
    return await awardBadge(env, userId, badgeId);
  } catch (err) {
    console.error('[awardBadge]', badgeId, err);
    return null;
  }
}

/** All badge metrics in one round trip (1 bound param). */
export async function loadBadgeMetrics(env: Env, userId: string): Promise<BadgeMetrics> {
  const row = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM posts WHERE user_id = ?1) AS posts,
       (SELECT COUNT(*) FROM journal_entries WHERE user_id = ?1) AS journals,
       (SELECT COUNT(*) FROM user_activity_days WHERE user_id = ?1 AND (kinds & 2) != 0) AS stories,
       (SELECT COUNT(*) FROM daily_checkins WHERE user_id = ?1 AND rest = 0) AS checkins,
       (SELECT MAX(current, longest) FROM user_streaks WHERE user_id = ?1) AS streak,
       (EXISTS (SELECT 1 FROM post_engagement e JOIN posts p ON p.id = e.post_id
                WHERE p.user_id = ?1 AND e.type = 'like' AND e.user_id != ?1)
        OR EXISTS (SELECT 1 FROM journal_reactions r JOIN journal_entries j ON j.id = r.entry_id
                WHERE j.user_id = ?1 AND r.user_id != ?1)) AS encouragements,
       (SELECT COUNT(*) FROM user_relationships
          WHERE user_id = ?1 AND type = 'friend' AND source = 'manual') AS friends,
       (SELECT COUNT(DISTINCT lower(CASE WHEN instr(category, ':') > 0
                 THEN substr(category, 1, instr(category, ':') - 1) ELSE category END))
          FROM posts WHERE user_id = ?1) AS paths,
       (SELECT COUNT(*) FROM invite_redemptions WHERE inviter_id = ?1 AND status = 'rewarded') AS invites,
       (SELECT COUNT(*) FROM challenge_participants WHERE user_id = ?1 AND completed_at IS NOT NULL) AS challenges`
  )
    .bind(userId)
    .first<Record<keyof BadgeMetrics, number | null>>();
  const n = (k: keyof BadgeMetrics) => Math.max(0, Number(row?.[k] ?? 0) || 0);
  return {
    posts: n('posts'),
    journals: n('journals'),
    stories: n('stories'),
    checkins: n('checkins'),
    streak: n('streak'),
    encouragements: n('encouragements'),
    friends: n('friends'),
    paths: n('paths'),
    invites: n('invites'),
    challenges: n('challenges'),
  };
}

export type EarnedBadgeRow = { badge_id: string; earned_at: string; seen_at: string | null };

export async function loadEarnedBadges(env: Env, userId: string): Promise<EarnedBadgeRow[]> {
  const rows = await env.DB.prepare(
    `SELECT badge_id, earned_at, seen_at FROM user_badges WHERE user_id = ? ORDER BY earned_at ASC, badge_id ASC`
  )
    .bind(userId)
    .all<EarnedBadgeRow>();
  return (rows.results || []).filter((r) => BADGE_BY_ID.has(r.badge_id));
}

/**
 * Award every badge whose threshold is met and not yet earned. `silent` skips the
 * notification (lazy back-fill on first GET /me/badges). Returns newly earned badges.
 */
export async function checkBadges(
  env: Env,
  userId: string,
  opts: { metrics?: BadgeMetrics; earned?: Set<string>; silent?: boolean } = {}
): Promise<{ newBadges: BadgeEarned[]; metrics: BadgeMetrics; earned: Set<string> }> {
  const [metrics, earned] = await Promise.all([
    opts.metrics ? Promise.resolve(opts.metrics) : loadBadgeMetrics(env, userId),
    opts.earned
      ? Promise.resolve(opts.earned)
      : loadEarnedBadges(env, userId).then((rows) => new Set(rows.map((r) => r.badge_id))),
  ]);
  const newBadges: BadgeEarned[] = [];
  for (const def of BADGES) {
    if (earned.has(def.id)) continue;
    if (metrics[def.metric] < def.target) continue;
    const got = await awardBadge(env, userId, def.id, { notify: !opts.silent });
    earned.add(def.id);
    if (got) newBadges.push(got);
  }
  return { newBadges, metrics, earned };
}

/** Never throws; returns [] on failure. */
export async function checkBadgesSafe(env: Env, userId: string): Promise<BadgeEarned[]> {
  try {
    return (await checkBadges(env, userId)).newBadges;
  } catch (err) {
    console.error('[checkBadges]', err);
    return [];
  }
}

export function badgeProgress(def: BadgeDef, metrics: BadgeMetrics, earned: boolean) {
  const current = earned ? def.target : Math.min(def.target, metrics[def.metric]);
  return { current, target: def.target };
}

/** Closest unearned badge by progress ratio (ties → smaller target). */
export function nextBadge(metrics: BadgeMetrics, earned: Set<string>) {
  let best: { def: BadgeDef; ratio: number } | null = null;
  for (const def of BADGES) {
    if (earned.has(def.id)) continue;
    const ratio = Math.min(1, metrics[def.metric] / def.target);
    if (!best || ratio > best.ratio || (ratio === best.ratio && def.target < best.def.target)) {
      best = { def, ratio };
    }
  }
  if (!best) return null;
  return {
    id: best.def.id,
    name: best.def.name,
    progress: badgeProgress(best.def, metrics, false),
  };
}
