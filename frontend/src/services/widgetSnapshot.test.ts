import { describe, expect, it } from 'vitest';
import type { Checkin, Streak } from './api/growth';
import { CHECKIN_MOODS } from '../components/recap/growthMeta';
import {
  buildWidgetSnapshot,
  moodToWidgetKey,
  WIDGET_MOOD_KEYS,
  widgetDayKey,
  widgetKeyToMood,
  widgetSnapshotSignature,
} from './widgetSnapshot';

const NOW = new Date(2026, 10, 14, 9, 30); // 2026-11-14 local
const TODAY = '2026-11-14';

const streak: Streak = {
  current: 12,
  longest: 20,
  total_days: 40,
  rest_days_left: 2,
  last_active_day: '2026-11-13',
  today_done: false,
  today: TODAY,
  week: [
    { day: '2026-11-09', status: 'active' },
    { day: '2026-11-10', status: 'rest' },
    { day: '2026-11-11', status: 'missed' },
    { day: '2026-11-12', status: 'active' },
    { day: '2026-11-13', status: 'active' },
    { day: '2026-11-14', status: 'today' },
    { day: '2026-11-15', status: 'future' },
  ],
};

function checkin(over: Partial<Checkin> = {}): Checkin {
  return {
    day: TODAY,
    mood: 4,
    path: 'fitness:cardio',
    intention: null,
    rest: false,
    followup: null,
    created_at: '2026-11-14T08:00:00Z',
    ...over,
  };
}

describe('mood keys', () => {
  it('maps 1…5 to the CHECKIN_MOODS labels in order', () => {
    expect(WIDGET_MOOD_KEYS).toEqual(CHECKIN_MOODS.map((m) => m.label.toLowerCase()));
    expect(moodToWidgetKey(1)).toBe('heavy');
    expect(moodToWidgetKey(5)).toBe('bright');
    expect(moodToWidgetKey(0)).toBeNull();
    expect(moodToWidgetKey(2.5)).toBeNull();
    expect(moodToWidgetKey(null)).toBeNull();
  });

  it('parses keys back, case-insensitively', () => {
    expect(widgetKeyToMood('good')).toBe(4);
    expect(widgetKeyToMood(' Bright ')).toBe(5);
    expect(widgetKeyToMood('meh')).toBeNull();
    expect(widgetKeyToMood(undefined)).toBeNull();
  });
});

