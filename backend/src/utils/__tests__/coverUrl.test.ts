import { describe, expect, it } from 'vitest';
import { sanitizeCoverUrl } from '../validation';

describe('sanitizeCoverUrl (reel metadata.cover_url)', () => {
  it('keeps hosted media URLs', () => {
    expect(sanitizeCoverUrl('https://api.letsgrow.lu/api/v1/media/post/u/abc.jpg')).toBe(
      'https://api.letsgrow.lu/api/v1/media/post/u/abc.jpg'
    );
    expect(sanitizeCoverUrl('  /api/v1/media/post/u/abc.jpg ')).toBe('/api/v1/media/post/u/abc.jpg');
  });

  it('drops anything else', () => {
    expect(sanitizeCoverUrl('http://api.letsgrow.lu/api/v1/media/x.jpg')).toBeUndefined();
    expect(sanitizeCoverUrl('https://evil.example/cover.jpg')).toBeUndefined();
    expect(sanitizeCoverUrl('file:///var/mobile/cover.jpg')).toBeUndefined();
    expect(sanitizeCoverUrl('data:image/jpeg;base64,AAAA')).toBeUndefined();
    expect(sanitizeCoverUrl('javascript:alert(1)')).toBeUndefined();
    expect(sanitizeCoverUrl('/api/v1/media/../../etc')).toBeUndefined();
    expect(sanitizeCoverUrl('')).toBeUndefined();
    expect(sanitizeCoverUrl(42)).toBeUndefined();
    expect(sanitizeCoverUrl(null)).toBeUndefined();
  });
});
