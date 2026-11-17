import { describe, expect, it } from 'vitest';
import {
  BADGE_NAMES,
  BADGE_VISUALS,
  CONTRACT_BADGE_IDS,
  badgeVisual,
  formatEarnedDate,
  levelProgress,
  pickLockedPreview,
  pointsToNext,
  progressFraction,
} from './badgeMeta';

describe('badge visuals', () => {
  it('covers every contract badge id with an emoji and tint', () => {
    for (const id of CONTRACT_BADGE_IDS) {
      const v = BADGE_VISUALS[id];
      expect(v, id).toBeDefined();
      expect(v.emoji.length).toBeGreaterThan(0);
      expect(v.tint).toMatch(/^#[0-9A-F]{6}$/i);
      expect(BADGE_NAMES[id], id).toBeTruthy();
    }
  });
  it('falls back for unknown ids', () => {
    expect(badgeVisual('nope').emoji).toBe('🏅');
  });
});

describe('levelProgress', () => {
  it('is 0 at the floor of a level', () => {
    expect(levelProgress({ n: 3, points: 150, next_at: 400 })).toBe(0);
  });
  it('is proportional inside a level', () => {
    expect(levelProgress({ n: 3, points: 275, next_at: 400 })).toBeCloseTo(0.5);
    expect(levelProgress({ n: 1, points: 25, next_at: 50 })).toBeCloseTo(0.5);
  });
  it('is 1 at the top level', () => {
    expect(levelProgress({ n: 6, points: 9000, next_at: null })).toBe(1);
  });
  it('clamps and tolerates a mismatched n', () => {
    expect(levelProgress({ n: 9, points: 180, next_at: 400 })).toBeCloseTo(30 / 250);
    expect(levelProgress({ n: 2, points: 999, next_at: 150 })).toBe(1);
  });
  it('pointsToNext', () => {
    expect(pointsToNext({ points: 180, next_at: 400 })).toBe(220);
    expect(pointsToNext({ points: 3000, next_at: null })).toBeNull();
  });
});

describe('misc', () => {
  it('progressFraction clamps', () => {
    expect(progressFraction({ current: 3, target: 7 })).toBeCloseTo(3 / 7);
    expect(progressFraction({ current: 9, target: 7 })).toBe(1);
    expect(progressFraction({ current: 1, target: 0 })).toBe(0);
  });
  it('formats SQLite datetimes', () => {
    expect(formatEarnedDate('2026-11-12 08:00:00')).toMatch(/^Nov 1[12], 2026$/);
    expect(formatEarnedDate('garbage')).toBe('');
  });
});

describe('pickLockedPreview', () => {
  const cat = [
    { id: 'a', progress: { current: 1, target: 10 } },
    { id: 'b', progress: { current: 9, target: 10 } },
    { id: 'c', progress: { current: 5, target: 10 } },
    { id: 'd', progress: { current: 0, target: 1 } },
    { id: 'e', progress: { current: 1, target: 1 } },
  ];
  it('puts next first, then closest, excluding earned', () => {
    const out = pickLockedPreview(cat, new Set(['e']), 'd', 3).map((c) => c.id);
    expect(out).toEqual(['d', 'b', 'c']);
  });
});
