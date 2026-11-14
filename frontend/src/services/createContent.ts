/**
 * One upload + publish path for the three create flows (post, reel, story).
 * Pure-ish helpers: no React, no Redux — the composer hook wires the results
 * into the store. Every failure is a `ComposerError` with copy that can go
 * straight into the inline "Not shared yet" banner.
 */
import { Platform } from 'react-native';
import {
  MediaTooLargeError,
  uploadMediaApi,
  uploadMediaFile,
  type UploadPurpose,
} from './api/media';
import { createFeedPost, type FeedPost } from './api/feed';
import { createStory } from './api/stories';
import { isRemoteMediaUrl } from '../utils/mediaUri';
import { reelSoundtrackFromEdit } from '../utils/reelMedia';
import type { VideoEditSettings } from '../components/ui/videoEditor/types';

export type ComposerKind = 'post' | 'reel' | 'story';
export type ComposerMediaType = 'image' | 'video';

export type ComposerErrorStage = 'upload' | 'publish';

/** A failure the composer can show inline. `message` is user-facing. */
export class ComposerError extends Error {
  readonly stage: ComposerErrorStage;
  readonly tooLarge: boolean;
  constructor(message: string, stage: ComposerErrorStage, opts?: { tooLarge?: boolean }) {
    super(message);
    this.name = 'ComposerError';
    this.stage = stage;
    this.tooLarge = !!opts?.tooLarge;
  }
}

/** Map anything thrown during upload/publish to a ComposerError. */
export function toComposerError(err: unknown, stage: ComposerErrorStage): ComposerError {
  if (err instanceof ComposerError) return err;
  if (err instanceof MediaTooLargeError) {
    return new ComposerError(err.message, 'upload', { tooLarge: true });
  }
  const raw = err instanceof Error ? err.message.trim() : '';
  const fallback =
    stage === 'upload'
      ? 'Your media did not finish uploading.'
      : 'We could not share it this time.';
  return new ComposerError(raw || fallback, stage);
}

/**
 * Hosted media we can publish: remote and served by our API's media route
 * (never a picker URI, blob, data URL or someone else's CDN).
 */
export function isPublishableMediaUrl(url: string | null | undefined): boolean {
  const u = (url || '').trim();
  return isRemoteMediaUrl(u) && /\/api\/[^/]+\/media\//i.test(u);
}

/** The server must hand back an https URL for the saved post. */
export function isServedHttpsUrl(url: string | null | undefined): boolean {
  return /^https:\/\//i.test((url || '').trim());
}

/** `fitness:cardio` → { category: 'fitness', subcategory: 'cardio' }. */
export function splitCategory(path: string): { category: string; subcategory?: string } {
  const [category, subcategory] = path.split(':');
  return subcategory ? { category, subcategory } : { category };
}

