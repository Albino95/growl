import { Image, Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import jpeg from 'jpeg-js';
import type { CropAspect } from './types';
import type { EditAdjustments } from './types';
import { isAdjustmentsNeutral, sanitizeAdjustments } from './filterEngine';

async function getImageDimensions(uri: string): Promise<{ width: number; height: number }> {
  if (typeof document !== 'undefined') {
    const img = await loadHtmlImage(uri);
    return { width: img.width, height: img.height };
  }
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

function computeCropRect(
  width: number,
  height: number,
  aspect: CropAspect
): { originX: number; originY: number; cropW: number; cropH: number } {
  const [wR, hR] = aspect.split(':').map(Number);
  const targetRatio = wR / hR;
  const currentRatio = width / height;

  let cropW = width;
  let cropH = height;

  if (currentRatio > targetRatio) {
    cropW = Math.round(height * targetRatio);
  } else {
    cropH = Math.round(width / targetRatio);
  }

  return {
    originX: Math.round((width - cropW) / 2),
    originY: Math.round((height - cropH) / 2),
    cropW,
    cropH,
  };
}

async function cropToAspectWeb(uri: string, aspect: CropAspect): Promise<string> {
  const img = await loadHtmlImage(uri);
  const { originX, originY, cropW, cropH } = computeCropRect(img.width, img.height, aspect);

  const canvas = document.createElement('canvas');
  canvas.width = cropW;
  canvas.height = cropH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return uri;

  ctx.drawImage(img, originX, originY, cropW, cropH, 0, 0, cropW, cropH);
  return canvas.toDataURL('image/jpeg', 0.92);
}

export async function cropToAspect(uri: string, aspect: CropAspect): Promise<string> {
  if (aspect === 'free') return uri;

  if (typeof document !== 'undefined') {
    return cropToAspectWeb(uri, aspect);
  }

  const { width, height } = await getImageDimensions(uri);
  const { originX, originY, cropW, cropH } = computeCropRect(width, height, aspect);

  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ crop: { originX, originY, width: cropW, height: cropH } }],
    { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG }
  );
  return result.uri;
}

export async function rotateImage(uri: string, degrees = 90): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ rotate: degrees }],
    { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG }
  );
  return result.uri;
}

export async function flipImage(
  uri: string,
  direction: 'horizontal' | 'vertical'
): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [
      {
        flip:
          direction === 'horizontal'
            ? ImageManipulator.FlipType.Horizontal
            : ImageManipulator.FlipType.Vertical,
      },
    ],
    { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG }
  );
  return result.uri;
}

async function loadHtmlImage(uri: string): Promise<HTMLImageElement> {
  if (uri.startsWith('data:') || uri.startsWith('blob:')) {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load image'));
      img.src = uri;
    });
  }

  const res = await fetch(uri);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load image'));
      img.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function applyPixelAdjustments(buffer: PixelBuffer, adj: EditAdjustments) {
  if (isAdjustmentsNeutral(adj)) return;

  const a = sanitizeAdjustments(adj);
  const { data: px } = buffer;
  const exposure = 1 + (a.exposure !== 0 ? a.exposure / 85 : 0) + (a.brightness !== 0 ? a.brightness / 170 : 0);
  const contrast = 1 + (a.contrast !== 0 ? a.contrast / 85 : 0);
  const satFactor = a.saturation !== 0 ? 1 + a.saturation / 85 : 1;
  const warmth = a.warmth !== 0 ? a.warmth / 100 : 0;
  const tint = a.tint !== 0 ? a.tint / 100 : 0;
  const fade = a.fade !== 0 ? a.fade / 100 : 0;
  const grayMix = a.grayscale !== 0 ? a.grayscale / 100 : 0;
  const sepiaMix = a.sepia !== 0 ? a.sepia / 100 : 0;

  for (let i = 0; i < px.length; i += 4) {
    let r = px[i];
    let g = px[i + 1];
    let b = px[i + 2];

    r = ((r / 255 - 0.5) * contrast + 0.5) * 255 * exposure;
    g = ((g / 255 - 0.5) * contrast + 0.5) * 255 * exposure;
    b = ((b / 255 - 0.5) * contrast + 0.5) * 255 * exposure;

    r += warmth * 28;
    b -= warmth * 22;
    g += tint * 16;
    r -= tint * 10;

    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const sat = satFactor;
    r = lum + (r - lum) * sat;
    g = lum + (g - lum) * sat;
    b = lum + (b - lum) * sat;

    if (sepiaMix > 0) {
      const sr = 0.393 * r + 0.769 * g + 0.189 * b;
      const sg = 0.349 * r + 0.686 * g + 0.168 * b;
      const sb = 0.272 * r + 0.534 * g + 0.131 * b;
      r = r * (1 - sepiaMix) + sr * sepiaMix;
      g = g * (1 - sepiaMix) + sg * sepiaMix;
      b = b * (1 - sepiaMix) + sb * sepiaMix;
    }

    if (grayMix > 0) {
      r = r * (1 - grayMix) + lum * grayMix;
      g = g * (1 - grayMix) + lum * grayMix;
      b = b * (1 - grayMix) + lum * grayMix;
    }

    if (fade > 0) {
      r = r * (1 - fade * 0.35) + 255 * fade * 0.35;
      g = g * (1 - fade * 0.35) + 255 * fade * 0.35;
      b = b * (1 - fade * 0.35) + 255 * fade * 0.35;
    }

    px[i] = clampByte(r);
    px[i + 1] = clampByte(g);
    px[i + 2] = clampByte(b);
  }
}

