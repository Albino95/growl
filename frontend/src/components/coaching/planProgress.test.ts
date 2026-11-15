import { describe, it, expect } from 'vitest';
import { dueDateFor, moodLabel, planProgress, planStatusLabel } from './planProgress';

describe('planProgress', () => {
  const start = '2026-11-01T10:00:00.000Z';
  const end = '2026-11-29T10:00:00.000Z';

  it('counts weeks from the start and clamps to the plan length', () => {
    expect(planProgress(start, end, 4, new Date('2026-11-02T00:00:00Z')).week).toBe(1);
    expect(planProgress(start, end, 4, new Date('2026-11-09T11:00:00Z')).week).toBe(2);
    expect(planProgress(start, end, 4, new Date('2026-12-20T00:00:00Z')).week).toBe(4);
    expect(planProgress(start, end, 4, new Date('2026-10-01T00:00:00Z')).week).toBe(1);
  });

  it('reports days left, never negative', () => {
    expect(planProgress(start, end, 4, new Date('2026-11-27T10:00:00Z')).daysLeft).toBe(2);
    expect(planProgress(start, end, 4, new Date('2026-12-27T10:00:00Z')).daysLeft).toBe(0);
    expect(planProgress(start, null, 4).daysLeft).toBeNull();
  });

  it('accepts SQLite timestamps', () => {
    expect(planProgress('2026-11-01 10:00:00', null, 2, new Date('2026-11-09T00:00:00Z')).week).toBe(2);
  });
});

describe('planStatusLabel', () => {
  it('never shows raw enum values', () => {
    expect(planStatusLabel('completed')).toBe('Plan complete');
    expect(planStatusLabel('active')).toBe('Active');
    expect(planStatusLabel('paused')).toBe('Paused');
  });
});

describe('dueDateFor', () => {
  it('is undefined without days and end-of-day otherwise', () => {
    expect(dueDateFor(null)).toBeUndefined();
    const now = new Date(2026, 10, 10, 9, 0, 0);
    const d = new Date(dueDateFor(3, now)!);
    expect(d.getDate()).toBe(13);
    expect(d.getHours()).toBe(23);
  });
});

describe('moodLabel', () => {
  it('maps the 1–5 average', () => {
    expect(moodLabel(null)).toBe('No mood logged');
    expect(moodLabel(4.6)).toBe('Great');
    expect(moodLabel(3)).toBe('Okay');
    expect(moodLabel(1.2)).toBe('Rough');
  });
});
