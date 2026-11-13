import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/storage/secureStore', () => ({
  getSecureItem: vi.fn(async () => {
    throw new Error('keychain unavailable');
  }),
  setSecureItem: vi.fn(async () => undefined),
  deleteSecureItem: vi.fn(async () => undefined),
}));

const { useUiPrefsStore, uiPrefsReadiness, DEFAULT_APPEARANCE } = await import('./useUiPrefsStore');

describe('useUiPrefsStore', () => {
  it('marks itself ready with defaults when rehydration fails', async () => {
    await vi.waitFor(() => expect(uiPrefsReadiness.isReady()).toBe(true));
    const s = useUiPrefsStore.getState();
    expect(s.soundEnabled).toBe(true);
    expect(s.hapticsEnabled).toBe(true);
    // Light until phase 2 migrates screens and flips the default to 'system'.
    expect(s.appearance).toBe('light');
    // zustand never flips hasHydrated() on a storage error — readiness covers it.
    expect(useUiPrefsStore.persist.hasHydrated()).toBe(false);
    const cb = vi.fn();
    uiPrefsReadiness.onReady(cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('appearance pref', () => {
  it('defaults to light and can be set', () => {
    expect(DEFAULT_APPEARANCE).toBe('light');
    useUiPrefsStore.getState().setAppearance('dark');
    expect(useUiPrefsStore.getState().appearance).toBe('dark');
    useUiPrefsStore.getState().setAppearance('system');
    expect(useUiPrefsStore.getState().appearance).toBe('system');
  });
});
