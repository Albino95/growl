import { describe, expect, it } from 'vitest';
import { clipCacheFileName, isLocalClipUri } from './cacheRemoteClip';

describe('cacheRemoteClip helpers', () => {
  it('treats device URIs as already local', () => {
    expect(isLocalClipUri('file:///tmp/clip.mp4')).toBe(true);
    expect(isLocalClipUri('ph://ABC')).toBe(true);
    expect(isLocalClipUri('content://media/video')).toBe(true);
    expect(isLocalClipUri('https://example.com/api/v1/media/reel/x.mp4')).toBe(false);
  });

  it('names cache files stably from the source URI', () => {
    const a = clipCacheFileName('https://api/media/reel/1.mp4');
    const b = clipCacheFileName('https://api/media/reel/1.mp4');
    const c = clipCacheFileName('https://api/media/reel/2.mp4');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.endsWith('.mp4')).toBe(true);
  });
});
