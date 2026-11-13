import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dateKeyFromIso, journalMoodFromCheckin, MOOD_META } from './journalMeta';

describe('dateKeyFromIso (device-local day)', () => {
  const prevTz = process.env.TZ;
  beforeAll(() => {
    // CET/CEST: UTC+1 in November.
    process.env.TZ = 'Europe/Luxembourg';
  });
  afterAll(() => {
    process.env.TZ = prevTz;
  });

  it('moves a late-evening UTC timestamp to the next local day', () => {
    // 23:30 UTC on Nov 12 is 00:30 on Nov 13 in Luxembourg.
    expect(dateKeyFromIso('2026-11-12T23:30:00.000Z')).toBe('2026-11-13');
  });

  it('keeps the same day just before local midnight', () => {
    // 22:59 UTC = 23:59 local, still Nov 12.
    expect(dateKeyFromIso('2026-11-12T22:59:00Z')).toBe('2026-11-12');
  });

  it('treats SQLite datetime strings (no zone) as UTC', () => {
    expect(dateKeyFromIso('2026-11-12 23:30:00')).toBe('2026-11-13');
  });

  it('passes plain day keys through and tolerates junk', () => {
    expect(dateKeyFromIso('2026-11-12')).toBe('2026-11-12');
    expect(dateKeyFromIso('')).toBe('');
  });
});

describe('journalMoodFromCheckin', () => {
  it('maps the 1–5 Today scale to journal mood keys', () => {
    expect(journalMoodFromCheckin(1)).toBe('sad');
    expect(journalMoodFromCheckin(2)).toBe('tired');
    expect(journalMoodFromCheckin(3)).toBe('calm');
    expect(journalMoodFromCheckin(4)).toBe('happy');
    expect(journalMoodFromCheckin(5)).toBe('excited');
    expect(journalMoodFromCheckin(null)).toBeNull();
    expect(journalMoodFromCheckin(9)).toBeNull();
  });

  it('only returns moods the journal knows', () => {
    for (const m of [1, 2, 3, 4, 5]) {
      const key = journalMoodFromCheckin(m);
      expect(key && MOOD_META[key]).toBeTruthy();
    }
  });
});
