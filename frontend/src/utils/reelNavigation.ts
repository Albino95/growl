import type { FeedPost } from '../services/api/feed';
import { isVideoMedia } from '../services/api/media';

export function isReelPost(
  post: Pick<FeedPost, 'metadata'> | { metadata?: Record<string, unknown> | null }
): boolean {
  const m = post.metadata || {};
  if (m.format === 'reel') return true;
  if (m.media_type === 'video') return true;
  if (
    isVideoMedia({
      uri: typeof m.image_url === 'string' ? m.image_url : undefined,
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
export function openReelsAtPost(navigation: Nav, postId: string) {
  const root = navigation.getParent?.() || navigation;
  root.navigate('Reels', { startPostId: postId });
}
