import { beforeEach, describe, expect, it, vi } from 'vitest';

const media = vi.hoisted(() => {
  class MediaTooLargeError extends Error {
    constructor(sizeBytes: number) {
      super(`This video is ${Math.round(sizeBytes / (1024 * 1024))} MB. The limit is 40 MB — trim it or pick a shorter clip.`);
      this.name = 'MediaTooLargeError';
    }
  }
  return {
    MediaTooLargeError,
    isUploadCancelled: (err: unknown) => (err as Error)?.name === 'UploadCancelledError',
    uploadMediaApi: vi.fn(),
    uploadMediaFile: vi.fn(),
  };
});
const api = vi.hoisted(() => ({ createFeedPost: vi.fn(), createStory: vi.fn() }));

vi.mock('./api/media', () => media);
vi.mock('./api/feed', () => ({ createFeedPost: api.createFeedPost }));
vi.mock('./api/stories', () => ({ createStory: api.createStory }));
vi.mock('../utils/reelMedia', () => ({
  reelSoundtrackFromEdit: (edit: { audioUrl?: string | null; audioTitle?: string | null } | null) =>
    edit?.audioUrl ? { audioUrl: edit.audioUrl, audioTitle: edit.audioTitle || undefined } : {},
}));

import {
  ComposerError,
  buildOptimisticFeedPost,
  isPublishableMediaUrl,
  publishPost,
  publishReel,
  publishStory,
  splitCategory,
  storyMediaUrl,
  toComposerError,
  uploadComposerMedia,
} from './createContent';
import type { FeedPost } from './api/feed';
import type { VideoEditSettings } from '../components/ui/videoEditor/types';

const HOSTED = 'https://api.grow.test/api/v1/media/abc123';

beforeEach(() => {
  media.uploadMediaApi.mockReset();
  media.uploadMediaFile.mockReset();
  api.createFeedPost.mockReset();
  api.createStory.mockReset();
});

describe('isPublishableMediaUrl', () => {
  it('accepts hosted API media URLs', () => {
    expect(isPublishableMediaUrl(HOSTED)).toBe(true);
    expect(isPublishableMediaUrl('http://localhost:8787/api/v1/media/k?ts=1')).toBe(true);
  });
  it('rejects local, data, blob and foreign URLs', () => {
    expect(isPublishableMediaUrl('file:///tmp/a.jpg')).toBe(false);
    expect(isPublishableMediaUrl('data:image/jpeg;base64,AAAA')).toBe(false);
    expect(isPublishableMediaUrl('blob:https://x/123')).toBe(false);
    expect(isPublishableMediaUrl('https://images.unsplash.com/photo.jpg')).toBe(false);
    expect(isPublishableMediaUrl('')).toBe(false);
    expect(isPublishableMediaUrl(null)).toBe(false);
  });
});

