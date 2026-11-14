import { describe, it, expect } from 'vitest';
import {
  getPeriodBounds,
  toSqliteDateTime,
  csvEscape,
  isAwaitingPayment,
  MAX_EXPORT_RANGE_DAYS,
} from '../../src/routes/business';
import {
  ALLOWED_TRANSITIONS,
  isAllowedTransition,
  transitionRequiresPayment,
} from '../../src/routes/marketplace';

const SQLITE_DT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

describe('getPeriodBounds', () => {
  const now = new Date('2026-03-03T15:04:05.678Z');

  it('returns SQLite datetime strings (no T/Z) comparable to created_at', () => {
    const b = getPeriodBounds('today', now);
    for (const v of Object.values(b)) expect(v).toMatch(SQLITE_DT);
    expect(b.start).toBe('2026-03-03 00:00:00');
    expect(b.end).toBe('2026-03-03 15:04:06');
    expect(b.prevStart).toBe('2026-03-02 00:00:00');
    expect(b.prevEnd).toBe('2026-03-03 00:00:00');
    // An order placed this morning must fall inside "today" with string comparison.
    const createdAt = '2026-03-03 08:00:00';
    expect(createdAt >= b.start && createdAt < b.end).toBe(true);
  });

  it('handles week and month across month boundaries', () => {
    const w = getPeriodBounds('week', now);
    expect(w.start).toBe('2026-02-25 00:00:00');
    expect(w.prevStart).toBe('2026-02-18 00:00:00');
    expect(w.prevEnd).toBe('2026-02-25 00:00:00');
    const m = getPeriodBounds('month', now);
    expect(m.start).toBe('2026-02-02 00:00:00');
    expect(m.prevStart).toBe('2026-01-03 00:00:00');
    expect(m.prevEnd).toBe(m.start);
  });

  it('formats like SQLite datetime()', () => {
    expect(toSqliteDateTime(new Date('2026-01-02T03:04:05.999Z'))).toBe('2026-01-02 03:04:05');
  });
});

describe('csvEscape', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape(null)).toBe('');
  });

  it('neutralises formula injection', () => {
    expect(csvEscape('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvEscape('+1')).toBe("'+1");
    expect(csvEscape('-2')).toBe("'-2");
    expect(csvEscape('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvEscape('\tcmd')).toBe("'\tcmd");
  });

  it('leaves plain values and real numbers alone', () => {
    expect(csvEscape('Yoga mat')).toBe('Yoga mat');
    expect(csvEscape(-5)).toBe('-5');
    expect(csvEscape(12.5)).toBe('12.5');
  });

  it('caps sales exports at a year', () => {
    expect(MAX_EXPORT_RANGE_DAYS).toBe(366);
  });
});

describe('order status transitions', () => {
  it('allows the forward lifecycle', () => {
    expect(isAllowedTransition('pending', 'processing')).toBe(true);
    expect(isAllowedTransition('processing', 'shipped')).toBe(true);
    expect(isAllowedTransition('shipped', 'delivered')).toBe(true);
    expect(isAllowedTransition('delivered', 'completed')).toBe(true);
    expect(isAllowedTransition('pending', 'cancelled')).toBe(true);
    expect(isAllowedTransition('processing', 'cancelled')).toBe(true);
  });

  it('rejects skips, reversals and exits from terminal states', () => {
    expect(isAllowedTransition('pending', 'shipped')).toBe(false);
    expect(isAllowedTransition('shipped', 'pending')).toBe(false);
    expect(isAllowedTransition('shipped', 'cancelled')).toBe(false);
    expect(isAllowedTransition('completed', 'pending')).toBe(false);
    expect(isAllowedTransition('cancelled', 'processing')).toBe(false);
    expect(ALLOWED_TRANSITIONS.completed).toEqual([]);
    expect(ALLOWED_TRANSITIONS.cancelled).toEqual([]);
    expect(isAllowedTransition('bogus', 'processing')).toBe(false);
  });

  it('requires payment for fulfilment but not for cancelling', () => {
    expect(transitionRequiresPayment('processing')).toBe(true);
    expect(transitionRequiresPayment('cancelled')).toBe(false);
    expect(isAwaitingPayment('unpaid')).toBe(true);
    expect(isAwaitingPayment('paid')).toBe(false);
    expect(isAwaitingPayment('refunded')).toBe(false);
  });
});
