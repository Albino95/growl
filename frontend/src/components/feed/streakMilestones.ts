/**
 * Streak milestones celebrated in the Today card (in-card burst, once ever per
 * milestone via `celebrateOnce('streak:' + n)`). Pure — no RN imports.
 */
export const STREAK_CELEBRATIONS: Readonly<Record<number, string>> = {
  3: '3 days in a row — you’re taking root 🌱',
  7: 'A whole week. Steady.',
  14: 'Two weeks. It’s becoming yours.',
  30: '30 days. Deep roots.',
  50: '50 days. Branching out.',
  100: '100 days. Old oak.',
  365: 'A full year. Evergreen.',
};

/** Celebration copy for a streak length, or null when it isn't a milestone. */
export function streakMilestoneCopy(days: number): string | null {
  return Number.isInteger(days) ? STREAK_CELEBRATIONS[days] ?? null : null;
}

export const BURST_COLORS = ['#059669', '#F97066', '#F59E0B'] as const;

export type BurstDot = { dx: number; dy: number; size: number; color: string };

/** An even ring of `count` dots (alternating emerald / coral / gold), radius jittered ±15%. */
export function burstRing(count = 12, radius = 34): BurstDot[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    const r = radius * (i % 2 === 0 ? 1.15 : 0.85);
    return {
      dx: Math.round(Math.cos(angle) * r * 10) / 10,
      dy: Math.round(Math.sin(angle) * r * 10) / 10,
      size: i % 3 === 0 ? 7 : 5,
      color: BURST_COLORS[i % BURST_COLORS.length],
    };
  });
}
