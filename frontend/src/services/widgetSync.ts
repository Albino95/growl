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
import { ApiError, request } from './api/http';
import {
  buildWidgetSnapshot,
  circleToWidgetFriends,
  widgetDayKey,
  widgetSnapshotSignature,
  WIDGET_SNAPSHOT_KEY,
  type CircleTodayFriend,
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

/** Friends who checked in today (GET /me/circle/today), refreshed at most every 10 min. */
const FRIENDS_TTL_MS = 10 * 60_000;
let friends: WidgetFriend[] = [];
let friendsFetchedAt = 0;
let friendsInFlight = false;
/** Backend without the endpoint (404): stop asking for this session. */
let friendsUnsupported = false;
/** Account the cached list belongs to (user id, so token refreshes don't refetch). */
let friendsForUser: string | null = null;
let friendsDay: string | null = null;

function friendsCheckedInToday(): WidgetFriend[] {
  // Yesterday's circle never leaks into a new day while waiting for the next fetch.
  return friendsDay === widgetDayKey(new Date()) ? friends : [];
}

/**
 * Fetch the circle for the widget. Throttled to once per FRIENDS_TTL_MS unless
 * `force` (the user just checked in). Never throws; a failure keeps the last list.
 */
async function refreshFriends(force = false): Promise<void> {
  if (friendsUnsupported || friendsInFlight) return;
  const auth = store.getState().auth;
  const owner = auth.token ? auth.user?.id ?? 'me' : null;
  if (!owner) return;
  const fresh =
    friendsForUser === owner &&
    friendsDay === widgetDayKey(new Date()) &&
    Date.now() - friendsFetchedAt < FRIENDS_TTL_MS;
  if (!force && fresh) return;
  friendsInFlight = true;
  try {
    const res = await request<{ success: boolean; data: { friends: CircleTodayFriend[] } }>(
      '/me/circle/today'
    );
    // Signed out / switched account while in flight: drop the result.
    const now = store.getState().auth;
    if (!now.token || (now.user?.id ?? 'me') !== owner) return;
    friends = circleToWidgetFriends(res?.data?.friends);
    friendsDay = widgetDayKey(new Date());
    friendsFetchedAt = Date.now();
    friendsForUser = owner;
    scheduleSync();
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) friendsUnsupported = true;
    const today = widgetDayKey(new Date());
    if (friendsDay !== today) {
      friends = [];
      friendsDay = today;
    }
    friendsFetchedAt = Date.now(); // don't hammer on errors either
    friendsForUser = owner;
  } finally {
    friendsInFlight = false;
  }
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

  const checkinKey = (c: { day: string; created_at: string } | null) => (c ? `${c.day}|${c.created_at}` : null);
  let lastCheckinId = checkinKey(useGrowthStore.getState().checkin);
  useGrowthStore.subscribe((g) => {
    scheduleSync();
    // The user just checked in: friends' dots are most interesting right now.
    const id = checkinKey(g.checkin);
    if (id && id !== lastCheckinId) void refreshFriends(true);
    lastCheckinId = id;
  });
  let last = store.getState().auth;
  store.subscribe(() => {
    const auth = store.getState().auth;
    if (auth.token === last.token && auth.hydrated === last.hydrated) return;
    const owner = auth.token ? auth.user?.id ?? 'me' : null;
    if (owner !== friendsForUser) {
      // Sign in / out / account switch: never show another account's circle.
      friends = [];
      friendsFetchedAt = 0;
      friendsForUser = null;
      if (owner) void refreshFriends();
    }
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
    void refreshFriends(); // throttled to every 10 min
  });

  syncWidgetNow(); // skipped until auth has hydrated; the subscription above catches that
  checkPending();
  void refreshFriends();
}