function applySharpen(buffer: PixelBuffer, amount: number) {
  if (amount <= 0) return;
  const { width, height, data: px } = buffer;
  const copy = new Uint8ClampedArray(px);
  const strength = amount / 200;
  const kernel = [0, -strength, 0, -strength, 1 + 4 * strength, -strength, 0, -strength, 0];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let ki = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4 + c;
            sum += copy[idx] * kernel[ki++];
          }
        }
        px[(y * width + x) * 4 + c] = clampByte(sum);
      }
    }
  }
}

function applyVignette(buffer: PixelBuffer, amount: number) {
  if (amount <= 0) return;
  const { width, height, data: px } = buffer;
  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  const power = 1 + amount / 25;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxDist;
      const factor = 1 - Math.pow(dist, power) * (amount / 100);
      const i = (y * width + x) * 4;
      px[i] = clampByte(px[i] * factor);
      px[i + 1] = clampByte(px[i + 1] * factor);
      px[i + 2] = clampByte(px[i + 2] * factor);
    }
  }
}

function applyGrain(buffer: PixelBuffer, amount: number) {
  if (amount <= 0) return;
  const { data: px } = buffer;
  const amp = amount * 0.55;
  for (let i = 0; i < px.length; i += 4) {
    const noise = (Math.random() - 0.5) * amp;
    px[i] = clampByte(px[i] + noise);
    px[i + 1] = clampByte(px[i + 1] + noise);
    px[i + 2] = clampByte(px[i + 2] + noise);
  }
}

function clampByte(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function uint8ToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triplet = (a << 16) | (b << 8) | c;
    output += chars[(triplet >> 18) & 63];
    output += chars[(triplet >> 12) & 63];
    output += i + 1 < bytes.length ? chars[(triplet >> 6) & 63] : '=';
    output += i + 2 < bytes.length ? chars[triplet & 63] : '=';
  }
  return output;
}

/** Bake all color edits into a JPEG data URL (web canvas + native jpeg-js). */
export async function exportEditedImage(
  uri: string,
  adjustments: EditAdjustments
): Promise<string> {
  if (typeof document !== 'undefined') {
    return exportViaCanvas(uri, adjustments);
  }
  return exportViaJpegJs(uri, adjustments);
}

async function exportViaCanvas(uri: string, adjustments: EditAdjustments): Promise<string> {
  const img = await loadHtmlImage(uri);
  const maxDim = 1600;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return uri;

  ctx.drawImage(img, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  processPixelBuffer(imageData, adjustments);
  ctx.putImageData(imageData, 0, 0);

  return canvas.toDataURL('image/jpeg', 0.9);
}

async function exportViaJpegJs(uri: string, adjustments: EditAdjustments): Promise<string> {
  try {
    let sourceUri = uri;
    if (Platform.OS !== 'web' && !uri.toLowerCase().includes('.jpg') && !uri.toLowerCase().includes('.jpeg')) {
      const normalized = await ImageManipulator.manipulateAsync(sourceUri, [], {
        compress: 0.92,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      sourceUri = normalized.uri;
    }

    const response = await fetch(sourceUri);
    const buffer = await response.arrayBuffer();
    const decoded = jpeg.decode(new Uint8Array(buffer), { useTArray: true });
    const pixelBuffer: PixelBuffer = {
      data: new Uint8ClampedArray(decoded.data),
      width: decoded.width,
      height: decoded.height,
    };
    processPixelBuffer(pixelBuffer, adjustments);

    const encoded = jpeg.encode(
      { data: pixelBuffer.data, width: pixelBuffer.width, height: pixelBuffer.height },
      90
    );
    const base64 = uint8ToBase64(encoded.data);
    return `data:image/jpeg;base64,${base64}`;
  } catch {
    return uri;
  }
}

type PixelBuffer = { data: Uint8ClampedArray; width: number; height: number };

function processPixelBuffer(buffer: PixelBuffer, adjustments: EditAdjustments) {
  const adj = sanitizeAdjustments(adjustments);
  applyPixelAdjustments(buffer, adj);
  applySharpen(buffer, adj.sharpen);
  applyVignette(buffer, adj.vignette);
  applyGrain(buffer, adj.grain);
}

export { rotateImage as rotateImageFile, flipImage as flipImageFile, cropToAspect as cropToAspectFile };
