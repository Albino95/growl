import { beforeEach, describe, expect, it, vi } from 'vitest';

const content = vi.hoisted(() => ({
  uploadComposerMedia: vi.fn(),
  publishPost: vi.fn(),
  publishReel: vi.fn(),
  publishStory: vi.fn(),
}));
const cover = vi.hoisted(() => ({ uploadReelCover: vi.fn() }));

vi.mock('../createContent', () => ({
  ...content,
  ComposerError: class ComposerError extends Error {},
}));
vi.mock('../../utils/uploadReelCover', () => cover);
vi.mock('../api/media', () => {
  class UploadCancelledError extends Error {
    constructor() {
      super('Upload cancelled');
      this.name = 'UploadCancelledError';
    }
  }
  return {
    UploadCancelledError,
    isUploadCancelled: (e: unknown) => (e as Error)?.name === 'UploadCancelledError',
  };
});

import { runPublish, type PublishInput } from './runPublish';

const HOSTED = 'https://api.grow.test/api/v1/media/abc';

function input(kind: PublishInput['kind']): PublishInput {
  return {
    kind,
    media:
      kind === 'post'
        ? { uri: 'file:///a.jpg', mediaType: 'image', mimeType: 'image/jpeg', durationMs: 0 }
        : { uri: 'file:///clip.mp4', mediaType: 'video', mimeType: 'video/mp4', durationMs: 4000 },
    caption: 'hi',
    category: 'fitness',
    videoEdit: { trimStartMs: 0, trimEndMs: 0 } as PublishInput['videoEdit'],
    audio: null,
    uploadMaxEdge: 1400,
    user: null,
  };
}

beforeEach(() => {
  Object.values(content).forEach((f) => f.mockReset());
  cover.uploadReelCover.mockReset();
  content.uploadComposerMedia.mockImplementation(async (_uri, _kind, opts) => {
    opts.onProgress?.(500, 1000);
    opts.onProgress?.(1000, 1000);
    return { url: HOSTED, mediaType: opts.mediaType, contentType: 'image/jpeg' };
  });
  content.publishPost.mockResolvedValue({ post: { id: 'p' }, optimistic: { id: 'p' } });
  content.publishReel.mockResolvedValue({ post: { id: 'r' }, optimistic: { id: 'r' } });
  content.publishStory.mockResolvedValue(undefined);
});

describe('runPublish', () => {
  it('passes the idempotency key to the create call, every attempt', async () => {
    await runPublish(input('post'), { idempotencyKey: 'draft-key-123' });
    await runPublish(input('post'), { idempotencyKey: 'draft-key-123' });
    expect(content.publishPost).toHaveBeenCalledTimes(2);
    for (const call of content.publishPost.mock.calls) {
      expect(call[0].idempotencyKey).toBe('draft-key-123');
    }
    await runPublish(input('story'), { idempotencyKey: 'story-key-1' });
    expect(content.publishStory.mock.calls[0][0].idempotencyKey).toBe('story-key-1');
  });

  it('reports upload progress, then finishing, then done', async () => {
    const stages: string[] = [];
    const sent: number[] = [];
    await runPublish(input('post'), {
      idempotencyKey: 'k-12345678',
      onProgress: ({ parts, stage }) => {
        stages.push(stage);
        const media = parts.find((p) => p.id === 'media');
        if (media) sent.push(media.sent);
      },
    });
    expect(stages[0]).toBe('preparing');
    expect(stages).toContain('uploading');
    expect(stages.indexOf('finishing')).toBeGreaterThan(stages.lastIndexOf('uploading'));
    expect(stages[stages.length - 1]).toBe('done');
    expect(sent).toContain(500);
  });

  it('reels upload the cover as a second weighted part', async () => {
    cover.uploadReelCover.mockImplementation(async (opts) => {
      opts.onProgress?.(10, 100);
      return 'https://api.grow.test/api/v1/media/cover';
    });
    const ids = new Set<string>();
    const { upload } = await runPublish(input('reel'), {
      idempotencyKey: 'k-12345678',
      onProgress: ({ parts }) => parts.forEach((p) => ids.add(p.id)),
    });
    expect(ids).toEqual(new Set(['media', 'cover']));
    expect(upload.coverUrl).toBe('https://api.grow.test/api/v1/media/cover');
    expect(content.publishReel.mock.calls[0][0].coverUrl).toBe(upload.coverUrl);
  });

  it('a retry with the cached upload skips uploading', async () => {
    await runPublish(input('post'), {
      idempotencyKey: 'k-12345678',
      cachedUpload: { sourceUri: 'file:///a.jpg', url: HOSTED, mediaType: 'image' },
    });
    expect(content.uploadComposerMedia).not.toHaveBeenCalled();
    expect(content.publishPost.mock.calls[0][0].mediaUrl).toBe(HOSTED);
  });

  it('stops before the create call when cancelled during upload', async () => {
    const controller = new AbortController();
    content.uploadComposerMedia.mockImplementation(async (_u, _k, opts) => {
      controller.abort();
      return { url: HOSTED, mediaType: opts.mediaType };
    });
    await expect(
      runPublish(input('post'), { idempotencyKey: 'k-12345678', signal: controller.signal })
    ).rejects.toMatchObject({ name: 'UploadCancelledError' });
    expect(content.publishPost).not.toHaveBeenCalled();
  });
});
