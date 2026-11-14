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

const {
  isEndpointMissingError,
  whenAvailable,
  normalizeBlockedList,
  toLifeMode,
  getPrivacy,
  listBlockedUsers,
  setLifeMode,
} = await import('../privacy');
const { ApiError } = await import('../http');

beforeEach(() => {
  requestMock.mockReset();
});

describe('isEndpointMissingError', () => {
  it('decides on ApiError status', () => {
    expect(isEndpointMissingError(new ApiError('Not here', 404))).toBe(true);
    expect(isEndpointMissingError(new ApiError('Route not found: /x', 500))).toBe(false);
    expect(isEndpointMissingError(new ApiError('Offline', 0))).toBe(false);
  });
  it('matches the router 404 and the generic 404 fallback', () => {
    expect(isEndpointMissingError(new Error('Route not found: /api/v1/me/privacy'))).toBe(true);
    expect(isEndpointMissingError(new Error('Request failed (404). Please try again.'))).toBe(true);
  });
  it('ignores other failures', () => {
    expect(isEndpointMissingError(new Error('Request failed (500). Please try again.'))).toBe(
      false,
    );
    expect(isEndpointMissingError(new Error('Request timed out. Check your connection.'))).toBe(
      false,
    );
    expect(isEndpointMissingError(null)).toBe(false);
  });
});

describe('whenAvailable', () => {
  it('wraps data when the endpoint exists', async () => {
    requestMock.mockResolvedValue({ success: true, data: { dm_policy: 'friends' } });
    await expect(whenAvailable(getPrivacy)).resolves.toEqual({
      available: true,
      data: { dm_policy: 'friends' },
    });
  });
  it('hides the feature on an ApiError 404', async () => {
    requestMock.mockRejectedValue(new ApiError('Not found', 404));
    await expect(whenAvailable(getPrivacy)).resolves.toEqual({ available: false });
  });
  it('hides the feature on 404', async () => {
    requestMock.mockRejectedValue(new Error('Route not found: /api/v1/social/blocks'));
    await expect(whenAvailable(listBlockedUsers)).resolves.toEqual({ available: false });
  });
  it('rethrows real errors', async () => {
    requestMock.mockRejectedValue(new Error('Could not reach Grow! servers'));
    await expect(whenAvailable(getPrivacy)).rejects.toThrow('Could not reach');
  });
});

describe('normalisers', () => {
  it('accepts a bare list or a wrapped one', () => {
    const u = { id: 'u1', username: 'ana', avatar_url: 'x', blocked_at: '2026-01-01' };
    expect(normalizeBlockedList([u])).toHaveLength(1);
    expect(normalizeBlockedList({ blocks: [u] })[0].username).toBe('ana');
    expect(normalizeBlockedList({ nope: 1 })).toEqual([]);
  });
  it('defaults unknown dm policy to everyone', async () => {
    requestMock.mockResolvedValue({ success: true, data: { dm_policy: 'weird' } });
    await expect(getPrivacy()).resolves.toEqual({ dm_policy: 'everyone' });
  });
  it('clears until when mode is none and validates the date', () => {
    expect(toLifeMode({ mode: 'none', until: '2026-01-01' })).toEqual({
      mode: 'none',
      until: null,
    });
    expect(toLifeMode({ mode: 'sick', until: 'soon' })).toEqual({ mode: 'sick', until: null });
    expect(toLifeMode({ mode: 'travel', until: '2026-11-20' })).toEqual({
      mode: 'travel',
      until: '2026-11-20',
    });
    expect(toLifeMode(undefined)).toEqual({ mode: 'none', until: null });
  });
  it('omits until from the PUT body when clearing', async () => {
    requestMock.mockResolvedValue({ success: true, data: { mode: 'none', until: null } });
    await setLifeMode({ mode: 'none', until: '2026-11-20' });
    expect(JSON.parse(requestMock.mock.calls[0][1].body)).toEqual({ mode: 'none' });
  });
});
