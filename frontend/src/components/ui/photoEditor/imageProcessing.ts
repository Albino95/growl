import { Image, Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import type { CropAspect, EditAdjustments, ImageToneStats, TextOverlay } from './types';
import { bakeTextOverlaysOnBuffer, bakeTextOverlaysOnCanvas } from './overlayBake';
import { needsPixelPass, processPixelBuffer } from './pixelOps';
import { readFileBytes, writeJpegBytes } from './fileBytes';
import { decodeJpeg, encodeJpeg } from './jpegCodec';
import {
  computeCropRect,
  isManipulatorJpeg,
  planGeometry,
  type GeometryEdit,
  type Size,
} from './geometry';

export { computeCropRect, planGeometry, isManipulatorJpeg };
export type { GeometryEdit, Size };

/**
 * Long edge of the working copy / export. Upload caps are 1440 (story) –
 * 1600 (post); a phone shows ≤1170px wide, and 1280 cuts ~16% of the pixels
 * the jpeg-js pass has to touch versus the old 1400.
 */
export const EXPORT_MAX_EDGE = 1280;

/** Intermediate JPEGs get decoded again — keep them near-lossless. */
const INTERMEDIATE_QUALITY = 0.92;
const FINAL_JPEG_QUALITY = 88;

const isWeb = () => Platform.OS === 'web' || typeof document !== 'undefined';

// ---------------------------------------------------------------------------
// Sizes: every ImageManipulator result tells us its size; remember it so later
// steps don't pay for Image.getSize (which loads the image again).
// ---------------------------------------------------------------------------
const sizeCache = new Map<string, Size>();

function rememberSize(uri: string, width: number, height: number) {
  if (!(width > 0 && height > 0)) return;
  if (sizeCache.size > 48) {
    const first = sizeCache.keys().next().value;
    if (first !== undefined) sizeCache.delete(first);
  }
  sizeCache.set(uri, { width, height });
}

async function getImageDimensions(uri: string): Promise<Size> {
  const cached = sizeCache.get(uri);
  if (cached) return cached;
  if (typeof document !== 'undefined') {
    const img = await loadHtmlImage(uri);
    return { width: img.width, height: img.height };
  }
  const size = await new Promise<Size>((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
  rememberSize(uri, size.width, size.height);
  return size;
}

async function manipulate(
  uri: string,
  actions: ImageManipulator.Action[],
  compress = INTERMEDIATE_QUALITY
): Promise<{ uri: string; width: number; height: number }> {
  const res = await ImageManipulator.manipulateAsync(uri, actions, {
    compress,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  rememberSize(res.uri, res.width, res.height);
  return { uri: res.uri, width: res.width, height: res.height };
}

/** Let React commit + the UI paint (e.g. a "Saving…" overlay) before heavy sync work. */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => void })
      .requestAnimationFrame;
    if (typeof raf === 'function') raf(() => setTimeout(resolve, 0));
    else setTimeout(resolve, 16);
  });
}

// ---------------------------------------------------------------------------
// Geometry (straighten / crop / resize) — ONE ImageManipulator call on native.
// ---------------------------------------------------------------------------

/**
 * Native: rotate + crop + resize in a single manipulateAsync (one decode, one
 * encode). The old path re-encoded after every step and called Image.getSize
 * in between. Web keeps the canvas / sequential path.
 *
 * `normalize`: also re-encode when nothing changes, unless the source is
 * already one of our JPEGs (jpeg-js can't read HEIC/PNG and ignores EXIF
 * orientation; ImageManipulator output has orientation baked in).
 */
export async function applyGeometry(
  uri: string,
  geometry: GeometryEdit,
  opts: { maxEdge?: number; normalize?: boolean } = {}
): Promise<{ uri: string; width: number; height: number }> {
  const maxEdge = opts.maxEdge ?? Number.POSITIVE_INFINITY;
  if (isWeb()) {
    let out = uri;
    if (Math.abs(geometry.straighten) >= 0.4) out = await straightenSequential(out, geometry.straighten);
    if (geometry.crop !== 'free') {
      out = await cropToAspectWeb(out, geometry.crop, geometry.offsetX, geometry.offsetY);
    }
    return { uri: out, width: 0, height: 0 };
  }

  const size = await getImageDimensions(uri);
  const plan = planGeometry(size, geometry, maxEdge);
  if (plan.actions.length === 0 && (!opts.normalize || isManipulatorJpeg(uri))) {
    return { uri, width: size.width, height: size.height };
  }
  return manipulate(uri, plan.actions);
}

