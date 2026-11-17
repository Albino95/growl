/**
 * Daily check-in reminder — local notifications only, at most one per day.
 *
 * `initReminders()` (call once after auth hydration) wires everything:
 *   - foreground handler: banner + list, no sound, no badge (calm);
 *   - schedules one DATE trigger per day for the next 7 days at the chosen
 *     time (not a repeating trigger), so "checked in today" cancels just today;
 *   - skips today once checked in, skips life-mode days, pauses after
 *     IGNORE_LIMIT unanswered reminders (ReminderHost then asks "Keep / Turn off");
 *   - re-plans on growth changes (check-in, life mode), prefs changes and app foreground;
 *   - tapping a reminder opens Home and spotlights the Today card.
 *
 * Pure rules live in reminderPlan.ts (unit-tested).
 */
import { AppState, Platform, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import { CommonActions } from '@react-navigation/native';
import { navigationRef } from '../app/navigation/navigationRef';
import { useGrowthStore } from '../state/useGrowthStore';
import { useReminderStore, whenRemindersHydrated } from '../state/useReminderStore';
import { useDemoTutorialStore } from '../state/useDemoTutorialStore';
import {
  dayKey,
  planReminderDates,
  reminderCopyFor,
  settleIgnored,
  type ScheduledReminder,
} from './reminderPlan';

export const REMINDER_KIND = 'daily-checkin';
const ID_PREFIX = 'grow-checkin-';
const ANDROID_CHANNEL_ID = 'daily-checkin';

export type ReminderPermission = { granted: boolean; canAskAgain: boolean };

const supported = Platform.OS === 'ios' || Platform.OS === 'android';

let initialized = false;
/** False while signed out (ReminderHost toggles it) — nothing stays scheduled. */
let active = true;
let channelReady: Promise<void> | null = null;

/* ------------------------------------------------------------------ permission */

export async function getReminderPermission(): Promise<ReminderPermission> {
  if (!supported) return { granted: false, canAskAgain: false };
  try {
    const p = await Notifications.getPermissionsAsync();
    return { granted: isGranted(p), canAskAgain: p.canAskAgain !== false };
  } catch {
    return { granted: false, canAskAgain: false };
  }
}

/** Shows the system prompt when it still can; otherwise just reports the current state. */
export async function requestReminderPermission(): Promise<ReminderPermission> {
  if (!supported) return { granted: false, canAskAgain: false };
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (isGranted(cur)) return { granted: true, canAskAgain: true };
    if (cur.canAskAgain === false) return { granted: false, canAskAgain: false };
    await ensureAndroidChannel();
    const p = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: true },
    });
    return { granted: isGranted(p), canAskAgain: p.canAskAgain !== false };
  } catch {
    return { granted: false, canAskAgain: false };
  }
}

function isGranted(p: Notifications.NotificationPermissionsStatus): boolean {
  if (p.granted || p.status === 'granted') return true;
  const ios = p.ios?.status;
  return (
    ios === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    ios === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
}

/**
 * Turn the daily reminder on at hour:minute (asks the OS when needed).
 * Returns the permission result; settings are only switched on when granted.
 */
export async function enableDailyReminder(
  hour: number,
  minute: number,
): Promise<ReminderPermission> {
  const perm = await requestReminderPermission();
  if (perm.granted) {
    const s = useReminderStore.getState();
    s.setTime(hour, minute);
    s.setEnabled(true);
  }
  return perm;
}

export function disableDailyReminder(): void {
  useReminderStore.getState().setEnabled(false);
}

/** Signed out → cancel everything; signed in → plan again. */
export function setRemindersActive(next: boolean): void {
  if (active === next) return;
  active = next;
  requestReplan();
}

/* ------------------------------------------------------------------ planning */

function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  if (!channelReady) {
    channelReady = Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Daily check-in',
      description: 'One gentle nudge a day. Skipped when you’ve already checked in.',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: null,
      enableVibrate: false,
      showBadge: false,
    })
      .then(() => undefined)
      .catch(() => {
        channelReady = null;
      });
  }
  return channelReady;
}

function checkedInToday(now: Date): boolean {
  const g = useGrowthStore.getState();
  if (!g.checkin) return false;
  const today = dayKey(now);
  return (g.checkin.day || g.day) === today;
}

async function cancelOurs(): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all
      .filter(
        (n) =>
          n.identifier.startsWith(ID_PREFIX) ||
          (n.content?.data as { kind?: unknown } | undefined)?.kind === REMINDER_KIND,
      )
      .map((n) =>
        Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => undefined),
      ),
  );
}

