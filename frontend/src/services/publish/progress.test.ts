import { describe, expect, it } from 'vitest';
import {
  FINISHING_SHARE,
  overallProgress,
  progressPercent,
  uploadFraction,
  upsertPart,
  type ProgressPart,
} from './progress';

const UP = 1 - FINISHING_SHARE;

describe('uploadFraction', () => {
  it('is 0 with no parts or nothing known yet', () => {
    expect(uploadFraction([])).toBe(0);
    expect(uploadFraction([{ id: 'media', sent: 0, total: 0 }])).toBe(0);
  });

  it('is sent / total for one file', () => {
    expect(uploadFraction([{ id: 'media', sent: 250, total: 1000 }])).toBeCloseTo(0.25);
  });

  it('weights several files by size', () => {
    const parts: ProgressPart[] = [
      { id: 'media', sent: 9_000_000, total: 9_000_000 }, // done, 90% of bytes
      { id: 'cover', sent: 0, total: 1_000_000 },
    ];
    expect(uploadFraction(parts)).toBeCloseTo(0.9);
    expect(
      uploadFraction([
        { id: 'media', sent: 0, total: 9_000_000 },
        { id: 'cover', sent: 1_000_000, total: 1_000_000 },
      ])
    ).toBeCloseTo(0.1);
  });

  it('uses the estimate as weight while a size is unknown', () => {
    const parts: ProgressPart[] = [
      { id: 'media', sent: 500, total: 1000 },
      { id: 'cover', sent: 0, total: 0, estimate: 1000 },
    ];
    expect(uploadFraction(parts)).toBeCloseTo(0.25);
  });

  it('counts `done` parts as complete even without byte progress', () => {
    expect(uploadFraction([{ id: 'json', sent: 0, total: 0, done: true }])).toBe(1);
  });

  it('clamps bad transport numbers', () => {
    expect(uploadFraction([{ id: 'media', sent: 2000, total: 1000 }])).toBe(1);
    expect(uploadFraction([{ id: 'media', sent: -5, total: 1000 }])).toBe(0);
    expect(uploadFraction([{ id: 'media', sent: Number.NaN, total: 1000 }])).toBe(0);
  });
});

describe('overallProgress', () => {
  const half: ProgressPart[] = [{ id: 'media', sent: 50, total: 100 }];
  it('maps uploads into the first part of the bar and reserves the rest for finishing', () => {
    expect(overallProgress(half, 'preparing')).toBe(0);
    expect(overallProgress(half, 'uploading')).toBeCloseTo(0.5 * UP);
    expect(overallProgress([{ id: 'media', sent: 100, total: 100 }], 'uploading')).toBeCloseTo(UP);
    expect(overallProgress(half, 'finishing')).toBeCloseTo(UP);
    expect(overallProgress(half, 'done')).toBe(1);
  });
});

describe('upsertPart', () => {
  it('replaces by id without mutating, and appends new ids', () => {
    const a: ProgressPart[] = [{ id: 'media', sent: 0, total: 0, estimate: 9 }];
    const b = upsertPart(a, { id: 'media', sent: 5, total: 10 });
    expect(a[0].sent).toBe(0);
    expect(b).toEqual([{ id: 'media', sent: 5, total: 10, estimate: 9 }]);
    expect(upsertPart(b, { id: 'cover', sent: 0, total: 0 })).toHaveLength(2);
  });
});

describe('progressPercent', () => {
  it('floors, clamps, and never shows 100 before done', () => {
    expect(progressPercent(0.426)).toBe(42);
    expect(progressPercent(1)).toBe(99);
    expect(progressPercent(1, true)).toBe(100);
    expect(progressPercent(-1)).toBe(0);
  });
});
