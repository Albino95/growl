import { parseApiDate } from './homeworkDates';

/** Where an active plan is: "Week 2 of 4", days left. Clamped to [1, weeks]. */
export function planProgress(
  startedAt: string | null | undefined,
  endsAt: string | null | undefined,
  weeks: number,
  now: Date = new Date()
): { week: number; total: number; daysLeft: number | null } {
  const total = Math.max(1, Math.floor(weeks || 1));
  const start = parseApiDate(startedAt);
  const end = parseApiDate(endsAt);
  const dayMs = 86_400_000;
  const week = start
    ? Math.min(total, Math.max(1, Math.floor((now.getTime() - start.getTime()) / (7 * dayMs)) + 1))
    : 1;
  const daysLeft = end ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / dayMs)) : null;
  return { week, total, daysLeft };
}

/** Human status for a plan row (never shows raw enum values). */
export function planStatusLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'completed':
      return 'Plan complete';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status ? status.charAt(0).toUpperCase() + status.slice(1) : '';
  }
}

export type DueOption = { key: string; label: string; days: number | null };

export const DUE_OPTIONS: DueOption[] = [
  { key: 'none', label: 'No due date', days: null },
  { key: 'tomorrow', label: 'Tomorrow', days: 1 },
  { key: '3d', label: 'In 3 days', days: 3 },
  { key: 'week', label: 'In a week', days: 7 },
];

/** ISO due date at local end-of-day N days from now, or undefined for "no due date". */
export function dueDateFor(days: number | null, now: Date = new Date()): string | undefined {
  if (days == null) return undefined;
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 0, 0);
  return d.toISOString();
}

/** Short mood label for the check-in summary (1–5 scale). */
export function moodLabel(avg: number | null | undefined): string {
  if (avg == null) return 'No mood logged';
  if (avg >= 4.5) return 'Great';
  if (avg >= 3.5) return 'Good';
  if (avg >= 2.5) return 'Okay';
  if (avg >= 1.5) return 'Low';
  return 'Rough';
}
