/**
 * Authenticated profile updates (categories persist to D1 and trigger cohort friend sync).
 */

import { request } from './http';

export type ProfileUpdatePayload = {
  username?: string;
  avatar?: string;
  categories?: string[];
};

export type CurrentProfile = {
  id: string;
  email: string;
  username?: string;
  avatar?: string;
  points: number;
  is_instructor: boolean;
  is_business: boolean;
  categories: string[];
};

export type PublicProfileApiData = {
  id: string;
  username: string | null;
  avatar: string | null;
  points: number;
  is_instructor: boolean;
  is_business: boolean;
  categories: string[];
  posts_count: number;
  stories_count: number;
};

export type PublicProfileSummary = {
  id: string;
  username: string;
  avatar: string;
  points: number;
  isInstructor: boolean;
  categories: string[];
  postsCount: number;
  storiesCount: number;
};

/** GET /profile — source of truth for categories after login (not stored in AsyncStorage). */
export async function fetchCurrentProfile(): Promise<CurrentProfile> {
  const res = await request<{ success: boolean; data: CurrentProfile }>('/profile');
  if (!res.success || !res.data) {
    throw new Error('Failed to load profile');
  }
  return {
    ...res.data,
    categories: Array.isArray(res.data.categories) ? res.data.categories : [],
  };
}

export async function getPublicProfile(userId: string): Promise<PublicProfileSummary> {
  const res = await request<{ success: boolean; data: PublicProfileApiData }>(
    `/profile/user/${encodeURIComponent(userId)}`
  );
  if (!res.success || !res.data) {
    throw new Error('Failed to load profile');
  }
  const d = res.data;
  return {
    id: d.id,
    username: (d.username && d.username.trim()) || 'User',
    avatar: d.avatar ?? '',
    points: d.points,
    isInstructor: !!d.is_instructor,
    categories: Array.isArray(d.categories) ? d.categories : [],
    postsCount: d.posts_count,
    storiesCount: d.stories_count,
  };
}

export async function updateProfileOnServer(payload: ProfileUpdatePayload): Promise<void> {
  await request('/profile', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}
