import { describe, it, expect } from 'vitest';
import {
  ASK_COOLDOWN_MS,
  IGNORE_LIMIT,
  MAX_ASKS,
  REMINDER_COPY,
  createCheckinSaveTracker,
  dayKey,
  defaultReminderTime,
  formatReminderTime,
  halfHourSlots,
  lifeModeCovers,
  planReminderDates,
  reminderCopyFor,
  settleIgnored,
  shouldOfferReminder,
} from './reminderPlan';

// Sat 14 Nov 2026, 10:15 local.
const NOW = new Date(2026, 10, 14, 10, 15);
const base = {
  now: NOW,
  enabled: true,
  hour: 20,
  minute: 30,
  checkedInToday: false,
  lifeMode: null,
  ignoredCount: 0,
};

const keys = (ds: Date[]) => ds.map((d) => `${dayKey(d)} ${d.getHours()}:${d.getMinutes()}`);

describe('planReminderDates', () => {
  it('schedules one reminder per day for 7 days, today included when still ahead', () => {
    const out = planReminderDates(base);
    expect(out).toHaveLength(7);
    expect(keys(out)[0]).toBe('2026-11-14 20:30');
    expect(keys(out)[6]).toBe('2026-11-20 20:30');
    // At most one per day.
    expect(new Set(out.map(dayKey)).size).toBe(out.length);
  });

  it('skips today once checked in', () => {
    const out = planReminderDates({ ...base, checkedInToday: true });
    expect(out).toHaveLength(6);
    expect(dayKey(out[0])).toBe('2026-11-15');
  });

  it('skips today when the time has already passed', () => {
    const out = planReminderDates({ ...base, hour: 9, minute: 0 });
    expect(dayKey(out[0])).toBe('2026-11-15');
    expect(out).toHaveLength(6);
    // Exactly now counts as passed.
    expect(planReminderDates({ ...base, hour: 10, minute: 15 })).toHaveLength(6);
  });

  it('skips life-mode days through `until` (inclusive)', () => {
    const out = planReminderDates({ ...base, lifeMode: { mode: 'sick', until: '2026-11-16' } });
    expect(out.map(dayKey)).toEqual(['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']);
  });

  it('open-ended life mode → no reminders; mode none → normal', () => {
    expect(planReminderDates({ ...base, lifeMode: { mode: 'travel', until: null } })).toEqual([]);
    expect(planReminderDates({ ...base, lifeMode: { mode: 'none', until: null } })).toHaveLength(7);
  });

  it('nothing when disabled or paused after ignored reminders', () => {
    expect(planReminderDates({ ...base, enabled: false })).toEqual([]);
    expect(planReminderDates({ ...base, ignoredCount: IGNORE_LIMIT })).toEqual([]);
    expect(planReminderDates({ ...base, ignoredCount: IGNORE_LIMIT - 1 })).toHaveLength(7);
  });

  it('crosses month / year boundaries with local wall-clock times', () => {
    const out = planReminderDates({
      ...base,
      now: new Date(2026, 11, 29, 8, 0),
      hour: 7,
      minute: 0,
    });
    expect(out.map(dayKey)).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
      '2027-01-04',
    ]);
    expect(out.every((d) => d.getHours() === 7 && d.getMinutes() === 0)).toBe(true);
  });
});

describe('lifeModeCovers', () => {
  it('handles null / none / bad until', () => {
    expect(lifeModeCovers(null, '2026-11-14')).toBe(false);
    expect(lifeModeCovers({ mode: 'none', until: '2026-12-01' }, '2026-11-14')).toBe(false);
    expect(lifeModeCovers({ mode: 'break', until: 'soon' }, '2026-11-14')).toBe(true);
    expect(lifeModeCovers({ mode: 'break', until: '2026-11-14' }, '2026-11-15')).toBe(false);
  });
});

describe('defaultReminderTime', () => {
  it('rounds to the nearest half hour', () => {
    expect(defaultReminderTime(new Date(2026, 0, 1, 8, 14))).toEqual({ hour: 8, minute: 0 });
    expect(defaultReminderTime(new Date(2026, 0, 1, 8, 16))).toEqual({ hour: 8, minute: 30 });
    expect(defaultReminderTime(new Date(2026, 0, 1, 8, 46))).toEqual({ hour: 9, minute: 0 });
  });
  it('stays inside 07:00–21:30', () => {
    expect(defaultReminderTime(new Date(2026, 0, 1, 2, 0))).toEqual({ hour: 7, minute: 0 });
    expect(defaultReminderTime(new Date(2026, 0, 1, 23, 50))).toEqual({ hour: 21, minute: 30 });
  });
});

