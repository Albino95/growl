/**
 * Pure math for count-up numbers (no RN imports, unit-tested).
 * `eased` is the already-eased progress in [0, 1]; values outside are clamped.
 */
export function countUpFrame(from: number, to: number, eased: number): number {
  const t = Number.isFinite(eased) ? Math.min(1, Math.max(0, eased)) : 1;
  if (t >= 1) return Math.round(to);
  return Math.round(from + (to - from) * t);
}

/** Integer to show for a raw (possibly non-finite) target. */
export function safeCountTarget(target: number): number {
  return Number.isFinite(target) ? Math.round(target) : 0;
}
