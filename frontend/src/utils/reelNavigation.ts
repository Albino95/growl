import type { FeedPost } from '../services/api/feed';
import { isVideoMedia } from '../services/api/media';
import { getRootNavigator } from '../app/navigation/rootNavigation';

export function isReelPost(
  post:
    | Pick<FeedPost, 'metadata' | 'image_url'>
    | { metadata?: Record<string, unknown> | null; image_url?: string | null }
): boolean {
  const m = post.metadata || {};
  if (m.format === 'reel') return true;
  if (m.media_type === 'video') return true;
  const uri =
    typeof post.image_url === 'string'
      ? post.image_url
      : typeof m.image_url === 'string'
        ? m.image_url
        : undefined;
  if (
    isVideoMedia({
      uri,
      mediaType: typeof m.media_type === 'string' ? m.media_type : undefined,
      contentType: typeof m.content_type === 'string' ? m.content_type : undefined,
    })
  ) {
    return m.format !== 'post';
  }
  return false;
}

type Nav = {
  getParent?: () => Nav;
  navigate: (name: string, params?: object) => void;
};

/** Open the reels viewer scrolled to a specific post. */
export function openReelsAtPost(
  navigation: Nav,
  postId: string,
  seedPost?: FeedPost | null
) {
  const root = getRootNavigator(navigation);
  root?.navigate('Reels', { startPostId: postId, seedPost: seedPost || undefined });
}
