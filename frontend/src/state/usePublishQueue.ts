/**
 * Background publishing queue. The composer enqueues a draft and closes; the
 * global `PublishHost` pill shows progress, success, and Retry / Edit on
 * failure. One job runs at a time; later ones wait as `queued`.
 *
 *   queued ─▶ preparing ─▶ uploading ─▶ finishing ─▶ success
 *     ▲           │             │            │
 *     │           └─────────────┴────────────┴─▶ failed ─retry─┘
 *     └─────────── (cancel while queued/preparing/uploading → removed)
 *
 * The store logic lives in `createPublishQueue(deps)` so tests can drive it with
 * a fake runner; the app singleton gets its real deps from
 * `installPublishDeps` (called by PublishHost on mount).
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { ComposerKind } from '../services/createContent';
import type { ComposerUpload } from '../hooks/composerMachine';
import type { FeedPost } from '../services/api/feed';
import type {
  PublishInput,
  PublishOutcome,
  PublishRunContext,
} from '../services/publish/runPublish';
import {
  overallProgress,
  type ProgressPart,
  type PublishStage,
} from '../services/publish/progress';

export type PublishJobStatus =
  | 'queued'
  | 'preparing'
  | 'uploading'
  | 'finishing'
  | 'success'
  | 'failed';

export type PublishJob = {
  id: string;
  kind: ComposerKind;
  input: PublishInput;
  /** Same key for every attempt of this draft. */
  idempotencyKey: string;
  /** Who owns the persisted pending draft. */
  userId: string | null;
  thumbUri: string | null;
  status: PublishJobStatus;
  /** 0..1, never moves backwards within an attempt. */
  progress: number;
  parts: ProgressPart[];
  error: string | null;
  attempts: number;
  /** Hosted media from an earlier attempt — a retry skips the upload. */
  upload: ComposerUpload | null;
  /** Created post (post / reel) once shared. */
  post: FeedPost | null;
};

/** What "Edit" hands back to the composer. */
export type PublishEditRequest = {
  kind: ComposerKind;
  input: PublishInput;
  idempotencyKey: string;
  upload: ComposerUpload | null;
};

export type PublishRunner = (
  job: Readonly<PublishJob>,
  ctx: Required<Pick<PublishRunContext, 'signal' | 'onProgress' | 'onUploaded'>> &
    Pick<PublishRunContext, 'idempotencyKey' | 'cachedUpload'>
) => Promise<PublishOutcome>;

export type PublishQueueDeps = {
  run: PublishRunner;
  onSuccess?: (job: PublishJob, outcome: PublishOutcome) => void;
  onFailure?: (job: PublishJob, error: unknown) => void;
  onCancel?: (job: PublishJob) => void;
  /** User-facing message for a failure. */
  toMessage?: (error: unknown) => string;
  /** True when the error means "the user cancelled". */
  isCancelled?: (error: unknown) => boolean;
  newId?: () => string;
};

export type EnqueueOptions = {
  idempotencyKey: string;
  userId?: string | null;
  thumbUri?: string | null;
  upload?: ComposerUpload | null;
};

export type PublishQueueState = {
  jobs: PublishJob[];
  /** Bumped on every success (screens refetch stories / feed on change). */
  lastSharedAt: number;
  editRequest: PublishEditRequest | null;
  /** Number of mounted PublishHosts — 0 means the composer keeps its in-place flow. */
  hosts: number;

  enqueue: (input: PublishInput, opts: EnqueueOptions) => string;
  /** Stops an upload (or drops a queued job). No-op while finishing or after success. */
  cancel: (id: string) => void;
  /** Failed → queued again with the same idempotency key and cached upload. */
  retry: (id: string) => void;
  /** Remove a finished / failed job from the list. */
  dismiss: (id: string) => void;
  /** Remove a failed job and park it for the composer to reopen. */
  edit: (id: string) => PublishEditRequest | null;
  /** Composer mount: take the parked edit request for this kind, if any. */
  takeEditRequest: (kind: ComposerKind) => PublishEditRequest | null;
  /** A job (not yet finished) holds this idempotency key. */
  hasLiveJob: (idempotencyKey: string) => boolean;
  hostMounted: (mounted: boolean) => void;
};

const ACTIVE: readonly PublishJobStatus[] = ['preparing', 'uploading', 'finishing'];

export function isActiveJob(job: Pick<PublishJob, 'status'>): boolean {
  return ACTIVE.includes(job.status);
}

let fallbackId = 0;

