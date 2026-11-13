import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import {
  getSecureItem,
  setSecureItem,
  deleteSecureItem,
} from '../services/storage/secureStore';
import {
  DEFAULT_SOUND_LEVEL,
  migrateUiPrefs,
  type SoundLevel,
} from '../theme/hapticsCore';

export type { SoundLevel } from '../theme/hapticsCore';
export { DEFAULT_SOUND_LEVEL } from '../theme/hapticsCore';

const STORAGE_KEY = 'grow.uiPrefs.v1';

/** User's appearance choice; resolved to 'light' | 'dark' in src/theme/appearance.ts. */
export type AppearancePref = 'system' | 'light' | 'dark';

/**
 * 'light' while screens are still being migrated to semantic colour tokens.
 * Phase 2 flips this to 'system' together with DARK_MODE_READY.
 */
export const DEFAULT_APPEARANCE: AppearancePref = 'system';

type UiPrefsState = {
  /** Settings → Sounds: Off / Subtle (signature + like/toggle/commit) / Full (+ tab/chip/refresh). */
  soundLevel: SoundLevel;
  hapticsEnabled: boolean;
  appearance: AppearancePref;
  setSoundLevel: (level: SoundLevel) => void;
  /** Legacy on/off: false → 'off', true → 'subtle' (keeps 'full' if already full). */
  setSoundEnabled: (enabled: boolean) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setAppearance: (appearance: AppearancePref) => void;
};

/** Same storage the other app stores use (SecureStore on native, localStorage on web). */
const secureStateStorage: StateStorage = {
  getItem: (name) => getSecureItem(name),
  setItem: (name, value) => setSecureItem(name, value),
  removeItem: (name) => deleteSecureItem(name),
};

/**
 * Readiness of the persisted prefs. True once rehydration finished — or
 * failed, in which case the defaults (sounds on, haptics on) stay in force.
 * zustand's `persist.hasHydrated()` stays false forever on a storage error,
 * so feedback waits on this instead.
 */
let prefsReady = false;
const readyListeners = new Set<() => void>();

function markPrefsReady() {
  if (prefsReady) return;
  prefsReady = true;
  const listeners = [...readyListeners];
  readyListeners.clear();
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* ignore */
    }
  }
}

export const uiPrefsReadiness = {
  isReady: () => prefsReady,
  onReady: (cb: () => void): (() => void) => {
    if (prefsReady) {
      cb();
      return () => undefined;
    }
    readyListeners.add(cb);
    return () => {
      readyListeners.delete(cb);
    };
  },
};

/**
 * On by default so the app feels alive; Settings can mute either channel.
 * Persisted so a muted app stays muted across launches. `triggerFeedback`
 * reads `getState()` on every call, so it picks up the stored values as soon
 * as rehydration finishes (defaults apply only for the first few ms).
 */
export const useUiPrefsStore = create<UiPrefsState>()(
  persist(
    (set) => ({
      soundLevel: DEFAULT_SOUND_LEVEL,
      hapticsEnabled: true,
      appearance: DEFAULT_APPEARANCE,
      setSoundLevel: (level) => set({ soundLevel: level }),
      setSoundEnabled: (enabled) =>
        set((s) => ({
          soundLevel: enabled ? (s.soundLevel === 'off' ? DEFAULT_SOUND_LEVEL : s.soundLevel) : 'off',
        })),
      setHapticsEnabled: (enabled) => set({ hapticsEnabled: enabled }),
      setAppearance: (appearance) => set({ appearance }),
    }),
    {
      name: STORAGE_KEY,
      // v2: `soundEnabled: boolean` → `soundLevel` (false → 'off', true → 'subtle').
      version: 2,
      migrate: (persisted, version) => migrateUiPrefs(persisted, version) as unknown as UiPrefsState,
      storage: createJSONStorage(() => secureStateStorage),
      // `appearance` was added without a version bump: older blobs simply lack
      // it and the default above stays in force (persist merges shallowly).
      partialize: (s) => ({
        soundLevel: s.soundLevel,
        hapticsEnabled: s.hapticsEnabled,
        appearance: s.appearance,
      }),
      // Called after rehydration; `error` is set when storage/parse failed —
      // the store keeps its defaults and is marked ready either way.
      onRehydrateStorage: () => () => {
        markPrefsReady();
      },
    }
  )
);

/** Derived: any UI sound at all (Sounds level is not Off). */
export const selectSoundEnabled = (s: Pick<UiPrefsState, 'soundLevel'>): boolean => s.soundLevel !== 'off';
