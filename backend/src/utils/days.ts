/**
 * Local-calendar helpers for the growth system. A "day" is a YYYY-MM-DD string in
 * the user's IANA timezone (users.timezone, default UTC); arithmetic on day keys is
 * done in UTC so DST never shifts a key.
 */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEK_RE = /^(\d{4})-W(\d{2})$/;
const MS_DAY = 86_400_000;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function dayFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** True for a real IANA zone the runtime knows (e.g. Europe/Luxembourg). */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try {
    dayFormatter(tz);
    return true;
  } catch {
    return false;
  }
}

export function safeTimeZone(tz: unknown): string {
  return isValidTimeZone(tz) ? tz : 'UTC';
}

/** Local YYYY-MM-DD for an instant in a timezone (fallback UTC). */
export function localDay(timeZone: string | null | undefined, at: Date = new Date()): string {
  const f = dayFormatter(safeTimeZone(timeZone));
  const parts = f.formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function isDayKey(s: unknown): s is string {
  if (typeof s !== 'string' || !DAY_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  return new Date(d.getTime() + n * MS_DAY).toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / MS_DAY);
}

/** Inclusive list of day keys. */
export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Monday of the ISO week containing `day`. */
export function weekStart(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 Sun .. 6 Sat
  return addDays(day, -((dow + 6) % 7));
}

/** ISO week key, e.g. 2026-W46. */
export function isoWeek(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon 0
  const thursday = new Date(d.getTime() + (3 - dow) * MS_DAY);
  const year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = jan4.getTime() - jan4Dow * MS_DAY;
  const week = Math.floor((thursday.getTime() - week1Monday) / (7 * MS_DAY)) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Monday (YYYY-MM-DD) of an ISO week key, or null if malformed. */
export function isoWeekStart(week: string): string | null {
  const m = WEEK_RE.exec(week);
  if (!m) return null;
  const year = Number(m[1]);
  const w = Number(m[2]);
  if (w < 1 || w > 53) return null;
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = (jan4.getUTCDay() + 6) % 7;
  const monday = new Date(jan4.getTime() - jan4Dow * MS_DAY + (w - 1) * 7 * MS_DAY)
    .toISOString()
    .slice(0, 10);
  return isoWeek(monday) === week ? monday : null;
}

/** Parse a DB timestamp ("YYYY-MM-DD HH:MM:SS" UTC or ISO) to a Date. */
export function parseDbTimestamp(ts: string | null | undefined): Date | null {
  if (!ts) return null;
  let s = String(ts).trim();
  if (/^\d{4}-\d{2}-\d{2} \d/.test(s)) s = s.replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(s)) s += 'Z';
  if (DAY_RE.test(s)) s += 'T00:00:00Z';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Local day of a DB timestamp. */
export function localDayOf(ts: string | null | undefined, timeZone: string): string | null {
  const d = parseDbTimestamp(ts);
  return d ? localDay(timeZone, d) : null;
}

/** "YYYY-MM-DD HH:MM:SS" (SQLite datetime format) for a Date. */
export function sqlDateTime(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/** Top-level path of a category/path key ("fitness:cardio" → "fitness"). */
export function topLevelPath(p: string | null | undefined): string | null {
  const s = String(p ?? '').trim().toLowerCase();
  if (!s) return null;
  const i = s.indexOf(':');
  return i > 0 ? s.slice(0, i) : s;
}
