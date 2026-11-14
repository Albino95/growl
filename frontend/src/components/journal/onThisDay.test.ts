import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { excerptOf, onThisDayTargets, pickOnThisDay } from './onThisDay';

const e = (id: string, created_at: string, content = `entry ${id}`) => ({ id, created_at, content });

describe('pickOnThisDay', () => {
  const prevTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'UTC';
  });
  afterAll(() => {
    process.env.TZ = prevTz;
  });

  const now = new Date(2026, 10, 14, 9, 0); // 14 Nov 2026

  it('lists targets year > month > week', () => {
    expect(onThisDayTargets(now)).toEqual([
      { kind: 'year', dateKey: '2025-11-14' },
      { kind: 'month', dateKey: '2026-10-14' },
      { kind: 'week', dateKey: '2026-11-07' },
    ]);
  });

  it('returns null with no matching day', () => {
    expect(pickOnThisDay([e('a', '2026-11-13T10:00:00Z')], now)).toBeNull();
    expect(pickOnThisDay([], now)).toBeNull();
  });

  it('picks a week-ago entry', () => {
    const pick = pickOnThisDay([e('a', '2026-11-07T10:00:00Z')], now);
    expect(pick?.kind).toBe('week');
    expect(pick?.heading).toBe('A week ago you wrote…');
    expect(pick?.entry.id).toBe('a');
  });

  it('prefers year over month over week', () => {
    const entries = [
      e('w', '2026-11-07T10:00:00Z'),
      e('m', '2026-10-14T10:00:00Z'),
      e('y', '2025-11-14T10:00:00Z'),
    ];
    expect(pickOnThisDay(entries, now)?.entry.id).toBe('y');
    expect(pickOnThisDay(entries.slice(0, 2), now)?.entry.id).toBe('m');
  });

  it('picks the first entry written that day and skips blank ones', () => {
    const entries = [
      e('late', '2026-11-07T20:00:00Z'),
      e('blank', '2026-11-07T06:00:00Z', '   '),
      e('early', '2026-11-07T08:00:00Z'),
    ];
    expect(pickOnThisDay(entries, now)?.entry.id).toBe('early');
  });

  it('skips the month match when that day does not exist', () => {
    const march31 = new Date(2026, 2, 31, 9, 0);
    const kinds = onThisDayTargets(march31).map((t) => t.kind);
    expect(kinds).toEqual(['year', 'week']);
    const feb29 = new Date(2028, 1, 29, 9, 0);
    expect(onThisDayTargets(feb29).map((t) => t.kind)).toEqual(['month', 'week']);
  });
});

describe('excerptOf', () => {
  it('keeps short text and trims long text on a word boundary', () => {
    expect(excerptOf('  hello   there ')).toBe('hello there');
    const long = 'word '.repeat(60);
    const out = excerptOf(long);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(121);
    expect(out).not.toMatch(/ …$/);
  });
});
