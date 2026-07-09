/** Limit how many items from the same author appear in a ranked list. */

export function applyPerAuthorCap<T>(
  items: T[],
  getAuthorId: (item: T) => string | undefined,
  maxPerAuthor = 2,
  limit = 20
): T[] {
  const counts = new Map<string, number>();
  const out: T[] = [];
  for (const item of items) {
    const authorId = getAuthorId(item);
    if (!authorId) {
      out.push(item);
    } else {
      const n = counts.get(authorId) ?? 0;
      if (n >= maxPerAuthor) continue;
      counts.set(authorId, n + 1);
      out.push(item);
    }
    if (out.length >= limit) break;
  }
  return out;
}
