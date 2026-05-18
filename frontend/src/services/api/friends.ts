/**
 * Friends graph API — mutual edges stored as type friend on user_relationships.
 */

import { request } from './http';

export type FriendSummary = { id: string; username: string; avatar?: string };

/** Re-run cohort auto-friending (shared category paths) and return updated list */
export async function syncCohortFriends(): Promise<{ linked: number; friends: FriendSummary[] }> {
  const res = await request<{
    success: boolean;
    data: { linked: number; friends: FriendSummary[] };
  }>('/social/friends/sync-cohort', { method: 'POST' });
  return res.data ?? { linked: 0, friends: [] };
}

export async function listFriends(): Promise<FriendSummary[]> {
  try {
    const res = await request<{ success: boolean; data: { friends: FriendSummary[] } }>('/social/friends');
    if (!res.success || !res.data?.friends) return [];
    return res.data.friends;
  } catch (e) {
    console.warn('[friends] listFriends failed', e);
    return [];
  }
}

export async function addFriend(targetUserId: string): Promise<void> {
  await request('/social/friends', {
    method: 'POST',
    body: JSON.stringify({ targetUserId }),
  });
}

export async function removeFriend(targetUserId: string): Promise<void> {
  await request(`/social/friends/${encodeURIComponent(targetUserId)}`, { method: 'DELETE' });
}

export async function getFriendshipStatus(targetUserId: string): Promise<{ connected: boolean; isSelf: boolean }> {
  try {
    const res = await request<{
      success: boolean;
      data?: { connected: boolean; isSelf?: boolean };
    }>(`/social/friends/status/${encodeURIComponent(targetUserId)}`);
    if (!res.success || !res.data) {
      return { connected: false, isSelf: false };
    }
    return {
      connected: !!res.data.connected,
      isSelf: !!res.data.isSelf,
    };
  } catch {
    return { connected: false, isSelf: false };
  }
}
