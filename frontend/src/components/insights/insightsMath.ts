/** Pure helpers for the insights section (unit-tested). */
import type { Insight } from '../../services/api/insights';

/** Check-ins needed before patterns show (mirrors the backend threshold). */
export const INSIGHTS_READY_CHECKINS = 7;

export function visibleInsights(list: Insight[], hidden: ReadonlySet<string>, max = 3): Insight[] {
  return list.filter((i) => i && typeof i.id === 'string' && !hidden.has(i.id)).slice(0, max);
}

export function notReadyCopy(needed: number): string {
  const n = Math.max(1, Math.round(needed));
  return n === 1 ? '1 more check-in to see your patterns' : `${n} more check-ins to see your patterns`;
}

/** 0..total filled dots for the mini ring. */
export function ringProgress(needed: number, total = INSIGHTS_READY_CHECKINS): { done: number; total: number } {
  const n = Number.isFinite(needed) ? Math.max(0, Math.min(total, Math.round(needed))) : total;
  return { done: total - n, total };
}

/** Dot centres (top-left offsets) evenly spaced on a circle, starting at 12 o'clock, clockwise. */
export function ringDots(count: number, size: number, dot: number): { left: number; top: number }[] {
  const r = (size - dot) / 2;
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
    return { left: r + r * Math.cos(a), top: r + r * Math.sin(a) };
  });
}

export function parseHiddenIds(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const v = JSON.parse(raw);
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-200) : []);
  } catch {
    return new Set();
  }
}

export function explainerCopy(days: number): string {
  return `Based on your last ${days} days of check-ins. Patterns, not rules.`;
}
