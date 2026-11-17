import { describe, expect, it } from 'vitest';
import { getTimeOfDayGreeting } from './greeting';

const at = (hour: number) => new Date(2026, 10, 13, hour, 30, 0);

describe('getTimeOfDayGreeting', () => {
  it('greets by part of day with the first name', () => {
    expect(getTimeOfDayGreeting('Albi', at(5))).toBe('Good morning, Albi');
    expect(getTimeOfDayGreeting('Albi', at(11))).toBe('Good morning, Albi');
    expect(getTimeOfDayGreeting('Albi', at(12))).toBe('Good afternoon, Albi');
    expect(getTimeOfDayGreeting('Albi', at(17))).toBe('Good afternoon, Albi');
    expect(getTimeOfDayGreeting('Albi', at(18))).toBe('Good evening, Albi');
    expect(getTimeOfDayGreeting('Albi', at(22))).toBe('Good evening, Albi');
  });

  it('says hello to night owls between 23:00 and 04:59', () => {
    expect(getTimeOfDayGreeting('Albi', at(23))).toBe('Hello, night owl');
    expect(getTimeOfDayGreeting(undefined, at(0))).toBe('Hello, night owl');
    expect(getTimeOfDayGreeting('Albi', at(4))).toBe('Hello, night owl');
  });

  it('works without a name and trims / shortens names', () => {
    expect(getTimeOfDayGreeting(undefined, at(9))).toBe('Good morning');
    expect(getTimeOfDayGreeting('   ', at(14))).toBe('Good afternoon');
    expect(getTimeOfDayGreeting('  Albi Ndreu ', at(20))).toBe('Good evening, Albi');
  });
});
