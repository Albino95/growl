import {
  captureCoverFrame,
  frameImageSource,
  nearestFrame,
  type FrameThumb,
} from '../components/ui/videoEditor/extractFrames';
import { uploadMediaApi, uploadMediaFile } from '../services/api/media';
import { reelCoverTimeMs } from './reelCover';

/**
 * Capture the reel's cover frame and upload it as an image. Resolves the hosted
 * URL, or null on any failure — a missing cover must never block publishing.
 */
export async function uploadReelCover(opts: {
  videoUri: string;
  durationMs: number;
  edit: { coverMs?: number; trimStartMs?: number; trimEndMs?: number } | null | undefined;
  /** Filmstrip stills already sampled in the composer (low-res fallback). */
  frames?: FrameThumb[];
}): Promise<string | null> {
  try {
    const timeMs = reelCoverTimeMs(opts.edit, opts.durationMs);
    const fallbackSource = frameImageSource(nearestFrame(opts.frames || [], timeMs));
    const still = await captureCoverFrame(opts.videoUri, timeMs, opts.durationMs, {
      maxWidth: 720,
      fallbackSource,
    });
    if (!still?.uri) return null;
    if (still.uri.toLowerCase().startsWith('data:')) {
      const url = await uploadMediaApi(still.uri, 'reel');
      return url || null;
    }
    const uploaded = await uploadMediaFile(still.uri, 'reel', { mimeType: 'image/jpeg' });
    return uploaded.url || null;
  } catch {
    return null;
  }
}