export function createPublishQueue(deps: PublishQueueDeps): StoreApi<PublishQueueState> {
  const controllers = new Map<string, AbortController>();

  return createStore<PublishQueueState>((set, get) => {
    const patch = (id: string, next: Partial<PublishJob> | ((j: PublishJob) => Partial<PublishJob>)) =>
      set((s) => ({
        jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...(typeof next === 'function' ? next(j) : next) } : j)),
      }));
    const find = (id: string) => get().jobs.find((j) => j.id === id);
    const remove = (id: string) => set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) }));

    const pump = () => {
      const { jobs } = get();
      if (jobs.some(isActiveJob)) return;
      const next = jobs.find((j) => j.status === 'queued');
      if (next) void start(next.id);
    };

    const start = async (id: string) => {
      const controller = new AbortController();
      controllers.set(id, controller);
      patch(id, (j) => ({
        status: 'preparing',
        progress: 0,
        parts: [],
        error: null,
        attempts: j.attempts + 1,
      }));
      const job = find(id);
      if (!job) return;

      const onProgress = ({ parts, stage }: { parts: ProgressPart[]; stage: PublishStage }) => {
        if (controller.signal.aborted) return;
        const cur = find(id);
        if (!cur || !isActiveJob(cur)) return;
        const status: PublishJobStatus =
          stage === 'finishing' || stage === 'done'
            ? 'finishing'
            : stage === 'uploading'
              ? 'uploading'
              : cur.status;
        patch(id, {
          parts,
          status,
          progress: Math.max(cur.progress, Math.min(1, overallProgress(parts, stage === 'done' ? 'finishing' : stage))),
        });
      };
      const onUploaded = (upload: ComposerUpload) => patch(id, { upload });

      try {
        const outcome = await deps.run(job, {
          signal: controller.signal,
          onProgress,
          onUploaded,
          idempotencyKey: job.idempotencyKey,
          cachedUpload: job.upload,
        });
        if (controller.signal.aborted && !find(id)) return;
        patch(id, {
          status: 'success',
          progress: 1,
          error: null,
          upload: outcome.upload,
          post: outcome.result?.post ?? null,
        });
        set({ lastSharedAt: Date.now() });
        const done = find(id);
        if (done) deps.onSuccess?.(done, outcome);
      } catch (err) {
        const cancelled = controller.signal.aborted || !!deps.isCancelled?.(err);
        const cur = find(id);
        if (cancelled) {
          if (cur) {
            remove(id);
            deps.onCancel?.(cur);
          }
        } else if (cur) {
          const message =
            deps.toMessage?.(err) ?? (err instanceof Error && err.message ? err.message : 'Something went wrong.');
          patch(id, { status: 'failed', error: message });
          const failed = find(id);
          if (failed) deps.onFailure?.(failed, err);
        }
      } finally {
        controllers.delete(id);
        pump();
      }
    };

    return {
      jobs: [],
      lastSharedAt: 0,
      editRequest: null,
      hosts: 0,

      enqueue: (input, opts) => {
        const id = deps.newId?.() ?? `publish-${Date.now()}-${++fallbackId}`;
        const job: PublishJob = {
          id,
          kind: input.kind,
          input,
          idempotencyKey: opts.idempotencyKey,
          userId: opts.userId ?? null,
          thumbUri: opts.thumbUri ?? null,
          status: 'queued',
          progress: 0,
          parts: [],
          error: null,
          attempts: 0,
          upload: opts.upload ?? null,
          post: null,
        };
        set((s) => ({ jobs: [...s.jobs, job] }));
        pump();
        return id;
      },

      cancel: (id) => {
        const job = find(id);
        if (!job) return;
        if (job.status === 'finishing' || job.status === 'success' || job.status === 'failed') return;
        if (job.status === 'queued') {
          remove(id);
          deps.onCancel?.(job);
          pump();
          return;
        }
        // Active: abort the transport; `start` removes the job when the runner settles.
        controllers.get(id)?.abort();
      },

      retry: (id) => {
        const job = find(id);
        if (!job || job.status !== 'failed') return;
        patch(id, { status: 'queued', progress: 0, parts: [], error: null });
        pump();
      },

      dismiss: (id) => {
        const job = find(id);
        if (!job || isActiveJob(job)) return;
        remove(id);
        pump();
      },

      edit: (id) => {
        const job = find(id);
        if (!job || job.status !== 'failed') return null;
        const request: PublishEditRequest = {
          kind: job.kind,
          input: job.input,
          idempotencyKey: job.idempotencyKey,
          upload: job.upload,
        };
        remove(id);
        set({ editRequest: request });
        pump();
        return request;
      },

      takeEditRequest: (kind) => {
        const req = get().editRequest;
        if (!req || req.kind !== kind) return null;
        set({ editRequest: null });
        return req;
      },

      hasLiveJob: (key) => get().jobs.some((j) => j.idempotencyKey === key && j.status !== 'success'),

      hostMounted: (mounted) => set((s) => ({ hosts: Math.max(0, s.hosts + (mounted ? 1 : -1)) })),
    };
  });
}

// --- App singleton -------------------------------------------------------------

const appDeps: PublishQueueDeps = {
  run: () => Promise.reject(new Error('Publishing is not ready yet.')),
};

/** Wire the real runner + side effects (PublishHost does this on mount). */
export function installPublishDeps(deps: PublishQueueDeps): void {
  Object.assign(appDeps, deps);
}

export const publishQueue = createPublishQueue({
  run: (job, ctx) => appDeps.run(job, ctx),
  onSuccess: (job, outcome) => appDeps.onSuccess?.(job, outcome),
  onFailure: (job, err) => appDeps.onFailure?.(job, err),
  onCancel: (job) => appDeps.onCancel?.(job),
  toMessage: (err) =>
    appDeps.toMessage?.(err) ?? (err instanceof Error && err.message ? err.message : 'Something went wrong.'),
  isCancelled: (err) => !!appDeps.isCancelled?.(err),
});

export function usePublishQueue<T>(selector: (s: PublishQueueState) => T): T {
  return useStore(publishQueue, selector);
}
