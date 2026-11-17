import { describe, it, expect, vi, beforeEach } from 'vitest';

(globalThis as { __DEV__?: boolean }).__DEV__ = false;
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));
vi.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));

const requestMock = vi.fn();
vi.mock('../http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../http')>()),
  request: (...args: unknown[]) => requestMock(...args),
}));

const { searchAll, resetSearchEndpointProbe } = await import('../search');
const { ApiError } = await import('../http');

beforeEach(() => {
  requestMock.mockReset();
  resetSearchEndpointProbe();
});

describe('searchAll', () => {
  it('calls GET /search and normalises the payload', async () => {
    requestMock.mockResolvedValueOnce({
      success: true,
      data: { people: [{ id: 'u1' }], posts: null, tags: [{ tag: 'yoga', count: 2 }], more: { tags: true }, next_cursor: '20' },
    });
    const res = await searchAll(' #yo ', { type: 'tags', limit: 20, cursor: '0' });
    expect(requestMock.mock.calls[0][0]).toBe('/search?q=%23yo&type=tags&limit=20&cursor=0');
    expect(res).toMatchObject({
      people: [{ id: 'u1' }],
      posts: [],
      tags: [{ tag: 'yoga', count: 2 }],
      more: { people: false, posts: false, tags: true },
      next_cursor: '20',
      legacy: false,
    });
  });

  it('falls back to /social/search on 404 and remembers it', async () => {
    requestMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/search')) throw new ApiError('Not found', 404);
      return {
        success: true,
        data: {
          people: [{ id: 'u1', username: 'ann', avatar: null, categories: ['fitness'], isFriend: true }],
          posts: [{ id: 'p1', user_id: 'u1', caption: 'Run', category: 'fitness', image_url: 'https://x', created_at: 'now', username: 'ann' }],
        },
      };
    });
    const res = await searchAll('ann');
    expect(res.legacy).toBe(true);
    expect(res.people[0]).toEqual({ id: 'u1', username: 'ann', display_name: 'ann', avatar_url: null, paths: ['fitness'], is_friend: true });
    expect(res.posts[0]).toMatchObject({ id: 'p1', thumb_url: 'https://x', caption_snippet: 'Run', author: { id: 'u1', username: 'ann' } });
    await searchAll('bob');
    const newCalls = requestMock.mock.calls.filter((c) => String(c[0]).startsWith('/search'));
    expect(newCalls).toHaveLength(1);
  });

  it('rethrows other errors', async () => {
    requestMock.mockRejectedValueOnce(new ApiError('Server', 500));
    await expect(searchAll('x')).rejects.toThrow('Server');
  });
});
