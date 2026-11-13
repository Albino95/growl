/**
 * Pure helpers for the Today check-in + weekly recap (no React Native imports,
 * so vitest can cover them). Contract: docs/GROWTH_SYSTEM.md.
 */
import type { Mood, StreakDayStatus, WeeklyRecap } from '../../services/api/growth';

export type CheckinMoodMeta = { mood: Mood; glyph: string; label: string };

/** Today card mood scale, 1 (heavy) … 5 (bright). */
export const CHECKIN_MOODS: CheckinMoodMeta[] = [
  { mood: 1, glyph: '🌧', label: 'Heavy' },
  { mood: 2, glyph: '🌙', label: 'Tired' },
  { mood: 3, glyph: '◇', label: 'Okay' },
  { mood: 4, glyph: '😊', label: 'Good' },
  { mood: 5, glyph: '⚡', label: 'Bright' },
];

export function checkinMoodMeta(mood: number | null | undefined): CheckinMoodMeta | null {
  return CHECKIN_MOODS.find((m) => m.mood === mood) ?? null;
}

/** Warm reply after a check-in, by mood. */
export function moodReply(mood: number | null | undefined): string {
  if (mood === 1 || mood === 2) return 'Thanks for being honest. Small is enough today.';
  if (mood === 3) return 'Steady counts. One step at a time.';
  if (mood === 4 || mood === 5) return 'Love that energy. Go grow.';
  return 'Thanks for checking in.';
}

export type Followup = 'yes' | 'partly' | 'no';

export const FOLLOWUP_OPTIONS: { value: Followup; label: string; reply: string }[] = [
  { value: 'yes', label: 'Yes', reply: 'That’s growth. Proud of you.' },
  { value: 'partly', label: 'Partly', reply: 'Partly is still forward.' },
  { value: 'no', label: 'Not today', reply: 'Tomorrow’s a fresh page.' },
];

export function followupReply(value: Followup | null | undefined): string | null {
  return FOLLOWUP_OPTIONS.find((o) => o.value === value)?.reply ?? null;
}

/** Streak milestones that get the stronger "celebrate" haptic. */
export const STREAK_MILESTONES = [3, 7, 30, 100] as const;
export function isStreakMilestone(n: number): boolean {
  return (STREAK_MILESTONES as readonly number[]).includes(n);
}

/** Evening follow-up ("Did you grow in X today?") from 18:00 local. */
export function isEvening(now: Date = new Date()): boolean {
  return now.getHours() >= 18;
}

export function streakLabel(n: number): string {
  return `${n}-day streak`;
}

/** "Welcome back" copy after a streak ended; null when it doesn't apply. */
export function welcomeBackLine(current: number, longest: number): string | null {
  if (current > 0 || longest <= 0) return null;
  return `Welcome back. Your longest streak, ${longest} ${longest === 1 ? 'day' : 'days'}, is safe. Today's a fresh start.`;
}

/** Monday (1) … Wednesday (3) in local time. */
export function isRecapWindow(now: Date = new Date()): boolean {
  const d = now.getDay();
  return d >= 1 && d <= 3;
}

/** Show the recap card for this week's recap? */
export function shouldShowRecap(
  recap: { week: string; empty: boolean; is_first_week: boolean } | null | undefined,
  dismissedWeek: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!recap || !isRecapWindow(now)) return false;
  if (dismissedWeek && dismissedWeek === recap.week) return false;
  return !recap.empty || recap.is_first_week;
}

/** Top-level path keys from stored categories (`fitness:running` → `fitness`), de-duplicated. */
export function topLevelPaths(categories: unknown): string[] {
  const list = Array.isArray(categories) ? categories : [];
  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const key = raw.trim().split(':')[0]?.trim();
    if (key && !out.includes(key)) out.push(key);
  }
  return out;
}

/** First word of a username/display name, for "Good morning, Albi." */
export function firstNameOf(name: string | null | undefined): string {
  const first = String(name ?? '').trim().split(/[\s._-]+/)[0] ?? '';
  if (!first) return '';
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export type DotStatus = StreakDayStatus;

/** Recap days → dot statuses for the shared WeekDots row. */
export function recapDayStatuses(
  days: { day: string; active: boolean; rest: boolean }[]
): { day: string; status: DotStatus }[] {
  return days.map((d) => ({
    day: d.day,
    status: d.active ? 'active' : d.rest ? 'rest' : 'missed',
  }));
}

/**
 * Up to three friendly stat chips for a recap: active days, the top stat
 * (top path, else the biggest count), then encouragement / new friends.
 */
export function recapStatChips(
  recap: WeeklyRecap,
  labelForPath: (path: string) => string = (p) => p
): string[] {
  const chips: string[] = [`${recap.active_days} active ${recap.active_days === 1 ? 'day' : 'days'}`];
  const counts: [number, string, string][] = [
    [recap.posts, 'post', 'posts'],
    [recap.journal_entries, 'journal line', 'journal lines'],
    [recap.checkins, 'check-in', 'check-ins'],
    [recap.stories, 'story', 'stories'],
    [recap.reels, 'reel', 'reels'],
  ];
  const top = counts.filter(([n]) => n > 0).sort((a, b) => b[0] - a[0])[0];
  const topCount = top ? `${top[0]} ${top[0] === 1 ? top[1] : top[2]}` : null;
  if (recap.top_path) chips.push(`Most in ${labelForPath(recap.top_path)}`);
  else if (topCount) chips.push(topCount);
  if (recap.encouragement_received > 0) {
    chips.push(`${recap.encouragement_received} cheers received`);
  } else if (recap.new_friends > 0) {
    chips.push(`${recap.new_friends} new ${recap.new_friends === 1 ? 'friend' : 'friends'}`);
  } else if (recap.top_path && topCount) {
    chips.push(topCount);
  }
  return chips.slice(0, 3);
}
