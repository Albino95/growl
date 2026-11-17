import { describe, expect, it } from 'vitest';
import { formatCurrency, parseLocaleNumber } from './money';

describe('parseLocaleNumber', () => {
  it('accepts dot and comma decimals', () => {
    expect(parseLocaleNumber('12.5')).toBe(12.5);
    expect(parseLocaleNumber('12,5')).toBe(12.5);
    expect(parseLocaleNumber(' 7 ')).toBe(7);
    expect(parseLocaleNumber('0')).toBe(0);
  });
  it('returns null for empty or invalid input', () => {
    expect(parseLocaleNumber('')).toBeNull();
    expect(parseLocaleNumber('  ')).toBeNull();
    expect(parseLocaleNumber('abc')).toBeNull();
    expect(parseLocaleNumber('1,2,3')).toBeNull();
    expect(parseLocaleNumber('1.2.3')).toBeNull();
    expect(parseLocaleNumber(',')).toBeNull();
    expect(parseLocaleNumber(null)).toBeNull();
  });
});

describe('formatCurrency', () => {
  it('formats with the currency symbol', () => {
    expect(formatCurrency(10)).toMatch(/€/);
    expect(formatCurrency(12.5, 'USD')).toMatch(/\$|US/);
    expect(formatCurrency(12.5)).toMatch(/12[.,]50/);
  });
  it('falls back for an invalid currency code', () => {
    expect(formatCurrency(3, 'NOT-A-CODE')).toBe('€3.00');
  });
});
