import { request, withIdempotency } from './http';

export type FeedPost = {
  id: string;
  user_id: string;
  image_url?: string | null;
  caption?: string | null;
  category: string;
  subcategory?: string | null;
  created_at: string;
  relevance_score?: number;
  feed_section?: 'following' | 'suggested';
  points_awarded?: number;
  points_total?: number;
  metadata?: {
    likes?: number;
    comments?: number;
    has_liked?: boolean;
    friend_likes_count?: number;
    friend_likers?: string[];
    is_friend?: boolean;
    username?: string;
    avatar?: string;
    isInstructor?: boolean;
    audio_url?: string;
    audio_title?: string;
    /** Vertical clip published via Create Reel. */
    format?: 'reel' | 'post' | string;
    media_type?: 'image' | 'video' | string;
    content_type?: string;
    /** Client-side reel video edits (trim, mute, look, text). */
    video_edit?: Record<string, unknown>;
  };
};

export type FeedResponse = {
  success: boolean;
  data: FeedPost[];
};

export type ForYouFeedResponse = {
  success: boolean;
  data: {
    following: FeedPost[];
    suggested: FeedPost[];
  };
};

export type FeedComment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  /** Top-level comment this replies to (one level); null/absent = top-level. */
  parent_id?: string | null;
  user: {
    id: string;
    username?: string;
    avatar?: string | null;
    is_instructor?: boolean;
  };
};

export type FeedLiker = {
  id: string;
  username: string;
  avatar?: string | null;
  isFriend?: boolean;
};

export async function getFeedPosts(options?: {
  mode?: 'default' | 'explore' | 'foryou' | 'home';
}): Promise<FeedResponse> {
  const mode = options?.mode;
  const query =
    mode === 'explore' ? '?mode=explore' : mode === 'foryou' || mode === 'home' ? '?mode=foryou' : '';
  return request<FeedResponse>(`/feed/feed${query}`);
}

export async function getForYouFeed(): Promise<ForYouFeedResponse> {
  return request<ForYouFeedResponse>('/feed/feed?mode=foryou');
}

/** Home feed page size (server default 20, max 50). */
export const FEED_PAGE_SIZE = 20;

export type FeedPage = {
  following: FeedPost[];
  suggested: FeedPost[];
  /** Explore / array modes: the page in server order. For You: following + suggested. */
  items: FeedPost[];
  /** Opaque token for the next page; null when there is nothing more. */
  nextCursor: string | null;
};

/**
 * One page of the feed. Pass the previous page's `nextCursor` to continue.
 * Older servers ignore cursor/limit and omit next_cursor → a single page.
 */
export async function getFeedPage(options: {
  mode: 'foryou' | 'explore';
  cursor?: string | null;
  limit?: number;
  signal?: AbortSignal;
}): Promise<FeedPage> {
  const params = new URLSearchParams();
  params.set('mode', options.mode);
  params.set('limit', String(options.limit ?? FEED_PAGE_SIZE));
  if (options.cursor) params.set('cursor', options.cursor);
  const res = await request<{
    success: boolean;
    data:
      | FeedPost[]
      | { following?: FeedPost[]; suggested?: FeedPost[]; next_cursor?: string | null };
    meta?: { next_cursor?: string | null };
  }>(`/feed/feed?${params.toString()}`, options.signal ? { signal: options.signal } : {});
  if (!res || !res.success || !res.data) throw new Error('Unexpected feed response');
  const data = res.data;
  const fromData = !Array.isArray(data) ? data.next_cursor : undefined;
  const raw = res.meta?.next_cursor ?? fromData ?? null;
  const nextCursor = typeof raw === 'string' && raw.length > 0 ? raw : null;
  if (Array.isArray(data)) {
    return { following: [], suggested: [], items: data, nextCursor };
  }
  const following = Array.isArray(data.following) ? data.following : [];
  const suggested = Array.isArray(data.suggested) ? data.suggested : [];
  return { following, suggested, items: [...following, ...suggested], nextCursor };
}

