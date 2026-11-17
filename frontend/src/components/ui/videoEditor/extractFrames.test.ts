import { describe, expect, it } from 'vitest';
import {
  buildPlaceholders,
  clampThumbnailTimeMs,
  clearFrameCache,
  frameCountForDuration,
  nearestFrame,
  remapFrameTimes,
  sampleClipFrames,
  stillFromFrames,
  type FrameThumb,
} from './extractFrames';

describe('extractFrames', () => {
  it('builds evenly spaced placeholders for the filmstrip', () => {
    const frames = buildPlaceholders(8000, 5);
    expect(frames).toHaveLength(5);
    expect(frames.every((f) => f.placeholder && f.uri === '')).toBe(true);
    expect(frames[0].timeMs).toBe(0);
    expect(frames[4].timeMs).toBeGreaterThan(frames[0].timeMs);
    expect(frames[4].timeMs).toBeLessThanOrEqual(8000);
  });

  it('keeps 8–10 cells for typical reel lengths', () => {
    expect(frameCountForDuration(1000)).toBe(8);
    expect(frameCountForDuration(8000)).toBe(8);
    expect(frameCountForDuration(12000)).toBe(10);
  });

  it('remapFrameTimes stretches cached stills across the real duration', () => {
    const src: FrameThumb[] = [
      { uri: 'a', timeMs: 0, placeholder: false },
      { uri: 'b', timeMs: 100, placeholder: false },
      { uri: 'c', timeMs: 200, placeholder: false },
    ];
    const remapped = remapFrameTimes(src, 9000);
    expect(remapped.map((f) => f.uri)).toEqual(['a', 'b', 'c']);
    expect(remapped[0].timeMs).toBe(0);
    expect(remapped[2].timeMs).toBe(8960);
  });

  it('stillFromFrames ignores blank placeholders', () => {
    expect(
      stillFromFrames([
        { uri: '', timeMs: 0, placeholder: true },
        { uri: 'file://still.jpg', timeMs: 400, placeholder: false },
      ])
    ).toBe('file://still.jpg');
    expect(stillFromFrames(buildPlaceholders(3000, 4))).toBeNull();
  });

  it('nearestFrame picks the closest real still for scrubbing', () => {
    const frames: FrameThumb[] = [
      { uri: '', timeMs: 0, placeholder: true },
      { uri: 't0', timeMs: 80, placeholder: false },
      { uri: 't1', timeMs: 1200, placeholder: false },
      { uri: 't2', timeMs: 2400, placeholder: false },
    ];
    expect(nearestFrame(frames, 0)?.uri).toBe('t0');
    expect(nearestFrame(frames, 1300)?.uri).toBe('t1');
    expect(nearestFrame(frames, 9000)?.uri).toBe('t2');
    expect(nearestFrame(buildPlaceholders(4000, 8), 200)).toBeNull();
  });

  it('clamps thumbnail times inside the clip so AVAssetImageGenerator stays valid', () => {
    expect(clampThumbnailTimeMs(0, 5000)).toBe(80);
    expect(clampThumbnailTimeMs(5000, 5000)).toBe(4920);
    expect(clampThumbnailTimeMs(2500, 5000)).toBe(2500);
    expect(clampThumbnailTimeMs(10, 100)).toBe(80);
  });

  it('sampleClipFrames with no URI returns placeholders and never hits native thumbnails', async () => {
    clearFrameCache();
    const frames = await sampleClipFrames('', 4000);
    expect(frames.length).toBe(frameCountForDuration(4000));
    expect(frames.every((f) => f.placeholder)).toBe(true);
  });

  it('fills filmstrip stills from native thumbnails when a file URI is present', async () => {
    clearFrameCache();
    const frames = await sampleClipFrames('file://clip.mp4', 8000);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.some((f) => f.uri.startsWith('file://thumb-') && !f.placeholder)).toBe(true);
    expect(stillFromFrames(frames)).toMatch(/^file:\/\/thumb-/);
  });
});
