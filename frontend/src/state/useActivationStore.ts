import { create } from 'zustand';
import { getSecureItem, setSecureItem } from '../services/storage/secureStore';
import { localDateKey } from '../components/journal/journalMeta';

const STORAGE_KEY = 'grow.activation.v1';

type Persisted = {
  lastJournalDateKey: string | null;
  dismissedSundayWeek: string | null;
};

type ActivationState = Persisted & {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  markJournaled: (when?: Date | string) => void;
  dismissSunday: () => void;
  hasJournaledToday: () => boolean;
  showSundaySit: () => boolean;
};

function isoWeekKey(d = new Date()): string {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${week}`;
}

function toDateKey(when?: Date | string): string {
  if (!when) return localDateKey();
  return localDateKey(when instanceof Date ? when : new Date(when));
}

async function persist(partial: Persisted) {
  await setSecureItem(STORAGE_KEY, JSON.stringify(partial));
}

/** First-session activation: journal today + Sunday sit cue. */
export const useActivationStore = create<ActivationState>((set, get) => ({
  hydrated: false,
  lastJournalDateKey: null,
  dismissedSundayWeek: null,
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await getSecureItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Persisted>;
        set({
          hydrated: true,
          lastJournalDateKey: parsed.lastJournalDateKey ?? null,
          dismissedSundayWeek: parsed.dismissedSundayWeek ?? null,
        });
        return;
      }
    } catch {
      // Fresh install or corrupt payload — start empty.
    }
    set({ hydrated: true });
  },
  markJournaled: (when) => {
    const lastJournalDateKey = toDateKey(when);
    set({ lastJournalDateKey });
    const { dismissedSundayWeek } = get();
    void persist({ lastJournalDateKey, dismissedSundayWeek });
  },
  dismissSunday: () => {
    const dismissedSundayWeek = isoWeekKey();
    set({ dismissedSundayWeek });
    const { lastJournalDateKey } = get();
    void persist({ lastJournalDateKey, dismissedSundayWeek });
  },
  hasJournaledToday: () => get().lastJournalDateKey === localDateKey(),
  showSundaySit: () => {
    if (new Date().getDay() !== 0) return false;
    if (get().hasJournaledToday()) return false;
    return get().dismissedSundayWeek !== isoWeekKey();
  },
}));
