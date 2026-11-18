import { describe, it, expect, vi, beforeEach } from 'vitest';

(globalThis as { __DEV__?: boolean }).__DEV__ = false;
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));
vi.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));
vi.mock('../../events', () => ({ logEvent: vi.fn() }));

const requestMock = vi.fn();
vi.mock('../http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../http')>()),
  request: (...args: unknown[]) => requestMock(...args),
}));

const { isHttpsLink, normalizeLink, isOpenNow, getVerifiedBusinesses } = await import('../storefront');

beforeEach(() => {
  requestMock.mockReset();
});

describe('links', () => {
  it('accepts only https links with a real host', () => {
    expect(isHttpsLink('https://shop.lu')).toBe(true);
    expect(isHttpsLink('https://shop.lu/path?x=1')).toBe(true);
    expect(isHttpsLink('http://shop.lu')).toBe(false);
    expect(isHttpsLink('https://localhost')).toBe(false);
    expect(isHttpsLink('javascript:alert(1)')).toBe(false);
  });
  it('normalizes bare domains and http to https, leaves other schemes invalid', () => {
    expect(normalizeLink(' shop.lu ')).toBe('https://shop.lu');
    expect(normalizeLink('http://shop.lu')).toBe('https://shop.lu');
    expect(normalizeLink('mailto:a@b.c')).toBe('mailto:a@b.c');
  });
});

describe('isOpenNow', () => {
  const hours = [{ day: 1, open: '09:00', close: '17:00' }];
  it('is null without hours and checks the local day + time', () => {
    expect(isOpenNow([])).toBeNull();
    expect(isOpenNow(hours, new Date(2026, 10, 16, 10, 0))).toBe(true); // Monday
    expect(isOpenNow(hours, new Date(2026, 10, 16, 17, 0))).toBe(false);
    expect(isOpenNow(hours, new Date(2026, 10, 17, 10, 0))).toBe(false); // Tuesday
  });
});

describe('getVerifiedBusinesses', () => {
  it('asks once per id and caches the answer', async () => {
    requestMock.mockResolvedValueOnce({ success: true, data: { verified: ['b1'] } });
    expect([...(await getVerifiedBusinesses(['b1', 'b2']))]).toEqual(['b1']);
    expect([...(await getVerifiedBusinesses(['b1', 'b2']))]).toEqual(['b1']);
    expect(requestMock).toHaveBeenCalledTimes(1);
  });
  it('shows no badge when the endpoint is missing', async () => {
    requestMock.mockRejectedValueOnce(new Error('404'));
    expect((await getVerifiedBusinesses(['zz'])).size).toBe(0);
  });
});
