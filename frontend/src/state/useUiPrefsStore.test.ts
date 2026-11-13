import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/storage/secureStore', () => ({
  getSecureItem: vi.fn(async () => {
    throw new Error('keychain unavailable');
  }),
  setSecureItem: vi.fn(async () => undefined),
  deleteSecureItem: vi.fn(async () => undefined),
}));

const { useUiPrefsStore, uiPrefsReadiness } = await import('./useUiPrefsStore');

describe('useUiPrefsStore', () => {
  it('marks itself ready with defaults when rehydration fails', async () => {
    await vi.waitFor(() => expect(uiPrefsReadiness.isReady()).toBe(true));
    const s = useUiPrefsStore.getState();
    expect(s.soundEnabled).toBe(true);
    expect(s.hapticsEnabled).toBe(true);
    // zustand never flips hasHydrated() on a storage error — readiness covers it.
    expect(useUiPrefsStore.persist.hasHydrated()).toBe(false);
    const cb = vi.fn();
    uiPrefsReadiness.onReady(cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
