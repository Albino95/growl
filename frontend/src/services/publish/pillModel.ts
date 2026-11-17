/** Pure view model for the PublishHost pill (which job to show, and its copy). */
import { PUBLISH_PILL_COPY } from '../../hooks/composerConfig';
import type { PublishJob } from '../../state/usePublishQueue';
import { progressPercent } from './progress';

const NOUN = { post: 'post', reel: 'reel', story: 'story' } as const;

/**
 * The job the pill shows: the running one, else a failure waiting for
 * Retry / Edit, else the latest success (until the host dismisses it).
 */
export function pickPillJob(jobs: readonly PublishJob[]): PublishJob | null {
  const running = jobs.find(
    (j) => j.status === 'preparing' || j.status === 'uploading' || j.status === 'finishing'
  );
  if (running) return running;
  const failed = jobs.find((j) => j.status === 'failed');
  if (failed) return failed;
  const succeeded = jobs.filter((j) => j.status === 'success');
  if (succeeded.length) return succeeded[succeeded.length - 1];
  return jobs.find((j) => j.status === 'queued') ?? null;
}

export type PillModel = {
  label: string;
  percent: number;
  /** Bar fill 0..1 (null = no bar). */
  bar: number | null;
  canCancel: boolean;
  /** Jobs waiting behind this one. */
  waiting: number;
};

export function pillModel(job: PublishJob, jobs: readonly PublishJob[]): PillModel {
  const noun = NOUN[job.kind];
  const waiting = jobs.filter((j) => j.status === 'queued' && j.id !== job.id).length;
  const percent = progressPercent(job.progress, job.status === 'success');
  switch (job.status) {
    case 'queued':
      return { label: PUBLISH_PILL_COPY.queued(noun), percent: 0, bar: 0, canCancel: true, waiting };
    case 'preparing':
      return { label: PUBLISH_PILL_COPY.preparing(noun), percent: 0, bar: 0, canCancel: true, waiting };
    case 'uploading':
      return {
        label: PUBLISH_PILL_COPY.uploading(noun, percent),
        percent,
        bar: job.progress,
        canCancel: true,
        waiting,
      };
    case 'finishing':
      return { label: PUBLISH_PILL_COPY.finishing, percent, bar: job.progress, canCancel: false, waiting };
    case 'success':
      return { label: PUBLISH_PILL_COPY.success, percent: 100, bar: null, canCancel: false, waiting };
    case 'failed':
    default:
      return { label: PUBLISH_PILL_COPY.failed, percent, bar: null, canCancel: false, waiting };
  }
}
