import { describe, expect, it } from 'vitest';
import type { WeeklyRecap } from '../../services/api/growth';
import {
  firstNameOf,
  followupReply,
  isEvening,
  isRecapWindow,
  isStreakMilestone,
  moodReply,
  recapDayStatuses,
  recapStatChips,
  shouldShowRecap,
  topLevelPaths,
  welcomeBackLine,
} from './growthMeta';

// 2026-11-16 is a Monday.
const day = (d: number, h = 10) => new Date(2026, 10, d, h, 0, 0);

const recap = (over: Partial<WeeklyRecap> = {}): WeeklyRecap => ({
  week: '2026-W46',
  start: '2026-11-09',
  end: '2026-11-15',
  is_first_week: false,
  empty: false,
  active_days: 4,
  days: [],
  current_streak: 3,
  posts: 2,
  reels: 0,
  stories: 1,
  journal_entries: 3,
  checkins: 4,
  encouragement_received: 5,
  new_friends: 0,
  top_path: 'fitness',
  badges_earned: [],
  avg_mood: 3.5,
  reflection: 'Steady week.',
  ...over,
});

describe('recap visibility', () => {
  it('is only open Monday to Wednesday', () => {
    expect(isRecapWindow(day(15))).toBe(false); // Sun
    expect(isRecapWindow(day(16))).toBe(true); // Mon
    expect(isRecapWindow(day(17))).toBe(true); // Tue
    expect(isRecapWindow(day(18))).toBe(true); // Wed
    expect(isRecapWindow(day(19))).toBe(false); // Thu
    expect(isRecapWindow(day(21))).toBe(false); // Sat
  });

  it('shows non-empty or first-week recaps, hides dismissed weeks', () => {
    const mon = day(16);
    expect(shouldShowRecap(recap(), null, mon)).toBe(true);
    expect(shouldShowRecap(recap(), '2026-W46', mon)).toBe(false);
    expect(shouldShowRecap(recap(), '2026-W45', mon)).toBe(true);
    expect(shouldShowRecap(recap({ empty: true }), null, mon)).toBe(false);
    expect(shouldShowRecap(recap({ empty: true, is_first_week: true }), null, mon)).toBe(true);
    expect(shouldShowRecap(recap(), null, day(19))).toBe(false);
    expect(shouldShowRecap(null, null, mon)).toBe(false);
  });
});

describe('Today copy', () => {
  it('replies by mood', () => {
    expect(moodReply(1)).toMatch(/Small is enough/);
    expect(moodReply(2)).toMatch(/Small is enough/);
    expect(moodReply(3)).toMatch(/Steady counts/);
    expect(moodReply(5)).toMatch(/Go grow/);
  });

  it('follow-up replies', () => {
    expect(followupReply('yes')).toMatch(/Proud of you/);
    expect(followupReply('partly')).toMatch(/still forward/);
    expect(followupReply('no')).toMatch(/fresh page/);
    expect(followupReply(null)).toBeNull();
  });

  it('welcome back only after a streak ended', () => {
    expect(welcomeBackLine(0, 12)).toBe(
      "Welcome back. Your longest streak, 12 days, is safe. Today's a fresh start."
    );
    expect(welcomeBackLine(3, 12)).toBeNull();
    expect(welcomeBackLine(0, 0)).toBeNull();
  });

  it('evening starts at 18:00 local', () => {
    expect(isEvening(day(16, 17))).toBe(false);
    expect(isEvening(day(16, 18))).toBe(true);
  });

  it('milestones', () => {
    expect([3, 7, 30, 100].every(isStreakMilestone)).toBe(true);
    expect(isStreakMilestone(4)).toBe(false);
  });
});

describe('helpers', () => {
  it('top-level paths de-duplicate subcategories', () => {
    expect(topLevelPaths(['fitness:running', 'fitness', 'mindset', '', 3])).toEqual(['fitness', 'mindset']);
    expect(topLevelPaths(undefined)).toEqual([]);
  });

  it('first names', () => {
    expect(firstNameOf('albi_95')).toBe('Albi');
    expect(firstNameOf('  ')).toBe('');
  });

  it('recap chips and dots', () => {
    expect(recapStatChips(recap(), (p) => p.toUpperCase())).toEqual([
      '4 active days',
      'Most in FITNESS',
      '5 cheers received',
    ]);
    expect(recapStatChips(recap({ top_path: null, encouragement_received: 0 }))).toEqual([
      '4 active days',
      '4 check-ins',
    ]);
    expect(
      recapDayStatuses([
        { day: 'a', active: true, rest: false },
        { day: 'b', active: false, rest: true },
        { day: 'c', active: false, rest: false },
      ]).map((d) => d.status)
    ).toEqual(['active', 'rest', 'missed']);
  });
});
