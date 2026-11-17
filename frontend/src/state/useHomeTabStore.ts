import { create } from 'zustand';

type State = {
  pulse: number;
  requestTopAndRefresh: () => void;
};

/** Feed tab / Grow! mark — scroll home to top and refresh. */
export const useHomeTabStore = create<State>((set) => ({
  pulse: 0,
  requestTopAndRefresh: () => set((s) => ({ pulse: s.pulse + 1 })),
}));
