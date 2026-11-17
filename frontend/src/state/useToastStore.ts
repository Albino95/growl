import { create } from 'zustand';

export type ToastTone = 'success' | 'info';

export type ToastAction = { label: string; onPress: () => void };

export type ToastOptions = {
  message: string;
  /** Ionicons glyph name; defaults by tone (checkmark for success, info for info). */
  icon?: string;
  tone?: ToastTone;
  action?: ToastAction;
};

export type ToastItem = {
  id: number;
  message: string;
  icon?: string;
  tone: ToastTone;
  action?: ToastAction;
  /** Auto-hide delay in ms. */
  durationMs: number;
};

export const TOAST_DURATION_MS = 2200;
export const TOAST_ACTION_DURATION_MS = 4000;

type ToastState = {
  current: ToastItem | null;
  /** Show a toast. One at a time: a new toast replaces the visible one. Returns its id. */
  show: (opts: ToastOptions) => number;
  /** Hide the toast. With an id, only hides if that toast is still the visible one. */
  hide: (id?: number) => void;
};

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  current: null,
  show: (opts) => {
    const message = (opts.message || '').trim();
    if (!message) return 0;
    const id = nextId++;
    set({
      current: {
        id,
        message,
        icon: opts.icon,
        tone: opts.tone ?? 'success',
        action: opts.action,
        durationMs: opts.action ? TOAST_ACTION_DURATION_MS : TOAST_DURATION_MS,
      },
    });
    return id;
  },
  hide: (id) => {
    const cur = get().current;
    if (!cur) return;
    if (id !== undefined && cur.id !== id) return;
    set({ current: null });
  },
}));

/** Convenience API — `toast.success('Profile saved')`. */
export const toast = {
  show: (opts: ToastOptions) => useToastStore.getState().show(opts),
  success: (message: string, opts: Omit<ToastOptions, 'message' | 'tone'> = {}) =>
    useToastStore.getState().show({ ...opts, message, tone: 'success' }),
  info: (message: string, opts: Omit<ToastOptions, 'message' | 'tone'> = {}) =>
    useToastStore.getState().show({ ...opts, message, tone: 'info' }),
  hide: (id?: number) => useToastStore.getState().hide(id),
};
