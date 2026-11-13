/**
 * Pure helpers for the Progress tab (heatmap / path bars / mood bars).
 * No React Native imports so vitest can load them.
 */
import type { Progress } from '../../services/api/growth';

export type ProgressDay = Progress['days'][number];

/** Activity kinds bitmask (docs/GROWTH_SYSTEM.md §2). */
export const KIND_BITS = [
  { bit: 1, label: 'Posted' },
  { bit: 2, label: 'Shared a story' },
  { bit: 4, label: 'Journaled' },
  { bit: 8, label: 'Checked in' },
] as const;

export function kindsBitCount(kinds: number): number {
  let n = 0;
  let k = kinds & 0xf;
  while (k) {
    n += k & 1;
    k >>= 1;
  }
  return n;
}

/** Heatmap shade: 0 = nothing, 1..4 = emerald intensity, 'rest' = rest day. */
export type HeatShade = 0 | 1 | 2 | 3 | 4 | 'rest';

export function heatShade(day: Pick<ProgressDay, 'active' | 'rest' | 'kinds'> | null | undefined): HeatShade {
  if (!day) return 0;
  const bits = kindsBitCount(day.kinds || 0);
  if (bits > 0) return Math.min(4, bits) as 1 | 2 | 3 | 4;
  if (day.active) return 1;
  if (day.rest) return 'rest';
  return 0;
}

export const HEAT_COLORS: Record<Exclude<HeatShade, 'rest'>, string> = {
  0: '#EAE4D6',
  1: '#A7F3D0',
  2: '#34D399',
  3: '#059669',
  4: '#065F46',
};
export const REST_COLOR = '#FBF3DF';
export const REST_BORDER = '#E9D9AE';

/** Human summary of what happened on a day. */
export function describeDay(day: Pick<ProgressDay, 'active' | 'rest' | 'kinds' | 'mood'> | null | undefined): string {
  if (!day) return 'A quiet day — that’s okay.';
  const parts = KIND_BITS.filter((k) => (day.kinds & k.bit) !== 0).map((k) => k.label);
  if (parts.length) return parts.join(' · ');
  if (day.active) return 'You showed up';
  if (day.rest) return 'Rest day 🌿';
  return 'A quiet day — that’s okay.';
}

/** Parse `YYYY-MM-DD` as a local calendar date at noon (DST-safe). */
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1, 12);
}

export function toDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Monday = 0 … Sunday = 6. */
export function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export type HeatCell = { day: string; data: ProgressDay | null; future: boolean; isToday: boolean };

/**
 * Builds `weeks` columns × 7 rows (Mon..Sun) ending with the week containing `today`.
 */
export function buildHeatmapGrid(days: ProgressDay[], today: string, weeks: number): HeatCell[][] {
  const byDay = new Map(days.map((d) => [d.day, d]));
  const t = parseDayKey(today);
  const start = new Date(t);
  start.setDate(t.getDate() - mondayIndex(t) - (weeks - 1) * 7);
  const cols: HeatCell[][] = [];
  const cursor = new Date(start);
  for (let w = 0; w < weeks; w += 1) {
    const col: HeatCell[] = [];
    for (let r = 0; r < 7; r += 1) {
      const key = toDayKey(cursor);
      col.push({ day: key, data: byDay.get(key) ?? null, future: key > today, isToday: key === today });
      cursor.setDate(cursor.getDate() + 1);
    }
    cols.push(col);
  }
  return cols;
}

/** Path palette keyed by top-level category key; unknown paths get a stable fallback. */
export const PATH_COLORS: Record<string, string> = {
  fitness: '#059669',
  art: '#F97066',
  nutrition: '#65A30D',
  mindset: '#8B5CF6',
  discipline: '#0F766E',
  'martial-arts': '#DC6B2F',
  language: '#0EA5E9',
  coding: '#334155',
  sustainability: '#16A34A',
  wellness: '#EC4899',
  finance: '#D97706',
};
const FALLBACK_PATH_COLORS = ['#059669', '#F97066', '#D97706', '#0EA5E9', '#8B5CF6'];

export function pathColor(path: string): string {
  const parent = path.includes(':') ? path.split(':')[0] : path;
  if (PATH_COLORS[parent]) return PATH_COLORS[parent];
  let h = 0;
  for (let i = 0; i < parent.length; i += 1) h = (h * 31 + parent.charCodeAt(i)) >>> 0;
  return FALLBACK_PATH_COLORS[h % FALLBACK_PATH_COLORS.length];
}

/** Bar fill colour for an average mood 1..5. */
export function moodColor(avg: number): string {
  if (avg >= 4.25) return '#059669';
  if (avg >= 3.5) return '#34D399';
  if (avg >= 2.75) return '#FBBF24';
  if (avg >= 2) return '#FB923C';
  return '#F97066';
}

/** "2026-W46" → "W46". */
export function shortWeek(week: string): string {
  const m = /W(\d{1,2})$/.exec(week);
  return m ? `W${parseInt(m[1], 10)}` : week;
}
