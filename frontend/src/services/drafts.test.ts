import { describe, expect, it } from 'vitest';
import {
  createDraftStore,
  draftKey,
  memoryDraftBackend,
  newIdempotencyKey,
  sanitizeComposerDraft,
  type ComposerDraft,
} from './drafts';

describe('draft store', () => {
  it('saves, restores and clears per user', async () => {
    const backend = memoryDraftBackend();
    const store = createDraftStore(backend);
    await store.save('journal-draft', 'u1', { content: 'hello' });
    await store.save('journal-draft', 'u2', { content: 'other' });
    expect((await store.load<{ content: string }>('journal-draft', 'u1'))?.data.content).toBe('hello');
    expect((await store.load<{ content: string }>('journal-draft', 'u2'))?.data.content).toBe('other');
    await store.clear('journal-draft', 'u1');
    expect(await store.load('journal-draft', 'u1')).toBeNull();
    expect(await store.load('journal-draft', 'u2')).not.toBeNull();
  });

  it('overwrites the previous draft', async () => {
    const store = createDraftStore(memoryDraftBackend());
    await store.save('ns', 'u', { n: 1 });
    await store.save('ns', 'u', { n: 2 });
    expect((await store.load<{ n: number }>('ns', 'u'))?.data.n).toBe(2);
  });

  it('expires stale drafts and drops corrupt ones', async () => {
    let t = 1_000;
    const backend = memoryDraftBackend();
    const store = createDraftStore(backend, () => t);
    await store.save('ns', 'u', { a: 1 });
    t += 10_000;
    expect(await store.load('ns', 'u', { maxAgeMs: 5_000 })).toBeNull();
    expect(backend.dump()).toEqual({});

    await backend.write(draftKey('ns', 'u'), '{not json');
    expect(await store.load('ns', 'u')).toBeNull();
    expect(backend.dump()).toEqual({});
  });

  it('never throws when the backend fails', async () => {
    const store = createDraftStore({
      read: async () => {
        throw new Error('io');
      },
      write: async () => {
        throw new Error('io');
      },
      remove: async () => {
        throw new Error('io');
      },
    });
    await expect(store.save('ns', 'u', {})).resolves.toBeUndefined();
    await expect(store.load('ns', 'u')).resolves.toBeNull();
    await expect(store.clear('ns', 'u')).resolves.toBeUndefined();
  });
});

describe('sanitizeComposerDraft', () => {
  const base: ComposerDraft = {
    kind: 'reel',
    caption: '',
    category: 'fitness',
    media: { uri: 'file:///cache/clip.mp4', mediaType: 'video', durationMs: 4000 },
    videoEdit: { trimStartMs: 0, trimEndMs: 3000 },
    audio: null,
    idempotencyKey: 'k',
  };

  it('keeps media that still exists', async () => {
    const out = await sanitizeComposerDraft(base, async () => true);
    expect(out?.draft.media?.uri).toBe('file:///cache/clip.mp4');
    expect(out?.droppedMedia).toBe(false);
  });

  it('drops missing media but keeps a caption', async () => {
    const out = await sanitizeComposerDraft({ ...base, caption: 'hi' }, async () => false);
    expect(out?.draft.media).toBeNull();
    expect(out?.draft.videoEdit).toBeNull();
    expect(out?.droppedMedia).toBe(true);
    expect(out?.draft.idempotencyKey).toBe('k');
  });

  it('returns null when nothing is left', async () => {
    expect(await sanitizeComposerDraft(base, async () => false)).toBeNull();
  });
});

describe('newIdempotencyKey', () => {
  it('produces distinct v4 uuids', () => {
    const a = newIdempotencyKey();
    const b = newIdempotencyKey();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});
