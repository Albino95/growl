import { create } from 'zustand';

type UiPrefsState = {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  setHapticsEnabled: (enabled: boolean) => void;
};

/** On by default so the app feels alive; Settings can mute either channel. */
export const useUiPrefsStore = create<UiPrefsState>((set) => ({
  soundEnabled: true,
  hapticsEnabled: true,
  setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
  setHapticsEnabled: (enabled) => set({ hapticsEnabled: enabled }),
}));
