/** Largest box of `mediaW:mediaH` that fits inside `maxW` × `maxH`. */
export function fitMediaBox(
  maxW: number,
  maxH: number,
  mediaW: number,
  mediaH: number
): { width: number; height: number } {
  if (maxW <= 0 || maxH <= 0) return { width: 0, height: 0 };
  if (mediaW <= 0 || mediaH <= 0) return { width: Math.round(maxW), height: Math.round(maxH) };
  const scale = Math.min(maxW / mediaW, maxH / mediaH);
  return {
    width: Math.max(1, Math.round(mediaW * scale)),
    height: Math.max(1, Math.round(mediaH * scale)),
  };
}

/** 9:16 reel frame fitted into the available preview area. */
export function fitReelStage(maxW: number, maxH: number): { width: number; height: number } {
  return fitMediaBox(maxW, maxH, 9, 16);
}
