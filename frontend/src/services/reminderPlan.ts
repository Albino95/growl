/**
 * Pure logic for the daily check-in reminder (no React Native / Expo imports,
 * so it is unit-testable). `reminders.ts` wires it to expo-notifications.
 *
 * Rules (calm by design):
 *   - local notifications only, at most ONE per day;
 *   - never on a day the user already checked in;
 *   - never on life-mode days (sick / travel / break);
 *   - after IGNORE_LIMIT reminders in a row went unanswered, pause and ask.
 */

export const REMINDER_DAYS_AHEAD = 7;
/** Unanswered reminders in a row before we pause and ask "Keep reminders?". */
export const IGNORE_LIMIT = 3;
/** "Not now" on the soft ask → don't ask again for a week. */
export const ASK_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
/** Never ask more often than this in total — after that, Settings is the way in. */
export const MAX_ASKS = 3;
/** Default reminder time is clamped into this window (minutes after midnight). */
export const DEFAULT_TIME_MIN = 7 * 60;
export const DEFAULT_TIME_MAX = 21 * 60 + 30;

export type ReminderLifeMode = { mode: string; until: string | null } | null | undefined;

/** One reminder we scheduled (or that already fired): its local day and fire time (ms). */
export type ScheduledReminder = { day: string; at: number };

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local `YYYY-MM-DD` (same format as `localDayKey` in services/api/http). */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** True when life mode covers `day` (inclusive `until`; open-ended = every day). */
export function lifeModeCovers(lm: ReminderLifeMode, day: string): boolean {
  if (!lm || !lm.mode || lm.mode === 'none') return false;
  if (!lm.until || !/^\d{4}-\d{2}-\d{2}$/.test(lm.until)) return true;
  return day <= lm.until;
}

export type PlanInput = {
  now: Date;
  enabled: boolean;
  hour: number;
  minute: number;
  checkedInToday: boolean;
  lifeMode?: ReminderLifeMode;
  ignoredCount: number;
  days?: number;
};

/**
 * Fire dates for the next `days` local days (today included), one per day at
 * hour:minute. Skips today when already checked in or the time has passed,
 * skips life-mode days; empty when disabled or paused after ignored reminders.
 */
export function planReminderDates(input: PlanInput): Date[] {
  const { now, enabled, checkedInToday, lifeMode, ignoredCount } = input;
  if (!enabled || ignoredCount >= IGNORE_LIMIT) return [];
  const hour = clampInt(input.hour, 0, 23);
  const minute = clampInt(input.minute, 0, 59);
  const days = input.days ?? REMINDER_DAYS_AHEAD;
  const out: Date[] = [];
  for (let i = 0; i < days; i++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hour, minute, 0, 0);
    if (i === 0 && (checkedInToday || at.getTime() <= now.getTime())) continue;
    if (lifeModeCovers(lifeMode, dayKey(at))) continue;
    out.push(at);
  }
  return out;
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/**
 * Default time offered in the ask sheet: the moment of the first check-in,
 * rounded to the nearest :00 / :30 and kept inside 07:00–21:30.
 */
export function defaultReminderTime(at: Date): { hour: number; minute: number } {
  let mins = Math.round((at.getHours() * 60 + at.getMinutes()) / 30) * 30;
  mins = Math.max(DEFAULT_TIME_MIN, Math.min(DEFAULT_TIME_MAX, mins));
  return { hour: Math.floor(mins / 60), minute: mins % 60 };
}

/** Every 30 minutes, 00:00 → 23:30 (the settings time list). */
export function halfHourSlots(): { hour: number; minute: number }[] {
  const out: { hour: number; minute: number }[] = [];
  for (let m = 0; m < 24 * 60; m += 30) out.push({ hour: Math.floor(m / 60), minute: m % 60 });
  return out;
}

/** "8:30 AM" style label (device-locale-agnostic, matches the rest of the app's English copy). */
export function formatReminderTime(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${pad(minute)} ${hour < 12 ? 'AM' : 'PM'}`;
}

export const REMINDER_COPY: readonly string[] = [
  'How are you arriving today?',
  'Ten seconds for you.',
  'Your paths are here when you are.',
  'A small pause. How’s today feeling?',
  'One breath, one check-in.',
  'Here whenever you’re ready.',
  'What would make today feel good?',
];

/** Gentle rotation: one line per calendar day, never the same two days running. */
export function reminderCopyFor(at: Date): string {
  const dayIndex = Math.floor(Date.UTC(at.getFullYear(), at.getMonth(), at.getDate()) / 86_400_000);
  return REMINDER_COPY[
    ((dayIndex % REMINDER_COPY.length) + REMINDER_COPY.length) % REMINDER_COPY.length
  ];
}

/**
 * Auto-quiet bookkeeping. Reminders whose fire time has passed are resolved:
 *   - the user checked in that day → answered (ignoredCount back to 0);
 *   - the day is over without a check-in → ignored (+1);
 *   - fired today, not checked in yet → still open (kept).
 * Not-yet-fired entries are dropped (the caller re-plans them).
 */
export function settleIgnored(input: {
  now: Date;
  scheduled: ScheduledReminder[];
  checkinDays: string[];
  ignoredCount: number;
}): { ignoredCount: number; open: ScheduledReminder[] } {
  const today = dayKey(input.now);
  const nowMs = input.now.getTime();
  const checked = new Set(input.checkinDays);
  let ignored = input.ignoredCount;
  const open: ScheduledReminder[] = [];
  const fired = input.scheduled
    .filter((r) => r && typeof r.at === 'number' && r.at <= nowMs)
    .sort((a, b) => a.at - b.at);
  for (const r of fired) {
    if (checked.has(r.day)) ignored = 0;
    else if (r.day < today) ignored += 1;
    else open.push(r);
  }
  return { ignoredCount: ignored, open };
}

export type AskGateInput = {
  now: number;
  /** Daily reminder already on → nothing to ask. */
  enabled: boolean;
  lastAskedAt: number | null;
  askCount: number;
  /** OS permission: denied with no way to re-prompt → Settings is the only route; don't nag. */
  permission: { granted: boolean; canAskAgain: boolean };
  /** Already shown once in this app session. */
  shownThisSession: boolean;
};

/** Whether to show the soft "Want a gentle nudge each day?" sheet after a check-in. */
export function shouldOfferReminder(g: AskGateInput): boolean {
  if (g.enabled || g.shownThisSession) return false;
  if (g.askCount >= MAX_ASKS) return false;
  if (g.lastAskedAt != null && g.now - g.lastAskedAt < ASK_COOLDOWN_MS) return false;
  if (!g.permission.granted && !g.permission.canAskAgain) return false;
  return true;
}

/**
 * Watches growth-store snapshots for a check-in that was just saved: a save
 * (`saving` true → false) that ends with today's check-in present when there
 * was none as the save began. A failed save, an edit of an existing check-in,
 * or a background refresh doesn't count.
 */
export function createCheckinSaveTracker() {
  let saving = false;
  let hadCheckinAtStart = true;
  return {
    observe(s: { saving: boolean; checkin: unknown | null }): boolean {
      if (s.saving && !saving) {
        saving = true;
        hadCheckinAtStart = s.checkin != null;
        return false;
      }
      if (!s.saving && saving) {
        saving = false;
        return !hadCheckinAtStart && s.checkin != null;
      }
      return false;
    },
  };
}
