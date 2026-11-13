import { describe, expect, it } from 'vitest';
import { isOverdue, parseApiDate } from './homeworkDates';

describe('parseApiDate', () => {
  it('treats SQLite timestamps as UTC', () => {
    expect(parseApiDate('2026-03-02 10:00:00')?.toISOString()).toBe('2026-03-02T10:00:00.000Z');
  });
  it('keeps ISO timestamps with a zone', () => {
    expect(parseApiDate('2026-03-02T10:00:00.000Z')?.toISOString()).toBe('2026-03-02T10:00:00.000Z');
  });
  it('returns null for empty or bad input', () => {
    expect(parseApiDate(null)).toBeNull();
    expect(parseApiDate('')).toBeNull();
    expect(parseApiDate('not a date')).toBeNull();
  });
});

describe('isOverdue', () => {
  it('is false until the due day ends', () => {
    const due = '2026-03-02T09:00:00.000Z';
    expect(isOverdue(due, new Date('2026-03-01T12:00:00.000Z'))).toBe(false);
    expect(isOverdue(due, new Date('2026-03-05T12:00:00.000Z'))).toBe(true);
    expect(isOverdue(null)).toBe(false);
  });
});
