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
  return clampAdjustments(merged);
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
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Map slider values to CSS filter chain (preview). */
export function buildCssFilter(adj: EditAdjustments): string {
  const exposure = 1 + adj.exposure / 100 + adj.brightness / 200;
  const contrast = 1 + adj.contrast / 100;
  const saturate = Math.max(0, 1 + adj.saturation / 100);
  const hue = adj.hue * 0.9 + adj.tint * 0.4 + adj.warmth * -0.3;
  const sepia = adj.sepia / 100;
  const gray = adj.grayscale / 100;
  const warmthSepia = Math.max(0, adj.warmth / 200);

  const parts: string[] = [];
  if (exposure !== 1) parts.push(`brightness(${exposure.toFixed(3)})`);
  if (contrast !== 1) parts.push(`contrast(${contrast.toFixed(3)})`);
  if (saturate !== 1) parts.push(`saturate(${saturate.toFixed(3)})`);
  if (hue !== 0) parts.push(`hue-rotate(${hue.toFixed(1)}deg)`);
  const totalSepia = Math.min(1, sepia + warmthSepia);
  if (totalSepia > 0) parts.push(`sepia(${totalSepia.toFixed(3)})`);
  if (gray > 0) parts.push(`grayscale(${gray.toFixed(3)})`);
  if (adj.fade > 0) parts.push(`opacity(${Math.max(0.72, 1 - adj.fade / 200).toFixed(3)})`);

  return parts.join(' ') || 'none';
}

export function hasActiveEdits(adj: EditAdjustments, presetId: string | null): boolean {
  if (presetId && presetId !== 'original') return true;
  return Object.entries(adj).some(([, v]) => Math.abs(v) > 0.5);
}
