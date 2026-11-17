import { describe, expect, it } from 'vitest';
import { parseServerDate, serverDate, serverTime } from './serverDate';

describe('parseServerDate', () => {
  it('treats SQLite datetime strings as UTC', () => {
    expect(parseServerDate('2026-03-01 10:20:30')?.toISOString()).toBe('2026-03-01T10:20:30.000Z');
    expect(parseServerDate('2026-03-01T10:20:30')?.toISOString()).toBe('2026-03-01T10:20:30.000Z');
  });
  it('keeps explicit zones', () => {
    expect(parseServerDate('2026-03-01T10:20:30.000Z')?.toISOString()).toBe('2026-03-01T10:20:30.000Z');
    expect(parseServerDate('2026-03-01T10:20:30+02:00')?.toISOString()).toBe('2026-03-01T08:20:30.000Z');
  });
  it('handles empty / garbage / numbers', () => {
    expect(parseServerDate(null)).toBeNull();
    expect(parseServerDate('')).toBeNull();
    expect(parseServerDate('nope')).toBeNull();
    expect(serverTime(undefined)).toBeNaN();
    expect(serverTime(0)).toBe(0);
    expect(Number.isNaN(serverDate('nope').getTime())).toBe(true);
  });
});
