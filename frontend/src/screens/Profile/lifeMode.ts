/** Pure helpers for life modes (labels, "until" dates). No React / network here. */
import type { LifeMode, LifeModeKind } from '../../services/api/privacy';

export const LIFE_MODE_MAX_DAYS = 30;

export const LIFE_MODE_LABEL: Record<LifeModeKind, string> = {
  none: 'Off',
  sick: 'Sick',
  travel: 'Travelling',
  break: 'Taking a break',
};

export type UntilOption = { key: string; label: string; days: number | null };

/** `days` = how many days from today the mode stays on (inclusive end date). */
export const UNTIL_OPTIONS: UntilOption[] = [
  { key: 'open', label: 'Until I’m back', days: null },
  { key: '1d', label: 'Tomorrow', days: 1 },
  { key: '3d', label: '3 days', days: 3 },
  { key: '1w', label: '1 week', days: 7 },
  { key: '2w', label: '2 weeks', days: 14 },
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local calendar day `days` from `from`, as YYYY-MM-DD (clamped to 0…30). */
export function untilDateKey(days: number, from: Date = new Date()): string {
  const d = Math.max(0, Math.min(LIFE_MODE_MAX_DAYS, Math.round(days)));
  const t = new Date(from.getFullYear(), from.getMonth(), from.getDate() + d);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

function parseDayKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Active when a mode is set and today ≤ until (or there's no end date). */
export function isLifeModeActive(lm: LifeMode | null | undefined, now: Date = new Date()): boolean {
  if (!lm || lm.mode === 'none') return false;
  if (!lm.until) return true;
  const end = parseDayKey(lm.until);
  if (!end) return true;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return today.getTime() <= end.getTime();
}

/** "Fri 21 Nov" — short, locale-neutral enough for a subtitle. */
export function formatUntil(key: string): string {
  const d = parseDayKey(key);
  if (!d) return key;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

/** Settings row subtitle. */
export function lifeModeSubtitle(lm: LifeMode | null | undefined, now: Date = new Date()): string {
  if (!lm || !isLifeModeActive(lm, now)) return 'Pause your streak when life happens';
  const label = LIFE_MODE_LABEL[lm.mode];
  return lm.until ? `${label} · until ${formatUntil(lm.until)}` : `${label} · until you’re back`;
}

/** Which "until" chip matches a saved date; 'saved' = an off-chip date to keep as is. */
export function untilOptionFor(lm: LifeMode, now: Date = new Date()): string {
  if (!lm.until) return 'open';
  const hit = UNTIL_OPTIONS.find((o) => o.days != null && untilDateKey(o.days, now) === lm.until);
  return hit?.key ?? 'saved';
}
