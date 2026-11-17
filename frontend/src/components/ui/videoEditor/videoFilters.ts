import { buildCssFilter, mergeAdjustments } from '../photoEditor/filterEngine';
import type { VideoEditSettings } from './types';
import { getVideoLook } from './types';

/** Combined CSS filter chain for video preview (web). */
export function buildVideoCssFilter(edit: VideoEditSettings): string | undefined {
  const look = getVideoLook(edit.lookId);
  const adjFilter = buildCssFilter(
    mergeAdjustments(edit.filterPresetId, edit.manualAdjust)
  );
  const parts = [adjFilter, look.cssFilter].filter((p) => p && p !== 'none') as string[];
  return parts.length ? parts.join(' ') : undefined;
}

export function videoVignetteStrength(edit: VideoEditSettings): number {
  const look = getVideoLook(edit.lookId);
  const adj = mergeAdjustments(edit.filterPresetId, edit.manualAdjust);
  const fromAdj = (adj.vignette || 0) / 100;
  return Math.max(look.vignette || 0, fromAdj);
}

export function videoCinematicStrength(edit: VideoEditSettings): number {
  const look = getVideoLook(edit.lookId);
  const adj = mergeAdjustments(edit.filterPresetId, edit.manualAdjust);
  const fromAdj = (adj.cinematic || 0) / 50;
  return Math.max(look.cinematic || 0, fromAdj);
}

export function videoFadeOpacity(edit: VideoEditSettings): number {
  const adj = mergeAdjustments(edit.filterPresetId, edit.manualAdjust);
  const fade = adj.fade || 0;
  if (fade <= 0) return 0;
  return Math.min(0.35, fade / 120);
}
