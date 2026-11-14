import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { getSecureItem, setSecureItem, deleteSecureItem } from '../services/storage/secureStore';
import {
  getToday,
  getWeeklyRecap,
  saveToday,
  type BadgeEarned,
  type Checkin,
  type CheckinInput,
  type CheckinResult,
  type Streak,
  type WeeklyRecap,
} from '../services/api/growth';
import { localDayKey } from '../services/api/http';
import { newIdempotencyKey } from '../services/api/idempotency';
import { toLifeMode, type LifeMode } from '../services/api/privacy';
import type { JournalMood } from '../services/api/journal';

/**
 * Growth system client state (streak + Today check-in + weekly recap).
 * Contract: docs/GROWTH_SYSTEM.md.
 *
 * Public API for other screens:
 *   - `streak: Streak | null`          server streak (current/longest/rest_days_left/week…)
 *   - `checkin: Checkin | null`        today's check-in (null = not done yet)
 *   - `available: boolean`             false once /me/today has failed with nothing cached
 *                                      (backend not deployed / offline) — hide growth UI
 *   - `refresh({ force?, userId? })`   refetch today + streak (throttled 20s unless force;
 *                                      passing userId clears the cache on account switch).
 *                                      Call after any activity: post, story, journal entry.
 *   - `refreshRecap({ force? })`       fetch last week's recap (once per local day)
 *   - `saveCheckin(input)`             PUT /me/today; updates streak/checkin, pushes new badges
 *   - `pendingBadges: BadgeEarned[]`   FIFO of freshly earned badges from any create response.
 *     `pushBadges(badges)`             append (de-duplicated by id). Call with `new_badges`
 *                                      from post/story/journal/check-in responses.
 *     `takeBadges()`                   returns and clears the queue — the global
 *                                      BadgeCelebrationHost consumes this.
 */

const STORAGE_KEY = 'grow.growth.v1';
const REFRESH_THROTTLE_MS = 20_000;

export type ComposeDraft = {
  mood: JournalMood | null;
  path: string | null;
  intention: string | null;
};

type GrowthState = {
  streak: Streak | null;
  checkin: Checkin | null;
  /** From GET /me/today (`none` when off or the server doesn't send it). */
  lifeMode: LifeMode | null;
  /** Local day the `checkin` / `streak` snapshot belongs to. */
  day: string | null;
  loading: boolean;
  loaded: boolean;
  available: boolean;
  lastFetchedAt: number;
  saving: boolean;

  recap: WeeklyRecap | null;
  recapFetchedDay: string | null;
  /** Persisted: ISO week (`2026-W46`) the user dismissed the recap card for. */
  dismissedRecapWeek: string | null;

  pendingBadges: BadgeEarned[];
  /** One-shot prefill for the Journal composer ("Write more" from the Today card). */
  composeDraft: ComposeDraft | null;

  /** User id the cached snapshot belongs to (account switch → refetch). */
  owner: string | null;
  refresh: (opts?: { force?: boolean; userId?: string | null }) => Promise<void>;
  refreshRecap: (opts?: { force?: boolean }) => Promise<void>;
  saveCheckin: (input: CheckinInput) => Promise<CheckinResult>;
  pushBadges: (badges: BadgeEarned[] | null | undefined) => void;
  takeBadges: () => BadgeEarned[];
  dismissRecap: (week: string) => void;
  setComposeDraft: (draft: ComposeDraft | null) => void;
  takeComposeDraft: () => ComposeDraft | null;
  reset: () => void;
};

const secureStateStorage: StateStorage = {
  getItem: (name) => getSecureItem(name),
  setItem: (name, value) => setSecureItem(name, value),
  removeItem: (name) => deleteSecureItem(name),
};

/**
 * Idempotency key for the check-in save in flight / last failed. A retry of the
 * same input on the same day reuses it (no double points if the first PUT
 * landed but its response was lost); any other input, or a success, starts a
 * new key so a later edit is never answered with the stored earlier save.
 */
let pendingSave: { sig: string; key: string } | null = null;

function checkinKeyFor(input: CheckinInput): string {
  const sig = `${localDayKey()}|${JSON.stringify(input)}`;
  if (!pendingSave || pendingSave.sig !== sig) {
    pendingSave = { sig, key: `checkin-${newIdempotencyKey()}` };
  }
  return pendingSave.key;
}

let inflight: Promise<void> | null = null;
let recapInflight: Promise<void> | null = null;
/** Bumped on account switch so a late response for the previous user is dropped. */
let epoch = 0;

