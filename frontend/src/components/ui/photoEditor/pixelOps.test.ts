import { describe, expect, it } from 'vitest';
import { DEFAULT_ADJUSTMENTS } from './types';
import { applySharpen, applyVignette, needsPixelPass, processPixelBuffer } from './pixelOps';

function gradient(w: number, h: number) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data[i] = (x * 255) / w;
      data[i + 1] = (y * 255) / h;
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  return { data, width: w, height: h };
}

describe('pixelOps', () => {
  it('neutral adjustments are a no-op and skip the pixel pass', () => {
    const buf = gradient(20, 10);
    const before = buf.data.slice();
    processPixelBuffer(buf, { ...DEFAULT_ADJUSTMENTS });
    expect(Array.from(buf.data)).toEqual(Array.from(before));
    expect(needsPixelPass({ ...DEFAULT_ADJUSTMENTS }, 0)).toBe(false);
    expect(needsPixelPass({ ...DEFAULT_ADJUSTMENTS }, 1)).toBe(true);
    expect(needsPixelPass({ ...DEFAULT_ADJUSTMENTS, warmth: 10 }, 0)).toBe(true);
  });

  it('sharpen leaves a flat image unchanged', () => {
    const buf = { data: new Uint8ClampedArray(12 * 9 * 4).fill(90), width: 12, height: 9 };
    applySharpen(buf, 40);
    expect(buf.data.every((v) => v === 90)).toBe(true);
  });

  it('vignette darkens corners, keeps the centre', () => {
    const w = 41;
    const h = 31;
    const buf = { data: new Uint8ClampedArray(w * h * 4).fill(200), width: w, height: h };
    applyVignette(buf, 40);
    const at = (x: number, y: number) => buf.data[(y * w + x) * 4];
    expect(at(20, 15)).toBeGreaterThanOrEqual(199);
    expect(at(0, 0)).toBeLessThan(150);
  });

  it('values stay in range under strong edits', () => {
    const buf = gradient(30, 20);
    processPixelBuffer(buf, {
      ...DEFAULT_ADJUSTMENTS,
      exposure: 40,
      contrast: 60,
      saturation: 80,
      hue: 30,
      fade: 50,
      sharpen: 50,
      vignette: 50,
      cinematic: 50,
      grain: 50,
    });
    expect(buf.data.every((v) => v >= 0 && v <= 255 && Number.isInteger(v))).toBe(true);
  });
});
