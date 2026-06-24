import { create } from 'zustand';

type UiPrefsState = {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  setHapticsEnabled: (enabled: boolean) => void;
};

export const useUiPrefsStore = create<UiPrefsState>((set) => ({
  soundEnabled: false,
  hapticsEnabled: true,
  setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
  setHapticsEnabled: (enabled) => set({ hapticsEnabled: enabled }),
}));
