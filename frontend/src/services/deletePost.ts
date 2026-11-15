/**
 * "Delete post" flow shared by Home, Profile and Post detail: confirm → remove from
 * the Home feed at once (optimistic) → DELETE → toast. On failure the feed is
 * refetched (restores the post) and the caller's onRestore runs.
 */
import { store } from '../store/store';
import { fetchFeedPosts, removeFeedPost } from '../store/slices/feedSlice';
import { deleteFeedPost } from './api/feed';
import { ApiError } from './api/http';
import { confirmAsync, alertMessage } from '../utils/confirmDialog';
import { toast } from '../state/useToastStore';
import { usePostEventsStore } from '../state/usePostEventsStore';

export async function confirmAndDeletePost(
  postId: string,
  opts: { onRemoved?: () => void; onRestore?: () => void } = {}
): Promise<boolean> {
  const ok = await confirmAsync(
    'Delete post?',
    'This removes the post, its likes and comments for everyone. This can’t be undone.',
    { confirmLabel: 'Delete', destructive: true }
  );
  if (!ok) return false;

  store.dispatch(removeFeedPost(postId));
  usePostEventsStore.getState().markDeleted(postId);
  opts.onRemoved?.();
  try {
    await deleteFeedPost(postId);
  } catch (e) {
    // Already gone on the server (POST_NOT_FOUND) → the outcome the user wanted. A bare
    // router 404 means an older server without the route: restore and say so.
    const alreadyGone = e instanceof ApiError && e.status === 404 && e.code === 'POST_NOT_FOUND';
    if (!alreadyGone) {
      usePostEventsStore.getState().unmarkDeleted(postId);
      opts.onRestore?.();
      void store.dispatch(fetchFeedPosts({ force: true, silent: true }));
      const routeMissing = e instanceof ApiError && e.status === 404;
      void alertMessage(
        'Couldn’t delete post',
        routeMissing
          ? 'Deleting posts isn’t available right now. Please try again later.'
          : e instanceof ApiError && e.message && e.status !== 0
            ? e.message
            : 'Check your connection and try again.'
      );
      return false;
    }
  }
  // Toast plays the success haptic itself.
  toast.success('Post deleted');
  return true;
}
