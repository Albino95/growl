import { describe, it, expect, vi, beforeEach } from 'vitest';

const storage = new Map<string, string>();
vi.mock('../services/storage/secureStore', () => ({
  getSecureItem: vi.fn(async (k: string) => storage.get(k) ?? null),
  setSecureItem: vi.fn(async (k: string, v: string) => void storage.set(k, v)),
  deleteSecureItem: vi.fn(async (k: string) => void storage.delete(k)),
}));

const { useRecentSearchStore, pushRecent, recentSearchKey, normalizeRecentQuery, MAX_RECENT_SEARCHES } =
  await import('./useRecentSearchStore');

const s = () => useRecentSearchStore.getState();
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  storage.clear();
  useRecentSearchStore.setState({ userId: null, items: [] });
});

describe('pushRecent', () => {
  it('puts the newest first, de-duplicates case-insensitively and caps at 10', () => {
    let list: string[] = [];
    for (let i = 0; i < 12; i++) list = pushRecent(list, `q${i}`);
    expect(list).toHaveLength(MAX_RECENT_SEARCHES);
    expect(list[0]).toBe('q11');
    expect(list).not.toContain('q0');
    list = pushRecent(list, '  Q5 ');
    expect(list[0]).toBe('Q5');
    expect(list.filter((x) => x.toLowerCase() === 'q5')).toHaveLength(1);
    expect(pushRecent(list, '   ')).toBe(list);
  });

  it('normalises queries and builds safe storage keys', () => {
    expect(normalizeRecentQuery('  a   b ')).toBe('a b');
    expect(normalizeRecentQuery('x'.repeat(200))).toHaveLength(80);
    expect(recentSearchKey('user:1/2')).toBe('grow.recentSearches.v1.user_1_2');
  });
});

describe('useRecentSearchStore', () => {
  it('ignores adds while signed out', async () => {
    s().add('yoga');
    expect(s().items).toEqual([]);
  });

  it('adds, removes one, clears all and persists per user', async () => {
    await s().loadFor('alice');
    s().add('yoga');
    s().add('#run');
    s().add('Yoga');
    expect(s().items).toEqual(['Yoga', '#run']);
    await flush();
    expect(JSON.parse(storage.get(recentSearchKey('alice'))!)).toEqual(['Yoga', '#run']);

    s().remove('#run');
    expect(s().items).toEqual(['Yoga']);

    // Another user has their own list.
    await s().loadFor('bob');
    expect(s().items).toEqual([]);
    s().add('paint');
    await s().loadFor('alice');
    expect(s().items).toEqual(['Yoga']);

    s().clear();
    expect(s().items).toEqual([]);
    await flush();
    expect(storage.has(recentSearchKey('alice'))).toBe(false);
    expect(JSON.parse(storage.get(recentSearchKey('bob'))!)).toEqual(['paint']);

    await s().loadFor(null);
    expect(s().items).toEqual([]);
  });

  it('survives corrupt storage', async () => {
    storage.set(recentSearchKey('carol'), '{not json');
    await s().loadFor('carol');
    expect(s().items).toEqual([]);
    storage.set(recentSearchKey('dave'), JSON.stringify(['a', 3, 'b', 'A']));
    await s().loadFor('dave');
    expect(s().items).toEqual(['a', 'b']);
  });
});
