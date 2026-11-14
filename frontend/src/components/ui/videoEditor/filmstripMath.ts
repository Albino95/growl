import type { FrameThumb } from './extractFrames';

export const MIN_TRIM_MS = 400;
export const HANDLE_W = 28;

export function snapToFrame(ms: number, frames: FrameThumb[], duration: number): number {
  const points =
    frames.length > 0
      ? frames.map((f) => f.timeMs)
      : Array.from({ length: 20 }, (_, i) => Math.round((i / 19) * duration));
  let best = points[0] ?? 0;
  let bestD = Math.abs(best - ms);
  for (const t of points) {
    const d = Math.abs(t - ms);
    if (d < bestD) {
      best = t;
      bestD = d;
    }
  }
  return Math.max(0, Math.min(duration, best));
}

export function filmstripWindow(
  durationMs: number,
  trimStartMs: number,
  trimEndMs: number
): { duration: number; start: number; end: number } {
  const duration = Math.max(durationMs, 1000);
  const end = trimEndMs > 0 ? Math.min(trimEndMs, duration) : duration;
  const start = Math.max(0, Math.min(trimStartMs, end - MIN_TRIM_MS));
  return { duration, start, end };
}

/** Tapping a cell scrubs. Only IN / OUT handles change the trim window. */
export function tapFrameAdjustsTrim(): boolean {
  return false;
}

/** Playhead travels the full clip; gray regions are visual only. */
export function playheadClampedToTrim(): boolean {
  return false;
}

export function clampPlayheadMs(ms: number, duration: number): number {
  return Math.max(0, Math.min(duration, ms));
}

export function handlePositions(
  start: number,
  end: number,
  duration: number,
  contentW: number,
  handleW = HANDLE_W
): { startX: number; endX: number; startLeft: number; endLeft: number; bothOnScreen: boolean } {
  const startX = contentW > 0 ? (start / duration) * contentW : 0;
  const endX = contentW > 0 ? (end / duration) * contentW : 0;
  const startLeft = Math.max(0, Math.min(endX - handleW, startX - handleW / 2));
  const endLeft = Math.min(contentW - handleW, Math.max(startX, endX - handleW / 2));
  return {
    startX,
    endX,
    startLeft,
    endLeft,
    bothOnScreen: startLeft >= 0 && endLeft + handleW <= contentW + 0.51,
  };
}