describe('uploadComposerMedia', () => {
  it('reuses media that is already hosted', async () => {
    const out = await uploadComposerMedia(HOSTED, 'post', { mediaType: 'image' });
    expect(out.url).toBe(HOSTED);
    expect(media.uploadMediaFile).not.toHaveBeenCalled();
    expect(media.uploadMediaApi).not.toHaveBeenCalled();
  });

  it('uploads videos multipart with their mime (default mp4)', async () => {
    media.uploadMediaFile.mockResolvedValue({ url: HOSTED, mediaType: 'video', contentType: 'video/quicktime' });
    const out = await uploadComposerMedia('file:///clip.mov', 'reel', {
      mediaType: 'video',
      mime: 'video/quicktime',
    });
    expect(media.uploadMediaFile).toHaveBeenCalledWith('file:///clip.mov', 'reel', { mimeType: 'video/quicktime' });
    expect(out).toEqual({ url: HOSTED, mediaType: 'video', contentType: 'video/quicktime' });

    media.uploadMediaFile.mockClear();
    await uploadComposerMedia('file:///clip', 'story', { mediaType: 'video' });
    expect(media.uploadMediaFile).toHaveBeenCalledWith('file:///clip', 'story', { mimeType: 'video/mp4' });
  });

  it('sends data: images through the JSON upload', async () => {
    media.uploadMediaApi.mockResolvedValue(HOSTED);
    const out = await uploadComposerMedia('data:image/jpeg;base64,AAAA', 'story', { mediaType: 'image' });
    expect(media.uploadMediaApi).toHaveBeenCalledWith(
      'data:image/jpeg;base64,AAAA',
      'story',
      expect.objectContaining({ onProgress: undefined, signal: undefined })
    );
    expect(media.uploadMediaFile).not.toHaveBeenCalled();
    expect(out.mediaType).toBe('image');
  });

  it('sends file images multipart as JPEG', async () => {
    media.uploadMediaFile.mockResolvedValue({ url: HOSTED, mediaType: 'image', contentType: 'image/jpeg' });
    await uploadComposerMedia('file:///video-of-dog.jpg', 'post', { mediaType: 'image' });
    expect(media.uploadMediaFile).toHaveBeenCalledWith('file:///video-of-dog.jpg', 'post', { mimeType: 'image/jpeg' });
  });

  it('maps MediaTooLargeError to a too-large upload error', async () => {
    media.uploadMediaFile.mockRejectedValue(new media.MediaTooLargeError(60 * 1024 * 1024));
    const err = await uploadComposerMedia('file:///big.mp4', 'reel', { mediaType: 'video' }).catch((e) => e);
    expect(err).toBeInstanceOf(ComposerError);
    expect(err.stage).toBe('upload');
    expect(err.tooLarge).toBe(true);
    expect(err.message).toMatch(/60 MB/);
  });

  it('maps network errors and keeps their message', async () => {
    media.uploadMediaFile.mockRejectedValue(new Error('Upload failed — no connection.'));
    const err = await uploadComposerMedia('file:///a.jpg', 'post', { mediaType: 'image' }).catch((e) => e);
    expect(err).toBeInstanceOf(ComposerError);
    expect(err.stage).toBe('upload');
    expect(err.message).toBe('Upload failed — no connection.');
  });

  it('rejects an upload that did not land on the media API', async () => {
    media.uploadMediaFile.mockResolvedValue({ url: 'file:///still-local.jpg', mediaType: 'image', contentType: 'image/jpeg' });
    const err = await uploadComposerMedia('file:///a.jpg', 'post', { mediaType: 'image' }).catch((e) => e);
    expect(err).toBeInstanceOf(ComposerError);
    expect(err.message).toMatch(/did not finish uploading/);
  });
});

describe('toComposerError', () => {
  it('falls back to stage copy for empty errors', () => {
    expect(toComposerError(new Error(''), 'publish').message).toBe('We could not share it this time.');
    expect(toComposerError('weird', 'upload').message).toBe('Your media did not finish uploading.');
  });
});

describe('buildOptimisticFeedPost', () => {
  const created = {
    id: 'p1',
    user_id: 'u1',
    image_url: ` ${HOSTED} `,
    category: 'fitness',
    created_at: '2026-01-01',
    metadata: { likes: 3, format: 'server', username: '' },
  } as unknown as FeedPost;

  it('layers base < server < override and fills author + engagement', () => {
    const post = buildOptimisticFeedPost(created, {
      user: { username: 'maya', avatar: 'a.png' },
      base: { format: 'reel', media_type: 'video' },
      override: { video_edit: { muted: true } },
    });
    expect(post.image_url).toBe(HOSTED);
    expect(post.feed_section).toBe('following');
    expect(post.metadata).toMatchObject({
      format: 'server',
      media_type: 'video',
      video_edit: { muted: true },
      username: 'maya',
      avatar: 'a.png',
      likes: 3,
      comments: 0,
      has_liked: false,
    });
  });

  it('falls back to the email handle, then "You"', () => {
    expect(buildOptimisticFeedPost(created, { user: { email: 'sam@x.io' } }).metadata?.username).toBe('sam');
    expect(buildOptimisticFeedPost(created, { user: null }).metadata?.username).toBe('You');
  });
});

