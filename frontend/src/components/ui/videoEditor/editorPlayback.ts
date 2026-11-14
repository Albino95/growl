/** Trim end of 0 means the full clip. */
export function clipEndMs(trimEndMs: number, durationMs: number): number {
  if (trimEndMs > 0) return Math.min(trimEndMs, durationMs || trimEndMs);
  return Math.max(0, durationMs);
}

export function isAtClipEnd(
  positionMs: number,
  endMs: number,
  slopMs = 160
): boolean {
  if (!(endMs > 0)) return false;
  return positionMs >= Math.max(0, endMs - slopMs);
}

/** Play again from IN when the playhead is sitting on the last frame. */
export function playFromMs(
  positionMs: number,
  trimStartMs: number,
  endMs: number
): number {
  const start = Math.max(0, trimStartMs);
  if (isAtClipEnd(positionMs, endMs)) return start;
  return Math.max(start, positionMs);
}
