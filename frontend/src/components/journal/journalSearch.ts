/**
 * Journal search (pure → vitest). Local entries are filtered on-device; when older
 * pages aren't loaded yet, server hits (GET /journal/entries?q=) are merged in so a
 * search covers the whole journal, not just the newest 100.
 */
type Searchable = {
  id: string;
  content: string;
  title?: string | null;
  mood?: string | null;
  tags?: string[];
  created_at: string;
};

/** Minimum query length before asking the server. */
export const SERVER_SEARCH_MIN = 2;

export function matchesJournalQuery(entry: Searchable, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  return (
    entry.content.toLowerCase().includes(q) ||
    (entry.title ?? '').toLowerCase().includes(q) ||
    (entry.tags ?? []).some((t) => t.toLowerCase().includes(q)) ||
    (entry.mood ?? '').toLowerCase().includes(q)
  );
}

/** Union by id (local copy wins — it carries optimistic edits), newest first. */
export function mergeEntriesById<T extends Searchable>(local: T[], extra: T[]): T[] {
  if (extra.length === 0) return local;
  const seen = new Set(local.map((e) => e.id));
  const merged = [...local];
  for (const e of extra) if (!seen.has(e.id)) merged.push(e);
  return merged.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}

/** Ask the server only when the local list may be incomplete and the query is meaningful. */
export function shouldSearchServer(query: string, hasMore: boolean): boolean {
  return hasMore && query.trim().length >= SERVER_SEARCH_MIN;
}
