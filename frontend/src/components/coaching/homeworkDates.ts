/** Parse API timestamps (ISO or SQLite `YYYY-MM-DD HH:MM:SS`, which is UTC). */
export function parseApiDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  let s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) s = s.replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(s)) s += 'Z';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Mon 3 Mar" style short date, or null when unparseable. */
export function formatHomeworkDate(raw: string | null | undefined): string | null {
  const d = parseApiDate(raw);
  if (!d) return null;
  try {
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return d.toDateString();
  }
}

/** True when the due date has passed (end of that day). */
export function isOverdue(raw: string | null | undefined, now = new Date()): boolean {
  const d = parseApiDate(raw);
  if (!d) return false;
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return end.getTime() < now.getTime();
}
