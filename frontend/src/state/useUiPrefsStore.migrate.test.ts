import { describe, it, expect, vi } from 'vitest';

// A v1 blob from before the Sounds level: sounds were switched off.
const stored = new Map<string, string>([
  [
    'grow.uiPrefs.v1',
    JSON.stringify({ state: { soundEnabled: false, hapticsEnabled: true, appearance: 'dark' }, version: 1 }),
  ],
]);

vi.mock('../services/storage/secureStore', () => ({
  getSecureItem: vi.fn(async (k: string) => stored.get(k) ?? null),
  setSecureItem: vi.fn(async (k: string, v: string) => {
    stored.set(k, v);
  }),
  deleteSecureItem: vi.fn(async () => undefined),
}));

const { useUiPrefsStore, uiPrefsReadiness, selectSoundEnabled } = await import('./useUiPrefsStore');

describe('useUiPrefsStore v1 → v2 migration', () => {
  it('turns soundEnabled=false into soundLevel off and persists v2', async () => {
    await vi.waitFor(() => expect(uiPrefsReadiness.isReady()).toBe(true));
    const s = useUiPrefsStore.getState();
    expect(s.soundLevel).toBe('off');
    expect(s.appearance).toBe('dark');
    expect(selectSoundEnabled(s)).toBe(false);
    expect('soundEnabled' in s).toBe(false);

    s.setSoundEnabled(true);
    expect(useUiPrefsStore.getState().soundLevel).toBe('subtle');
    useUiPrefsStore.getState().setSoundLevel('full');
    useUiPrefsStore.getState().setSoundEnabled(true);
    expect(useUiPrefsStore.getState().soundLevel).toBe('full');
    await vi.waitFor(() => {
      const blob = JSON.parse(stored.get('grow.uiPrefs.v1')!);
      expect(blob.version).toBe(2);
      expect(blob.state).toEqual({ soundLevel: 'full', hapticsEnabled: true, appearance: 'dark' });
    });
  });
});
