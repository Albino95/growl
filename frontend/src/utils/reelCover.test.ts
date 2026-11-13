import { describe, expect, it, vi } from 'vitest';

// Same rules as services/api/media isVideoMedia (that module pulls in native deps).
vi.mock('../services/api/media', () => ({
  isVideoMedia: (o: { uri?: string; mediaType?: string; contentType?: string }) =>
    o.mediaType === 'video' ||
    (o.contentType || '').toLowerCase().startsWith('video/') ||
    /\.(mp4|webm|mov|m4v)(\?|$)/i.test(o.uri || ''),
}));
// images.ts requires an asset (jpg) at module load; keep its resolve rule (no device-local URIs).
vi.mock('./images', () => ({
  resolvePostMediaUri: (raw?: string | null) => {
    const s = (raw || '').trim();
    return /^(https?:|data:)/i.test(s) ? s : '';
  },
}));
import { gridTileImageUri, isVideoPostMedia, reelCoverTimeMs, reelCoverUri } from './reelCover';

const COVER = 'https://api.letsgrow.lu/api/v1/media/reel/u1/cover.jpg';
const VIDEO = 'https://api.letsgrow.lu/api/v1/media/reel/u1/clip.mp4';

describe('reelCoverUri', () => {
  it('reads metadata.cover_url (and legacy poster keys)', () => {
    expect(reelCoverUri({ cover_url: COVER })).toBe(COVER);
    expect(reelCoverUri({ thumbnail_url: COVER })).toBe(COVER);
    expect(reelCoverUri({ poster_url: COVER })).toBe(COVER);
  });

  it('never returns a video or a device-local file as a poster', () => {
    expect(reelCoverUri({ cover_url: VIDEO })).toBe('');
    expect(reelCoverUri({ cover_url: 'file:///tmp/cover.jpg' })).toBe('');
    expect(reelCoverUri({})).toBe('');
    expect(reelCoverUri(null)).toBe('');
  });
});

describe('isVideoPostMedia', () => {
  it('detects video reels from the URL, media_type or legacy video_edit', () => {
    expect(isVideoPostMedia({ image_url: VIDEO })).toBe(true);
    expect(
      isVideoPostMedia({ image_url: 'https://x/api/v1/media/reel/u1/abc', metadata: { media_type: 'video' } })
    ).toBe(true);
    expect(
      isVideoPostMedia({ image_url: 'https://x/api/v1/media/reel/u1/abc', metadata: { video_edit: {} } })
    ).toBe(true);
    expect(isVideoPostMedia({ image_url: COVER, metadata: { media_type: 'image' } })).toBe(false);
    expect(isVideoPostMedia({ image_url: COVER })).toBe(false);
  });
});

describe('gridTileImageUri', () => {
  it('prefers the poster, hides raw video URLs, keeps photos', () => {
    expect(gridTileImageUri({ image: VIDEO, cover: COVER, isVideo: true })).toBe(COVER);
    expect(gridTileImageUri({ image: VIDEO, isVideo: true })).toBe('');
    expect(gridTileImageUri({ image: COVER })).toBe(COVER);
  });
});

describe('reelCoverTimeMs', () => {
  it('uses the chosen cover frame, else the first trimmed frame', () => {
    expect(reelCoverTimeMs({ coverMs: 4200, trimStartMs: 1000, trimEndMs: 9000 }, 12000)).toBe(4200);
    expect(reelCoverTimeMs({ coverMs: 0, trimStartMs: 1500 }, 12000)).toBe(1500);
    expect(reelCoverTimeMs(null, 8000)).toBe(0);
    // Clamped into the trimmed range.
    expect(reelCoverTimeMs({ coverMs: 500, trimStartMs: 2000, trimEndMs: 6000 }, 12000)).toBe(2000);
    expect(reelCoverTimeMs({ coverMs: 9000, trimStartMs: 0, trimEndMs: 6000 }, 12000)).toBe(6000);
  });
});
