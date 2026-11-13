import type * as ImagePicker from 'expo-image-picker';
import type { ComposerKind } from '../services/createContent';
import {
  FAST_CAMERA,
  FAST_IMAGE_PICKER,
  FAST_REEL_PICKER,
  FAST_STORY_CAMERA,
  FAST_STORY_PICKER,
} from '../utils/prepareImageUpload';

export type ComposerAspect = '4:5' | '9:16';

export type ComposerConfig = {
  kind: ComposerKind;
  /** "a post" — permission copy. */
  noun: string;
  /** Header title. */
  title: string;
  library: ImagePicker.ImagePickerOptions;
  /** `reel-capture` uses the in-app ReelCameraCapture modal instead of the OS camera. */
  camera: { type: 'picker'; options: ImagePicker.ImagePickerOptions } | { type: 'reel-capture' };
  acceptsVideo: boolean;
  /** Longer clips open with the trim window clamped to this. 0 = no clamp. */
  maxClipMs: number;
  /** Stage + editor crop aspect. */
  aspect: ComposerAspect;
  categoryRequired: boolean;
  captionMax: number;
  /** Focus the caption once media is in (post / reel). */
  autofocusCaption: boolean;
  /** Web blob images are downscaled to this long edge before upload. */
  uploadMaxEdge: number;
  /** Editor header override; omit to use the editors' defaults ("Edit photo" / "Edit video"). */
  editorTitle?: string;
  empty: { icon: string; title: string; subtitle: string; importing: string };
  discardTitle: string;
};

export const COMPOSER_CONFIG: Record<ComposerKind, ComposerConfig> = {
  post: {
    kind: 'post',
    noun: 'a post',
    title: 'New post',
    library: FAST_IMAGE_PICKER,
    camera: { type: 'picker', options: FAST_CAMERA },
    acceptsVideo: false,
    maxClipMs: 0,
    aspect: '4:5',
    categoryRequired: true,
    captionMax: 500,
    autofocusCaption: true,
    uploadMaxEdge: 1400,
    empty: {
      icon: 'images',
      title: 'Plant a post',
      subtitle: 'Camera or library — then grade, crop, and caption before you share.',
      importing: 'Adding your photo…',
    },
    discardTitle: 'Discard post?',
  },
  reel: {
    kind: 'reel',
    noun: 'a reel',
    title: 'New reel',
    library: FAST_REEL_PICKER,
    camera: { type: 'reel-capture' },
    acceptsVideo: true,
    maxClipMs: 60_000,
    aspect: '9:16',
    categoryRequired: true,
    captionMax: 500,
    autofocusCaption: true,
    uploadMaxEdge: 1600,
    empty: {
      icon: 'film-outline',
      title: 'Create a vertical clip',
      subtitle: 'Photo or video up to 60s. Trim on the film, then share.',
      importing: 'Reading your clip…',
    },
    discardTitle: 'Discard reel?',
  },
  story: {
    kind: 'story',
    noun: 'a story',
    title: 'New story',
    library: FAST_STORY_PICKER,
    camera: { type: 'picker', options: FAST_STORY_CAMERA },
    acceptsVideo: true,
    maxClipMs: 30_000,
    aspect: '9:16',
    categoryRequired: false,
    captionMax: 180,
    autofocusCaption: false,
    uploadMaxEdge: 1400,
    editorTitle: 'Your story',
    empty: {
      icon: 'sparkles-outline',
      title: 'Add to your story',
      subtitle: 'Photo or a clip up to 30 seconds. Lives 24 hours.',
      importing: 'Adding to your story…',
    },
    discardTitle: 'Discard story?',
  },
};

/** Unified publish copy for every flow. */
export const COMPOSER_COPY = {
  share: 'Share',
  sharing: 'Sharing…',
  phase: {
    preparing: 'Preparing…',
    uploading: 'Uploading…',
    publishing: 'Sharing…',
  },
  openingEditor: 'Opening editor…',
  errorTitle: 'Not shared yet — your draft is safe.',
  success: 'Shared!',
  discardMessage: 'Your draft will be lost.',
} as const;
