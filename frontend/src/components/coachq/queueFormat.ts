import type { CoachQueue, QueueClient, QueueSegment, QueueWeek } from '../../services/api/coachq';
import type { Proof } from '../../services/api/proofs';
import { KIND_META, formatClock } from '../proof/proofDefaults';

export const SEGMENTS: Array<{ key: QueueSegment; label: string; color: string }> = [
  { key: 'red', label: 'Act today', color: 'rose' },
  { key: 'amber', label: 'This week', color: 'amber' },
  { key: 'green', label: 'On track', color: 'emerald' },
  { key: 'wins', label: 'Wins', color: 'violet' },
];

/** Clients for a segment: wins cut across statuses. */
export function clientsFor(queue: CoachQueue | null, seg: QueueSegment): QueueClient[] {
  if (!queue) return [];
  if (seg === 'wins') return queue.clients.filter((c) => c.wins.length > 0);
  return queue.clients.filter((c) => c.status === seg);
}

/** First segment with someone in it (red → amber → green → wins), else red. */
export function defaultSegment(queue: CoachQueue | null): QueueSegment {
  if (!queue) return 'red';
  for (const s of ['red', 'amber', 'green', 'wins'] as QueueSegment[]) {
    if (clientsFor(queue, s).length) return s;
  }
  return 'red';
}

export const EMPTY_COPY: Record<QueueSegment, { title: string; description: string }> = {
  red: { title: 'Everyone’s on track. Enjoy your day.', description: 'Nobody needs you urgently right now.' },
  amber: { title: 'Nothing to check this week', description: 'Clients who drift a little show up here.' },
  green: { title: 'No one here yet', description: 'Clients who are doing fine land here — one tap to say you saw it.' },
  wins: { title: 'No wins yet this week', description: 'Streaks, first proofs and finished plan weeks appear here.' },
};

/** "~45 min" / "~2 h" / "~1 h 30 min" (rounded to 5 minutes). */
export function formatMinutes(min: number | null | undefined): string {
  const m = Math.max(0, Math.round((Number(min) || 0) / 5) * 5);
  if (m < 60) return `~${Math.max(5, m)} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `~${h} h ${rest} min` : `~${h} h`;
}

/** Compact week stats for a card; only what the client shared. */
export function weekStats(week: QueueWeek): Array<{ key: string; label: string; icon: string }> {
  const out: Array<{ key: string; label: string; icon: string }> = [];
  if (week.days_checked_in != null) out.push({ key: 'days', label: `${week.days_checked_in}/7 days`, icon: 'calendar-outline' });
  if (week.mood_avg != null) {
    const arrow = week.mood_trend === 'up' ? ' ↑' : week.mood_trend === 'down' ? ' ↓' : '';
    out.push({ key: 'mood', label: `Mood ${week.mood_avg.toFixed(1)}${arrow}`, icon: 'happy-outline' });
  }
  if (week.yes_rate != null) out.push({ key: 'yes', label: `${Math.round(week.yes_rate * 100)}% follow-through`, icon: 'checkmark-done-outline' });
  if (week.homework_done) out.push({ key: 'hw', label: `${week.homework_done} homework done`, icon: 'school-outline' });
  if (week.homework_overdue) out.push({ key: 'late', label: `${week.homework_overdue} waiting`, icon: 'time-outline' });
  if (week.proofs) out.push({ key: 'proofs', label: `${week.proofs} proof${week.proofs === 1 ? '' : 's'}`, icon: 'camera-outline' });
  return out;
}

/** "Last contact 3 days ago" / "No contact yet". */
export function contactLabel(ts: string | null, now = new Date()): string {
  if (!ts) return 'No contact yet';
  const d = new Date(ts).getTime();
  if (!Number.isFinite(d)) return 'No contact yet';
  const days = Math.floor((now.getTime() - d) / 86_400_000);
  if (days <= 0) return 'Last contact today';
  if (days === 1) return 'Last contact yesterday';
  return `Last contact ${days} days ago`;
}

export function progressLabel(index: number, total: number): string {
  if (total <= 0) return '';
  return `${Math.min(index + 1, total)} of ${total}`;
}

export function displayName(p: { username: string; display_name?: string | null }): string {
  return (p.display_name && p.display_name.trim()) || p.username;
}

/**
 * Compact chip for a non-photo proof on a queue card: "🔢 25 reps", "⏱ 12 min",
 * "✏️ note", "🎙 0:24". Photos render as thumbnails instead.
 */
export function proofChipLabel(
  p: Pick<Proof, 'kind'> & Partial<Pick<Proof, 'number' | 'unit' | 'minutes' | 'duration_s'>>
): string {
  const emoji = KIND_META[p.kind]?.emoji ?? '✓';
  switch (p.kind) {
    case 'number': {
      if (p.number == null) return `${emoji} number`;
      const n = Number.isInteger(p.number) ? String(p.number) : String(Math.round(p.number * 100) / 100);
      return `${emoji} ${n}${p.unit ? ` ${p.unit}` : ''}`;
    }
    case 'timer':
      return p.minutes ? `${emoji} ${p.minutes} min` : `${emoji} timer`;
    case 'voice':
      return p.duration_s ? `${emoji} ${formatClock(p.duration_s * 1000)}` : `${emoji} voice`;
    case 'photo':
      return `${emoji} photo`;
    default:
      return `${emoji} note`;
  }
}

/** Instructor Hub "Today" entry: subtitle and whether to show a badge. */
export function todayEntrySummary(c: { red: number; amber: number; review: number }): {
  subtitle: string;
  badge: number;
  badgeTone: 'red' | 'review' | null;
} {
  const status = c.red
    ? `${c.red} need${c.red === 1 ? 's' : ''} you today`
    : c.amber
      ? `${c.amber} to check this week`
      : 'everyone’s on track';
  const parts = c.review > 0 ? [`${c.review} to review`, status] : [status];
  const subtitle = parts.join(' · ');
  return {
    subtitle: subtitle.charAt(0).toUpperCase() + subtitle.slice(1),
    badge: c.red > 0 ? c.red : c.review > 0 ? c.review : 0,
    badgeTone: c.red > 0 ? 'red' : c.review > 0 ? 'review' : null,
  };
}
