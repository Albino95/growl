/**
 * Keeps the iOS "Grow! Today" widget (targets/widget) in sync with the app.
 *
 * `initWidgetSync()` — call once at startup (App.tsx, module scope). It:
 *   - subscribes to useGrowthStore + the auth token and writes a JSON snapshot
 *     to the App Group (`grow.widget.today`), then reloads the widget timeline
 *     (only when the snapshot actually changed);
 *   - on launch and whenever the app comes to the foreground, re-writes (day
 *     rollover) and consumes a mood the widget's AppIntent left behind.
 *
 * No-op on Android / web, in Expo Go and in tests (native module missing).
 */
import { AppState, type AppStateStatus } from 'react-native';
import { useGrowthStore } from '../state/useGrowthStore';
import { store } from '../store/store';
import { getCategoryMeta } from '../utils/categoryLabels';
import {
  buildWidgetSnapshot,
  widgetSnapshotSignature,
  WIDGET_SNAPSHOT_KEY,
  type WidgetFriend,
} from './widgetSnapshot';
import { isWidgetStorageAvailable, reloadWidgets, widgetStorageSet } from './widgetStorage';
import {
  consumePendingWidgetCheckin,
  getWidgetCheckinInFlight,
  onWidgetCheckinChange,
} from './widgetLinks';

const WRITE_DEBOUNCE_MS = 250;
/** The widget's AppIntent may finish writing just after we become active. */
const PENDING_RECHECK_MS = [0, 700, 2000];

let started = false;
let lastSignature: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Friends who checked in today.
 * TODO(widget-friends): no store or endpoint exposes "friends who checked in
 * today" yet. When the API adds it, map to `{ initial, color }` (max 4, no
 * avatars — the widget never loads network images) and return it here.
 */
function friendsCheckedInToday(): WidgetFriend[] {
  return [];
}

function pathLabel(key: string): string {
  return getCategoryMeta(key).parentLabel;
}

/** Builds + writes the snapshot now. `force` rewrites even when unchanged. */
export function syncWidgetNow(force = false): void {
  if (!isWidgetStorageAvailable()) return;
  try {
    const auth = store.getState().auth;
    // Before hydration we don't know who is signed in; don't flash "signed out".
    if (!auth.hydrated) return;
    const g = useGrowthStore.getState();
    // Signed in but /me/today not fetched yet (cold start, account switch):
    // keep the widget's previous snapshot instead of flashing a 0 streak.
    if (auth.token && !g.loaded) return;
    const snapshot = buildWidgetSnapshot({
      signedIn: !!auth.token,
      growth: { streak: g.streak, checkin: g.checkin, lifeMode: g.lifeMode, day: g.day },
      friends: friendsCheckedInToday(),
      pending: getWidgetCheckinInFlight(),
      pathLabel,
    });
    const sig = widgetSnapshotSignature(snapshot);
    if (!force && sig === lastSignature) return;
    if (!widgetStorageSet(WIDGET_SNAPSHOT_KEY, JSON.stringify(snapshot))) return;
    lastSignature = sig;
    reloadWidgets();
  } catch {
    // Never let the widget break the app.
  }
}

function scheduleSync(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    syncWidgetNow();
  }, WRITE_DEBOUNCE_MS);
}

function checkPending(): void {
  for (const ms of PENDING_RECHECK_MS) {
    setTimeout(() => {
      consumePendingWidgetCheckin();
    }, ms);
  }
}

export function initWidgetSync(): void {
  if (started) return;
  if (!isWidgetStorageAvailable()) return;
  started = true;

  useGrowthStore.subscribe(scheduleSync);
  let last = store.getState().auth;
  store.subscribe(() => {
    const auth = store.getState().auth;
    if (auth.token === last.token && auth.hydrated === last.hydrated) return;
    last = auth;
    scheduleSync();
  });
  // A widget check-in starting / settling: show or clear "Checking in…".
  // Forced, because a failed save leaves the store (and so the signature)
  // unchanged while the widget may still show the intent's optimistic state.
  onWidgetCheckinChange(() => syncWidgetNow(true));

  AppState.addEventListener('change', (next: AppStateStatus) => {
    if (next !== 'active') return;
    syncWidgetNow(); // new day since last write → widget shows unchecked
    checkPending();
  });

  syncWidgetNow(); // skipped until auth has hydrated; the subscription above catches that
  checkPending();
}