/** Web: downscale a blob: image to a JPEG data URL so uploads stay small. */
async function webBlobToDataUrl(uri: string, maxEdge: number, quality: number): Promise<string> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return uri;
  const res = await fetch(uri);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const imageEl = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not decode selected image'));
      img.src = objectUrl;
    });
    const scale = Math.min(1, maxEdge / Math.max(imageEl.width, imageEl.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(imageEl.width * scale));
    canvas.height = Math.max(1, Math.round(imageEl.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return uri;
    ctx.drawImage(imageEl, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export type UploadedMedia = {
  url: string;
  mediaType: ComposerMediaType;
  contentType?: string;
};

export type UploadComposerMediaOptions = {
  mediaType: ComposerMediaType;
  mime?: string;
  /** Web blob → JPEG long edge (default 1400). */
  maxEdge?: number;
};

/**
 * Upload picked/edited media once, the same way for every flow:
 * - already hosted → reused as-is
 * - video → multipart (`uploadMediaFile`, fails fast with MediaTooLargeError)
 * - image data: URL (or web blob, downscaled first) → JSON upload
 * - image file → multipart (shrunk to JPEG by media.ts)
 * Throws ComposerError (stage 'upload'); never resolves a non-hosted URL.
 */
export async function uploadComposerMedia(
  uri: string,
  kind: ComposerKind,
  opts: UploadComposerMediaOptions
): Promise<UploadedMedia> {
  const purpose: UploadPurpose = kind;
  let result: UploadedMedia;
  try {
    if (isRemoteMediaUrl(uri)) {
      result = { url: uri, mediaType: opts.mediaType, contentType: opts.mime };
    } else if (opts.mediaType === 'video') {
      const uploaded = await uploadMediaFile(uri, purpose, {
        mimeType: opts.mime || 'video/mp4',
      });
      result = { url: uploaded.url, mediaType: uploaded.mediaType, contentType: uploaded.contentType };
    } else {
      let source = uri;
      if (Platform.OS === 'web' && source.toLowerCase().startsWith('blob:')) {
        try {
          source = await webBlobToDataUrl(source, opts.maxEdge ?? 1400, 0.85);
        } catch {
          /* keep the blob URI — multipart can still read it */
        }
      }
      if (source.toLowerCase().startsWith('data:')) {
        const url = await uploadMediaApi(source, purpose);
        result = { url, mediaType: 'image', contentType: 'image/jpeg' };
      } else {
        const uploaded = await uploadMediaFile(source, purpose, { mimeType: 'image/jpeg' });
        result = { url: uploaded.url, mediaType: 'image', contentType: uploaded.contentType };
      }
    }
  } catch (err) {
    throw toComposerError(err, 'upload');
  }
  if (!isPublishableMediaUrl(result.url)) {
    throw new ComposerError('Your media did not finish uploading.', 'upload');
  }
  return result;
}

type OptimisticUser = {
  username?: string | null;
  email?: string | null;
  avatar?: string | null;
} | null | undefined;

/**
 * The post we prepend to the feed right after the server saved it.
 * Order: `base` (client defaults) < server metadata < `override` (client
 * values that must win, e.g. the reel's video_edit) < author/engagement.
 */
export function buildOptimisticFeedPost(
  created: FeedPost,
  opts: {
    user: OptimisticUser;
    base?: Record<string, unknown>;
    override?: Record<string, unknown>;
  }
): FeedPost {
  const serverMeta = (created.metadata || {}) as NonNullable<FeedPost['metadata']>;
  const user = opts.user;
  return {
    ...created,
    image_url: (created.image_url || '').trim(),
    feed_section: 'following',
    metadata: {
      ...(opts.base || {}),
      ...serverMeta,
      ...(opts.override || {}),
      username: serverMeta.username || user?.username || user?.email?.split('@')[0] || 'You',
      avatar: serverMeta.avatar || user?.avatar || undefined,
      likes: Number(serverMeta.likes ?? 0),
      comments: Number(serverMeta.comments ?? 0),
      has_liked: !!serverMeta.has_liked,
    },
  };
}

async function createAndVerify(
  payload: Parameters<typeof createFeedPost>[0],
  idempotencyKey?: string
): Promise<FeedPost> {
  let created: Awaited<ReturnType<typeof createFeedPost>>;
  try {
    created = await createFeedPost(payload, { idempotencyKey });
  } catch (err) {
    throw toComposerError(err, 'publish');
  }
  if (!created?.data || !isServedHttpsUrl(created.data.image_url)) {
    throw new ComposerError('The server did not save your media.', 'publish');
  }
  return { ...created.data, image_url: (created.data.image_url || '').trim() };
}

export type PublishFeedResult = { post: FeedPost; optimistic: FeedPost };

export type PostPublishExtras = {
  productId?: string;
  referralInstructorId?: string;
  promoteBusinessId?: string;
  promoteBusinessName?: string;
};

export async function publishPost(input: {
  mediaUrl: string;
  caption: string;
  category: string;
  audioTrack?: { title: string; url: string } | null;
  extras?: PostPublishExtras;
  user: OptimisticUser;
  /** Stable per draft: a retry of the same draft can't create a second post. */
  idempotencyKey?: string;
}): Promise<PublishFeedResult> {
  const metadata: Record<string, unknown> = {};
  if (input.audioTrack) {
    metadata.audio_url = input.audioTrack.url;
    metadata.audio_title = input.audioTrack.title;
  }
  const extras = input.extras;
  if (extras?.productId) metadata.product_id = extras.productId;
  if (extras?.referralInstructorId) metadata.referral_instructor_id = extras.referralInstructorId;
  if (extras?.promoteBusinessId) {
    metadata.promote_business_id = extras.promoteBusinessId;
    metadata.promote_business_name = extras.promoteBusinessName;
    metadata.source = 'partnership';
  }
  const post = await createAndVerify({
    image_url: input.mediaUrl,
    caption: input.caption.trim(),
    ...splitCategory(input.category),
    metadata: Object.keys(metadata).length ? metadata : undefined,
  }, input.idempotencyKey);
  return { post, optimistic: buildOptimisticFeedPost(post, { user: input.user, base: metadata }) };
}

export async function publishReel(input: {
  media: UploadedMedia;
  caption: string;
  category: string;
  videoEdit: VideoEditSettings;
  coverUrl?: string | null;
  user: OptimisticUser;
  /** Stable per draft: a retry of the same draft can't create a second reel. */
  idempotencyKey?: string;
}): Promise<PublishFeedResult> {
  const { media } = input;
  const isVideo = media.mediaType === 'video';
  const soundtrack = reelSoundtrackFromEdit(input.videoEdit);
  const audio = soundtrack.audioUrl
    ? { audio_url: soundtrack.audioUrl, audio_title: soundtrack.audioTitle }
    : {};
  const base = { format: 'reel', media_type: media.mediaType, content_type: media.contentType };
  const post = await createAndVerify({
    image_url: media.url,
    caption: input.caption.trim(),
    ...splitCategory(input.category),
    metadata: {
      ...base,
      ...(isVideo ? { video_edit: input.videoEdit } : {}),
      ...(isVideo && input.coverUrl ? { cover_url: input.coverUrl } : {}),
      ...audio,
    },
  }, input.idempotencyKey);
  return {
    post,
    optimistic: buildOptimisticFeedPost(post, {
      user: input.user,
      base,
      override: { ...(isVideo ? { video_edit: input.videoEdit } : {}), ...audio },
    }),
  };
}

/**
 * Stories store only a URL, so a video trim travels as `ts`/`te` (ms) query
 * params on the hosted media URL. Images and untrimmed clips pass through.
 */
export function storyMediaUrl(
  url: string,
  mediaType: ComposerMediaType,
  edit?: Pick<VideoEditSettings, 'trimStartMs' | 'trimEndMs'> | null
): string {
  if (mediaType !== 'video' || !edit) return url;
  try {
    const u = new URL(url);
    if (edit.trimStartMs > 0) u.searchParams.set('ts', String(Math.round(edit.trimStartMs)));
    if (edit.trimEndMs > 0) u.searchParams.set('te', String(Math.round(edit.trimEndMs)));
    return u.toString();
  } catch {
    return url;
  }
}

export async function publishStory(input: {
  media: UploadedMedia;
  caption: string;
  videoEdit?: Pick<VideoEditSettings, 'trimStartMs' | 'trimEndMs'> | null;
  /** Stable per draft: a retry of the same draft can't create a second story. */
  idempotencyKey?: string;
}): Promise<void> {
  try {
    await createStory(
      {
        image_url: storyMediaUrl(input.media.url, input.media.mediaType, input.videoEdit),
        caption: input.caption.trim() || undefined,
      },
      { idempotencyKey: input.idempotencyKey }
    );
  } catch (err) {
    throw toComposerError(err, 'publish');
  }
}
