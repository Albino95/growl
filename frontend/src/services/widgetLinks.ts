/**
 * Deep links from the iOS "Grow! Today" widget.
 *
 *   growl://home                → Home (Feed tab)
 *   growl://checkin?mood=good   → Home + mood-only check-in (same payload as
 *                                 TodayCard: { mood, path: null, intention: null }),
 *                                 toast "Checked in · Good", haptic('checkin').
 *                                 Already checked in today → just Home.
 *
 * Two transports reach `handleWidgetUrl`:
 *   1. The URL scheme — wired in src/app/navigation/linking.ts (cold start via
 *      getInitialURL, warm via the 'url' event).
 *   2. Widget mood buttons (AppIntent, iOS 17 can't open URLs from a widget
 *      intent) store the URL in the App Group; `consumePendingWidgetCheckin`
 *      picks it up when the app becomes active (driven by widgetSync.ts).
 *
 * Every path waits for auth hydration + a ready navigator; signed out → no-op.
 */
import { CommonActions } from '@react-navigation/native';
import { navigationRef } from '../app/navigation/navigationRef';
import { store } from '../store/store';
import { useGrowthStore } from '../state/useGrowthStore';
import { toast } from '../state/useToastStore';
import { haptic } from '../theme/haptics';
import { checkinMoodMeta } from '../components/recap/growthMeta';
import { localDayKey } from './api/http';
import { parsePendingWidgetCheckin, parseWidgetUrl, type WidgetLink } from './widgetUrl';
import { moodToWidgetKey, WIDGET_PENDING_KEY, type WidgetMoodKey } from './widgetSnapshot';
import { widgetStorageGet, widgetStorageRemove } from './widgetStorage';

const READY_TIMEOUT_MS = 20_000;
const READY_POLL_MS = 150;

/** Root routes where we must not jump to Home (signed out / onboarding). */
const BLOCKING_ROUTES = new Set(['Auth', 'Categories']);

let inflight: { mood: WidgetMoodKey; at: number } | null = null;
const listeners = new Set<() => void>();

/** Mood check-in started from the widget and not yet settled (for the optimistic widget state). */
export function getWidgetCheckinInFlight(): { mood: WidgetMoodKey; at: number } | null {
  return inflight;
}

/** Notified when a widget check-in starts or settles. Returns unsubscribe. */
export function onWidgetCheckinChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function setInflight(next: typeof inflight): void {
  inflight = next;
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore
    }
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Resolves once signed in + navigator ready; null when signed out / onboarding / timed out. */
async function waitForSignedInApp(): Promise<{ userId: string | null } | null> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const auth = store.getState().auth;
    if (auth.hydrated && !auth.token) return null;
    if (auth.hydrated && auth.token && navigationRef.isReady()) {
      const root = navigationRef.getRootState();
      const current = root?.routes?.[root.index ?? 0]?.name;
      if (current && BLOCKING_ROUTES.has(current)) return null;
      return { userId: auth.user?.id ?? null };
    }
    await sleep(READY_POLL_MS);
  }
  return null;
}

function goHome(): void {
  if (!navigationRef.isReady()) return;
  const names = navigationRef.getRootState()?.routeNames ?? [];
  if (!names.includes('Individual')) return; // business shell: stay where we are
  navigationRef.dispatch(CommonActions.navigate({ name: 'Individual', params: { screen: 'Feed' } }));
}

async function run(link: WidgetLink): Promise<void> {
  const mood = link.kind === 'checkin' ? link.mood : null;
  const key = moodToWidgetKey(mood);
  if (key) {
    if (inflight) return; // a widget check-in is already running
    setInflight({ mood: key, at: Date.now() });
  }
  try {
    const ready = await waitForSignedInApp();
    if (!ready) return;
    goHome();
    if (!mood) return;

    const growth = useGrowthStore.getState();
    // Same call FeedScreen makes: fresh today state for this account.
    await growth.refresh({ force: true, userId: ready.userId }).catch(() => undefined);
    const s = useGrowthStore.getState();
    const today = localDayKey();
    if (s.checkin && (s.checkin.day || s.day) === today) return; // already checked in
    if (s.saving) return; // TodayCard is saving right now

    await s.saveCheckin({ mood, path: null, intention: null });
    const label = checkinMoodMeta(mood)?.label ?? 'Today';
    haptic('checkin');
    toast.success(`Checked in · ${label}`);
  } catch {
    haptic('error');
    toast.info('Couldn’t check in just now. Try again from Today.');
  } finally {
    if (key) setInflight(null);
  }
}

/**
 * Handles a widget deep link. Returns true when `url` is a widget link (the
 * work continues asynchronously), false otherwise so callers can fall through.
 */
export function handleWidgetUrl(url: string | null | undefined): boolean {
  const link = parseWidgetUrl(url);
  if (!link) return false;
  void run(link);
  return true;
}

/** Reads + clears the mood the widget's AppIntent left in the App Group, and runs it. */
export function consumePendingWidgetCheckin(): boolean {
  const raw = widgetStorageGet(WIDGET_PENDING_KEY);
  if (!raw) return false;
  widgetStorageRemove(WIDGET_PENDING_KEY);
  const url = parsePendingWidgetCheckin(raw, Date.now());
  return url ? handleWidgetUrl(url) : false;
}
