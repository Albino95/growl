import { localDayKey } from '../../services/api/http';

function dayToUtcMs(day: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Whole days from `from` to `to` (both local YYYY-MM-DD). */
export function dayDiff(from: string, to: string): number | null {
  const a = dayToUtcMs(from);
  const b = dayToUtcMs(to);
  if (a == null || b == null) return null;
  return Math.round((b - a) / 86_400_000);
}

/** Days left including today; null when unknown. */
export function challengeDaysLeft(endsAt: string | undefined | null, today = localDayKey()): number | null {
  if (!endsAt) return null;
  const diff = dayDiff(today, endsAt);
  if (diff == null) return null;
  return diff + 1;
}

/** "12 days left" · "Last day today" · "Ended". */
export function formatDaysLeft(endsAt: string | undefined | null, today = localDayKey()): string | null {
  const left = challengeDaysLeft(endsAt, today);
  if (left == null) return null;
  if (left <= 0) return 'Ended';
  if (left === 1) return 'Last day today';
  return `${left} days left`;
}

export function progressRatio(progress: number, target: number): number {
  if (!target || target <= 0) return 0;
  return Math.max(0, Math.min(1, progress / target));
}

/**
 * Joining/leaving on the detail screen marks the Explore strip stale so it
 * refreshes on the next focus instead of waiting for its throttle window.
 */
let dirty = false;
export function markChallengesDirty(): void {
  dirty = true;
}
export function consumeChallengesDirty(): boolean {
  const was = dirty;
  dirty = false;
  return was;
}
