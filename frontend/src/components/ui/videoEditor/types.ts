import type { TextOverlay } from '../photoEditor/types';

export type VideoLookId =
  | 'none'
  | 'golden'
  | 'arctic'
  | 'noir'
  | 'cinema'
  | 'rose'
  | 'vivid'
  | 'muted'
  | 'sunset'
  | 'forest'
  | 'chrome';

export type VideoEditSettings = {
  /**
   * @deprecated Prefer originalVolume === 0
   * Kept for older drafts — treated as originalVolume 0 when true.
   */
  muted: boolean;
  /** Original clip volume 0–1 (default 1). Overlaps soundtrack unless 0. */
  originalVolume: number;
  /** Playback rate (0.5–2). */
  speed: number;
  /** Trim start in milliseconds. */
  trimStartMs: number;
  /** Trim end in milliseconds (0 = full duration). */
  trimEndMs: number;
  /** Cover / poster frame time in ms. */
  coverMs: number;
  flipH: boolean;
  flipV: boolean;
  lookId: VideoLookId;
  overlays: TextOverlay[];
  /** Selected track from the public music library. */
  audioTrackId?: string | null;
  /** Resolved soundtrack URL (from library). */
  audioUrl?: string | null;
  audioTitle?: string | null;
  /** Soundtrack volume 0–1. */
  audioVolume: number;
};

export const DEFAULT_VIDEO_EDIT: VideoEditSettings = {
  muted: false,
  originalVolume: 1,
  speed: 1,
  trimStartMs: 0,
  trimEndMs: 0,
  coverMs: 0,
  flipH: false,
  flipV: false,
  lookId: 'none',
  overlays: [],
  audioTrackId: null,
  audioUrl: null,
  audioTitle: null,
  audioVolume: 0.85,
};

/** Normalize partial/legacy settings into a full VideoEditSettings. */
export function normalizeVideoEdit(
  partial?: Partial<VideoEditSettings> | null
): VideoEditSettings {
  const base = { ...DEFAULT_VIDEO_EDIT, ...(partial || {}) };
  const muted = !!base.muted;
  let originalVolume =
    typeof base.originalVolume === 'number' ? base.originalVolume : muted ? 0 : 1;
  if (muted && originalVolume > 0) originalVolume = 0;
  return {
    ...base,
    muted: originalVolume <= 0.001,
    originalVolume: Math.max(0, Math.min(1, originalVolume)),
    audioVolume: Math.max(0, Math.min(1, base.audioVolume ?? 0.85)),
    speed: Math.max(0.5, Math.min(2, base.speed || 1)),
    coverMs: Math.max(0, base.coverMs || 0),
    flipH: !!base.flipH,
    flipV: !!base.flipV,
    overlays: Array.isArray(base.overlays) ? base.overlays : [],
  };
}

export type VideoLookLayer = {
  color: string;
  opacity?: number;
};

export type VideoLook = {
  id: VideoLookId;
  label: string;
  hint: string;
  cssFilter?: string;
  layers: VideoLookLayer[];
  vignette?: number;
  cinematic?: number;
  swatch: string;
};

