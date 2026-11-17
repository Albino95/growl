import { create } from 'zustand';
import { getSecureItem, setSecureItem } from '../services/storage/secureStore';

const STORAGE_KEY = 'grow.composerPrefs.v1';

export type ComposerPrefsKind = 'post' | 'reel' | 'story';

type ComposerPrefsState = {
  hydrated: boolean;
  /** Last category the user shared with, per create flow. */
  lastCategory: Partial<Record<ComposerPrefsKind, string>>;
  hydrate: () => Promise<void>;
  rememberCategory: (kind: ComposerPrefsKind, category: string) => void;
};

/** Same storage as the other app stores (SecureStore on native, localStorage on web). */
export const useComposerPrefsStore = create<ComposerPrefsState>((set, get) => ({
  hydrated: false,
  lastCategory: {},
  hydrate: async () => {
    if (get().hydrated) return;
    let lastCategory: ComposerPrefsState['lastCategory'] = {};
    try {
      const raw = await getSecureItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as { lastCategory?: unknown }) : null;
      if (parsed && typeof parsed.lastCategory === 'object' && parsed.lastCategory) {
        lastCategory = parsed.lastCategory as ComposerPrefsState['lastCategory'];
      }
    } catch {
      /* corrupt or unavailable — start fresh */
    }
    set({ hydrated: true, lastCategory: { ...lastCategory, ...get().lastCategory } });
  },
  rememberCategory: (kind, category) => {
    const lastCategory = { ...get().lastCategory, [kind]: category };
    set({ lastCategory });
    void setSecureItem(STORAGE_KEY, JSON.stringify({ lastCategory })).catch(() => undefined);
  },
}));
