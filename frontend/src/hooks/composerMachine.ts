/**
 * Pure state machine behind every create flow (post, reel, story).
 *
 *   empty ─pick─▶ importing ─done─▶ ready ⇄ editing
 *                    │cancel           │
 *                    ▼                 ▼ publish
 *              (previous)        publishing{preparing → uploading → publishing}
 *                                      │            │
 *                                   success      error (draft kept) ─retry─▶ publishing
 *
 * No React, no I/O — `useMediaComposer` runs the effects and feeds results back.
 */
import { DEFAULT_VIDEO_EDIT, type VideoEditSettings } from '../components/ui/videoEditor/types';
import type { FrameThumb } from '../components/ui/videoEditor/extractFrames';

export type ComposerStatus =
  | 'empty'
  | 'importing'
  | 'ready'
  | 'editing'
  | 'publishing'
  | 'success'
  | 'error';

export type PublishPhase = 'preparing' | 'uploading' | 'publishing';

export type ComposerMedia = {
  uri: string;
  mediaType: 'image' | 'video';
  mimeType?: string;
  durationMs: number;
};

export type ComposerUpload = {
  /** Local URI that was uploaded — reuse only while the media is unchanged. */
  sourceUri: string;
  url: string;
  mediaType: 'image' | 'video';
  contentType?: string;
  coverUrl?: string | null;
};

export type ComposerAudio = { id: string; title: string; url: string };

export type ComposerState = {
  status: ComposerStatus;
  /** Only meaningful while publishing. */
  phase: PublishPhase | null;
  /** Editing: false while the editor is arming (stills / player unload), true once shown. */
  editorShown: boolean;
  media: ComposerMedia | null;
  videoEdit: VideoEditSettings;
  frames: FrameThumb[];
  stillsBusy: boolean;
  /** The user saved an editor change (worth confirming before throwing away). */
  edited: boolean;
  caption: string;
  category: string | null;
  audio: ComposerAudio | null;
  /** Hosted media from an earlier attempt — a retry skips the upload. */
  upload: ComposerUpload | null;
  error: string | null;
  /** Status to return to when an import is cancelled. */
  beforeImport: 'empty' | 'ready' | 'error' | null;
};

export type ComposerAction =
  | { type: 'IMPORT_START' }
  | { type: 'IMPORT_CANCEL' }
  | {
      type: 'IMPORT_DONE';
      media: ComposerMedia;
      maxClipMs: number;
      /** Filmstrip placeholders for a clip; stills are sampled right after. */
      frames?: FrameThumb[];
    }
  | { type: 'SET_FRAMES'; frames: FrameThumb[] }
  | { type: 'STILLS_BUSY'; busy: boolean }
  | { type: 'OPEN_EDITOR' }
  | { type: 'EDITOR_SHOWN' }
  | { type: 'CLOSE_EDITOR' }
  | { type: 'PHOTO_EDITED'; uri: string }
  | { type: 'VIDEO_EDITED'; settings: VideoEditSettings }
  | { type: 'SET_CAPTION'; caption: string }
  | { type: 'SET_CATEGORY'; category: string | null }
  | { type: 'SET_AUDIO'; audio: ComposerAudio | null }
  | { type: 'PUBLISH_START' }
  | { type: 'PUBLISH_PHASE'; phase: PublishPhase }
  | { type: 'UPLOADED'; upload: ComposerUpload }
  | { type: 'PUBLISH_SUCCESS' }
  | { type: 'PUBLISH_FAIL'; message: string }
  | { type: 'DISMISS_ERROR' }
  | { type: 'REMOVE_MEDIA' }
  | { type: 'DISCARD' };

export function initialComposerState(seed?: Partial<Pick<ComposerState, 'caption' | 'category'>>): ComposerState {
  return {
    status: 'empty',
    phase: null,
    editorShown: false,
    media: null,
    videoEdit: { ...DEFAULT_VIDEO_EDIT },
    frames: [],
    stillsBusy: false,
    edited: false,
    caption: seed?.caption ?? '',
    category: seed?.category ?? null,
    audio: null,
    upload: null,
    error: null,
    beforeImport: null,
  };
}

/** Busy states where the draft must not change underneath the user. */
export function isComposerBusy(s: ComposerState): boolean {
  return s.status === 'publishing' || s.status === 'importing';
}

/** Something worth a "Discard?" prompt. */
export function hasComposerDraft(s: ComposerState): boolean {
  if (s.status === 'success') return false;
  return Boolean(s.media || s.caption.trim() || s.audio || s.status === 'importing');
}

export function canPublish(s: ComposerState, opts: { categoryRequired: boolean }): boolean {
  if (!s.media) return false;
  if (s.status !== 'ready' && s.status !== 'error') return false;
  if (opts.categoryRequired && !s.category) return false;
  return true;
}