async function cropToAspectWeb(
  uri: string,
  aspect: CropAspect,
  offsetX = 0,
  offsetY = 0
): Promise<string> {
  if (aspect === 'free') return uri;
  const img = await loadHtmlImage(uri);
  const { originX, originY, cropW, cropH } = computeCropRect(
    img.width,
    img.height,
    aspect,
    offsetX,
    offsetY
  );

  const canvas = document.createElement('canvas');
  canvas.width = cropW;
  canvas.height = cropH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return uri;

  ctx.drawImage(img, originX, originY, cropW, cropH, 0, 0, cropW, cropH);
  return canvas.toDataURL('image/jpeg', 0.92);
}

export async function cropToAspect(
  uri: string,
  aspect: CropAspect,
  offsetX = 0,
  offsetY = 0
): Promise<string> {
  if (aspect === 'free') return uri;
  if (isWeb()) return cropToAspectWeb(uri, aspect, offsetX, offsetY);
  const out = await applyGeometry(uri, { straighten: 0, crop: aspect, offsetX, offsetY });
  return out.uri;
}

/** Web: rotate, measure, crop (ImageManipulator web build is canvas based). */
async function straightenSequential(uri: string, degrees: number): Promise<string> {
  const angle = Math.max(-15, Math.min(15, degrees));
  if (Math.abs(angle) < 0.4) return uri;
  const { width: srcW, height: srcH } = await getImageDimensions(uri);
  const rotated = await manipulate(uri, [{ rotate: angle }]);
  const { width, height } = rotated;
  const rad = (Math.abs(angle) * Math.PI) / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  const safeW = Math.min(Math.max(1, Math.round(srcW * cos - srcH * sin)), width);
  const safeH = Math.min(Math.max(1, Math.round(srcH * cos - srcW * sin)), height);
  if (safeW < 8 || safeH < 8) return rotated.uri;
  const out = await manipulate(rotated.uri, [
    {
      crop: {
        originX: Math.round((width - safeW) / 2),
        originY: Math.round((height - safeH) / 2),
        width: safeW,
        height: safeH,
      },
    },
  ]);
  return out.uri;
}

/**
 * Straighten by a small angle (−15…15°), then center-crop to remove empty corners.
 */
export async function straightenImage(uri: string, degrees: number): Promise<string> {
  if (Math.abs(degrees) < 0.4) return uri;
  if (isWeb()) return straightenSequential(uri, degrees);
  const out = await applyGeometry(uri, { straighten: degrees, crop: 'free', offsetX: 0, offsetY: 0 });
  return out.uri;
}

export async function rotateImage(uri: string, degrees = 90): Promise<string> {
  return (await manipulate(uri, [{ rotate: degrees }])).uri;
}