export const useGrowthStore = create<GrowthState>()(
  persist(
    (set, get) => ({
      streak: null,
      checkin: null,
      lifeMode: null,
      day: null,
      loading: false,
      loaded: false,
      available: true,
      lastFetchedAt: 0,
      saving: false,
      recap: null,
      recapFetchedDay: null,
      dismissedRecapWeek: null,
      pendingBadges: [],
      composeDraft: null,
      owner: null,

      refresh: async (opts) => {
        if (opts?.userId !== undefined && opts.userId !== get().owner) {
          epoch += 1;
          get().reset();
          set({ owner: opts.userId ?? null });
          inflight = null;
          recapInflight = null;
        }
        const s = get();
        const today = localDayKey();
        const fresh =
          !opts?.force &&
          s.day === today &&
          Date.now() - s.lastFetchedAt < REFRESH_THROTTLE_MS;
        if (fresh) return;
        if (inflight) {
          // A forced refresh (after new activity) must not reuse a request that started before it.
          if (!opts?.force) return inflight;
          await inflight.catch(() => undefined);
          if (inflight) return inflight;
        }
        set({ loading: true });
        const myEpoch = epoch;
        inflight = (async () => {
          try {
            const res = await getToday();
            if (myEpoch !== epoch) return;
            set({
              streak: res?.streak ?? null,
              checkin: res?.checkin ?? null,
              lifeMode: res && 'life_mode' in res ? toLifeMode(res.life_mode) : null,
              day: res?.streak?.today || today,
              loaded: true,
              available: !!res?.streak,
              lastFetchedAt: Date.now(),
            });
          } catch {
            if (myEpoch !== epoch) return;
            // Backend not deployed yet / offline: keep what we have, hide the card if nothing.
            const cur = get();
            set({
              loaded: true,
              available: !!cur.streak && cur.day === today,
              lastFetchedAt: Date.now(),
            });
          } finally {
            if (myEpoch === epoch) {
              set({ loading: false });
              inflight = null;
            }
          }
        })();
        return inflight;
      },

      refreshRecap: async (opts) => {
        const today = localDayKey();
        if (!opts?.force && get().recapFetchedDay === today) return;
        if (recapInflight) return recapInflight;
        const myEpoch = epoch;
        recapInflight = (async () => {
          try {
            const recap = await getWeeklyRecap();
            if (myEpoch === epoch) set({ recap: recap ?? null, recapFetchedDay: today });
          } catch {
            if (myEpoch === epoch) set({ recap: null, recapFetchedDay: today });
          } finally {
            if (myEpoch === epoch) recapInflight = null;
          }
        })();
        return recapInflight;
      },

      saveCheckin: async (input) => {
        set({ saving: true });
        try {
          const idempotencyKey = checkinKeyFor(input);
          const res = await saveToday(input, { idempotencyKey });
          if (pendingSave?.key === idempotencyKey) pendingSave = null;
          set({
            checkin: res.checkin,
            streak: res.streak ?? get().streak,
            day: res.checkin?.day || localDayKey(),
            available: true,
            loaded: true,
            lastFetchedAt: Date.now(),
          });
          get().pushBadges(res.new_badges);
          return res;
        } finally {
          set({ saving: false });
        }
      },

      pushBadges: (badges) => {
        if (!Array.isArray(badges) || badges.length === 0) return;
        const queue = get().pendingBadges;
        const seen = new Set(queue.map((b) => b.id));
        const next = [...queue];
        for (const b of badges) {
          if (b && b.id && !seen.has(b.id)) {
            seen.add(b.id);
            next.push(b);
          }
        }
        if (next.length !== queue.length) set({ pendingBadges: next });
      },

      takeBadges: () => {
        const queue = get().pendingBadges;
        if (queue.length) set({ pendingBadges: [] });
        return queue;
      },

      dismissRecap: (week) => set({ dismissedRecapWeek: week }),

      setComposeDraft: (draft) => set({ composeDraft: draft }),

      takeComposeDraft: () => {
        const draft = get().composeDraft;
        if (draft) set({ composeDraft: null });
        return draft;
      },

      reset: () =>
        set({
          streak: null,
          checkin: null,
          lifeMode: null,
          day: null,
          loaded: false,
          available: true,
          lastFetchedAt: 0,
          recap: null,
          recapFetchedDay: null,
          pendingBadges: [],
          composeDraft: null,
        }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => secureStateStorage),
      partialize: (s) => ({ dismissedRecapWeek: s.dismissedRecapWeek }),
    }
  )
);

/** Convenience for non-React callers (e.g. after creating a post or story). */
export function refreshGrowth(force = true): void {
  void useGrowthStore.getState().refresh({ force });
}
