/**
 * Pure geometry planning for the export: turns straighten + aspect crop +
 * downscale into ONE ImageManipulator action list (rotate → crop → resize),
 * so the photo is decoded and re-encoded once instead of once per step.
 */
import type { Action } from 'expo-image-manipulator';
import type { CropAspect } from './types';

export type Size = { width: number; height: number };

export type GeometryEdit = {
  /** Degrees, −15…15. |angle| < 0.4 is ignored. */
  straighten: number;
  crop: CropAspect;
  /** Normalized −1…1 shift of the crop window within the slack. */
  offsetX: number;
  offsetY: number;
};

/** JPEGs written by ImageManipulator (orientation baked in; jpeg-js safe). */
export function isManipulatorJpeg(uri: string): boolean {
  return /ImageManipulator\/[^/]+\.jpe?g(\?|$)/i.test(uri);
}

export function computeCropRect(
  width: number,
  height: number,
  aspect: CropAspect,
  offsetX = 0,
  offsetY = 0
): { originX: number; originY: number; cropW: number; cropH: number } {
  if (aspect === 'free') return { originX: 0, originY: 0, cropW: width, cropH: height };
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

  const maxOffsetX = Math.max(0, (width - cropW) / 2);
  const maxOffsetY = Math.max(0, (height - cropH) / 2);
  const clampedX = Math.max(-1, Math.min(1, offsetX || 0));
  const clampedY = Math.max(-1, Math.min(1, offsetY || 0));

  return {
    originX: Math.round(maxOffsetX + clampedX * maxOffsetX),
    originY: Math.round(maxOffsetY + clampedY * maxOffsetY),
    cropW,
    cropH,
  };
}

export function planGeometry(
  size: Size,
  geometry: GeometryEdit,
  maxEdge = Number.POSITIVE_INFINITY
): { actions: Action[]; width: number; height: number } {
  const actions: Action[] = [];
  let w = size.width;
  let h = size.height;
  // Crop window in the (possibly rotated) canvas.
  let x0 = 0;
  let y0 = 0;
  let cropped = false;

  const angle = Math.max(-15, Math.min(15, geometry.straighten || 0));
  if (Math.abs(angle) >= 0.4) {
    actions.push({ rotate: angle });
    const rad = (Math.abs(angle) * Math.PI) / 180;
    const sin = Math.sin(rad);
    const cos = Math.cos(rad);
    // ImageManipulator (iOS) floors the rotated bounding box.
    const rw = Math.max(1, Math.floor(w * cos + h * sin));
    const rh = Math.max(1, Math.floor(w * sin + h * cos));
    // Same inscribed rectangle the editor has always used.
    const safeW = Math.min(Math.max(1, Math.round(w * cos - h * sin)), rw);
    const safeH = Math.min(Math.max(1, Math.round(h * cos - w * sin)), rh);
    if (safeW >= 8 && safeH >= 8) {
      x0 = Math.round((rw - safeW) / 2);
      y0 = Math.round((rh - safeH) / 2);
      w = safeW;
      h = safeH;
      cropped = true;
    } else {
      w = rw;
      h = rh;
    }
  }

  if (geometry.crop !== 'free') {
    const r = computeCropRect(w, h, geometry.crop, geometry.offsetX, geometry.offsetY);
    if (r.cropW !== w || r.cropH !== h) {
      x0 += r.originX;
      y0 += r.originY;
      w = r.cropW;
      h = r.cropH;
      cropped = true;
    }
  }

  if (cropped) {
    actions.push({ crop: { originX: x0, originY: y0, width: w, height: h } });
  }

  const long = Math.max(w, h);
  if (long > maxEdge) {
    const scale = maxEdge / long;
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
    actions.push({ resize: { width: w, height: h } });
  }

  return { actions, width: w, height: h };
}