describe('widgetDayKey', () => {
  it('formats the local day', () => {
    expect(widgetDayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('buildWidgetSnapshot', () => {
  const growth = { streak, checkin: null, lifeMode: null, day: TODAY };

  it('signed out publishes nothing personal', () => {
    const s = buildWidgetSnapshot({ signedIn: false, growth: { ...growth, checkin: checkin() }, now: NOW });
    expect(s).toMatchObject({
      signedIn: false,
      day: TODAY,
      streak: null,
      checkedIn: false,
      mood: null,
      path: null,
      week: [],
      friends: [],
    });
    expect(s.updatedAt).toBe(NOW.getTime());
  });

  it('not checked in yet', () => {
    const s = buildWidgetSnapshot({ signedIn: true, growth, now: NOW });
    expect(s).toMatchObject({
      v: 1,
      signedIn: true,
      day: TODAY,
      streak: 12,
      checkedIn: false,
      mood: null,
      restDay: false,
      restDaysLeft: 2,
      lifeMode: null,
    });
    expect(s.week).toHaveLength(7);
    expect(s.week[0]).toEqual({ day: '2026-11-09', status: 'active' });
  });

  it('checked in today with a mood + path label', () => {
    const s = buildWidgetSnapshot({
      signedIn: true,
      growth: { ...growth, checkin: checkin() },
      now: NOW,
      pathLabel: (k) => (k.startsWith('fitness') ? 'Fitness' : k),
    });
    expect(s).toMatchObject({ checkedIn: true, mood: 'good', path: 'Fitness', restDay: false });
  });

  it('falls back to the raw path key without a resolver, and survives a throwing one', () => {
    const c = { ...growth, checkin: checkin() };
    expect(buildWidgetSnapshot({ signedIn: true, growth: c, now: NOW }).path).toBe('fitness:cardio');
    const s = buildWidgetSnapshot({
      signedIn: true,
      growth: c,
      now: NOW,
      pathLabel: () => {
        throw new Error('boom');
      },
    });
    expect(s.path).toBeNull();
    expect(s.checkedIn).toBe(true);
  });

  it('a check-in from yesterday reads as not checked in', () => {
    const s = buildWidgetSnapshot({
      signedIn: true,
      growth: { ...growth, checkin: checkin({ day: '2026-11-13' }), day: '2026-11-13' },
      now: NOW,
    });
    expect(s).toMatchObject({ day: TODAY, checkedIn: false, mood: null, path: null });
  });

  it('rest day', () => {
    const s = buildWidgetSnapshot({
      signedIn: true,
      growth: { ...growth, checkin: checkin({ rest: true, mood: null, path: null }) },
      now: NOW,
    });
    expect(s).toMatchObject({ restDay: true, checkedIn: false, mood: null });
  });

  it('active life mode → kind + label; expired → none', () => {
    const on = buildWidgetSnapshot({
      signedIn: true,
      growth: { ...growth, lifeMode: { mode: 'travel', until: '2026-11-20' } },
      now: NOW,
    });
    expect(on).toMatchObject({ lifeMode: 'travel', lifeModeLabel: 'Travelling' });
    const off = buildWidgetSnapshot({
      signedIn: true,
      growth: { ...growth, lifeMode: { mode: 'sick', until: '2026-11-01' } },
      now: NOW,
    });
    expect(off).toMatchObject({ lifeMode: null, lifeModeLabel: null });
    const none = buildWidgetSnapshot({
      signedIn: true,
      growth: { ...growth, lifeMode: { mode: 'none', until: null } },
      now: NOW,
    });
    expect(none.lifeMode).toBeNull();
  });

  it('cleans friends: initials only, max 4, safe colours', () => {
    const s = buildWidgetSnapshot({
      signedIn: true,
      growth,
      now: NOW,
      friends: [
        { initial: 'maria', color: '#F59E0B' },
        { initial: '', color: '#000000' },
        { initial: 'j', color: 'red' },
        { initial: 'A', color: '#6366F1' },
        { initial: 'B', color: '#6366F1' },
        { initial: 'C', color: '#6366F1' },
      ],
    });
    expect(s.friends).toEqual([
      { initial: 'M', color: '#F59E0B' },
      { initial: 'J', color: '#059669' },
      { initial: 'A', color: '#6366F1' },
      { initial: 'B', color: '#6366F1' },
    ]);
  });

  it('keeps the optimistic pending state until the check-in lands', () => {
    const pending = { mood: 'good' as const, at: NOW.getTime() };
    expect(buildWidgetSnapshot({ signedIn: true, growth, now: NOW, pending }).pending).toEqual(pending);
    expect(
      buildWidgetSnapshot({ signedIn: true, growth: { ...growth, checkin: checkin() }, now: NOW, pending })
        .pending
    ).toBeNull();
  });

  it('missing streak (backend unavailable) → null streak, empty week', () => {
    const s = buildWidgetSnapshot({ signedIn: true, growth: { ...growth, streak: null }, now: NOW });
    expect(s).toMatchObject({ streak: null, restDaysLeft: null, week: [] });
  });

  it('signature ignores updatedAt only', () => {
    const a = buildWidgetSnapshot({ signedIn: true, growth, now: NOW });
    const b = buildWidgetSnapshot({ signedIn: true, growth, now: new Date(NOW.getTime() + 1000) });
    expect(widgetSnapshotSignature(a)).toBe(widgetSnapshotSignature(b));
    const c = buildWidgetSnapshot({ signedIn: true, growth: { ...growth, checkin: checkin() }, now: NOW });
    expect(widgetSnapshotSignature(c)).not.toBe(widgetSnapshotSignature(a));
  });

  it('serialises to JSON the Swift decoder understands (flat, no undefined)', () => {
    const s = buildWidgetSnapshot({ signedIn: true, growth: { ...growth, checkin: checkin() }, now: NOW });
    const round = JSON.parse(JSON.stringify(s));
    expect(round).toEqual(s);
  });
});
