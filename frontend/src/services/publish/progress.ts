/**
 * Pure publish-progress math (no React, no I/O).
 *
 * A publish is one or more file uploads (media, plus the reel cover) followed
 * by the create call. Uploads fill the bar up to `1 - FINISHING_SHARE`,
 * weighted by file size; the create call ("Finishing…") holds the rest.
 */

/** One file being uploaded. `total` is 0 until the transport knows it. */
export type ProgressPart = {
  id: string;
  sent: number;
  total: number;
  /** Size guess (bytes) used as the weight while `total` is unknown. */
  estimate?: number;
  /** Finished (also used for uploads with no byte progress, e.g. JSON bodies). */
  done?: boolean;
};

export type PublishStage = 'preparing' | 'uploading' | 'finishing' | 'done';

/** Share of the bar reserved for the create call after the uploads. */
export const FINISHING_SHARE = 0.08;

function clamp01(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n >= 1 ? 1 : n;
}

/** Size-weighted fraction (0..1) of all parts uploaded. */
export function uploadFraction(parts: readonly ProgressPart[]): number {
  if (!parts.length) return 0;
  const known = parts.filter((p) => p.total > 0);
  const fallbackWeight = known.length
    ? known.reduce((sum, p) => sum + p.total, 0) / known.length
    : 1;
  let weight = 0;
  let sent = 0;
  for (const p of parts) {
    const w = p.total > 0 ? p.total : p.estimate && p.estimate > 0 ? p.estimate : fallbackWeight;
    const f = p.done ? 1 : p.total > 0 ? clamp01(p.sent / p.total) : 0;
    weight += w;
    sent += w * f;
  }
  return weight > 0 ? clamp01(sent / weight) : 0;
}

/** Whole-publish fraction (0..1) for a stage + the current parts. */
export function overallProgress(parts: readonly ProgressPart[], stage: PublishStage): number {
  if (stage === 'done') return 1;
  if (stage === 'finishing') return 1 - FINISHING_SHARE;
  if (stage === 'preparing') return 0;
  return uploadFraction(parts) * (1 - FINISHING_SHARE);
}

/** Replace (or add) one part by id — immutable. */
export function upsertPart(parts: readonly ProgressPart[], next: ProgressPart): ProgressPart[] {
  const i = parts.findIndex((p) => p.id === next.id);
  if (i < 0) return [...parts, next];
  const copy = parts.slice();
  copy[i] = { ...parts[i], ...next };
  return copy;
}

/** Integer percent for labels; never shows 100 before the publish is done. */
export function progressPercent(fraction: number, done = false): number {
  if (done) return 100;
  return Math.min(99, Math.floor(clamp01(fraction) * 100));
}
