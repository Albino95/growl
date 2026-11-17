import { create } from 'zustand';
import { deleteSecureItem, getSecureItem, setSecureItem } from '../services/storage/secureStore';

/** Recent Explore searches: local only, per signed-in user, newest first, last 10. */
export const MAX_RECENT_SEARCHES = 10;
const MAX_QUERY_LENGTH = 80;
const KEY_PREFIX = 'grow.recentSearches.v1.';

/** SecureStore keys may only contain [A-Za-z0-9._-]. */
export function recentSearchKey(userId: string): string {
  return `${KEY_PREFIX}${userId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80)}`;
}

/** Trim, collapse spaces, cap length. Empty → null. */
export function normalizeRecentQuery(raw: string): string | null {
  const q = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH).trim();
  return q ? q : null;
}

/** Pure: put `query` first, dropping a case-insensitive duplicate, capped at MAX. */
export function pushRecent(list: string[], query: string): string[] {
  const q = normalizeRecentQuery(query);
  if (!q) return list;
  const lower = q.toLowerCase();
  return [q, ...list.filter((x) => x.toLowerCase() !== lower)].slice(0, MAX_RECENT_SEARCHES);
}

type RecentSearchState = {
  /** The user whose list is loaded (null = none / signed out). */
  userId: string | null;
  items: string[];
  /** Load the list for this user (no-op when already loaded). Pass null on sign-out. */
  loadFor: (userId: string | null) => Promise<void>;
  add: (query: string) => void;
  remove: (query: string) => void;
  clear: () => void;
};

function persist(userId: string | null, items: string[]) {
  if (!userId) return;
  const key = recentSearchKey(userId);
  const op = items.length ? setSecureItem(key, JSON.stringify(items)) : deleteSecureItem(key);
  void Promise.resolve(op).catch(() => undefined);
}

export const useRecentSearchStore = create<RecentSearchState>((set, get) => ({
  userId: null,
  items: [],
  loadFor: async (userId) => {
    if (get().userId === userId) return;
    set({ userId, items: [] });
    if (!userId) return;
    let items: string[] = [];
    try {
      const raw = await getSecureItem(recentSearchKey(userId));
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        items = parsed
          .filter((x): x is string => typeof x === 'string')
          .reduceRight<string[]>((acc, q) => pushRecent(acc, q), []);
      }
    } catch {
      /* corrupt or unavailable — start fresh */
    }
    // Another user may have signed in meanwhile; searches added while loading stay on top.
    if (get().userId !== userId) return;
    const merged = get().items.reduceRight((acc, q) => pushRecent(acc, q), items);
    set({ items: merged });
  },
  add: (query) => {
    const { userId, items } = get();
    if (!userId) return;
    const next = pushRecent(items, query);
    if (next === items) return;
    set({ items: next });
    persist(userId, next);
  },
  remove: (query) => {
    const { userId, items } = get();
    const next = items.filter((x) => x !== query);
    if (next.length === items.length) return;
    set({ items: next });
    persist(userId, next);
  },
  clear: () => {
    const { userId } = get();
    set({ items: [] });
    persist(userId, []);
  },
}));
