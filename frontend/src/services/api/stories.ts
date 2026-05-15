import { request } from './http';

export type StoryItem = {
  id: string;
  userId: string;
  username: string;
  avatar: string | null;
  image: string;
  caption?: string | null;
  views?: number;
  hasViewed: boolean;
  createdAt: string;
};

export type StoriesResponse = {
  success: boolean;
  data: {
    stories: StoryItem[];
    grouped: Array<{
      userId: string;
      username: string;
      avatar: string | null;
      stories: StoryItem[];
    }>;
  };
};

export async function getStories(): Promise<StoriesResponse> {
  return request<StoriesResponse>('/stories');
}

export async function getUserStories(userId: string): Promise<StoryItem[]> {
  const res = await request<{ success: boolean; data: { stories: StoryItem[] } }>(
    `/stories/user/${encodeURIComponent(userId)}`
  );
  if (!res.success || !res.data?.stories) return [];
  return res.data.stories;
}

export async function viewStory(storyId: string): Promise<{ success: boolean; data: { viewed: boolean } }> {
  return request<{ success: boolean; data: { viewed: boolean } }>(`/stories/${storyId}/view`, {
    method: 'POST',
  });
}