export async function getFeedPost(postId: string): Promise<FeedPost | null> {
  try {
    const res = await request<{ success: boolean; data: FeedPost }>(
      `/feed/posts/${encodeURIComponent(postId)}`
    );
    if (!res.success || !res.data) return null;
    return res.data;
  } catch {
    return null;
  }
}

export async function createFeedPost(payload: {
  image_url: string;
  caption?: string;
  category: string;
  subcategory?: string;
  metadata?: Record<string, unknown>;
}, opts?: { idempotencyKey?: string }): Promise<{ success: boolean; data: FeedPost }> {
  return request<{ success: boolean; data: FeedPost }>('/feed/posts', {
    method: 'POST',
    body: JSON.stringify(payload),
    // Pass the draft's stable key so a retry after a dropped response can't double-post.
    ...withIdempotency(opts?.idempotencyKey),
  });
}

export async function toggleFeedPostLike(postId: string): Promise<{ success: boolean; data: { liked: boolean } }> {
  return request<{ success: boolean; data: { liked: boolean } }>(`/feed/posts/${postId}/like`, {
    method: 'POST',
  });
}

export async function getUserPosts(userId: string): Promise<FeedPost[]> {
  const res = await request<{ success: boolean; data: FeedPost[] }>(
    `/feed/posts/user/${encodeURIComponent(userId)}`
  );
  if (!res.success || !Array.isArray(res.data)) return [];
  return res.data;
}

/** Server page size for comments; a full page means older comments may exist. */
export const COMMENT_PAGE_SIZE = 50;
/** Server-side max comment length (createCommentSchema). */
export const COMMENT_MAX_LENGTH = 1000;

/**
 * Newest page of comments in chronological order. Pass the oldest loaded
 * comment as `before` to fetch the page of older comments.
 */
export async function getFeedPostComments(
  postId: string,
  before?: Pick<FeedComment, 'id' | 'created_at'> | null
): Promise<FeedComment[]> {
  const qs = before
    ? `?before=${encodeURIComponent(before.created_at)}&before_id=${encodeURIComponent(before.id)}`
    : '';
  const res = await request<{ success: boolean; data: FeedComment[] }>(
    `/feed/posts/${encodeURIComponent(postId)}/comments${qs}`
  );
  if (!res.success || !Array.isArray(res.data)) return [];
  return res.data;
}

/** Deletes your own post for everyone (DELETE /feed/posts/:id — author only). */
export async function deleteFeedPost(postId: string): Promise<void> {
  await request(`/feed/posts/${encodeURIComponent(postId)}`, { method: 'DELETE' });
}

/** Deletes a comment (allowed for the comment author and the post author). */
export async function deleteFeedPostComment(postId: string, commentId: string): Promise<void> {
  await request(
    `/feed/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
    { method: 'DELETE' }
  );
}

export async function createFeedPostComment(
  postId: string,
  content: string,
  opts?: { idempotencyKey?: string; parentId?: string | null }
): Promise<FeedComment> {
  // parent_id is only sent for replies, so the body stays identical for plain comments.
  const body = opts?.parentId ? { content, parent_id: opts.parentId } : { content };
  const res = await request<{ success: boolean; data: FeedComment }>(
    `/feed/posts/${encodeURIComponent(postId)}/comments`,
    { method: 'POST', body: JSON.stringify(body), ...withIdempotency(opts?.idempotencyKey) }
  );
  if (!res.success || !res.data) throw new Error('Could not post comment');
  return res.data;
}

export async function getFeedPostLikes(postId: string): Promise<{
  likes: number;
  likers: FeedLiker[];
  friendLikesCount: number;
  friendLikers: FeedLiker[];
}> {
  const res = await request<{
    success: boolean;
    data: {
      likes: number;
      likers: FeedLiker[];
      friendLikesCount?: number;
      friendLikers?: FeedLiker[];
    };
  }>(`/feed/posts/${encodeURIComponent(postId)}/likes`);
  const data = res.data || { likes: 0, likers: [], friendLikesCount: 0, friendLikers: [] };
  return {
    likes: data.likes || 0,
    likers: Array.isArray(data.likers) ? data.likers : [],
    friendLikesCount: data.friendLikesCount || 0,
    friendLikers: Array.isArray(data.friendLikers) ? data.friendLikers : [],
  };
}
