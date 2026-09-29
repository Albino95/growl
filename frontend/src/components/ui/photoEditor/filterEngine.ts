import type { EditAdjustments } from './types';
import { DEFAULT_ADJUSTMENTS } from './types';
import { getPresetById } from './presets';

/** Merge preset deltas with manual fine-tune sliders. */
export function mergeAdjustments(
  presetId: string | null,
  manual: EditAdjustments
): EditAdjustments {
  const preset = presetId ? getPresetById(presetId) : undefined;
  const base = { ...DEFAULT_ADJUSTMENTS };

  if (preset?.deltas) {
    for (const key of Object.keys(preset.deltas) as (keyof EditAdjustments)[]) {
      const delta = preset.deltas[key];
      if (delta !== undefined) base[key] = (base[key] ?? 0) + delta;
    }
  }

  const merged = { ...base };
  for (const key of Object.keys(manual) as (keyof EditAdjustments)[]) {
    merged[key] = (merged[key] ?? 0) + (manual[key] ?? 0);
  }
  return sanitizeAdjustments(clampAdjustments(merged));
}

function clampAdjustments(a: EditAdjustments): EditAdjustments {
  return {
    exposure: clamp(a.exposure, -40, 40),
    brightness: clamp(a.brightness, -40, 40),
    contrast: clamp(a.contrast, -40, 60),
    saturation: clamp(a.saturation, -80, 80),
    warmth: clamp(a.warmth, -40, 40),
    tint: clamp(a.tint, -40, 40),
    fade: clamp(a.fade, 0, 50),
    vignette: clamp(a.vignette, 0, 50),
    sharpen: clamp(a.sharpen, 0, 50),
    grain: clamp(a.grain, 0, 50),
    hue: clamp(a.hue, -40, 40),
    sepia: clamp(a.sepia, 0, 100),
    grayscale: clamp(a.grayscale, 0, 100),
    highlights: clamp(a.highlights, -40, 40),
    shadows: clamp(a.shadows, -40, 40),
    clarity: clamp(a.clarity, -40, 40),
    cinematic: clamp(a.cinematic, 0, 50),
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Values within this range of zero are treated as no-op (slider tap noise). */
const NEUTRAL_THRESHOLD = 0.5;

export function sanitizeAdjustments(adj: EditAdjustments): EditAdjustments {
  const out = { ...adj };
  for (const key of Object.keys(out) as (keyof EditAdjustments)[]) {
    if (Math.abs(out[key]) < NEUTRAL_THRESHOLD) {
      out[key] = 0;
    } else {
      out[key] = Math.round(out[key]);
    }
  }
  return out;
}

export function snapSliderValue(value: number, defaultValue = 0): number {
  if (Math.abs(value - defaultValue) < NEUTRAL_THRESHOLD) return defaultValue;
  return Math.round(value);
}

export function isAdjustmentsNeutral(adj: EditAdjustments): boolean {
  const sanitized = sanitizeAdjustments(adj);
  return (Object.keys(sanitized) as (keyof EditAdjustments)[]).every(
    (key) => sanitized[key] === 0
  );
}

/** Map slider values to CSS filter chain (preview). Skips neutral (≈0) values. */
export function buildCssFilter(adj: EditAdjustments): string {
  const a = sanitizeAdjustments(adj);
  const exposureMul =
    1 +
    (a.exposure !== 0 ? a.exposure / 100 : 0) +
    (a.brightness !== 0 ? a.brightness / 200 : 0) +
    (a.highlights !== 0 ? a.highlights / 280 : 0) +
    (a.shadows !== 0 ? a.shadows / 320 : 0);
  const contrastMul =
    1 +
    (a.contrast !== 0 ? a.contrast / 100 : 0) +
    (a.clarity !== 0 ? a.clarity / 160 : 0);
  const saturateMul = a.saturation !== 0 ? Math.max(0, 1 + a.saturation / 100) : 1;
  const hue =
    (a.hue !== 0 ? a.hue * 0.9 : 0) +
    (a.tint !== 0 ? a.tint * 0.4 : 0) +
    (a.warmth !== 0 ? a.warmth * -0.3 : 0);
  const sepia = a.sepia !== 0 ? a.sepia / 100 : 0;
  const gray = a.grayscale !== 0 ? a.grayscale / 100 : 0;
  const warmthSepia = a.warmth > 0 ? a.warmth / 200 : 0;

  const parts: string[] = [];
  if (exposureMul !== 1) parts.push(`brightness(${exposureMul.toFixed(3)})`);
  if (contrastMul !== 1) parts.push(`contrast(${contrastMul.toFixed(3)})`);
  if (saturateMul !== 1) parts.push(`saturate(${saturateMul.toFixed(3)})`);
  if (hue !== 0) parts.push(`hue-rotate(${hue.toFixed(1)}deg)`);
  const totalSepia = Math.min(1, sepia + warmthSepia);
  if (totalSepia > 0) parts.push(`sepia(${totalSepia.toFixed(3)})`);
  if (gray > 0) parts.push(`grayscale(${gray.toFixed(3)})`);
  if (a.fade > 0) parts.push(`opacity(${Math.max(0.72, 1 - a.fade / 200).toFixed(3)})`);
  // Cinematic edges approximated as slight darkening in preview
  if (a.cinematic > 0) {
    parts.push(`brightness(${Math.max(0.82, 1 - a.cinematic / 220).toFixed(3)})`);
  }

  return parts.join(' ') || 'none';
}

export function hasActiveEdits(adj: EditAdjustments, presetId: string | null): boolean {
  if (presetId && presetId !== 'original') return true;
  return !Object.values(sanitizeAdjustments(adj)).every((v) => v === 0);
}

/** One-tap “Auto” look — gentle pro polish, not a heavy filter. */
export const AUTO_ENHANCE_ADJUSTMENTS: EditAdjustments = {
  ...DEFAULT_ADJUSTMENTS,
  exposure: 4,
  contrast: 10,
  saturation: 8,
  warmth: 4,
  shadows: 8,
  highlights: -6,
  clarity: 10,
  sharpen: 8,
};

/** Vertical-clip auto look — slight cinematic edges. */
export const AUTO_REEL_ADJUSTMENTS: EditAdjustments = {
  ...AUTO_ENHANCE_ADJUSTMENTS,
  cinematic: 18,
  vignette: 10,
  contrast: 12,
};
