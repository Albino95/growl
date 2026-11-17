import { create } from 'zustand';
import {
  acceptBuddy,
  declineBuddy,
  endBuddy,
  getBuddies,
  inviteBuddy,
  type BuddiesPayload,
} from '../services/api/buddies';
import { ApiError } from '../services/api/http';
import { buddyName } from '../components/buddies/buddyCopy';
import { celebrateOnce } from '../theme/haptics';
import { toast } from './useToastStore';

/**
 * Shared Path Buddies state for the Buddies screen, the Profile preview, the
 * PublicProfile button and the TodayCard line. `unavailable` = the backend
 * doesn't have /buddies yet (404) → every surface hides the feature.
 */
export type BuddyStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';

type BuddyState = {
  data: BuddiesPayload | null;
  status: BuddyStatus;
  loadedAt: number;
  /** Reload (throttled to once a minute unless `force`). */
  load: (opts?: { force?: boolean }) => Promise<void>;
  invite: (userId: string) => Promise<void>;
  accept: (id: string) => Promise<void>;
  decline: (id: string) => Promise<void>;
  end: (id: string) => Promise<void>;
};

const STALE_MS = 60_000;
let inflight: Promise<void> | null = null;

/** Celebrate each buddy milestone once per device (haptic 'celebrate' + rise sound). */
async function celebrateMilestones(data: BuddiesPayload): Promise<void> {
  for (const b of data.buddies) {
    if (!b.milestone) continue;
    try {
      if (await celebrateOnce(`buddy-${b.id}-${b.milestone.days}`)) {
        toast.success(`${b.milestone.name} with ${buddyName(b.user)} · ${b.milestone.days} days together`, {
          icon: 'leaf',
        });
        return; // one at a time; the next shows on a later load
      }
    } catch {
      /* celebration is best-effort */
    }
  }
}

function isNotDeployed(e: unknown): boolean {
  // GET /buddies itself never 404s once deployed, so any 404 means "not deployed yet".
  return e instanceof ApiError && e.status === 404;
}

export const useBuddyStore = create<BuddyState>((set, get) => ({
  data: null,
  status: 'idle',
  loadedAt: 0,

  load: async (opts = {}) => {
    const { status, loadedAt } = get();
    if (status === 'unavailable') return;
    if (!opts.force && status === 'ready' && Date.now() - loadedAt < STALE_MS) return;
    if (inflight) {
      // A forced reload (after invite/accept/end) must not reuse a fetch that started
      // before the mutation — wait for it, then fetch again.
      if (!opts.force) return inflight;
      await inflight.catch(() => {});
      if (inflight) return inflight;
    }
    if (!get().data) set({ status: 'loading' });
    inflight = (async () => {
      try {
        const data = await getBuddies();
        set({ data, status: 'ready', loadedAt: Date.now() });
        void celebrateMilestones(data);
      } catch (e) {
        if (isNotDeployed(e)) set({ status: 'unavailable', data: null });
        else set({ status: get().data ? 'ready' : 'error' });
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  },

  invite: async (userId) => {
    await inviteBuddy(userId);
    await get().load({ force: true });
  },
  accept: async (id) => {
    await acceptBuddy(id);
    await get().load({ force: true });
  },
  decline: async (id) => {
    await declineBuddy(id);
    await get().load({ force: true });
  },
  end: async (id) => {
    await endBuddy(id);
    await get().load({ force: true });
  },
}));

/** Relationship to one user, for the PublicProfile button. */
export function buddyStateFor(
  data: BuddiesPayload | null,
  userId: string
): { kind: 'none' } | { kind: 'buddies' | 'pending_out' | 'pending_in'; id: string } {
  if (!data) return { kind: 'none' };
  const b = data.buddies.find((x) => x.user.id === userId);
  if (b) return { kind: 'buddies', id: b.id };
  const out = data.invites_out.find((x) => x.user.id === userId);
  if (out) return { kind: 'pending_out', id: out.id };
  const inc = data.invites_in.find((x) => x.user.id === userId);
  if (inc) return { kind: 'pending_in', id: inc.id };
  return { kind: 'none' };
}

/** Slots used toward the cap (active buddies + invites you sent). */
export function buddySlotsUsed(data: BuddiesPayload | null): number {
  return data ? data.buddies.length + data.invites_out.length : 0;
}