function restingStatus(s: ComposerState): ComposerStatus {
  return s.media ? 'ready' : 'empty';
}

export function composerReducer(s: ComposerState, a: ComposerAction): ComposerState {
  switch (a.type) {
    case 'IMPORT_START':
      if (s.status === 'publishing' || s.status === 'success' || s.status === 'importing') return s;
      if (s.status === 'editing') return s;
      return {
        ...s,
        status: 'importing',
        beforeImport: s.status === 'error' ? 'error' : s.media ? 'ready' : 'empty',
      };

    case 'IMPORT_CANCEL':
      if (s.status !== 'importing') return s;
      return { ...s, status: s.beforeImport ?? restingStatus(s), beforeImport: null };

    case 'IMPORT_DONE': {
      if (s.status !== 'importing') return s;
      const videoEdit = { ...DEFAULT_VIDEO_EDIT };
      if (a.media.mediaType === 'video' && a.maxClipMs > 0 && a.media.durationMs > a.maxClipMs) {
        videoEdit.trimEndMs = a.maxClipMs;
      }
      return {
        ...s,
        status: 'ready',
        beforeImport: null,
        media: a.media,
        videoEdit,
        frames: a.media.mediaType === 'video' ? a.frames ?? [] : [],
        stillsBusy: a.media.mediaType === 'video' && !!a.frames,
        edited: false,
        upload: null,
        error: null,
      };
    }

    case 'SET_FRAMES':
      return { ...s, frames: a.frames };

    case 'STILLS_BUSY':
      return { ...s, stillsBusy: a.busy };

    case 'OPEN_EDITOR':
      if (!s.media || (s.status !== 'ready' && s.status !== 'error')) return s;
      return { ...s, status: 'editing', editorShown: false, error: null };

    case 'EDITOR_SHOWN':
      if (s.status !== 'editing') return s;
      return { ...s, editorShown: true };

    case 'CLOSE_EDITOR':
      if (s.status !== 'editing') return s;
      return { ...s, status: 'ready', editorShown: false };

    case 'PHOTO_EDITED': {
      if (s.status !== 'editing' || !s.media) return s;
      const changed = a.uri !== s.media.uri;
      return {
        ...s,
        status: 'ready',
        editorShown: false,
        media: changed ? { ...s.media, uri: a.uri, mimeType: 'image/jpeg' } : s.media,
        edited: s.edited || changed,
        upload: changed ? null : s.upload,
      };
    }

    case 'VIDEO_EDITED': {
      if (s.status !== 'editing') return s;
      const prev = s.videoEdit;
      const trimChanged =
        a.settings.trimStartMs !== prev.trimStartMs || a.settings.trimEndMs !== prev.trimEndMs;
      const coverChanged = a.settings.coverMs !== prev.coverMs;
      return {
        ...s,
        status: 'ready',
        editorShown: false,
        videoEdit: a.settings,
        edited: s.edited || trimChanged || coverChanged,
        // The clip itself is unchanged (edits travel as metadata), but the
        // cover still was captured at the old position.
        upload: s.upload && (coverChanged || trimChanged) ? { ...s.upload, coverUrl: undefined } : s.upload,
      };
    }

    case 'SET_CAPTION':
      if (s.status === 'publishing' || s.status === 'success') return s;
      return { ...s, caption: a.caption };

    case 'SET_CATEGORY':
      if (s.status === 'publishing' || s.status === 'success') return s;
      return { ...s, category: a.category };

    case 'SET_AUDIO':
      if (s.status === 'publishing' || s.status === 'success') return s;
      return { ...s, audio: a.audio };

    case 'PUBLISH_START':
      if (!s.media || (s.status !== 'ready' && s.status !== 'error')) return s;
      return { ...s, status: 'publishing', phase: 'preparing', error: null };

    case 'PUBLISH_PHASE':
      if (s.status !== 'publishing') return s;
      return { ...s, phase: a.phase };

    case 'UPLOADED':
      if (s.status !== 'publishing') return s;
      return { ...s, upload: a.upload };

    case 'PUBLISH_SUCCESS':
      if (s.status !== 'publishing') return s;
      return { ...s, status: 'success', phase: null };

    case 'PUBLISH_FAIL':
      if (s.status !== 'publishing') return s;
      // Draft (media, caption, category, edits, upload) is kept for Retry.
      return { ...s, status: 'error', phase: null, error: a.message };

    case 'DISMISS_ERROR':
      if (s.status !== 'error') return s;
      return { ...s, status: 'ready', error: null };

    case 'REMOVE_MEDIA':
      if (s.status === 'publishing' || s.status === 'success') return s;
      return initialComposerState({ category: s.category });

    case 'DISCARD':
      if (s.status === 'publishing') return s;
      return initialComposerState({ category: s.category });

    default:
      return s;
  }
}
