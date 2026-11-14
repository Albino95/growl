/**
 * Upload + create for one composer draft — the single publish pipeline used by
 * the background queue (`usePublishQueue`) and the in-composer fallback.
 * No React and no store writes: progress, the hosted upload and the result are
 * handed back through the context callbacks.
 */
import {
  ComposerError,
  publishPost,
  publishReel,
  publishStory,
  uploadComposerMedia,
  type ComposerKind,
  type PostPublishExtras,
  type PublishFeedResult,
} from '../createContent';
import { UploadCancelledError, isUploadCancelled } from '../api/media';
import { isRemoteMediaUrl } from '../../utils/mediaUri';
import { uploadReelCover } from '../../utils/uploadReelCover';
import type { VideoEditSettings } from '../../components/ui/videoEditor/types';
import type { FrameThumb } from '../../components/ui/videoEditor/extractFrames';
import type { ComposerAudio, ComposerMedia, ComposerUpload } from '../../hooks/composerMachine';
import type { ComposerDraft } from '../drafts';
import { upsertPart, type ProgressPart, type PublishStage } from './progress';

export { UploadCancelledError as PublishCancelledError };
export const isPublishCancelled = isUploadCancelled;

type OptimisticUser = Parameters<typeof publishPost>[0]['user'];

/** Everything needed to publish a draft without the composer mounted. */
export type PublishInput = {
  kind: ComposerKind;
  media: ComposerMedia;
  caption: string;
  category: string | null;
  videoEdit: VideoEditSettings;
  audio: ComposerAudio | null;
  /** Reel cover fallback stills (in memory only). */
  frames?: FrameThumb[];
  extras?: PostPublishExtras;
  uploadMaxEdge: number;
  user: OptimisticUser;
};

export type PublishRunContext = {
  /** Stable per draft — reused on every retry so the server can dedupe. */
  idempotencyKey: string;
  signal?: AbortSignal;
  /** Hosted media from an earlier attempt of the same draft (skips the upload). */
  cachedUpload?: ComposerUpload | null;
  onUploaded?: (upload: ComposerUpload) => void;
  onProgress?: (p: { parts: ProgressPart[]; stage: PublishStage }) => void;
};

export type PublishOutcome = {
  result: PublishFeedResult | null;
  upload: ComposerUpload;
};

/** Rough cover still size, used as its weight until the transport reports one. */
const COVER_ESTIMATE_BYTES = 120_000;

export async function runPublish(input: PublishInput, ctx: PublishRunContext): Promise<PublishOutcome> {
  const { kind, media } = input;
  const signal = ctx.signal;
  const throwIfCancelled = () => {
    if (signal?.aborted) throw new UploadCancelledError();
  };
  throwIfCancelled();

  let parts: ProgressPart[] = [];
  let stage: PublishStage = 'preparing';
  const emit = () => ctx.onProgress?.({ parts, stage });
  const track = (id: string, estimate?: number) => {
    parts = upsertPart(parts, { id, sent: 0, total: 0, estimate });
    return (sent: number, total: number) => {
      parts = upsertPart(parts, { id, sent, total });
      if (stage === 'preparing') stage = 'uploading';
      emit();
    };
  };
  const markDone = (id: string) => {
    parts = upsertPart(parts, { id, sent: 0, total: 0, done: true });
    emit();
  };
  emit();

  const isVideo = media.mediaType === 'video';
  let upload: ComposerUpload | null =
    ctx.cachedUpload && ctx.cachedUpload.sourceUri === media.uri ? ctx.cachedUpload : null;
  const needsCover =
    kind === 'reel' && isVideo && !isRemoteMediaUrl(media.uri) && typeof upload?.coverUrl !== 'string';

  const mainProgress = upload ? null : track('media');
  const coverProgress = needsCover ? track('cover', COVER_ESTIMATE_BYTES) : null;
  if (mainProgress || coverProgress) {
    stage = 'uploading';
    emit();
  }

  // Cover never blocks publishing (resolves null on failure, rethrows a cancel).
  const coverPromise: Promise<string | null> = needsCover
    ? uploadReelCover({
        videoUri: media.uri,
        durationMs: media.durationMs,
        edit: input.videoEdit,
        frames: input.frames,
        onProgress: coverProgress ?? undefined,
        signal,
      }).finally(() => markDone('cover'))
    : Promise.resolve(upload?.coverUrl ?? null);
  // Don't leave an unhandled rejection if the main upload fails first.
  coverPromise.catch(() => undefined);

  if (!upload) {
    const uploaded = await uploadComposerMedia(media.uri, kind, {
      mediaType: media.mediaType,
      mime: media.mimeType,
      maxEdge: input.uploadMaxEdge,
      onProgress: mainProgress ?? undefined,
      signal,
    });
    markDone('media');
    upload = { sourceUri: media.uri, ...uploaded };
    ctx.onUploaded?.(upload);
  }

  if (needsCover && upload.mediaType === 'video') {
    const coverUrl = await coverPromise;
    if (coverUrl) {
      upload = { ...upload, coverUrl };
      ctx.onUploaded?.(upload);
    }
  }

  // Past this point the create call can't be taken back — last chance to stop.
  throwIfCancelled();
  stage = 'finishing';
  emit();

  const idempotencyKey = ctx.idempotencyKey;
  let result: PublishFeedResult | null = null;
  if (kind === 'post') {
    if (!input.category) throw new ComposerError('Pick a category first.', 'publish');
    result = await publishPost({
      mediaUrl: upload.url,
      caption: input.caption,
      category: input.category,
      audioTrack: input.audio,
      extras: input.extras,
      user: input.user,
      idempotencyKey,
    });
  } else if (kind === 'reel') {
    if (!input.category) throw new ComposerError('Pick a category first.', 'publish');
    result = await publishReel({
      media: upload,
      caption: input.caption,
      category: input.category,
      videoEdit: input.videoEdit,
      coverUrl: upload.coverUrl,
      user: input.user,
      idempotencyKey,
    });
  } else {
    await publishStory({
      media: upload,
      caption: input.caption,
      videoEdit: input.videoEdit,
      idempotencyKey,
    });
  }
  stage = 'done';
  emit();
  return { result, upload };
}

/** The persisted-draft shape of a publish input ("Continue your draft?" / Edit). */
export function draftFromPublishInput(input: PublishInput, idempotencyKey: string): ComposerDraft {
  return {
    kind: input.kind,
    caption: input.caption,
    category: input.category,
    media: {
      uri: input.media.uri,
      mediaType: input.media.mediaType,
      mimeType: input.media.mimeType,
      durationMs: input.media.durationMs,
    },
    videoEdit: input.media.mediaType === 'video' ? { ...input.videoEdit } : null,
    audio: input.audio,
    idempotencyKey,
  };
}
