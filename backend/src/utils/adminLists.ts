/** Offset paging + LIKE search helpers shared by the admin list endpoints. */

export function parsePaging(url: URL, defaultLimit = 50, maxLimit = 200): { limit: number; offset: number } {
  const rawLimit = parseInt(url.searchParams.get('limit') || String(defaultLimit), 10);
  const rawOffset = parseInt(url.searchParams.get('offset') || '0', 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), maxLimit) : defaultLimit;
  const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;
  return { limit, offset };
}

/** Escape LIKE wildcards in admin search input (used with ESCAPE '\\'). */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function searchQuery(url: URL): string {
  return (url.searchParams.get('q') || '').trim().slice(0, 200);
}

export function paged<T>(items: T[], total: number, limit: number, offset: number) {
  return { total, limit, offset, has_more: offset + items.length < total };
}
