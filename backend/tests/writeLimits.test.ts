import { describe, it, expect } from 'vitest';
import { matchWriteLimit, enforceWriteLimit } from '../src/utils/writeLimits';
import { createMockEnv } from './utils/test-helpers';

describe('social write limits', () => {
  it.each([
    ['/messages/conversations/c1/messages', 'message'],
    ['/messages/conversations/c1/messages/m1/reaction', 'message'],
    ['/feed/posts/p1/comments', 'comment'],
    ['/feed/posts/p1/like', 'like'],
    ['/feed/posts', 'post'],
    ['/social/friends', 'friend-request'],
    ['/social/report', 'report'],
    ['/instructor/inquiries', 'coaching'],
  ])('limits POST %s as %s', (path, name) => {
    expect(matchWriteLimit('POST', path)?.name).toBe(name);
  });

  it('does not limit reads or unrelated writes', () => {
    expect(matchWriteLimit('GET', '/feed/posts')).toBeNull();
    expect(matchWriteLimit('POST', '/auth/sign-in')).toBeNull(); // auth has its own limits
    expect(matchWriteLimit('POST', '/media/upload')).toBeNull(); // upload has its own limit
  });

  it('returns 429 once the account is over the limit', async () => {
    const env = createMockEnv();
    const counts = new Map<string, string>();
    env.KV = {
      get: async (k: string) => counts.get(k) ?? null,
      put: async (k: string, v: string) => void counts.set(k, v),
    } as any;
    const req = () =>
      new Request('https://api.test/api/v1/social/report', {
        method: 'POST',
        headers: { Authorization: 'Bearer test' },
      });
    for (let i = 0; i < 20; i += 1) {
      expect(await enforceWriteLimit(req(), env, '/social/report')).toBeNull();
    }
    const blocked = await enforceWriteLimit(req(), env, '/social/report');
    expect(blocked?.status).toBe(429);
  });
});
