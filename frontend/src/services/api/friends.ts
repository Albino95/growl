/**
 * Friends graph API — mutual edges stored as type friend on user_relationships.
 */

import { request } from './http';

export type FriendSummary = { id: string; username: string; avatar?: string };

export type ConnectionsPayload = {
  following: FriendSummary[];
  followers: FriendSummary[];
  followingCount: number;
  followersCount: number;
};

/** Re-run cohort auto-friending and return following / followers lists */
export async function syncCohortFriends(): Promise<
  ConnectionsPayload & { linked: number }
> {
  const res = await request<{
    success: boolean;
    data: ConnectionsPayload & { linked: number };
  }>('/social/friends/sync-cohort', { method: 'POST' });
  const d = res.data;
  return {
    linked: d?.linked ?? 0,
    following: d?.following ?? [],
    followers: d?.followers ?? [],
    followingCount: d?.followingCount ?? d?.following?.length ?? 0,
    followersCount: d?.followersCount ?? d?.followers?.length ?? 0,
  };
}

export async function getConnections(): Promise<ConnectionsPayload> {
  const res = await request<{ success: boolean; data: ConnectionsPayload }>(
    '/social/friends/connections'
  );
  const d = res.data;
  return {
    following: d?.following ?? [],
    followers: d?.followers ?? [],
    followingCount: d?.followingCount ?? d?.following?.length ?? 0,
    followersCount: d?.followersCount ?? d?.followers?.length ?? 0,
  };
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
