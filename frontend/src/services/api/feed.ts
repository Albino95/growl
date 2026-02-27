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
    username?: string;
    avatar?: string;
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
