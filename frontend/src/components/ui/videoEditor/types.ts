import type { TextOverlay } from '../photoEditor/types';

export type VideoLookId = 'none' | 'warm' | 'cool' | 'cine' | 'fade' | 'pop' | 'noir';

export type VideoEditSettings = {
  muted: boolean;
  /** Playback rate (0.5–2). */
  speed: number;
  /** Trim start in milliseconds. */
  trimStartMs: number;
  /** Trim end in milliseconds (0 = full duration). */
  trimEndMs: number;
  lookId: VideoLookId;
  overlays: TextOverlay[];
};

export const DEFAULT_VIDEO_EDIT: VideoEditSettings = {
  muted: false,
  speed: 1,
  trimStartMs: 0,
  trimEndMs: 0,
  lookId: 'none',
  overlays: [],
};

export type VideoLook = {
  id: VideoLookId;
  label: string;
  /** Color wash over the frame. */
  wash: string | null;
  /** Extra top/bottom darken. */
  cinematic?: boolean;
  /** Approximate grayscale strength 0–1 (web CSS / overlay). */
  grayscale?: number;
};

export const VIDEO_LOOKS: VideoLook[] = [
  { id: 'none', label: 'Original', wash: null },
  { id: 'warm', label: 'Warm', wash: 'rgba(251, 191, 36, 0.22)' },
  { id: 'cool', label: 'Cool', wash: 'rgba(56, 189, 248, 0.2)' },
  { id: 'cine', label: 'Cine', wash: 'rgba(15, 23, 42, 0.28)', cinematic: true },
  { id: 'fade', label: 'Fade', wash: 'rgba(255, 255, 255, 0.14)' },
  { id: 'pop', label: 'Pop', wash: 'rgba(244, 114, 182, 0.14)' },
  { id: 'noir', label: 'Noir', wash: 'rgba(0, 0, 0, 0.35)', grayscale: 1, cinematic: true },
];

export function getVideoLook(id: VideoLookId): VideoLook {
  return VIDEO_LOOKS.find((l) => l.id === id) || VIDEO_LOOKS[0];
}
