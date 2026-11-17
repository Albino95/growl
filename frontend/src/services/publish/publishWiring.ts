/**
 * Real side effects for the background publish queue: the runner, the success
 * moment (haptic + seedpop, feed insert + refresh, points, pending draft
 * cleared), failure feedback, and the "Edit" route back into the composer.
 * Installed by PublishHost on mount.
 */
import { store } from '../../store/store';
import { fetchFeedPosts, prependFeedPost } from '../../store/slices/feedSlice';
import { updateUser } from '../../store/slices/authSlice';
import { haptic } from '../../theme/haptics';
import { feedback, lockNativeUiAudio } from '../../utils/interactionFeedback';
import { toast } from '../../state/useToastStore';
import { navigateRoot } from '../../app/navigation/navigationRef';
import {
  publishQueue,
  type PublishEditRequest,
  type PublishJob,
  type PublishQueueDeps,
} from '../../state/usePublishQueue';
import { toComposerError, type ComposerKind } from '../createContent';
import { composerPendingNs, drafts, type ComposerDraft } from '../drafts';
import { isPublishCancelled, runPublish } from './runPublish';

/** Clear the job's pending draft — only if it is still this job's draft. */
async function clearPendingDraft(job: PublishJob): Promise<void> {
  const ns = composerPendingNs(job.kind);
  const saved = await drafts.load<ComposerDraft>(ns, job.userId);
  if (!saved || saved.data.idempotencyKey === job.idempotencyKey) {
    await drafts.clear(ns, job.userId);
  }
}

/** Reopen the composer for a parked edit request (the composer takes it on mount). */
export function openComposerForEdit(request: PublishEditRequest): void {
  const route = composerRoute(request.kind);
  if (route === 'Post') {
    const extras = request.input.extras;
    navigateRoot('Post', {
      promoteBusinessId: extras?.promoteBusinessId,
      promoteBusinessName: extras?.promoteBusinessName,
      productId: extras?.productId,
    });
  } else {
    navigateRoot(route);
  }
}

export function composerRoute(kind: ComposerKind): 'Post' | 'CreateReel' | 'CreateStory' {
  return kind === 'post' ? 'Post' : kind === 'reel' ? 'CreateReel' : 'CreateStory';
}

/** Open the reels viewer at a freshly shared reel. */
export function openSharedReel(job: PublishJob): void {
  if (!job.post?.id) return;
  lockNativeUiAudio();
  navigateRoot('Reels', { startPostId: job.post.id, seedPost: job.post, mode: 'home' });
}

export const appPublishDeps: PublishQueueDeps = {
  run: (job, ctx) => runPublish(job.input, ctx),

  onSuccess: (job, { result }) => {
    // One success haptic + seedpop per publish.
    haptic('shared');
    if (result) {
      store.dispatch(prependFeedPost(result.optimistic));
      if (typeof result.post.points_total === 'number') {
        store.dispatch(updateUser({ points: result.post.points_total }));
      }
    }
    void clearPendingDraft(job);
    // Merge-refresh so the server copy (counts, media URLs) replaces the optimistic card.
    setTimeout(() => {
      void store.dispatch(fetchFeedPosts({ force: true, silent: true }));
    }, 600);
  },

  onFailure: () => {
    feedback.error();
  },

  onCancel: (job) => {
    toast.info('Sharing stopped — your draft is saved', {
      icon: 'pause-circle',
      action: {
        label: 'Edit',
        onPress: () => {
          publishQueue.setState({
            editRequest: {
              kind: job.kind,
              input: job.input,
              idempotencyKey: job.idempotencyKey,
              upload: job.upload,
            },
          });
          openComposerForEdit(publishQueue.getState().editRequest as PublishEditRequest);
        },
      },
    });
  },

  toMessage: (err) => toComposerError(err, 'publish').message,
  isCancelled: isPublishCancelled,
};
