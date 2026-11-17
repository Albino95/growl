import { describe, expect, it, vi } from 'vitest';
import { createPublishQueue, type PublishQueueDeps, type PublishRunner } from './usePublishQueue';
import type { PublishInput, PublishOutcome } from '../services/publish/runPublish';
import type { FeedPost } from '../services/api/feed';

const HOSTED = 'https://api.grow.test/api/v1/media/abc';

function input(kind: PublishInput['kind'] = 'reel'): PublishInput {
  return {
    kind,
    media: { uri: 'file:///clip.mp4', mediaType: 'video', mimeType: 'video/mp4', durationMs: 4000 },
    caption: 'hello',
    category: 'fitness',
    videoEdit: { trimStartMs: 0, trimEndMs: 0 } as PublishInput['videoEdit'],
    audio: null,
    uploadMaxEdge: 1600,
    user: null,
  };
}

const outcome = (id = 'post-1'): PublishOutcome => ({
  upload: { sourceUri: 'file:///clip.mp4', url: HOSTED, mediaType: 'video' },
  result: { post: { id } as FeedPost, optimistic: { id } as FeedPost },
});

/** A runner whose attempts the test resolves / rejects by hand. */
function controllableRunner() {
  const calls: Array<{
    key: string;
    cachedUrl: string | null;
    ctx: Parameters<PublishRunner>[1];
    resolve: (o: PublishOutcome) => void;
    reject: (e: unknown) => void;
  }> = [];
  const run: PublishRunner = (_job, ctx) =>
    new Promise<PublishOutcome>((resolve, reject) => {
      calls.push({ key: ctx.idempotencyKey, cachedUrl: ctx.cachedUpload?.url ?? null, ctx, resolve, reject });
      ctx.signal.addEventListener('abort', () => {
        const e = new Error('Upload cancelled');
        e.name = 'UploadCancelledError';
        reject(e);
      });
    });
  return { run, calls };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(extra: Partial<PublishQueueDeps> = {}) {
  const runner = controllableRunner();
  let n = 0;
  const deps: PublishQueueDeps = {
    run: runner.run,
    onSuccess: vi.fn(),
    onFailure: vi.fn(),
    onCancel: vi.fn(),
    isCancelled: (e) => (e as Error)?.name === 'UploadCancelledError',
    newId: () => `job-${++n}`,
    ...extra,
  };
  const store = createPublishQueue(deps);
  const job = (id = 'job-1') => store.getState().jobs.find((j) => j.id === id);
  return { store, deps, runner, job };
}

describe('publish queue', () => {
  it('start → progress → success', async () => {
    const { store, deps, runner, job } = setup();
    store.getState().enqueue(input(), { idempotencyKey: 'key-aaaaaaaa', thumbUri: 'file:///t.jpg' });
    expect(job()?.status).toBe('preparing');
    expect(job()?.attempts).toBe(1);

    const { ctx } = runner.calls[0];
    ctx.onProgress({ parts: [{ id: 'media', sent: 50, total: 100 }], stage: 'uploading' });
    expect(job()?.status).toBe('uploading');
    expect(job()?.progress).toBeCloseTo(0.46);

    // Progress never goes backwards within an attempt (e.g. a transport retry).
    ctx.onProgress({ parts: [{ id: 'media', sent: 0, total: 0 }], stage: 'uploading' });
    expect(job()?.progress).toBeCloseTo(0.46);

    ctx.onProgress({ parts: [{ id: 'media', sent: 100, total: 100, done: true }], stage: 'finishing' });
    expect(job()?.status).toBe('finishing');

    runner.calls[0].resolve(outcome('p1'));
    await flush();
    expect(job()?.status).toBe('success');
    expect(job()?.progress).toBe(1);
    expect(job()?.post?.id).toBe('p1');
    expect(store.getState().lastSharedAt).toBeGreaterThan(0);
    expect(deps.onSuccess).toHaveBeenCalledTimes(1);
  });

  it('failure → retry reuses the same idempotency key and the hosted upload', async () => {
    const { store, deps, runner, job } = setup();
    store.getState().enqueue(input(), { idempotencyKey: 'draft-key-123' });

    runner.calls[0].ctx.onUploaded({ sourceUri: 'file:///clip.mp4', url: HOSTED, mediaType: 'video' });
    runner.calls[0].reject(new Error('We could not share it this time.'));
    await flush();
    expect(job()?.status).toBe('failed');
    expect(job()?.error).toBe('We could not share it this time.');
    expect(deps.onFailure).toHaveBeenCalledTimes(1);

    store.getState().retry('job-1');
    expect(job()?.status).toBe('preparing');
    expect(job()?.attempts).toBe(2);
    expect(runner.calls).toHaveLength(2);
    expect(runner.calls[1].key).toBe('draft-key-123');
    expect(runner.calls[1].key).toBe(runner.calls[0].key);
    expect(runner.calls[1].cachedUrl).toBe(HOSTED);

    runner.calls[1].resolve(outcome());
    await flush();
    expect(job()?.status).toBe('success');
  });

  it('retry is a no-op unless the job failed', () => {
    const { store, runner } = setup();
    store.getState().enqueue(input(), { idempotencyKey: 'key-aaaaaaaa' });
    store.getState().retry('job-1');
    expect(runner.calls).toHaveLength(1);
  });

  it('runs one job at a time and queues the rest', async () => {
    const { store, runner, job } = setup();
    store.getState().enqueue(input('post'), { idempotencyKey: 'key-one-1111' });
    store.getState().enqueue(input('story'), { idempotencyKey: 'key-two-2222' });
    expect(job('job-1')?.status).toBe('preparing');
    expect(job('job-2')?.status).toBe('queued');
    expect(runner.calls).toHaveLength(1);

    runner.calls[0].resolve(outcome());
    await flush();
    expect(job('job-2')?.status).toBe('preparing');
    expect(runner.calls[1].key).toBe('key-two-2222');
  });

  it('a failed job does not block the next one', async () => {
    const { store, runner, job } = setup();
    store.getState().enqueue(input(), { idempotencyKey: 'key-one-1111' });
    store.getState().enqueue(input(), { idempotencyKey: 'key-two-2222' });
    runner.calls[0].reject(new Error('nope'));
    await flush();
    expect(job('job-1')?.status).toBe('failed');
    expect(job('job-2')?.status).toBe('preparing');
  });

  it('cancel while uploading aborts the transport and removes the job', async () => {
    const { store, deps, runner, job } = setup();
    store.getState().enqueue(input(), { idempotencyKey: 'key-aaaaaaaa' });
    expect(runner.calls[0].ctx.signal.aborted).toBe(false);
    store.getState().cancel('job-1');
    expect(runner.calls[0].ctx.signal.aborted).toBe(true);
    await flush();
    expect(job()).toBeUndefined();
    expect(deps.onCancel).toHaveBeenCalledTimes(1);
    expect(deps.onFailure).not.toHaveBeenCalled();
  });

  it('cannot cancel while finishing (the create call is already out)', async () => {
    const { store, runner, job } = setup();
    store.getState().enqueue(input(), { idempotencyKey: 'key-aaaaaaaa' });
    runner.calls[0].ctx.onProgress({ parts: [], stage: 'finishing' });
    store.getState().cancel('job-1');
    expect(runner.calls[0].ctx.signal.aborted).toBe(false);
    expect(job()?.status).toBe('finishing');
  });

  it('edit parks the failed draft (same key) for the composer and removes the job', async () => {
    const { store, runner, job } = setup();
    store.getState().enqueue(input('post'), { idempotencyKey: 'draft-key-123' });
    runner.calls[0].reject(new Error('nope'));
    await flush();
    const req = store.getState().edit('job-1');
    expect(req?.idempotencyKey).toBe('draft-key-123');
    expect(job()).toBeUndefined();
    expect(store.getState().takeEditRequest('reel')).toBeNull();
    expect(store.getState().takeEditRequest('post')?.input.caption).toBe('hello');
    expect(store.getState().takeEditRequest('post')).toBeNull();
  });

  it('hasLiveJob tracks unfinished jobs by key', async () => {
    const { store, runner } = setup();
    store.getState().enqueue(input(), { idempotencyKey: 'draft-key-123' });
    expect(store.getState().hasLiveJob('draft-key-123')).toBe(true);
    runner.calls[0].resolve(outcome());
    await flush();
    expect(store.getState().hasLiveJob('draft-key-123')).toBe(false);
  });
});