describe('publish adapters', () => {
  it('splits category paths', () => {
    expect(splitCategory('fitness:cardio')).toEqual({ category: 'fitness', subcategory: 'cardio' });
    expect(splitCategory('mind')).toEqual({ category: 'mind' });
  });

  it('publishPost sends promote metadata and trimmed caption', async () => {
    api.createFeedPost.mockResolvedValue({ success: true, data: { id: 'p', image_url: HOSTED, metadata: {} } });
    const out = await publishPost({
      mediaUrl: HOSTED,
      caption: '  hi  ',
      category: 'fitness:cardio',
      audioTrack: { title: 'Song', url: 'https://m/s.mp3' },
      extras: { promoteBusinessId: 'b1', promoteBusinessName: 'Café', productId: 'pr1' },
      user: { username: 'maya' },
      idempotencyKey: 'draft-key-1',
    });
    expect(api.createFeedPost).toHaveBeenCalledWith({
      image_url: HOSTED,
      caption: 'hi',
      category: 'fitness',
      subcategory: 'cardio',
      metadata: {
        audio_url: 'https://m/s.mp3',
        audio_title: 'Song',
        product_id: 'pr1',
        promote_business_id: 'b1',
        promote_business_name: 'Café',
        source: 'partnership',
      },
    }, { idempotencyKey: 'draft-key-1' });
    expect((out.optimistic.metadata as Record<string, unknown>).source).toBe('partnership');
  });

  it('publishPost fails when the server returns no https media', async () => {
    api.createFeedPost.mockResolvedValue({ success: true, data: { id: 'p', image_url: '' } });
    const err = await publishPost({ mediaUrl: HOSTED, caption: '', category: 'mind', user: null }).catch((e) => e);
    expect(err).toBeInstanceOf(ComposerError);
    expect(err.stage).toBe('publish');
  });

  it('publishReel keeps cover_url and video_edit for videos only', async () => {
    api.createFeedPost.mockResolvedValue({ success: true, data: { id: 'r', image_url: HOSTED, metadata: {} } });
    const edit = { trimStartMs: 0, trimEndMs: 5000, coverMs: 1000 } as VideoEditSettings;
    await publishReel({
      media: { url: HOSTED, mediaType: 'video', contentType: 'video/mp4' },
      caption: '',
      category: 'mind',
      videoEdit: edit,
      coverUrl: 'https://api.grow.test/api/v1/media/cover',
      user: null,
    });
    expect(api.createFeedPost.mock.calls[0][0].metadata).toEqual({
      format: 'reel',
      media_type: 'video',
      content_type: 'video/mp4',
      video_edit: edit,
      cover_url: 'https://api.grow.test/api/v1/media/cover',
    });

    api.createFeedPost.mockClear();
    await publishReel({
      media: { url: HOSTED, mediaType: 'image', contentType: 'image/jpeg' },
      caption: '',
      category: 'mind',
      videoEdit: edit,
      coverUrl: 'https://x/api/v1/media/c',
      user: null,
    });
    expect(api.createFeedPost.mock.calls[0][0].metadata).toEqual({
      format: 'reel',
      media_type: 'image',
      content_type: 'image/jpeg',
    });
  });
});

describe('story ts/te', () => {
  it('adds trim params to clips only', () => {
    expect(storyMediaUrl(HOSTED, 'video', { trimStartMs: 1200.4, trimEndMs: 9000 })).toBe(
      `${HOSTED}?ts=1200&te=9000`
    );
    expect(storyMediaUrl(HOSTED, 'video', { trimStartMs: 0, trimEndMs: 0 })).toBe(HOSTED);
    expect(storyMediaUrl(HOSTED, 'image', { trimStartMs: 1000, trimEndMs: 2000 })).toBe(HOSTED);
    expect(storyMediaUrl('not a url', 'video', { trimStartMs: 1, trimEndMs: 2 })).toBe('not a url');
  });

  it('publishStory posts the trimmed URL and omits empty captions', async () => {
    api.createStory.mockResolvedValue({ success: true });
    await publishStory({
      media: { url: HOSTED, mediaType: 'video' },
      caption: '   ',
      videoEdit: { trimStartMs: 0, trimEndMs: 30000 },
      idempotencyKey: 'draft-key-2',
    });
    expect(api.createStory).toHaveBeenCalledWith(
      { image_url: `${HOSTED}?te=30000`, caption: undefined },
      { idempotencyKey: 'draft-key-2' }
    );
  });

  it('publishStory maps failures to publish errors', async () => {
    api.createStory.mockRejectedValue(new Error('Server busy'));
    const err = await publishStory({ media: { url: HOSTED, mediaType: 'image' }, caption: 'x' }).catch((e) => e);
    expect(err).toBeInstanceOf(ComposerError);
    expect(err.stage).toBe('publish');
    expect(err.message).toBe('Server busy');
  });
});
