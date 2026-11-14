import { describe, expect, it } from 'vitest';
import {
  buildHeatmapGrid,
  describeDay,
  heatShade,
  kindsBitCount,
  moodColor,
  pathColor,
  shortWeek,
} from './progressMath';

const d = (day: string, kinds: number, extra: Partial<{ active: boolean; rest: boolean; mood: number | null }> = {}) => ({
  day,
  kinds,
  active: kinds > 0,
  rest: false,
  mood: null,
  ...extra,
});

describe('heatShade', () => {
  it('counts kinds bits', () => {
    expect(kindsBitCount(0)).toBe(0);
    expect(kindsBitCount(1)).toBe(1);
    expect(kindsBitCount(5)).toBe(2);
    expect(kindsBitCount(15)).toBe(4);
    expect(kindsBitCount(31)).toBe(4);
  });
  it('maps bit count to shade 1..4', () => {
    expect(heatShade(d('x', 0))).toBe(0);
    expect(heatShade(d('x', 8))).toBe(1);
    expect(heatShade(d('x', 3))).toBe(2);
    expect(heatShade(d('x', 7))).toBe(3);
    expect(heatShade(d('x', 15))).toBe(4);
  });
  it('rest and legacy-active days', () => {
    expect(heatShade(d('x', 0, { rest: true }))).toBe('rest');
    expect(heatShade(d('x', 0, { active: true }))).toBe(1);
    expect(heatShade(null)).toBe(0);
  });
  it('describes a day', () => {
    expect(describeDay(d('x', 5))).toBe('Posted · Journaled');
    expect(describeDay(d('x', 0, { rest: true }))).toBe('Rest day 🌿');
  });
});

describe('buildHeatmapGrid', () => {
  it('builds Monday-first columns ending in today’s week', () => {
    // 2026-11-13 is a Friday
    const grid = buildHeatmapGrid([d('2026-11-13', 1), d('2026-11-02', 4)], '2026-11-13', 3);
    expect(grid).toHaveLength(3);
    expect(grid[0][0].day).toBe('2026-10-26');
    const last = grid[2];
    expect(last[0].day).toBe('2026-11-09');
    expect(last[4].isToday).toBe(true);
    expect(last[4].data?.kinds).toBe(1);
    expect(last[5].future).toBe(true);
    expect(grid[1][0].data?.kinds).toBe(4);
  });
});

describe('colors', () => {
  it('pathColor is stable and handles subpaths', () => {
    expect(pathColor('fitness:cardio')).toBe(pathColor('fitness'));
    expect(pathColor('unknown-path')).toBe(pathColor('unknown-path'));
  });
  it('moodColor and shortWeek', () => {
    expect(moodColor(5)).toBe('#059669');
    expect(moodColor(1)).toBe('#F97066');
    expect(shortWeek('2026-W06')).toBe('W6');
  });
});
