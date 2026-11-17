/**
 * Parse a server timestamp. D1/SQLite `datetime('now')` gives `YYYY-MM-DD HH:MM:SS`
 * with no zone, which is UTC — but `new Date()` on that string is engine-dependent
 * (local time on JSC/V8, NaN on older Hermes). ISO strings pass through unchanged.
 */
export function parseServerDate(raw: string | number | Date | null | undefined): Date | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === 'number') {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  let s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) s = s.replace(' ', 'T');
  // Date-time with no zone designator → UTC.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s += 'Z';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Epoch ms for a server timestamp, or NaN when missing/unparseable. */
export function serverTime(raw: string | number | Date | null | undefined): number {
  return parseServerDate(raw)?.getTime() ?? NaN;
}

/** `parseServerDate` that never returns null (Invalid Date instead) for drop-in `new Date(x)` use. */
export function serverDate(raw: string | number | Date | null | undefined): Date {
  return parseServerDate(raw) ?? new Date(NaN);
}
