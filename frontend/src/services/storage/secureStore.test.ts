import { describe, it, expect, vi, beforeEach } from 'vitest';

const ss = vi.hoisted(() => ({
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
vi.mock('expo-secure-store', () => ss);

const { readSecureItem, getSecureItem, trySetSecureItem, setSecureItem } = await import(
  './secureStore'
);

beforeEach(() => {
  ss.getItemAsync.mockReset();
  ss.setItemAsync.mockReset();
  ss.deleteItemAsync.mockReset();
});

describe('secureStore', () => {
  it('tells a missing item apart from a read that threw', async () => {
    ss.getItemAsync.mockResolvedValueOnce(null);
    expect(await readSecureItem('k')).toEqual({ ok: true, value: null });

    ss.getItemAsync.mockRejectedValueOnce(new Error('User interaction is not allowed'));
    const failed = await readSecureItem('k');
    expect(failed.ok).toBe(false);
  });

  it('keeps getSecureItem lenient for existing callers', async () => {
    ss.getItemAsync.mockRejectedValueOnce(new Error('locked'));
    expect(await getSecureItem('k')).toBeNull();
    ss.getItemAsync.mockResolvedValueOnce('v');
    expect(await getSecureItem('k')).toBe('v');
  });

  it('writes with AFTER_FIRST_UNLOCK and retries a failed write once', async () => {
    ss.setItemAsync.mockRejectedValueOnce(new Error('busy')).mockResolvedValueOnce(undefined);
    expect(await trySetSecureItem('k', 'v')).toBe(true);
    expect(ss.setItemAsync).toHaveBeenCalledTimes(2);
    expect(ss.setItemAsync.mock.calls[0][2]).toEqual({ keychainAccessible: 'AFTER_FIRST_UNLOCK' });
  });

  it('reports a write that failed twice (and never throws)', async () => {
    ss.setItemAsync.mockRejectedValue(new Error('busy'));
    expect(await trySetSecureItem('k', 'v')).toBe(false);
    await expect(setSecureItem('k', 'v')).resolves.toBeUndefined();
  });
});
