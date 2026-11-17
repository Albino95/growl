/**
 * Weekly rituals copy + gating (pure → vitest). Warm, no-guilt wording: a missed
 * goal "partly counts", never "failed".
 */
import type {
  WeeklyAnswer,
  WeeklyAnswers,
  WeeklyCommitment,
  WeeklyQuestion,
} from '../../services/api/weekly';

/** Card visibility: hidden only when dismissed for this week (or no data at all). */
export function shouldShowWeeklyCard(
  weekKey: string | null | undefined,
  dismissedWeek: string | null | undefined
): boolean {
  if (!weekKey) return false;
  return dismissedWeek !== weekKey;
}

/** "3 of 5 days" (passes included). */
export function commitmentProgressLabel(c: Pick<WeeklyCommitment, 'covered' | 'target_days'>): string {
  const covered = Math.min(c.covered, c.target_days);
  return `${covered} of ${c.target_days} days`;
}

/** One gentle line under the ring. */
export function commitmentSubline(c: WeeklyCommitment): string {
  if (c.covered >= c.target_days) return 'Goal reached — anything more is a bonus.';
  const left = c.target_days - c.covered;
  const passesLeft = Math.max(0, c.passes_total - c.passes_used);
  const passes = passesLeft === 1 ? '1 rest pass' : `${passesLeft} rest passes`;
  if (!c.reachable) return 'Every day you show up still counts.';
  return `${left} more ${left === 1 ? 'day' : 'days'} to go · ${passes} left`;
}

/** Week-end result: celebration for a kept week, "partly counts" otherwise. */
export function commitmentResultCopy(c: Pick<WeeklyCommitment, 'status' | 'covered' | 'target_days' | 'points_awarded'>): {
  title: string;
  body: string;
} {
  if (c.status === 'kept') {
    return {
      title: 'You kept your week',
      body: `${Math.min(c.covered, c.target_days)} of ${c.target_days} days${c.points_awarded ? ` · +${c.points_awarded} points` : ''}`,
    };
  }
  if (c.covered <= 0) {
    return { title: 'A fresh week', body: 'Last week was quiet. Try a gentle goal this week?' };
  }
  return {
    title: `Partly counts — ${c.covered} of ${c.target_days} days`,
    body: 'Try again this week?',
  };
}

/** "Opens Saturday at noon" / "Open until Monday noon". */
export function windowLabel(open: boolean): string {
  return open ? 'Open until Monday noon' : 'Opens Saturday at noon';
}

/** True when an answer has something in it. */
export function hasAnswer(a: WeeklyAnswer | undefined | null): boolean {
  if (a === undefined || a === null) return false;
  if (typeof a === 'number') return a >= 1 && a <= 5;
  if (typeof a === 'string') return a.trim().length > 0;
  return a.chips.length > 0 || !!a.text?.trim();
}

/** Answers to send: only non-empty ones for the questions shown. */
export function cleanAnswers(questions: WeeklyQuestion[], answers: WeeklyAnswers): WeeklyAnswers {
  const out: WeeklyAnswers = {};
  for (const q of questions) {
    const a = answers[q.id];
    if (!hasAnswer(a)) continue;
    if (typeof a === 'string') out[q.id] = a.trim();
    else if (typeof a === 'object' && a) {
      const text = a.text?.trim();
      out[q.id] = text ? { chips: a.chips, text } : { chips: a.chips };
    } else out[q.id] = a as number;
  }
  return out;
}

/** Positions (x, y offsets from the centre) of `n` dots around a ring, starting at 12 o'clock. */
export function ringPositions(n: number, radius: number): Array<{ x: number; y: number }> {
  return Array.from({ length: n }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return { x: Math.round(Math.cos(angle) * radius * 100) / 100, y: Math.round(Math.sin(angle) * radius * 100) / 100 };
  });
}

/** Short weekday letter for a YYYY-MM-DD key (UTC-safe). */
export function weekdayLetter(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getUTCDay()] ?? '';
}

export function weekdayName(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()] ?? day;
}