/** Cancel + reschedule the next 7 days. Safe to call often (serialised, coalesced). */
export async function replanReminders(now: Date = new Date()): Promise<void> {
  if (!supported) return;
  await whenRemindersHydrated();
  const store = useReminderStore.getState();

  if (checkedInToday(now)) store.recordCheckinDay(dayKey(now));
  const { checkinDays } = useReminderStore.getState();

  // Auto-quiet bookkeeping first (it may pause the plan).
  const settled = settleIgnored({
    now,
    scheduled: store.scheduled,
    checkinDays,
    ignoredCount: store.ignoredCount,
  });

  const perm = active && store.enabled ? await getReminderPermission() : null;
  const dates = perm?.granted
    ? planReminderDates({
        now,
        enabled: store.enabled,
        hour: store.hour,
        minute: store.minute,
        checkedInToday: checkedInToday(now),
        lifeMode: useGrowthStore.getState().lifeMode,
        ignoredCount: settled.ignoredCount,
      })
    : [];

  await cancelOurs();
  await ensureAndroidChannel();
  const planned: ScheduledReminder[] = [];
  for (const at of dates) {
    const day = dayKey(at);
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: `${ID_PREFIX}${day}`,
        content: {
          title: 'Grow!',
          body: reminderCopyFor(at),
          sound: false,
          data: { kind: REMINDER_KIND, day },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: at,
          ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
        },
      });
      planned.push({ day, at: at.getTime() });
    } catch {
      /* one bad slot shouldn't stop the rest */
    }
  }

  useReminderStore.getState().setBookkeeping({
    ignoredCount: settled.ignoredCount,
    // Keep fired-but-open reminders (today, not yet answered) for the next settle.
    scheduled: [...settled.open, ...planned],
  });
}

let chain: Promise<void> = Promise.resolve();
let queued = false;

function requestReplan(): void {
  if (!supported || !initialized || queued) return;
  queued = true;
  chain = chain
    .then(() => {
      queued = false;
      return replanReminders();
    })
    .catch(() => {
      queued = false;
    });
}

/* ------------------------------------------------------------------ taps */

const handledResponses = new Set<string>();

function handleResponse(res: Notifications.NotificationResponse | null): void {
  if (!res) return;
  const req = res.notification.request;
  const data = req.content.data as { kind?: unknown; day?: unknown } | undefined;
  if (data?.kind !== REMINDER_KIND) return;
  if (handledResponses.has(req.identifier + res.notification.date)) return;
  handledResponses.add(req.identifier + res.notification.date);

  // Opening the reminder counts as answering it.
  const s = useReminderStore.getState();
  s.resetIgnored();
  if (typeof data.day === 'string') {
    s.setBookkeeping({ scheduled: s.scheduled.filter((r) => r.day !== data.day) });
  }
  Notifications.clearLastNotificationResponseAsync?.().catch(() => undefined);
  void openTodayCard();
}

async function waitForNavigation(timeoutMs = 10_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (navigationRef.isReady()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return navigationRef.isReady();
}

/** Home tab + Today card spotlight (individual accounts; no-op elsewhere). */
async function openTodayCard(): Promise<void> {
  if (!(await waitForNavigation())) return;
  const root = navigationRef.getRootState();
  if (!root?.routeNames?.includes('Individual')) return;
  navigationRef.dispatch(
    CommonActions.navigate({ name: 'Individual', params: { screen: 'Feed' } }),
  );
  void useGrowthStore.getState().refresh();
  // Let Home mount first so CheckInSpotlight sees the request as new.
  setTimeout(() => {
    if (!checkedInToday(new Date())) useDemoTutorialStore.getState().requestCheckInSpotlight();
  }, 600);
}

/* ------------------------------------------------------------------ init */

/** Call once after auth hydration. Returns a cleanup (tests / hot reload). */
export function initReminders(): () => void {
  if (!supported || initialized) return () => undefined;
  initialized = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  // Growth: today's check-in or life mode changed → re-plan.
  const growthSig = () => {
    const g = useGrowthStore.getState();
    return `${checkedInToday(new Date()) ? 1 : 0}|${g.lifeMode?.mode ?? ''}|${g.lifeMode?.until ?? ''}`;
  };
  let lastGrowth = growthSig();
  const unsubGrowth = useGrowthStore.subscribe(() => {
    const sig = growthSig();
    if (sig === lastGrowth) return;
    lastGrowth = sig;
    requestReplan();
  });

  // Prefs: on/off, time, "Keep reminders" after a pause → re-plan.
  const prefsSig = () => {
    const s = useReminderStore.getState();
    return `${s.enabled ? 1 : 0}|${s.hour}:${s.minute}|${s.ignoredCount}`;
  };
  let lastPrefs = prefsSig();
  const unsubPrefs = useReminderStore.subscribe(() => {
    const sig = prefsSig();
    if (sig === lastPrefs) return;
    lastPrefs = sig;
    requestReplan();
  });

  // Foreground: settle ignored reminders, roll the 7-day window forward.
  let appState: AppStateStatus = AppState.currentState;
  const appSub = AppState.addEventListener('change', (next) => {
    if (next === 'active' && appState !== 'active') requestReplan();
    appState = next;
  });

  const tapSub = Notifications.addNotificationResponseReceivedListener(handleResponse);
  // Cold start from a reminder tap.
  Notifications.getLastNotificationResponseAsync()
    .then(handleResponse)
    .catch(() => undefined);

  requestReplan();

  return () => {
    unsubGrowth();
    unsubPrefs();
    appSub.remove();
    tapSub.remove();
    initialized = false;
  };
}
