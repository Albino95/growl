import { describe, it, expect } from 'vitest';
import { normalizeTime, shortAgo } from './shared';

describe('normalizeTime', () => {
  it('accepts and pads common inputs', () => {
    expect(normalizeTime('18:00')).toBe('18:00');
    expect(normalizeTime('9:5')).toBe('09:05');
    expect(normalizeTime('930')).toBe('09:30');
    expect(normalizeTime('7')).toBe('07:00');
  });
  it('rejects impossible times', () => {
    expect(normalizeTime('24:00')).toBeNull();
    expect(normalizeTime('12:60')).toBeNull();
    expect(normalizeTime('abc')).toBeNull();
  });
});

describe('shortAgo', () => {
  const now = Date.parse('2026-11-18T12:00:00Z');
  it('formats recent server timestamps', () => {
    expect(shortAgo('2026-11-18 11:59:30', now)).toBe('just now');
    expect(shortAgo('2026-11-18T11:55:00.000Z', now)).toBe('5m');
    expect(shortAgo('2026-11-18 09:00:00', now)).toBe('3h');
    expect(shortAgo('2026-11-16 12:00:00', now)).toBe('2d');
    expect(shortAgo(null, now)).toBe('');
  });
});
