import { describe, expect, it } from 'vitest';
import {
  HANDLE_W,
  MIN_TRIM_MS,
  clampPlayheadMs,
  filmstripWindow,
  handlePositions,
  playheadClampedToTrim,
  snapToFrame,
  tapFrameAdjustsTrim,
} from './filmstripMath';
import type { FrameThumb } from './extractFrames';

describe('filmstripMath', () => {
  it('treats trimEnd 0 as the full clip so OUT is not locked to 1s', () => {
    const win = filmstripWindow(12000, 0, 0);
    expect(win.duration).toBe(12000);
    expect(win.start).toBe(0);
    expect(win.end).toBe(12000);
  });

  it('keeps a minimum trim window', () => {
    const win = filmstripWindow(8000, 7900, 8000);
    expect(win.end - win.start).toBeGreaterThanOrEqual(MIN_TRIM_MS);
  });

  it('puts IN and OUT on screen for the full clip width', () => {
    const { start, end, duration } = filmstripWindow(10000, 0, 0);
    const pos = handlePositions(start, end, duration, 360, HANDLE_W);
    expect(pos.startLeft).toBeGreaterThanOrEqual(0);
    expect(pos.endLeft + HANDLE_W).toBeLessThanOrEqual(360.51);
    expect(pos.bothOnScreen).toBe(true);
  });

  it('keeps both handles visible on a mid-clip trim', () => {
    const { start, end, duration } = filmstripWindow(20000, 4000, 16000);
    const pos = handlePositions(start, end, duration, 320, HANDLE_W);
    expect(pos.bothOnScreen).toBe(true);
    expect(pos.endLeft).toBeGreaterThan(pos.startLeft);
  });

  it('snaps trim times onto sampled frames', () => {
    const frames: FrameThumb[] = [
      { uri: 'a', timeMs: 0 },
      { uri: 'b', timeMs: 1000 },
      { uri: 'c', timeMs: 2000 },
      { uri: 'd', timeMs: 3000 },
    ];
    expect(snapToFrame(1080, frames, 3000)).toBe(1000);
    expect(snapToFrame(2900, frames, 3000)).toBe(3000);
    expect(snapToFrame(-20, frames, 3000)).toBe(0);
  });

  it('does not let tapping gray or the playhead change the trim window', () => {
    expect(tapFrameAdjustsTrim()).toBe(false);
    expect(playheadClampedToTrim()).toBe(false);
    expect(clampPlayheadMs(50, 5000)).toBe(50);
    expect(clampPlayheadMs(-20, 5000)).toBe(0);
    expect(clampPlayheadMs(9000, 5000)).toBe(5000);
  });
});
