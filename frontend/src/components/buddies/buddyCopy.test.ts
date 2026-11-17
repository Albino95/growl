import { describe, it, expect } from 'vitest';
import { buddiesTodaySummary, buddyStreakLabel, buddyTodayLine } from './buddyCopy';

const user = { id: 'u', username: 'lea_g', display_name: 'Lea Gomez', avatar_url: null };

describe('buddyCopy', () => {
  it('labels the streak calmly', () => {
    expect(buddyStreakLabel(0)).toBe('New pair');
    expect(buddyStreakLabel(1)).toBe('1 day together');
    expect(buddyStreakLabel(8)).toBe('8 days together');
  });

  it('describes today without guilt', () => {
    expect(buddyTodayLine({ user, streak: 3, today: { me: true, them: true } })).toBe('You both showed up today');
    expect(buddyTodayLine({ user, streak: 3, today: { me: true, them: false } })).toBe('Waiting on Lea today');
    expect(buddyTodayLine({ user, streak: 3, today: { me: false, them: true } })).toMatch(/^Lea showed up/);
  });

  it('summarises buddies for the Today card', () => {
    expect(buddiesTodaySummary([])).toBeNull();
    expect(
      buddiesTodaySummary([{ today: { me: true, them: true } }, { today: { me: false, them: true } }])
    ).toBe('2 buddies showed up today');
    expect(buddiesTodaySummary([{ today: { me: true, them: false } }])).toBe('Growing with 1 buddy');
  });
});
