/**
 * Pixel pipeline for the native photo export (jpeg-js path) and the web canvas
 * path. Pure functions over an RGBA buffer — no React Native imports, so they
 * run (and are benchmarked / unit tested) in Node.
 *
 * Hermes has no JIT, so every per-pixel call counts. The loops below:
 * - write straight into a Uint8ClampedArray (the store clamps + rounds, so no
 *   Math.max/min/round per channel),
 * - hoist everything that does not depend on the pixel (hue matrix, LUTs,
 *   per-row / per-column falloff),
 * - skip whole passes that are neutral.
 */
import type { EditAdjustments } from './types';
import { isAdjustmentsNeutral, sanitizeAdjustments } from './filterEngine';
import { applyCinematicEdges } from './overlayBake';

export type PixelBuffer = { data: Uint8ClampedArray; width: number; height: number };

export function applyPixelAdjustments(buffer: PixelBuffer, adj: EditAdjustments) {
  if (isAdjustmentsNeutral(adj)) return;

  const a = sanitizeAdjustments(adj);
  const px = buffer.data;
  const exposure =
    1 + (a.exposure !== 0 ? a.exposure / 85 : 0) + (a.brightness !== 0 ? a.brightness / 170 : 0);
  const contrast = 1 + (a.contrast !== 0 ? a.contrast / 85 : 0);
  const sat = a.saturation !== 0 ? 1 + a.saturation / 85 : 1;
  const warmth = a.warmth !== 0 ? a.warmth / 100 : 0;
  const tint = a.tint !== 0 ? a.tint / 100 : 0;
  const fade = a.fade !== 0 ? a.fade / 100 : 0;
  const grayMix = a.grayscale !== 0 ? a.grayscale / 100 : 0;
  const sepiaMix = a.sepia !== 0 ? a.sepia / 100 : 0;

  // Contrast + exposure is per-channel and input-only → 256-entry LUT.
  const base = new Float32Array(256);
  for (let v = 0; v < 256; v++) {
    base[v] = ((v / 255 - 0.5) * contrast + 0.5) * 255 * exposure;
  }

  const hasHue = a.hue !== 0;
  const rad = (a.hue * 0.9 * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const m00 = 0.213 + 0.787 * cos - 0.213 * sin;
  const m01 = 0.715 - 0.715 * cos - 0.715 * sin;
  const m02 = 0.072 - 0.072 * cos + 0.928 * sin;
  const m10 = 0.213 - 0.213 * cos + 0.143 * sin;
  const m11 = 0.715 + 0.285 * cos + 0.14 * sin;
  const m12 = 0.072 - 0.072 * cos - 0.283 * sin;
  const m20 = 0.213 - 0.213 * cos - 0.787 * sin;
  const m21 = 0.715 - 0.715 * cos + 0.715 * sin;
  const m22 = 0.072 + 0.928 * cos + 0.072 * sin;

  const addR = warmth * 28 - tint * 10;
  const addG = tint * 16;
  const addB = -warmth * 22;
  const hasSat = sat !== 1;
  const hasTone = a.highlights !== 0 || a.shadows !== 0;
  const hi40 = (a.highlights / 100) * 40;
  const sh40 = (a.shadows / 100) * 40;
  const hasClarity = a.clarity !== 0;
  const clarityK = a.clarity / 120;
  const hasSepia = sepiaMix > 0;
  const sepiaKeep = 1 - sepiaMix;
  const hasGray = grayMix > 0;
  const grayKeep = 1 - grayMix;
  const hasFade = fade > 0;
  const fadeKeep = 1 - fade * 0.35;
  const fadeAdd = 255 * fade * 0.35;

  const n = px.length;
  for (let i = 0; i < n; i += 4) {
    let r = base[px[i]];
    let g = base[px[i + 1]];
    let b = base[px[i + 2]];

    if (hasHue) {
      const nr = r * m00 + g * m01 + b * m02;
      const ng = r * m10 + g * m11 + b * m12;
      const nb = r * m20 + g * m21 + b * m22;
      r = nr;
      g = ng;
      b = nb;
    }

    r += addR;
    g += addG;
    b += addB;

    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (hasSat) {
      r = lum + (r - lum) * sat;
      g = lum + (g - lum) * sat;
      b = lum + (b - lum) * sat;
    }

    if (hasTone) {
      const t = lum / 255;
      const hiW = t > 0.45 ? (t - 0.45) / 0.55 : 0;
      const shW = t < 0.55 ? (0.55 - t) / 0.55 : 0;
      const lift = hi40 * hiW + sh40 * shW;
      r += lift;
      g += lift;
      b += lift;
    }

    if (hasClarity) {
      const mid = lum / 255;
      const d = mid - 0.5;
      const c = 1 + clarityK * (1 - (d < 0 ? -d : d) * 2);
      r = (r - 127.5) * c + 127.5;
      g = (g - 127.5) * c + 127.5;
      b = (b - 127.5) * c + 127.5;
    }

    if (hasSepia) {
      const sr = 0.393 * r + 0.769 * g + 0.189 * b;
      const sg = 0.349 * r + 0.686 * g + 0.168 * b;
      const sb = 0.272 * r + 0.534 * g + 0.131 * b;
      r = r * sepiaKeep + sr * sepiaMix;
      g = g * sepiaKeep + sg * sepiaMix;
      b = b * sepiaKeep + sb * sepiaMix;
    }

    if (hasGray) {
      const l = lum * grayMix;
      r = r * grayKeep + l;
      g = g * grayKeep + l;
      b = b * grayKeep + l;
    }

    if (hasFade) {
      r = r * fadeKeep + fadeAdd;
      g = g * fadeKeep + fadeAdd;
      b = b * fadeKeep + fadeAdd;
    }

    // Uint8ClampedArray store clamps to 0…255 and rounds.
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  }
}

/**
 * 4-neighbour unsharp kernel. Keeps two original rows (rolling) instead of
 * copying the whole image, and is unrolled (the old 3×3 loop multiplied 5 zeros
 * per channel per pixel).
 */
export function applySharpen(buffer: PixelBuffer, amount: number) {
  if (amount <= 0) return;
  const { width, height, data: px } = buffer;
  if (width < 3 || height < 3) return;
  const s = amount / 200;
  const center = 1 + 4 * s;
  const stride = width * 4;
  const end = stride - 4;

  let prev = px.slice(0, stride);
  let cur = new Uint8ClampedArray(stride);
  for (let y = 1; y < height - 1; y++) {
    const rowStart = y * stride;
    const nextStart = rowStart + stride;
    cur.set(px.subarray(rowStart, nextStart));
    for (let x = 4; x < end; x += 4) {
      const o = rowStart + x;
      const nIdx = nextStart + x;
      px[o] = cur[x] * center - s * (prev[x] + px[nIdx] + cur[x - 4] + cur[x + 4]);
      px[o + 1] =
        cur[x + 1] * center - s * (prev[x + 1] + px[nIdx + 1] + cur[x - 3] + cur[x + 5]);
      px[o + 2] =
        cur[x + 2] * center - s * (prev[x + 2] + px[nIdx + 2] + cur[x - 2] + cur[x + 6]);
    }
    const tmp = prev;
    prev = cur;
    cur = tmp;
  }
}

const VIGNETTE_LUT_SIZE = 2048;

/** Radial darken. Falloff comes from a LUT over normalized squared distance. */
export function applyVignette(buffer: PixelBuffer, amount: number) {
  if (amount <= 0) return;
  const { width, height, data: px } = buffer;
  const cx = width / 2;
  const cy = height / 2;
  const maxD2 = cx * cx + cy * cy || 1;
  const halfPower = (1 + amount / 25) / 2;
  const k = amount / 100;
  const lutMax = VIGNETTE_LUT_SIZE - 1;

  // factor(t) = 1 - (sqrt(t))^power * k, with t = d² / maxD² ∈ [0, 1]
  const lut = new Float32Array(VIGNETTE_LUT_SIZE);
  for (let j = 0; j < VIGNETTE_LUT_SIZE; j++) {
    lut[j] = 1 - Math.pow(j / lutMax, halfPower) * k;
  }
  const dx2 = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const d = x - cx;
    dx2[x] = (d * d) / maxD2;
  }

  for (let y = 0; y < height; y++) {
    const dyN = ((y - cy) * (y - cy)) / maxD2;
    let i = y * width * 4;
    for (let x = 0; x < width; x++, i += 4) {
      const t = dx2[x] + dyN;
      const f = lut[t >= 1 ? lutMax : (t * lutMax + 0.5) | 0];
      px[i] *= f;
      px[i + 1] *= f;
      px[i + 2] *= f;
    }
  }
}

export function applyGrain(buffer: PixelBuffer, amount: number) {
  if (amount <= 0) return;
  const px = buffer.data;
  const amp = amount * 0.55;
  // xorshift32 — one cheap integer op chain per pixel instead of Math.random().
  let seed = (Math.random() * 0xffffffff) | 0 || 0x9e3779b9;
  const scale = amp / 4294967296;
  for (let i = 0; i < px.length; i += 4) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const noise = (seed >>> 0) * scale - amp / 2;
    px[i] += noise;
    px[i + 1] += noise;
    px[i + 2] += noise;
  }
}

/** True when the jpeg-js pass would change pixels. */
export function needsPixelPass(adjustments: EditAdjustments, overlayCount: number): boolean {
  return overlayCount > 0 || !isAdjustmentsNeutral(adjustments);
}

export function processPixelBuffer(buffer: PixelBuffer, adjustments: EditAdjustments) {
  const adj = sanitizeAdjustments(adjustments);
  applyPixelAdjustments(buffer, adj);
  applySharpen(buffer, adj.sharpen);
  applyVignette(buffer, adj.vignette);
  applyCinematicEdges(buffer, adj.cinematic);
  applyGrain(buffer, adj.grain);
}
