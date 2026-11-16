/**
 * Upload hardening: type comes from the file's bytes, oversized bodies are
 * refused before parsing, served media carries nosniff.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createMockEnv, parseJsonResponse } from '../utils/test-helpers';
import { uploadMedia, getMedia } from '../../src/routes/media';
import type { Env } from '../../src/types';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1]);
const MP4 = new Uint8Array([0, 0, 0, 0x18, ...Array.from('ftypmp42').map((c) => c.charCodeAt(0)), 0, 0, 0, 0]);
const MOV = new Uint8Array([0, 0, 0, 0x14, ...Array.from('ftypqt  ').map((c) => c.charCodeAt(0)), 0, 0, 0, 0]);
const HTML = new TextEncoder().encode('<html><script>alert(1)</script></html>');

describe('media upload', () => {
  let env: Env;
  let stored: { key: string; contentType?: string }[];

  beforeEach(() => {
    env = createMockEnv();
    stored = [];
    env.DB = {
      prepare: (q: string) => ({
        bind: () => ({
          first: async () =>
            q.includes('FROM users WHERE id') ? { id: 'test-user', email: 'u@example.com' } : null,
          all: async () => ({ results: [] }),
          run: async () => ({ success: true }),
        }),
      }),
    } as any;
    env.R2 = {
      put: async (key: string, _body: unknown, opts?: { httpMetadata?: { contentType?: string } }) => {
        stored.push({ key, contentType: opts?.httpMetadata?.contentType });
      },
      get: async () => ({
        size: 4,
        body: new Uint8Array([1, 2, 3, 4]),
        httpMetadata: { contentType: 'image/jpeg' },
      }),
    } as any;
  });

  const upload = (bytes: Uint8Array, type: string, name: string, headers: Record<string, string> = {}) => {
    const form = new FormData();
    form.append('purpose', 'post');
    form.append('file', new File([bytes], name, { type }));
    return uploadMedia(
      new Request('https://api.test/api/v1/media/upload', {
        method: 'POST',
        headers: { Authorization: 'Bearer test', ...headers },
        body: form,
      }),
      env
    );
  };

  it('accepts a real JPEG', async () => {
    const res = await upload(JPEG, 'image/jpeg', 'photo.jpg');
    expect(res.status).toBe(200);
    expect(stored[0].contentType).toBe('image/jpeg');
    expect(stored[0].key).toMatch(/\.jpg$/);
  });

  it('stores a video by its real type even when the client mislabels it', async () => {
    const res = await upload(MOV, 'video/mp4', 'clip.mp4');
    expect(res.status).toBe(200);
    expect(stored[0].contentType).toBe('video/quicktime');
    expect(stored[0].key).toMatch(/^reel\/.*\.mov$/);
  });

  it('accepts an MP4 with no declared type', async () => {
    const res = await upload(MP4, '', 'upload');
    expect(res.status).toBe(200);
    expect(stored[0].contentType).toBe('video/mp4');
  });

  it('rejects HTML disguised as an image', async () => {
    const res = await upload(HTML, 'image/jpeg', 'evil.jpg');
    expect(res.status).toBe(415);
    expect(stored).toHaveLength(0);
  });

  it('refuses an oversized body from its Content-Length before parsing', async () => {
    const res = await uploadMedia(
      new Request('https://api.test/api/v1/media/upload', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test',
          'Content-Type': 'multipart/form-data; boundary=x',
          'Content-Length': String(60 * 1024 * 1024),
        },
        body: 'x',
      }),
      env
    );
    expect(res.status).toBe(413);
    expect((await parseJsonResponse(res)).error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('serves media with nosniff', async () => {
    const res = await getMedia(new Request('https://api.test/api/v1/media/post/a.jpg'), env, 'post/a.jpg');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  // R2 reports `range` even on plain gets; production answered every avatar with 206.
  it('answers a plain GET with 200 even when R2 reports a full range', async () => {
    (env.R2 as any).get = async () => ({
      size: 4,
      range: { offset: 0, length: 4 },
      body: new Uint8Array([1, 2, 3, 4]),
      httpMetadata: { contentType: 'image/jpeg' },
    });
    const res = await getMedia(
      new Request('https://api.test/api/v1/media/avatar%2Fu%2Fa.jpg'),
      env,
      'avatar%2Fu%2Fa.jpg'
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Range')).toBeNull();
    expect(res.headers.get('Content-Length')).toBe('4');
  });

  it('answers a Range request with 206 + Content-Range', async () => {
    (env.R2 as any).get = async () => ({
      size: 10,
      range: { offset: 2, length: 3 },
      body: new Uint8Array([3, 4, 5]),
      httpMetadata: { contentType: 'video/mp4' },
    });
    const res = await getMedia(
      new Request('https://api.test/api/v1/media/reel/a.mp4', { headers: { Range: 'bytes=2-4' } }),
      env,
      'reel/a.mp4'
    );
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 2-4/10');
  });
});