export const VIDEO_LOOKS: VideoLook[] = [
  { id: 'none', label: 'Original', hint: 'Clean', layers: [], swatch: '#57534E' },
  {
    id: 'golden',
    label: 'Golden',
    hint: 'Hour',
    cssFilter: 'contrast(1.08) saturate(1.18) sepia(0.22) brightness(1.04)',
    layers: [
      { color: 'rgba(251, 191, 36, 0.2)' },
      { color: 'rgba(249, 115, 22, 0.1)' },
    ],
    vignette: 0.22,
    swatch: '#F59E0B',
  },
  {
    id: 'arctic',
    label: 'Arctic',
    hint: 'Cool',
    cssFilter: 'contrast(1.12) saturate(0.85) brightness(1.05) hue-rotate(190deg)',
    layers: [
      { color: 'rgba(56, 189, 248, 0.18)' },
      { color: 'rgba(15, 23, 42, 0.12)' },
    ],
    vignette: 0.18,
    swatch: '#38BDF8',
  },
  {
    id: 'cinema',
    label: 'Cinema',
    hint: 'Teal',
    cssFilter: 'contrast(1.22) saturate(0.88) brightness(0.92)',
    layers: [
      { color: 'rgba(15, 118, 110, 0.16)' },
      { color: 'rgba(120, 53, 15, 0.1)' },
    ],
    vignette: 0.35,
    cinematic: 0.55,
    swatch: '#0F766E',
  },
  {
    id: 'noir',
    label: 'Noir',
    hint: 'B&W',
    cssFilter: 'grayscale(1) contrast(1.28) brightness(0.95)',
    layers: [{ color: 'rgba(0, 0, 0, 0.28)' }],
    vignette: 0.45,
    cinematic: 0.35,
    swatch: '#1C1917',
  },
  {
    id: 'rose',
    label: 'Rose',
    hint: 'Soft',
    cssFilter: 'contrast(0.95) saturate(1.15) brightness(1.06) sepia(0.12)',
    layers: [
      { color: 'rgba(244, 114, 182, 0.2)' },
      { color: 'rgba(255, 255, 255, 0.08)' },
    ],
    vignette: 0.12,
    swatch: '#F472B6',
  },
  {
    id: 'vivid',
    label: 'Vivid',
    hint: 'Punch',
    cssFilter: 'contrast(1.2) saturate(1.45) brightness(1.03)',
    layers: [{ color: 'rgba(236, 72, 153, 0.08)' }],
    vignette: 0.1,
    swatch: '#EC4899',
  },
  {
    id: 'muted',
    label: 'Muted',
    hint: 'Matte',
    cssFilter: 'contrast(0.88) saturate(0.7) brightness(1.08)',
    layers: [
      { color: 'rgba(255, 255, 255, 0.14)' },
      { color: 'rgba(120, 113, 108, 0.12)' },
    ],
    swatch: '#A8A29E',
  },
  {
    id: 'sunset',
    label: 'Sunset',
    hint: 'Glow',
    cssFilter: 'contrast(1.1) saturate(1.25) sepia(0.28) brightness(1.02)',
    layers: [
      { color: 'rgba(251, 113, 133, 0.18)' },
      { color: 'rgba(251, 146, 60, 0.16)' },
    ],
    vignette: 0.2,
    swatch: '#FB7185',
  },
  {
    id: 'forest',
    label: 'Forest',
    hint: 'Green',
    cssFilter: 'contrast(1.14) saturate(0.95) hue-rotate(55deg) brightness(0.96)',
    layers: [
      { color: 'rgba(22, 163, 74, 0.16)' },
      { color: 'rgba(15, 23, 42, 0.14)' },
    ],
    vignette: 0.28,
    cinematic: 0.25,
    swatch: '#16A34A',
  },
  {
    id: 'chrome',
    label: 'Chrome',
    hint: 'Metal',
    cssFilter: 'contrast(1.3) saturate(0.55) brightness(1.08)',
    layers: [
      { color: 'rgba(148, 163, 184, 0.2)' },
      { color: 'rgba(15, 23, 42, 0.15)' },
    ],
    vignette: 0.3,
    swatch: '#94A3B8',
  },
];

export function getVideoLook(id: VideoLookId | string): VideoLook {
  return VIDEO_LOOKS.find((l) => l.id === id) || VIDEO_LOOKS[0];
}

export const SPEED_PRESETS = [
  { value: 0.5, label: '0.5×', hint: 'Slow-mo' },
  { value: 0.75, label: '0.75×', hint: 'Ease' },
  { value: 1, label: '1×', hint: 'Normal' },
  { value: 1.25, label: '1.25×', hint: 'Snappy' },
  { value: 1.5, label: '1.5×', hint: 'Fast' },
  { value: 2, label: '2×', hint: 'Rush' },
] as const;
