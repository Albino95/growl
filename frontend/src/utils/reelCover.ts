import { isVideoMedia } from '../services/api/media';
import { resolvePostMediaUri } from './images';

type MetaLike = Record<string, unknown> | null | undefined;

/** Metadata keys that may carry a reel poster image (cover_url is what we write). */
const COVER_KEYS = ['cover_url', 'thumbnail_url', 'poster_url'] as const;

/**
 * Poster image for a reel/video post, resolved for expo-image — '' when the
 * post has none. Never returns the video file itself.
 */
export function reelCoverUri(metadata: MetaLike): string {
  const m = metadata || {};
  for (const key of COVER_KEYS) {
    const raw = m[key];
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const uri = resolvePostMediaUri(raw);
    if (uri && !isVideoMedia({ uri })) return uri;
  }
  return '';
}

/** True when the post's main media is a video (expo-image cannot render it). */
export function isVideoPostMedia(post: { image_url?: string | null; metadata?: MetaLike }): boolean {
  const m = post.metadata || {};
  if (m.media_type === 'image') return false;
  // Legacy reels: video_edit but no media_type (same rule as FeedReelMedia).
  if (m.video_edit && m.format !== 'post') return true;
  return isVideoMedia({
    uri: post.image_url ?? undefined,
    mediaType: typeof m.media_type === 'string' ? m.media_type : undefined,
    contentType: typeof m.content_type === 'string' ? m.content_type : undefined,
  });
}

/** Cover time for a reel edit: the chosen cover frame, else the first frame after trim. */
export function reelCoverTimeMs(
  edit: { coverMs?: number; trimStartMs?: number; trimEndMs?: number } | null | undefined,
  durationMs: number
): number {
  const start = Math.max(0, edit?.trimStartMs || 0);
  const end = edit?.trimEndMs && edit.trimEndMs > start ? edit.trimEndMs : Math.max(durationMs, start);
  const cover = edit?.coverMs && edit.coverMs > 0 ? edit.coverMs : start;
  return Math.max(start, Math.min(cover, end));
}

/** Image for a grid tile: the poster, else the media itself unless it's a video. */
export function gridTileImageUri(post: { image?: string; cover?: string; isVideo?: boolean }): string {
  if (post.cover) return post.cover;
  if (post.isVideo) return '';
  return post.image || '';
}
