import { describe, it, expect } from 'vitest';
import {
  circleWeekHeadline,
  circleWeekSubline,
  daysLabel,
  isCircleWeekDay,
  shouldShowCircleWeek,
} from './circleWeekMeta';
import type { CircleWeek } from '../../services/api/circleWeek';

const SUNDAY = new Date(2026, 10, 15, 18, 0, 0);
const MONDAY = new Date(2026, 10, 16, 9, 0, 0);

const week = (over: Partial<CircleWeek> = {}): CircleWeek => ({
  week_start: '2026-11-09',
  today: '2026-11-15',
  shared: false,
  friends_total: 5,
  friends_active: 3,
  checkins: 7,
  members: [],
  moments: [],
  ...over,
});

describe('gating', () => {
  it('Sunday only, needs friends, respects dismissal', () => {
    expect(isCircleWeekDay(SUNDAY)).toBe(true);
    expect(isCircleWeekDay(MONDAY)).toBe(false);
    expect(shouldShowCircleWeek(week(), null, SUNDAY)).toBe(true);
    expect(shouldShowCircleWeek(week(), null, MONDAY)).toBe(false);
    expect(shouldShowCircleWeek(week({ friends_total: 0 }), null, SUNDAY)).toBe(false);
    expect(shouldShowCircleWeek(week(), '2026-11-09', SUNDAY)).toBe(false);
    expect(shouldShowCircleWeek(week(), '2026-11-02', SUNDAY)).toBe(true);
    expect(shouldShowCircleWeek(null, null, SUNDAY)).toBe(false);
  });
});

describe('copy', () => {
  it('headline', () => {
    expect(circleWeekHeadline({ friends_active: 3, friends_total: 5 })).toBe('3 of 5 friends grew this week');
    expect(circleWeekHeadline({ friends_active: 4, friends_total: 4 })).toBe('All 4 friends grew this week');
    expect(circleWeekHeadline({ friends_active: 1, friends_total: 1 })).toBe('Your friend grew this week');
    expect(circleWeekHeadline({ friends_active: 0, friends_total: 4 })).toBe('Your circle had a quiet week');
  });
  it('subline nudges to share while locked', () => {
    expect(circleWeekSubline({ checkins: 1, shared: false })).toBe(
      '1 check-in so far. Share one moment to see everyone’s week.'
    );
    expect(circleWeekSubline({ checkins: 0, shared: false })).toBe('Share one moment to see everyone’s week.');
    expect(circleWeekSubline({ checkins: 7, shared: true })).toBe('7 check-ins together this week.');
  });
  it('days label', () => {
    expect(daysLabel(1)).toBe('1 day');
    expect(daysLabel(4)).toBe('4 days');
  });
});
