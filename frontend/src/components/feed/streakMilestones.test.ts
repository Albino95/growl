import { describe, it, expect } from 'vitest';
import { burstRing, streakMilestoneCopy } from './streakMilestones';

describe('streakMilestoneCopy', () => {
  it('returns copy for milestones', () => {
    expect(streakMilestoneCopy(3)).toContain('taking root');
    expect(streakMilestoneCopy(7)).toBe('A whole week. Steady.');
    expect(streakMilestoneCopy(30)).toBe('30 days. Deep roots.');
    expect(streakMilestoneCopy(100)).toBe('100 days. Old oak.');
    expect(streakMilestoneCopy(14)).not.toBeNull();
    expect(streakMilestoneCopy(50)).not.toBeNull();
    expect(streakMilestoneCopy(365)).not.toBeNull();
  });

  it('returns null otherwise', () => {
    for (const n of [0, 1, 2, 4, 8, 29, 31, 99, 3.5, NaN]) expect(streakMilestoneCopy(n)).toBeNull();
  });
});

describe('burstRing', () => {
  it('makes an even ring of 12 coloured dots around the origin', () => {
    const dots = burstRing();
    expect(dots).toHaveLength(12);
    expect(new Set(dots.map((d) => d.color)).size).toBe(3);
    const sx = dots.reduce((a, d) => a + d.dx, 0);
    const sy = dots.reduce((a, d) => a + d.dy, 0);
    expect(Math.abs(sx)).toBeLessThan(1);
    expect(Math.abs(sy)).toBeLessThan(1);
    expect(dots[0].dy).toBeLessThan(0); // first dot goes straight up
  });
});
