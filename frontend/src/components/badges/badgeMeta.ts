/**
 * Pure badge / level helpers (no React Native imports so vitest can load them).
 * Badge ids mirror the launch catalog in docs/GROWTH_SYSTEM.md §4.
 */
import type { BadgeCatalogItem, GrowthLevel } from '../../services/api/growth';

export type BadgeCategory = BadgeCatalogItem['category'];

export type BadgeVisual = {
  emoji: string;
  /** Medallion fill. */
  tint: string;
  /** Soft wash behind the medallion / tiles. */
  soft: string;
};

/** Every badge id in the v1 contract catalog. */
export const CONTRACT_BADGE_IDS = [
  'first_post',
  'first_journal',
  'first_story',
  'first_checkin',
  'checkins_7',
  'checkins_30',
  'streak_3',
  'streak_7',
  'streak_30',
  'streak_100',
  'first_encourage_received',
  'first_friend',
  'path_explorer',
  'first_invite',
  'challenge_complete',
] as const;

const EMERALD = { tint: '#059669', soft: '#ECFDF5' };
const CORAL = { tint: '#F97066', soft: '#FFF1F0' };
const GOLD = { tint: '#D97706', soft: '#FEF3C7' };
const SKY = { tint: '#0EA5E9', soft: '#E0F2FE' };
const PLUM = { tint: '#A855F7', soft: '#F3E8FF' };

export const BADGE_VISUALS: Record<string, BadgeVisual> = {
  first_post: { emoji: '🌱', ...EMERALD },
  first_journal: { emoji: '📔', ...SKY },
  first_story: { emoji: '📸', ...CORAL },
  first_checkin: { emoji: '☀️', ...GOLD },
  checkins_7: { emoji: '🗓️', ...EMERALD },
  checkins_30: { emoji: '🌤️', ...GOLD },
  streak_3: { emoji: '🌿', ...EMERALD },
  streak_7: { emoji: '🎋', ...EMERALD },
  streak_30: { emoji: '🌳', ...EMERALD },
  streak_100: { emoji: '🌲', ...GOLD },
  first_encourage_received: { emoji: '💛', ...CORAL },
  first_friend: { emoji: '🤝', ...CORAL },
  path_explorer: { emoji: '🧭', ...SKY },
  first_invite: { emoji: '🪴', ...PLUM },
  challenge_complete: { emoji: '🏁', ...CORAL },
};

/** Names from the contract catalog, for surfaces that only get ids (public profile). */
export const BADGE_NAMES: Record<string, string> = {
  first_post: 'First Sprout',
  first_journal: 'Dear Diary',
  first_story: 'Moment Shared',
  first_checkin: 'Checked In',
  checkins_7: 'Regular',
  checkins_30: 'Showing Up',
  streak_3: 'Taking Root',
  streak_7: 'Steady Stem',
  streak_30: 'Deep Roots',
  streak_100: 'Old Oak',
  first_encourage_received: 'Seen',
  first_friend: 'Grow Together',
  path_explorer: 'Path Explorer',
  first_invite: 'Gardener',
  challenge_complete: 'Finisher',
};

export const RARE_BADGE_IDS: ReadonlySet<string> = new Set(['streak_100']);

export function badgeName(id: string): string {
  return BADGE_NAMES[id] ?? id.replace(/_/g, ' ');
}

const FALLBACK_VISUAL: BadgeVisual = { emoji: '🏅', ...EMERALD };

export function badgeVisual(id: string): BadgeVisual {
  return BADGE_VISUALS[id] ?? FALLBACK_VISUAL;
}

export const BADGE_CATEGORY_ORDER: BadgeCategory[] = ['start', 'consistency', 'community', 'explore'];

export const BADGE_CATEGORY_LABELS: Record<BadgeCategory, string> = {
  start: 'First steps',
  consistency: 'Showing up',
  community: 'Growing together',
  explore: 'Exploring',
};

/** Mirrors GROWTH_LEVELS in services/api/growth.ts (kept here so tests don't load the http client). */
export const LEVEL_FLOORS = [0, 50, 150, 400, 1000, 2500] as const;

/** Points floor of the level the user is currently in. */
export function levelFloor(level: Pick<GrowthLevel, 'n' | 'points'>): number {
  const byN = LEVEL_FLOORS[level.n - 1];
  if (typeof byN === 'number' && byN <= level.points) return byN;
  let floor = 0;
  for (const f of LEVEL_FLOORS) if (level.points >= f) floor = f;
  return floor;
}

/**
 * Progress through the current level, 0..1. Top level (next_at null) = 1.
 */
export function levelProgress(level: Pick<GrowthLevel, 'n' | 'points' | 'next_at'>): number {
  if (level.next_at == null) return 1;
  const floor = levelFloor(level);
  const span = level.next_at - floor;
  if (span <= 0) return 1;
  return Math.max(0, Math.min(1, (level.points - floor) / span));
}

export function pointsToNext(level: Pick<GrowthLevel, 'points' | 'next_at'>): number | null {
  if (level.next_at == null) return null;
  return Math.max(0, level.next_at - level.points);
}

/** Fraction 0..1 for a `{ current, target }` badge progress. */
export function progressFraction(p: { current: number; target: number } | null | undefined): number {
  if (!p || !(p.target > 0)) return 0;
  return Math.max(0, Math.min(1, p.current / p.target));
}

/** "Nov 12, 2026" from an ISO / SQLite datetime. Returns '' when unparsable. */
export function formatEarnedDate(raw: string | null | undefined): string {
  if (!raw) return '';
  const iso = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * Locked badges to tease next: the server's `next` first, then the closest to done.
 */
export function pickLockedPreview<T extends { id: string; progress: { current: number; target: number } }>(
  catalog: T[],
  earnedIds: ReadonlySet<string>,
  nextId: string | null | undefined,
  max = 3
): T[] {
  const locked = catalog.filter((c) => !earnedIds.has(c.id));
  locked.sort((a, b) => {
    if (a.id === nextId) return -1;
    if (b.id === nextId) return 1;
    return progressFraction(b.progress) - progressFraction(a.progress);
  });
  return locked.slice(0, max);
}

/** Earned list sorted newest first. */
export function sortEarnedNewestFirst<T extends { earned_at: string }>(earned: T[]): T[] {
  return [...earned].sort((a, b) => (a.earned_at < b.earned_at ? 1 : a.earned_at > b.earned_at ? -1 : 0));
}
