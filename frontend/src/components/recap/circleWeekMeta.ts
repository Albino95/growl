/**
 * Sunday circle recap copy + gating (pure → vitest). Keep it light: one card on
 * Sunday, counts for everyone, faces and moments once you've shared one moment.
 */
import type { CircleWeek } from '../../services/api/circleWeek';

/** The card lives on Sunday only (local). */
export function isCircleWeekDay(now: Date = new Date()): boolean {
  return now.getDay() === 0;
}

/** Show at all? Needs a circle, and not dismissed for this week. */
export function shouldShowCircleWeek(
  week: CircleWeek | null | undefined,
  dismissedWeekStart: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!week || !isCircleWeekDay(now)) return false;
  if (week.friends_total <= 0) return false;
  return dismissedWeekStart !== week.week_start;
}

/** "3 of 5 friends grew this week" / "Your circle had a quiet week". */
export function circleWeekHeadline(week: Pick<CircleWeek, 'friends_active' | 'friends_total'>): string {
  const { friends_active: a, friends_total: t } = week;
  if (a <= 0) return 'Your circle had a quiet week';
  if (t <= 1) return 'Your friend grew this week';
  if (a >= t) return `All ${t} friends grew this week`;
  return `${a} of ${t} friends grew this week`;
}

/** Secondary line: check-ins, or the give-to-get nudge while locked. */
export function circleWeekSubline(week: Pick<CircleWeek, 'checkins' | 'shared'>): string {
  const ck = week.checkins > 0 ? `${week.checkins} check-in${week.checkins === 1 ? '' : 's'}` : null;
  if (!week.shared) {
    return ck
      ? `${ck} so far. Share one moment to see everyone’s week.`
      : 'Share one moment to see everyone’s week.';
  }
  return ck ? `${ck} together this week.` : 'Here’s what your circle shared.';
}

/** "Mon–Sun · 3 days" style label for a member's days active. */
export function daysLabel(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}
