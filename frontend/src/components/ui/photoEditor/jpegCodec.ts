import jpeg from 'jpeg-js';
import type { PixelBuffer } from './pixelOps';

/**
 * Decode to RGBA. The pixel buffer is a Uint8ClampedArray *view* over jpeg-js'
 * output — no second full-size copy.
 */
export function decodeJpeg(bytes: Uint8Array): PixelBuffer {
  // (Bundled jpeg-js typings only declare `useTArray`; the rest exist at runtime.)
  const opts = {
    useTArray: true as const,
    formatAsRGBA: true,
    // Export sources are capped at EXPORT_MAX_EDGE; this only guards bad input.
    maxResolutionInMP: 40,
    maxMemoryUsageInMB: 256,
  };
  const decoded = jpeg.decode(bytes, opts);
  const raw = decoded.data as Uint8Array;
  return {
    data: new Uint8ClampedArray(raw.buffer, raw.byteOffset, raw.byteLength),
    width: decoded.width,
    height: decoded.height,
  };
}

/**
 * jpeg-js' encoder ends with `return Buffer.from(byteout)` whenever `module`
 * exists — which is always true under Metro. React Native / Hermes has no
 * global `Buffer`, so encode() threw "Buffer is not defined" on device: every
 * native export failed. Provide a minimal `Buffer.from` for the duration of the
 * (synchronous) call only.
 */
export function encodeJpeg(buffer: PixelBuffer, quality: number): Uint8Array {
  const g = globalThis as { Buffer?: unknown };
  const shim = typeof g.Buffer === 'undefined';
  if (shim) {
    g.Buffer = { from: (arr: ArrayLike<number>) => Uint8Array.from(arr) };
  }
  try {
    const out = jpeg.encode(
      { data: buffer.data, width: buffer.width, height: buffer.height },
      quality
    ).data as unknown as ArrayLike<number>;
    return out instanceof Uint8Array ? out : Uint8Array.from(out);
  } finally {
    if (shim) delete g.Buffer;
  }
}
