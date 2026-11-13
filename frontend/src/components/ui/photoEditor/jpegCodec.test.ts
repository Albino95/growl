import { describe, expect, it } from 'vitest';
import { decodeJpeg, encodeJpeg } from './jpegCodec';

function solid(w: number, h: number, rgb: [number, number, number]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  }
  return { data, width: w, height: h };
}

describe('jpegCodec', () => {
  it('encodes without a global Buffer (React Native / Hermes)', () => {
    const g = globalThis as { Buffer?: unknown };
    const saved = g.Buffer;
    delete g.Buffer;
    try {
      const bytes = encodeJpeg(solid(16, 8, [200, 100, 50]), 88);
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes[0]).toBe(0xff);
      expect(bytes[1]).toBe(0xd8);
      // shim is removed again
      expect(typeof g.Buffer).toBe('undefined');
    } finally {
      g.Buffer = saved;
    }
  });

  it('round-trips through decode as a clamped view (no copy)', () => {
    const bytes = encodeJpeg(solid(32, 24, [10, 200, 120]), 95);
    const img = decodeJpeg(bytes);
    expect(img.width).toBe(32);
    expect(img.height).toBe(24);
    expect(img.data).toBeInstanceOf(Uint8ClampedArray);
    expect(img.data.length).toBe(32 * 24 * 4);
    expect(Math.abs(img.data[1] - 200)).toBeLessThan(6);
  });
});
