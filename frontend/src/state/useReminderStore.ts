import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { getSecureItem, setSecureItem, deleteSecureItem } from '../services/storage/secureStore';
import type { ScheduledReminder } from '../services/reminderPlan';

/**
 * Daily check-in reminder settings + bookkeeping (device-local, persisted).
 * Scheduling lives in services/reminders.ts; pure rules in services/reminderPlan.ts.
 */

const STORAGE_KEY = 'grow.reminders.v1';
/** Keep the bookkeeping lists tiny (SecureStore values should stay well under 2 KB). */
const MAX_CHECKIN_DAYS = 10;

export type ReminderState = {
  enabled: boolean;
  hour: number;
  minute: number;
  /** Last time the soft "gentle nudge" sheet was shown (ms). */
  lastAskedAt: number | null;
  askCount: number;
  /** Reminders in a row that went unanswered (no check-in that day). */
  ignoredCount: number;
  /** Reminders we scheduled / that fired and aren't resolved yet. */
  scheduled: ScheduledReminder[];
  /** Recent local days with a check-in (for the ignored count). */
  checkinDays: string[];

  setEnabled: (enabled: boolean) => void;
  setTime: (hour: number, minute: number) => void;
  markAsked: (at?: number) => void;
  /** "Keep reminders" after the auto-quiet pause, or the user answered one. */
  resetIgnored: () => void;
  setBookkeeping: (patch: Partial<Pick<ReminderState, 'ignoredCount' | 'scheduled'>>) => void;
  recordCheckinDay: (day: string) => void;
};

const secureStateStorage: StateStorage = {
  getItem: (name) => getSecureItem(name),
  setItem: (name, value) => setSecureItem(name, value),
  removeItem: (name) => deleteSecureItem(name),
};

export const useReminderStore = create<ReminderState>()(
  persist(
    (set, get) => ({
      enabled: false,
      hour: 20,
      minute: 0,
      lastAskedAt: null,
      askCount: 0,
      ignoredCount: 0,
      scheduled: [],
      checkinDays: [],

      setEnabled: (enabled) =>
        // Turning on (again) starts the auto-quiet count fresh.
        set(enabled ? { enabled, ignoredCount: 0 } : { enabled, ignoredCount: 0, scheduled: [] }),
      setTime: (hour, minute) => set({ hour, minute }),
      markAsked: (at = Date.now()) => set((s) => ({ lastAskedAt: at, askCount: s.askCount + 1 })),
      resetIgnored: () => set({ ignoredCount: 0 }),
      setBookkeeping: (patch) => set(patch),
      recordCheckinDay: (day) => {
        const days = get().checkinDays;
        if (days.includes(day)) return;
        set({ checkinDays: [...days, day].sort().slice(-MAX_CHECKIN_DAYS) });
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => secureStateStorage),
      partialize: (s) => ({
        enabled: s.enabled,
        hour: s.hour,
        minute: s.minute,
        lastAskedAt: s.lastAskedAt,
        askCount: s.askCount,
        ignoredCount: s.ignoredCount,
        scheduled: s.scheduled,
        checkinDays: s.checkinDays,
      }),
    },
  ),
);

/** Resolves once persisted settings are loaded (or after a short timeout on storage errors). */
export function whenRemindersHydrated(timeoutMs = 3000): Promise<void> {
  if (useReminderStore.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      unsub();
      clearTimeout(t);
      resolve();
    };
    const unsub = useReminderStore.persist.onFinishHydration(finish);
    const t = setTimeout(finish, timeoutMs);
  });
}
