import { describe, expect, it } from 'vitest';
import {
  isLoadableAvatarUri,
  normalizeAvatarUrl,
  pickAvatarField,
  resolveAvatarUrlFrom,
} from './avatarUrl';

const PROD = 'https://growl-backend-production.wispy-leaf-4e8b.workers.dev/api/v1';
const PROD_ORIGIN = 'https://growl-backend-production.wispy-leaf-4e8b.workers.dev';
const KEY = 'avatar%2Fuser_1%2F1791497327602-abc.jpg';

describe('normalizeAvatarUrl', () => {
  it('keeps absolute https URLs exactly as stored', () => {
    expect(normalizeAvatarUrl('https://randomuser.me/api/portraits/men/51.jpg', PROD)).toBe(
      'https://randomuser.me/api/portraits/men/51.jpg'
    );
    expect(normalizeAvatarUrl(`${PROD}/media/${KEY}`, PROD)).toBe(`${PROD}/media/${KEY}`);
  });

  it('absolutizes relative media paths against the API host', () => {
    expect(normalizeAvatarUrl(`/api/v1/media/${KEY}`, PROD)).toBe(`${PROD_ORIGIN}/api/v1/media/${KEY}`);
    expect(normalizeAvatarUrl(`/media/${KEY}`, PROD)).toBe(`${PROD}/media/${KEY}`);
  });

  it('turns a bare R2 key into a media URL', () => {
    expect(normalizeAvatarUrl('avatar/user_1/a.jpg', PROD)).toBe(`${PROD}/media/avatar%2Fuser_1%2Fa.jpg`);
  });

  it('upgrades public http:// (blocked by iOS ATS) but keeps LAN dev hosts', () => {
    expect(normalizeAvatarUrl('http://randomuser.me/a.jpg', PROD)).toBe('https://randomuser.me/a.jpg');
    expect(
      normalizeAvatarUrl('http://192.168.1.4:8787/api/v1/media/x.jpg', 'http://192.168.1.4:8787/api/v1')
    ).toBe(
      'http://192.168.1.4:8787/api/v1/media/x.jpg'
    );
  });

  it('handles protocol-relative URLs', () => {
    expect(normalizeAvatarUrl('//randomuser.me/a.jpg', PROD)).toBe('https://randomuser.me/a.jpg');
  });

  it('moves media saved with the marketing host onto the API host', () => {
    expect(normalizeAvatarUrl(`https://letsgrow.lu/api/v1/media/${KEY}`, PROD)).toBe(
      `${PROD_ORIGIN}/api/v1/media/${KEY}`
    );
  });

  it('never moves media between backend hosts (each env has its own bucket)', () => {
    const qa = `https://growl-backend-qa.wispy-leaf-4e8b.workers.dev/api/v1/media/${KEY}`;
    expect(normalizeAvatarUrl(qa, PROD)).toBe(qa);
  });

  it('keeps on-device picks for the EditProfile preview', () => {
    expect(normalizeAvatarUrl('file:///var/mobile/a.jpg', PROD)).toBe('file:///var/mobile/a.jpg');
  });

  it('rejects empty, junk and non-portable values', () => {
    for (const v of [null, undefined, '', '   ', 'null', 'undefined', 'blob:abc', 'data:text/html,x', 'Kai', 42]) {
      expect(normalizeAvatarUrl(v as unknown, PROD)).toBe('');
    }
    expect(normalizeAvatarUrl('/api/v1/media/x.jpg', '')).toBe('');
  });
});

describe('pickAvatarField / resolveAvatarUrlFrom', () => {
  it('reads metadata.avatar from a feed/reel post (the Reels screen shape)', () => {
    const reel = {
      id: 'post_1',
      user_id: 'user_1',
      image_url: `${PROD}/media/reel%2Fuser_1%2Fclip`,
      metadata: { username: 'albino', avatar: `${PROD}/media/${KEY}`, format: 'reel' },
    };
    expect(resolveAvatarUrlFrom(reel, PROD)).toBe(`${PROD}/media/${KEY}`);
  });

  it('reads every API field name', () => {
    const url = 'https://randomuser.me/a.jpg';
    for (const field of ['avatar', 'avatar_url', 'avatarUrl', 'user_avatar', 'profile_image', 'picture']) {
      expect(pickAvatarField({ [field]: url })).toBe(url);
    }
    expect(pickAvatarField({ user: { avatar_url: url } })).toBe(url);
    expect(pickAvatarField({ author: { avatar: url } })).toBe(url);
    expect(pickAvatarField({ metadata: JSON.stringify({ avatar: url }) })).toBe(url);
  });

  it('prefers a top-level value and skips empty/null strings', () => {
    expect(pickAvatarField({ avatar: '', avatar_url: 'https://x/a.jpg' })).toBe('https://x/a.jpg');
    expect(pickAvatarField({ avatar: 'null', metadata: { avatar: 'https://x/b.jpg' } })).toBe('https://x/b.jpg');
  });

  it('never mistakes post media for an avatar', () => {
    expect(pickAvatarField({ image_url: 'https://x/post.jpg', photo_url: 'https://x/seed.jpg' })).toBe('');
  });

  it('accepts a raw string', () => {
    expect(resolveAvatarUrlFrom(`/api/v1/media/${KEY}`, PROD)).toBe(`${PROD_ORIGIN}/api/v1/media/${KEY}`);
  });
});

describe('isLoadableAvatarUri', () => {
  it('accepts remote, data:image and device URIs only', () => {
    expect(isLoadableAvatarUri('https://x/a.jpg')).toBe(true);
    expect(isLoadableAvatarUri('data:image/png;base64,AAA')).toBe(true);
    expect(isLoadableAvatarUri('file:///a.jpg')).toBe(true);
    expect(isLoadableAvatarUri('/api/v1/media/a.jpg')).toBe(false);
    expect(isLoadableAvatarUri('')).toBe(false);
  });
});
