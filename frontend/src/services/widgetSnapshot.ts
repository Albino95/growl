/**
 * Pure snapshot builder for the iOS "Grow! Today" widget (targets/widget).
 * No React Native imports, so vitest covers it. The Swift mirror is
 * `GrowSnapshot` in targets/widget/_shared/GrowWidgetShared.swift — keep the
 * field names in sync (every Swift field is optional, so adding is safe).
 */
import type { Checkin, Mood, Streak, StreakDayStatus } from './api/growth';
import type { LifeMode } from './api/privacy';
import { isLifeModeActive, LIFE_MODE_LABEL } from '../screens/Profile/lifeMode';

export const WIDGET_APP_GROUP = 'group.app.growl.mobile';
/** UserDefaults key (App Group) holding the JSON snapshot. */
export const WIDGET_SNAPSHOT_KEY = 'grow.widget.today';
/** UserDefaults key the widget's CheckInMoodIntent writes the tapped mood URL to. */
export const WIDGET_PENDING_KEY = 'grow.widget.pendingCheckin';
export const WIDGET_SNAPSHOT_VERSION = 1;

export type WidgetMoodKey = 'heavy' | 'tired' | 'okay' | 'good' | 'bright';

/** Mood scale 1…5 ↔ widget keys (order = CHECKIN_MOODS in growthMeta.ts). */
export const WIDGET_MOOD_KEYS: readonly WidgetMoodKey[] = ['heavy', 'tired', 'okay', 'good', 'bright'];

export function moodToWidgetKey(mood: number | null | undefined): WidgetMoodKey | null {
  if (typeof mood !== 'number' || !Number.isInteger(mood) || mood < 1 || mood > 5) return null;
  return WIDGET_MOOD_KEYS[mood - 1];
}

export function widgetKeyToMood(key: string | null | undefined): Mood | null {
  if (!key) return null;
  const i = WIDGET_MOOD_KEYS.indexOf(key.trim().toLowerCase() as WidgetMoodKey);
  return i === -1 ? null : ((i + 1) as Mood);
}

export type WidgetFriend = { initial: string; color: string };

export type WidgetSnapshot = {
  v: number;
  signedIn: boolean;
  /** Local day (YYYY-MM-DD) this snapshot describes. The widget treats any other day as unchecked. */
  day: string;
  streak: number | null;
  checkedIn: boolean;
  mood: WidgetMoodKey | null;
  /** Human label of today's growth path (e.g. "Fitness"), not the raw key. */
  path: string | null;
  restDay: boolean;
  restDaysLeft: number | null;
  /** Active life mode kind (sick / travel / break) or null. */
  lifeMode: Exclude<LifeMode['mode'], 'none'> | null;
  lifeModeLabel: string | null;
  week: { day: string; status: StreakDayStatus }[];
  /** Friends who checked in today, max 4. Empty until the API exposes it. */
  friends: WidgetFriend[];
  /** Optimistic "Checking in…" while a widget-started check-in is in flight. */
  pending: { mood: WidgetMoodKey; at: number } | null;
  updatedAt: number;
};

export type WidgetSnapshotInput = {
  signedIn: boolean;
  growth: {
    streak: Streak | null;
    checkin: Checkin | null;
    lifeMode: LifeMode | null;
    day: string | null;
  };
  friends?: WidgetFriend[] | null;
  pending?: { mood: WidgetMoodKey; at: number } | null;
  now?: Date;
  /** Path key → display label (the app passes getCategoryMeta(...).parentLabel). */
  pathLabel?: (key: string) => string;
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local calendar day, same format as localDayKey() in services/api/http. */
export function widgetDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const HEX = /^#[0-9a-f]{6}$/i;

function cleanFriends(list: WidgetFriend[] | null | undefined): WidgetFriend[] {
  if (!Array.isArray(list)) return [];
  const out: WidgetFriend[] = [];
  for (const f of list) {
    const initial = (f?.initial ?? '').trim().charAt(0).toUpperCase();
    if (!initial) continue;
    out.push({ initial, color: HEX.test(f.color ?? '') ? f.color : '#059669' });
    if (out.length === 4) break;
  }
  return out;
}

export function buildWidgetSnapshot(input: WidgetSnapshotInput): WidgetSnapshot {
  const now = input.now ?? new Date();
  const today = widgetDayKey(now);
  const base: WidgetSnapshot = {
    v: WIDGET_SNAPSHOT_VERSION,
    signedIn: false,
    day: today,
    streak: null,
    checkedIn: false,
    mood: null,
    path: null,
    restDay: false,
    restDaysLeft: null,
    lifeMode: null,
    lifeModeLabel: null,
    week: [],
    friends: [],
    pending: null,
    updatedAt: now.getTime(),
  };
  // Signed out: publish nothing personal to the home screen.
  if (!input.signedIn) return base;

  const { streak, checkin, lifeMode, day } = input.growth;
  const checkinDay = checkin?.day || day;
  const fresh = !!checkin && checkinDay === today;
  const rest = fresh && !!checkin?.rest;
  const checkedIn = fresh && !rest;
  const mood = checkedIn ? moodToWidgetKey(checkin?.mood) : null;
  const pathKey = checkedIn ? checkin?.path ?? null : null;
  let path: string | null = null;
  if (pathKey) {
    try {
      path = input.pathLabel ? input.pathLabel(pathKey) || null : pathKey;
    } catch {
      path = null;
    }
  }
  const lmActive = isLifeModeActive(lifeMode, now) && lifeMode && lifeMode.mode !== 'none';

  return {
    ...base,
    signedIn: true,
    streak: typeof streak?.current === 'number' ? Math.max(0, Math.floor(streak.current)) : null,
    checkedIn,
    mood,
    path,
    restDay: rest,
    restDaysLeft: typeof streak?.rest_days_left === 'number' ? streak.rest_days_left : null,
    lifeMode: lmActive ? (lifeMode!.mode as WidgetSnapshot['lifeMode']) : null,
    lifeModeLabel: lmActive ? LIFE_MODE_LABEL[lifeMode!.mode] : null,
    week: Array.isArray(streak?.week)
      ? streak!.week.map((w) => ({ day: w.day, status: w.status })).slice(-7)
      : [],
    friends: cleanFriends(input.friends),
    // A finished check-in wins over the optimistic state.
    pending: checkedIn || rest ? null : input.pending ?? null,
  };
}

/** Everything except `updatedAt` — used to skip identical writes. */
export function widgetSnapshotSignature(s: WidgetSnapshot): string {
  const { updatedAt: _ignored, ...rest } = s;
  return JSON.stringify(rest);
}
