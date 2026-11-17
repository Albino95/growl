/** Pure copy + date helpers for group plans (unit-tested, no React). */
import type { Cohort, CohortUser } from '../../services/api/cohorts';

export const COHORT_LIMITS = {
  capacity: { min: 2, max: 150 },
  weeks: { min: 1, max: 12 },
  title: { min: 2, max: 80 },
  post: 2000,
  reply: 600,
} as const;

export const CAPACITY_PRESETS = [8, 12, 20, 50, 150] as const;

export function personName(u: Pick<CohortUser, 'display_name' | 'username'> | null | undefined): string {
  return u?.display_name || u?.username || 'Someone';
}

/** ABCD-EFGH for reading aloud / typing. */
export function formatCode(code: string | null | undefined): string {
  if (!code) return '';
  const c = code.replace(/[\s-]/g, '').toUpperCase();
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

/** Normalize typed input like the server does (case, hyphens, O→0, I/L→1). Null if not 8 chars. */
export function normalizeCode(raw: string): string | null {
  const s = raw
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  return /^[0-9A-HJKMNP-TV-Z]{8}$/.test(s) ? s : null;
}

/** Pull a code out of a pasted deep link (growl://cohort/CODE) or plain text. */
export function codeFromText(raw: string): string | null {
  const m = raw.match(/cohort\/([0-9A-Za-z-]{8,9})/);
  return normalizeCode(m ? m[1] : raw);
}

export function shareMessage(c: Pick<Cohort, 'title' | 'invite_code' | 'invite_link'>, coachName: string): string {
  const code = formatCode(c.invite_code);
  return [
    `Join my group “${c.title}” on Grow! — ${coachName}`,
    `Open Grow! → Profile → Your groups → Join with a code: ${code}`,
    c.invite_link ? c.invite_link : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local YYYY-MM-DD. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDaysLocal(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

/** Next Monday strictly after `d` (or `d` itself when it is Monday and `includeToday`). */
export function nextMonday(d: Date, includeToday = false): Date {
  const dow = d.getDay(); // 0 Sun … 6 Sat
  let delta = (8 - dow) % 7;
  if (delta === 0 && !includeToday) delta = 7;
  return addDaysLocal(d, delta);
}

export type DayChoice = { key: string | null; label: string };

export function startChoices(now: Date): DayChoice[] {
  return [
    { key: dayKey(now), label: 'Today' },
    { key: dayKey(nextMonday(now)), label: 'Next Monday' },
    { key: dayKey(addDaysLocal(nextMonday(now), 7)), label: 'In 2 weeks' },
  ];
}

export function dueChoices(now: Date): DayChoice[] {
  return [
    { key: null, label: 'No date' },
    { key: dayKey(now), label: 'Today' },
    { key: dayKey(addDaysLocal(now, 1)), label: 'Tomorrow' },
    { key: dayKey(addDaysLocal(now, 3)), label: 'In 3 days' },
    { key: dayKey(addDaysLocal(now, 7)), label: 'In a week' },
  ];
}

/** "Mon 3 Mar" for a YYYY-MM-DD key (local), or the key itself. */
export function formatDay(key: string | null | undefined): string {
  if (!key) return '';
  const m = key.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return key;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  try {
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return key;
  }
}

export function weekLabel(c: Pick<Cohort, 'current_week' | 'weeks' | 'start_date' | 'status'>): string {
  if (c.status === 'archived') return 'Archived';
  if (c.current_week <= 0) return `Starts ${formatDay(c.start_date)}`;
  if (c.current_week > c.weeks) return 'Finished';
  return `Week ${c.current_week} of ${c.weeks}`;
}

export function membersLabel(c: Pick<Cohort, 'member_count' | 'capacity'>): string {
  return `${c.member_count} / ${c.capacity} ${c.capacity === 1 ? 'member' : 'members'}`;
}

/** Warm, no-guilt status words. */
export function homeworkStatusLabel(status: 'assigned' | 'done' | 'partly'): string {
  if (status === 'done') return 'Done';
  if (status === 'partly') return 'Partly counts';
  return 'Not yet';
}

export function inactiveLabel(days: number): string {
  if (days >= 14) return 'Quiet for 2+ weeks';
  return `Quiet for ${days} days`;
}

/** "2h", "3d", "Mar 4" style short relative time for API timestamps (SQLite UTC). */
export function shortAgo(raw: string | null | undefined, now = new Date()): string {
  if (!raw) return '';
  let s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) s = s.replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(s)) s += 'Z';
  const t = new Date(s).getTime();
  if (Number.isNaN(t)) return '';
  const mins = Math.max(0, Math.round((now.getTime() - t) / 60000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
