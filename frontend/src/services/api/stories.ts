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

/** Fetches active story rings; supports explore-mode query behavior. */
export async function getStories(options?: {
  mode?: 'default' | 'explore';
}): Promise<StoriesResponse> {
  const mode = options?.mode === 'explore' ? '?mode=explore' : '';
  return request<StoriesResponse>(`/stories${mode}`);
}

/** Fetches stories for a specific profile and returns a safe empty list on no payload. */
export async function getUserStories(userId: string): Promise<StoryItem[]> {
  const res = await request<{ success: boolean; data: { stories: StoryItem[] } }>(
    `/stories/user/${encodeURIComponent(userId)}`
  );
  if (!res.success || !res.data?.stories) return [];
  return res.data.stories;
}

/** Creates a new story after media has been uploaded/resolved by caller. */
export async function createStory(payload: {
  image_url: string;
  caption?: string;
}): Promise<{ success: boolean; data: StoryItem }> {
  return request<{ success: boolean; data: StoryItem }>('/stories', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Records that current user has viewed a story. Endpoint is idempotent server-side. */
export async function viewStory(storyId: string): Promise<{ success: boolean; data: { viewed: boolean } }> {
  return request<{ success: boolean; data: { viewed: boolean } }>(`/stories/${storyId}/view`, {
    method: 'POST',
  });
}
