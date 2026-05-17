import { request } from './http';

export type FeedPost = {
  id: string;
  user_id: string;
  image_url?: string | null;
  caption?: string | null;
  category: string;
  subcategory?: string | null;
  created_at: string;
  metadata?: {
    likes?: number;
    comments?: number;
    has_liked?: boolean;
    friend_likes_count?: number;
    username?: string;
    avatar?: string;
    isInstructor?: boolean;
  };
};

export type FeedComment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user: {
    id: string;
    username?: string;
    avatar?: string | null;
    is_instructor?: boolean;
  };
};

export type FeedResponse = {
  success: boolean;
  data: FeedPost[];
};

export async function getFeedPosts(): Promise<FeedResponse> {
  return request<FeedResponse>('/feed/feed');
}

export async function createFeedPost(payload: {
  image_url: string;
  caption?: string;
  category: string;
  subcategory?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ success: boolean; data: FeedPost }> {
  return request<{ success: boolean; data: FeedPost }>('/feed/posts', {
    method: 'POST',
    body: JSON.stringify(payload),
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

export async function getFeedPostComments(postId: string): Promise<FeedComment[]> {
  const res = await request<{ success: boolean; data: FeedComment[] }>(
    `/feed/posts/${encodeURIComponent(postId)}/comments`
  );
  if (!res.success || !Array.isArray(res.data)) return [];
  return res.data;
}

export async function createFeedPostComment(postId: string, content: string): Promise<FeedComment> {
  const res = await request<{ success: boolean; data: FeedComment }>(
    `/feed/posts/${encodeURIComponent(postId)}/comments`,
    { method: 'POST', body: JSON.stringify({ content }) }
  );
  if (!res.success || !res.data) throw new Error('Could not post comment');
  return res.data;
}