describe('time slots + labels + copy', () => {
  it('48 half-hour slots with 12h labels', () => {
    const slots = halfHourSlots();
    expect(slots).toHaveLength(48);
    expect(formatReminderTime(0, 0)).toBe('12:00 AM');
    expect(formatReminderTime(12, 30)).toBe('12:30 PM');
    expect(formatReminderTime(20, 0)).toBe('8:00 PM');
  });
  it('rotates copy per day, never repeating on consecutive days, no guilt', () => {
    const a = reminderCopyFor(new Date(2026, 10, 14, 20));
    const b = reminderCopyFor(new Date(2026, 10, 15, 20));
    expect(a).not.toBe(b);
    expect(reminderCopyFor(new Date(2026, 10, 14, 8))).toBe(a);
    expect(REMINDER_COPY.length).toBeGreaterThanOrEqual(5);
    for (const line of REMINDER_COPY)
      expect(line.toLowerCase()).not.toMatch(/streak|lose|miss|don.t/);
  });
});

describe('settleIgnored', () => {
  const at = (d: number, h = 20) => new Date(2026, 10, d, h, 0).getTime();

  it('counts fired reminders on days without a check-in', () => {
    const r = settleIgnored({
      now: NOW,
      scheduled: [
        { day: '2026-11-12', at: at(12) },
        { day: '2026-11-13', at: at(13) },
        { day: '2026-11-15', at: at(15) },
      ],
      checkinDays: [],
      ignoredCount: 1,
    });
    expect(r.ignoredCount).toBe(3);
    expect(r.open).toEqual([]);
  });

  it('a check-in on a reminder day resets the count', () => {
    const r = settleIgnored({
      now: NOW,
      scheduled: [
        { day: '2026-11-11', at: at(11) },
        { day: '2026-11-12', at: at(12) },
        { day: '2026-11-13', at: at(13) },
      ],
      checkinDays: ['2026-11-12'],
      ignoredCount: 2,
    });
    expect(r.ignoredCount).toBe(1);
  });

  it('keeps a reminder that fired today until the day is over', () => {
    const fired = { day: '2026-11-14', at: at(14, 9) };
    const r = settleIgnored({ now: NOW, scheduled: [fired], checkinDays: [], ignoredCount: 0 });
    expect(r).toEqual({ ignoredCount: 0, open: [fired] });
    const answered = settleIgnored({
      now: NOW,
      scheduled: [fired],
      checkinDays: ['2026-11-14'],
      ignoredCount: 2,
    });
    expect(answered).toEqual({ ignoredCount: 0, open: [] });
  });
});

describe('shouldOfferReminder (ask gating)', () => {
  const gate = {
    now: NOW.getTime(),
    enabled: false,
    lastAskedAt: null,
    askCount: 0,
    permission: { granted: false, canAskAgain: true },
    shownThisSession: false,
  };

  it('offers on the first check-in', () => {
    expect(shouldOfferReminder(gate)).toBe(true);
  });
  it('not when already on, or already shown this session', () => {
    expect(shouldOfferReminder({ ...gate, enabled: true })).toBe(false);
    expect(shouldOfferReminder({ ...gate, shownThisSession: true })).toBe(false);
  });
  it('"Not now" holds for 7 days', () => {
    const t = gate.now;
    expect(
      shouldOfferReminder({ ...gate, askCount: 1, lastAskedAt: t - ASK_COOLDOWN_MS + 60_000 }),
    ).toBe(false);
    expect(shouldOfferReminder({ ...gate, askCount: 1, lastAskedAt: t - ASK_COOLDOWN_MS })).toBe(
      true,
    );
  });
  it('stops after MAX_ASKS', () => {
    expect(shouldOfferReminder({ ...gate, askCount: MAX_ASKS, lastAskedAt: 0 })).toBe(false);
  });
  it('not when the OS has blocked prompts (Settings is the only way)', () => {
    expect(
      shouldOfferReminder({ ...gate, permission: { granted: false, canAskAgain: false } }),
    ).toBe(false);
    // Already granted (e.g. earlier) → the soft ask can still switch the reminder on.
    expect(
      shouldOfferReminder({ ...gate, permission: { granted: true, canAskAgain: false } }),
    ).toBe(true);
  });
});

describe('createCheckinSaveTracker', () => {
  const ck = { day: '2026-11-14' };

  it('fires once when a save adds today’s check-in (mid-save updates included)', () => {
    const t = createCheckinSaveTracker();
    expect(t.observe({ saving: false, checkin: null })).toBe(false);
    expect(t.observe({ saving: true, checkin: null })).toBe(false);
    expect(t.observe({ saving: true, checkin: ck })).toBe(false);
    expect(t.observe({ saving: false, checkin: ck })).toBe(true);
    expect(t.observe({ saving: false, checkin: ck })).toBe(false);
  });

  it('ignores failed saves, edits and background refreshes', () => {
    const failed = createCheckinSaveTracker();
    failed.observe({ saving: true, checkin: null });
    expect(failed.observe({ saving: false, checkin: null })).toBe(false);

    const edit = createCheckinSaveTracker();
    edit.observe({ saving: true, checkin: ck });
    expect(edit.observe({ saving: false, checkin: { ...ck } })).toBe(false);

    const refresh = createCheckinSaveTracker();
    refresh.observe({ saving: false, checkin: null });
    expect(refresh.observe({ saving: false, checkin: ck })).toBe(false);
  });
});
