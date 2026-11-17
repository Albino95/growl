import { describe, it, expect } from 'vitest';
import { countUpFrame, safeCountTarget } from './countUp';

describe('countUpFrame', () => {
  it('hits both ends exactly', () => {
    expect(countUpFrame(0, 128, 0)).toBe(0);
    expect(countUpFrame(0, 128, 1)).toBe(128);
  });

  it('interpolates and rounds to integers', () => {
    expect(countUpFrame(0, 10, 0.25)).toBe(3); // 2.5 → 3
    expect(countUpFrame(0, 10, 0.24)).toBe(2);
    expect(countUpFrame(10, 20, 0.5)).toBe(15);
  });

  it('counts down too', () => {
    expect(countUpFrame(20, 10, 0.5)).toBe(15);
    expect(countUpFrame(20, 10, 1)).toBe(10);
  });

  it('clamps overshoot and bad progress', () => {
    expect(countUpFrame(0, 10, 1.3)).toBe(10);
    expect(countUpFrame(0, 10, -0.2)).toBe(0);
    expect(countUpFrame(0, 10, Number.NaN)).toBe(10);
  });

  it('sanitises targets', () => {
    expect(safeCountTarget(4.6)).toBe(5);
    expect(safeCountTarget(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
