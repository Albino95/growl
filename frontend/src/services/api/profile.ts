/**
 * Authenticated profile updates (categories persist to D1 and trigger cohort friend sync).
 */

import { request } from './http';

export type NotificationPrefs = {
  notificationsEnabled?: boolean;
  emailNotifications?: boolean;
  pushNotifications?: boolean;
  marketingEmails?: boolean;
};

export type ProfileUpdatePayload = {
  username?: string;
  avatar?: string;
  categories?: string[];
  decay_timer?: number;
  metadata?: Record<string, unknown>;
};

export type CurrentProfile = {
  id: string;
  email: string;
  username?: string;
  avatar?: string;
  bio?: string | null;
  status?: string | null;
  points: number;
  is_instructor: boolean;
  is_business: boolean;
  categories: string[];
  notifications_prefs?: NotificationPrefs;
  decay_timer?: number;
  post_count?: number;
  endorsements_received?: number;
  endorsements_given?: number;
  streak_days?: number;
  instructor?: {
    alreadyInstructor?: boolean;
    endorsementsReceived?: number;
    endorsementsNeeded?: number;
    postCount?: number;
    postsNeeded?: number;
    eligible?: boolean;
    canClaim?: boolean;
  };
};

export type PublicProfileApiData = {
  id: string;
  username: string | null;
  avatar: string | null;
  bio?: string | null;
  status?: string | null;
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
  bio?: string;
  status?: string;
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
    notifications_prefs: res.data.notifications_prefs || {},
    decay_timer:
      typeof res.data.decay_timer === 'number' && res.data.decay_timer >= 1
        ? res.data.decay_timer
        : 7,
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
    bio: d.bio?.trim() || undefined,
    status: d.status?.trim() || undefined,
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
