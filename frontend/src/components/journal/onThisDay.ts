import { dateKeyFromIso, localDateKey } from './journalMeta';

export type OnThisDayKind = 'year' | 'month' | 'week';

export type OnThisDayPick<E> = {
  entry: E;
  kind: OnThisDayKind;
  /** Local date key (YYYY-MM-DD) of the remembered day. */
  dateKey: string;
  /** "A year ago you wrote…" */
  heading: string;
  /** First ~120 chars, trimmed on a word boundary. */
  excerpt: string;
};

const HEADINGS: Record<OnThisDayKind, string> = {
  year: 'A year ago you wrote…',
  month: 'A month ago you wrote…',
  week: 'A week ago you wrote…',
};

/** Same local calendar day N months back; null when that day doesn't exist (e.g. 31 Feb). */
function sameDayMonthsAgo(now: Date, months: number): string | null {
  const target = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  if (target.getDate() !== now.getDate()) return null; // rolled over → day missing
  return localDateKey(target);
}

/** Candidate days in preference order: 1 year > 1 month > 1 week. */
export function onThisDayTargets(now: Date): { kind: OnThisDayKind; dateKey: string }[] {
  const out: { kind: OnThisDayKind; dateKey: string }[] = [];
  const year = sameDayMonthsAgo(now, 12);
  if (year) out.push({ kind: 'year', dateKey: year });
  const month = sameDayMonthsAgo(now, 1);
  if (month) out.push({ kind: 'month', dateKey: month });
  const week = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
  out.push({ kind: 'week', dateKey: localDateKey(week) });
  return out;
}

export function excerptOf(text: string, max = 120): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?-]+$/, '')}…`;
}

/**
 * At most one "On this day" memory from the loaded entries. Within a day the
 * first entry written is picked. Returns null when nothing matches.
 */
export function pickOnThisDay<E extends { id: string; created_at: string; content: string }>(
  entries: readonly E[],
  now: Date = new Date()
): OnThisDayPick<E> | null {
  if (!entries.length) return null;
  const byDay = new Map<string, E[]>();
  for (const e of entries) {
    if (!e.content?.trim()) continue;
    const key = dateKeyFromIso(e.created_at);
    if (!key) continue;
    const list = byDay.get(key);
    if (list) list.push(e);
    else byDay.set(key, [e]);
  }
  for (const target of onThisDayTargets(now)) {
    const list = byDay.get(target.dateKey);
    if (!list?.length) continue;
    const entry = [...list].sort((a, b) => (a.created_at < b.created_at ? -1 : 1))[0];
    return {
      entry,
      kind: target.kind,
      dateKey: target.dateKey,
      heading: HEADINGS[target.kind],
      excerpt: excerptOf(entry.content),
    };
  }
  return null;
}