export async function flipImage(
  uri: string,
  direction: 'horizontal' | 'vertical'
): Promise<string> {
  const out = await manipulate(uri, [
    {
      flip:
        direction === 'horizontal'
          ? ImageManipulator.FlipType.Horizontal
          : ImageManipulator.FlipType.Vertical,
    },
  ]);
  return out.uri;
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

// ---------------------------------------------------------------------------
// Working copy
// ---------------------------------------------------------------------------

export type WorkingCopy = { uri: string; width: number; height: number };

/**
 * JPEG copy of the picked photo, long edge ≤ maxEdge, orientation baked in.
 * iPhone library photos are often 12–48 MP HEIC: slow to show and jpeg-js
 * can't decode them. Never throws — falls back to the original URI.
 */
export async function prepareWorkingCopy(
  uri: string,
  maxEdge = EXPORT_MAX_EDGE
): Promise<WorkingCopy> {
  const compress = maxEdge <= 720 ? 0.72 : INTERMEDIATE_QUALITY;
  try {
    // Already a small-enough JPEG written by ImageManipulator: reuse it instead
    // of re-compressing (costs time and quality).
    if (isManipulatorJpeg(uri)) {
      const size = await getImageDimensions(uri);
      if (Math.max(size.width, size.height) <= maxEdge) return { uri, ...size };
    }
    if (!isWeb()) {
      // One native decode gives us the size; no separate Image.getSize pass.
      try {
        return await prepareWithContext(uri, maxEdge, compress);
      } catch {
        /* fall through to manipulateAsync */
      }
    }
    const size = await getImageDimensions(uri);
    const plan = planGeometry(size, { straighten: 0, crop: 'free', offsetX: 0, offsetY: 0 }, maxEdge);
    return await manipulate(uri, plan.actions, compress);
  } catch {
    return { uri, width: 0, height: 0 };
  }
}

async function prepareWithContext(uri: string, maxEdge: number, compress: number): Promise<WorkingCopy> {
  const Manip = ImageManipulator.ImageManipulator;
  const decoded = await Manip.manipulate(uri).renderAsync();
  let target = decoded;
  try {
    const long = Math.max(decoded.width, decoded.height);
    if (long > maxEdge) {
      const scale = maxEdge / long;
      target = await Manip.manipulate(decoded)
        .resize({
          width: Math.max(1, Math.round(decoded.width * scale)),
          height: Math.max(1, Math.round(decoded.height * scale)),
        })
        .renderAsync();
    }
    const saved = await target.saveAsync({ compress, format: ImageManipulator.SaveFormat.JPEG });
    rememberSize(saved.uri, saved.width, saved.height);
    return { uri: saved.uri, width: saved.width, height: saved.height };
  } finally {
    try {
      if (target !== decoded) target.release();
      decoded.release();
    } catch {
      /* best effort */
    }
  }
}

export async function prepareExportSource(uri: string, maxEdge = EXPORT_MAX_EDGE): Promise<string> {
  return (await prepareWorkingCopy(uri, maxEdge)).uri;
}

const warmCache = new Map<string, Promise<WorkingCopy>>();

/**
 * Start preparing the editor's working copy as early as possible (e.g. right
 * when the picker returns). PhotoEditor awaits the same promise on open.
 */
export function warmPhotoEditorSource(uri: string): Promise<WorkingCopy> {
  const hit = warmCache.get(uri);
  if (hit) return hit;
  const p = prepareWorkingCopy(uri, EXPORT_MAX_EDGE).then((copy) => {
    // Failed prep (original handed back) — don't pin it; a retry tries again.
    if (copy.uri === uri) warmCache.delete(uri);
    return copy;
  });
  if (warmCache.size >= 4) {
    const first = warmCache.keys().next().value;
    if (first !== undefined) warmCache.delete(first);
  }
  warmCache.set(uri, p);
  return p;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export type ExportPhase = 'geometry' | 'read' | 'decode' | 'adjust' | 'encode' | 'write';
export type ExportError = Error & { phase: ExportPhase };

function phaseError(phase: ExportPhase, cause: unknown): ExportError {
  const reason = cause instanceof Error && cause.message ? cause.message : String(cause);
  const err = new Error(`Export failed at ${phase}: ${reason}`) as ExportError;
  err.phase = phase;
  return err;
}

export function exportErrorPhase(err: unknown): ExportPhase | null {
  const phase = (err as { phase?: unknown } | null)?.phase;
  return typeof phase === 'string' ? (phase as ExportPhase) : null;
}

async function step<T>(
  phase: ExportPhase,
  onPhase: ((p: ExportPhase) => void) | undefined,
  fn: () => T | Promise<T>
): Promise<T> {
  onPhase?.(phase);
  try {
    return await fn();
  } catch (err) {
    throw phaseError(phase, err);
  }
}

export type RenderOptions = {
  geometry?: GeometryEdit;
  adjustments: EditAdjustments;
  overlays?: TextOverlay[];
  /** Called before each phase so the UI can show "Applying edits…" etc. */
  onPhase?: (phase: ExportPhase) => void;
  maxEdge?: number;
};

/**
 * Bake geometry + color edits + text overlays into a new JPEG.
 * Native returns a file:// URI in the cache dir; web returns a data URL.
 * Throws an ExportError (with `.phase`) — never silently hands back the
 * unedited photo.
 */
export async function renderEditedPhoto(sourceUri: string, opts: RenderOptions): Promise<string> {
  const geometry: GeometryEdit = opts.geometry ?? {
    straighten: 0,
    crop: 'free',
    offsetX: 0,
    offsetY: 0,
  };
  const overlays = (opts.overlays || []).filter((o) => o.text.trim());
  const pixel = needsPixelPass(opts.adjustments, overlays.length);
  const maxEdge = opts.maxEdge ?? EXPORT_MAX_EDGE;
  const { onPhase } = opts;

  if (isWeb()) {
    const geo = await step('geometry', onPhase, () => applyGeometry(sourceUri, geometry));
    if (!pixel) return geo.uri;
    return step('adjust', onPhase, async () => {
      await nextFrame();
      return exportViaCanvas(geo.uri, opts.adjustments, overlays);
    });
  }

  // 1) One native pass: straighten + crop + downscale (+ HEIC → JPEG).
  const geo = await step('geometry', onPhase, () =>
    applyGeometry(sourceUri, geometry, { maxEdge, normalize: pixel })
  );
  if (!pixel) return geo.uri;

  // 2) Pixel pass (jpeg-js). Yield first so the overlay paints before the JS
  //    thread is busy with sync work.
  const bytes = await step('read', onPhase, async () => {
    await nextFrame();
    return readFileBytes(geo.uri);
  });
  const buffer = await step('decode', onPhase, () => decodeJpeg(bytes));
  await step('adjust', onPhase, async () => {
    await nextFrame();
    processPixelBuffer(buffer, opts.adjustments);
    if (overlays.length) bakeTextOverlaysOnBuffer(buffer, overlays);
  });
  const encoded = await step('encode', onPhase, async () => {
    await nextFrame();
    return encodeJpeg(buffer, FINAL_JPEG_QUALITY);
  });
  const out = await step('write', onPhase, () => writeJpegBytes(encoded));
  rememberSize(out, buffer.width, buffer.height);
  return out;
}

/** Bake color edits (+ optional text overlays) only — kept for callers without geometry. */
export async function exportEditedImage(
  uri: string,
  adjustments: EditAdjustments,
  options?: { overlays?: TextOverlay[] }
): Promise<string> {
  return renderEditedPhoto(uri, { adjustments, overlays: options?.overlays });
}

async function exportViaCanvas(
  uri: string,
  adjustments: EditAdjustments,
  overlays: TextOverlay[]
): Promise<string> {
  const img = await loadHtmlImage(uri);
  const maxDim = 1600;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  ctx.drawImage(img, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  processPixelBuffer(imageData, adjustments);
  ctx.putImageData(imageData, 0, 0);

  if (overlays.length) {
    bakeTextOverlaysOnCanvas(ctx, width, height, overlays);
  }

  return canvas.toDataURL('image/jpeg', 0.9);
}

export { rotateImage as rotateImageFile, flipImage as flipImageFile, cropToAspect as cropToAspectFile };

/** Tiny sample for Auto — not the export path. */
export async function sampleImageStats(uri: string): Promise<ImageToneStats> {
  const jpegUri = await prepareExportSource(uri, 64);
  const px = decodeJpeg(await readFileBytes(jpegUri)).data;
  let lumaSum = 0;
  let lumaSq = 0;
  let warmSum = 0;
  let satSum = 0;
  let n = 0;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    lumaSum += luma;
    lumaSq += luma * luma;
    warmSum += r - b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    satSum += max === 0 ? 0 : (max - min) / max;
    n += 1;
  }
  if (n === 0) {
    return { luma: 0.5, contrast: 0.2, warmth: 0, sat: 0.25 };
  }
  const mean = lumaSum / n;
  const variance = Math.max(0, lumaSq / n - mean * mean);
  return {
    luma: mean / 255,
    contrast: Math.sqrt(variance) / 255,
    warmth: warmSum / n / 255,
    sat: satSum / n,
  };
}
