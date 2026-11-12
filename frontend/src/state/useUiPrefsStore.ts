import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import {
  getSecureItem,
  setSecureItem,
  deleteSecureItem,
} from '../services/storage/secureStore';

const STORAGE_KEY = 'grow.uiPrefs.v1';

type UiPrefsState = {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  setHapticsEnabled: (enabled: boolean) => void;
};

/** Same storage the other app stores use (SecureStore on native, localStorage on web). */
const secureStateStorage: StateStorage = {
  getItem: (name) => getSecureItem(name),
  setItem: (name, value) => setSecureItem(name, value),
  removeItem: (name) => deleteSecureItem(name),
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
      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
      setHapticsEnabled: (enabled) => set({ hapticsEnabled: enabled }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => secureStateStorage),
      partialize: (s) => ({ soundEnabled: s.soundEnabled, hapticsEnabled: s.hapticsEnabled }),
    }
  )
);
