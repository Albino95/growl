import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import {
  getSecureItem,
  setSecureItem,
  deleteSecureItem,
} from '../services/storage/secureStore';

const STORAGE_KEY = 'grow.uiPrefs.v1';

/** User's appearance choice; resolved to 'light' | 'dark' in src/theme/appearance.ts. */
export type AppearancePref = 'system' | 'light' | 'dark';

/**
 * 'light' while screens are still being migrated to semantic colour tokens.
 * Phase 2 flips this to 'system' together with DARK_MODE_READY.
 */
export const DEFAULT_APPEARANCE: AppearancePref = 'system';

type UiPrefsState = {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  appearance: AppearancePref;
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
      soundEnabled: true,
      hapticsEnabled: true,
      appearance: DEFAULT_APPEARANCE,
      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
      setHapticsEnabled: (enabled) => set({ hapticsEnabled: enabled }),
      setAppearance: (appearance) => set({ appearance }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => secureStateStorage),
      // `appearance` was added without a version bump: older blobs simply lack
      // it and the default above stays in force (persist merges shallowly).
      partialize: (s) => ({
        soundEnabled: s.soundEnabled,
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
