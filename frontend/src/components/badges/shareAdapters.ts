/**
 * Builds ShareCardSheet payloads (kinds `badge` / `progress`) for badges and progress.
 */
import type { BadgeSharePayload, ProgressSharePayload } from '../share/ShareCardSheet';
import { badgeVisual } from './badgeMeta';

export type BadgeShareInput = {
  badgeId: string;
  name: string;
  description: string;
  points?: number;
  earnedAt?: string | null;
  username: string;
  userId?: string;
  avatar?: string | null;
  levelName?: string;
};

export type ProgressShareInput = {
  username: string;
  userId?: string;
  avatar?: string | null;
  totalActiveDays: number;
  longestStreak: number;
  currentStreak?: number;
  rangeDays: number;
  topPathLabel?: string | null;
  /** Last N days, oldest → newest (for a mini heatmap on the card). */
  days?: { day: string; active: boolean; rest: boolean; kinds: number }[];
};

export function badgeSharePayload(input: BadgeShareInput): BadgeSharePayload {
  return {
    kind: 'badge',
    badgeId: input.badgeId,
    name: input.name,
    description: input.description,
    emoji: badgeVisual(input.badgeId).emoji,
    level: input.levelName,
    username: input.username,
    userId: input.userId,
    avatar: input.avatar ?? null,
  };
}

export function progressSharePayload(input: ProgressShareInput): ProgressSharePayload {
  return {
    kind: 'progress',
    activeDays: input.totalActiveDays,
    longest: input.longestStreak,
    heatmapDays: input.days?.map((d) => ({ day: d.day, active: d.active, rest: d.rest })),
    username: input.username,
    userId: input.userId,
    avatar: input.avatar ?? null,
  };
}
