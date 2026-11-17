/**
 * Pure helpers for the paged Home feed (two sections: "following" then "suggested").
 * Kept free of Redux/React so they can be unit tested.
 */

type WithId = { id: string };

export type FeedSections<T extends WithId> = { following: T[]; suggested: T[] };

/** Keep the first occurrence of each id, preserving order. */
export function dedupeById<T extends WithId>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/**
 * Background refresh of page 1: refresh posts already on screen in place, append
 * brand-new ones (so the post the user is reading doesn't jump), and drop posts the
 * server now places in the other section.
 */
export function mergeRefreshedSection<T extends WithId>(
  existing: T[],
  incoming: T[],
  movedToOtherSection: Set<string>
): T[] {
  const incomingById = new Map(incoming.map((p) => [p.id, p]));
  const kept = existing
    .filter((p) => !movedToOtherSection.has(p.id))
    .map((p) => incomingById.get(p.id) ?? p);
  const keptIds = new Set(kept.map((p) => p.id));
  const brandNew = incoming.filter((p) => !keptIds.has(p.id));
  return dedupeById([...kept, ...brandNew]);
}

/** Merge a fresh page 1 into everything already loaded (all pages kept). */
export function mergeRefreshedFirstPage<T extends WithId>(
  current: FeedSections<T>,
  page: FeedSections<T>
): FeedSections<T> {
  const incomingSuggested = new Set(page.suggested.map((p) => p.id));
  const incomingFollowing = new Set(page.following.map((p) => p.id));
  const following = mergeRefreshedSection(current.following, page.following, incomingSuggested);
  const followingIds = new Set(following.map((p) => p.id));
  const suggested = mergeRefreshedSection(current.suggested, page.suggested, incomingFollowing).filter(
    (p) => !followingIds.has(p.id)
  );
  return { following, suggested };
}

/**
 * Append the next page. Posts already on screen (in either section) are skipped so
 * an optimistic like / an optimistic new post isn't overwritten or duplicated when
 * ranking drifts between pages.
 */
export function appendFeedPage<T extends WithId>(
  current: FeedSections<T>,
  page: FeedSections<T>
): FeedSections<T> {
  const seen = new Set<string>([...current.following, ...current.suggested].map((p) => p.id));
  const take = (items: T[]) => {
    const out: T[] = [];
    for (const p of items) {
      if (!p || seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
    return out;
  };
  const following = take(page.following);
  const suggested = take(page.suggested);
  if (following.length === 0 && suggested.length === 0) return current;
  return {
    following: following.length ? [...current.following, ...following] : current.following,
    suggested: suggested.length ? [...current.suggested, ...suggested] : current.suggested,
  };
}

/** Insert (or move) a post to the very top of the following section. */
export function prependToFollowing<T extends WithId>(current: FeedSections<T>, post: T): FeedSections<T> {
  return {
    following: [post, ...current.following.filter((p) => p.id !== post.id)],
    suggested: current.suggested.filter((p) => p.id !== post.id),
  };
}

/** True when cached data is older than `maxAgeMs` (or was never loaded). */
export function isStale(lastFetchedAt: string | number | null | undefined, maxAgeMs: number, now = Date.now()): boolean {
  if (lastFetchedAt === null || lastFetchedAt === undefined) return true;
  const t = typeof lastFetchedAt === 'number' ? lastFetchedAt : new Date(lastFetchedAt).getTime();
  if (!Number.isFinite(t)) return true;
  return now - t >= maxAgeMs;
}
