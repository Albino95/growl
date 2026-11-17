import { describe, it, expect } from 'vitest';
import { explainerCopy, notReadyCopy, parseHiddenIds, ringDots, ringProgress, visibleInsights } from './insightsMath';
import type { Insight } from '../../services/api/insights';

const ins = (id: string): Insight => ({ id, kind: 'mood_trend', title: id, body: '', strength: 'tentative', data: {} });

describe('insightsMath', () => {
  it('filters hidden insights and caps at 3', () => {
    const list = ['a', 'b', 'c', 'd'].map(ins);
    expect(visibleInsights(list, new Set(['b'])).map((i) => i.id)).toEqual(['a', 'c', 'd']);
    expect(visibleInsights(list, new Set()).length).toBe(3);
  });

  it('not-ready copy', () => {
    expect(notReadyCopy(4)).toBe('4 more check-ins to see your patterns');
    expect(notReadyCopy(1)).toBe('1 more check-in to see your patterns');
    expect(notReadyCopy(0)).toBe('1 more check-in to see your patterns');
  });

  it('ring progress clamps', () => {
    expect(ringProgress(4)).toEqual({ done: 3, total: 7 });
    expect(ringProgress(12)).toEqual({ done: 0, total: 7 });
    expect(ringProgress(-1)).toEqual({ done: 7, total: 7 });
    expect(ringProgress(NaN)).toEqual({ done: 0, total: 7 });
  });

  it('ring dots start at 12 o’clock and stay inside the box', () => {
    const dots = ringDots(7, 40, 8);
    expect(dots[0]).toEqual({ left: 16, top: 0 });
    for (const d of dots) {
      expect(d.left).toBeGreaterThanOrEqual(-1e-9);
      expect(d.left).toBeLessThanOrEqual(32 + 1e-9);
      expect(d.top).toBeLessThanOrEqual(32 + 1e-9);
    }
  });

  it('parses hidden ids defensively', () => {
    expect([...parseHiddenIds('["a",1,"b"]')]).toEqual(['a', 'b']);
    expect(parseHiddenIds('nope').size).toBe(0);
    expect(parseHiddenIds(null).size).toBe(0);
    expect(parseHiddenIds('{"a":1}').size).toBe(0);
  });

  it('explainer copy', () => {
    expect(explainerCopy(30)).toBe('Based on your last 30 days of check-ins. Patterns, not rules.');
  });
});
