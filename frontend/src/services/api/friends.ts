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

/** Loads following/followers with server-computed counts. */
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

/** Fetches a resilient friend list (falls back to empty on recoverable errors). */
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

/** Creates a mutual friend connection with target user. */
export async function addFriend(targetUserId: string): Promise<void> {
  await request('/social/friends', {
    method: 'POST',
    body: JSON.stringify({ targetUserId }),
  });
}

/** Removes mutual friend connection with target user. */
export async function removeFriend(targetUserId: string): Promise<void> {
  await request(`/social/friends/${encodeURIComponent(targetUserId)}`, { method: 'DELETE' });
}

/**
 * Returns relationship status used by public profile CTA + moderation UI state.
 * Falls back to a safe "not connected/not moderated" value when request fails.
 */
export async function getFriendshipStatus(targetUserId: string): Promise<{
  connected: boolean;
  isSelf: boolean;
  blocked: boolean;
  muted: boolean;
}> {
  try {
    const res = await request<{
      success: boolean;
      data?: { connected: boolean; isSelf?: boolean; blocked?: boolean; muted?: boolean };
    }>(`/social/friends/status/${encodeURIComponent(targetUserId)}`);
    if (!res.success || !res.data) {
      return { connected: false, isSelf: false, blocked: false, muted: false };
    }
    return {
      connected: !!res.data.connected,
      isSelf: !!res.data.isSelf,
      blocked: !!res.data.blocked,
      muted: !!res.data.muted,
    };
  } catch {
    return { connected: false, isSelf: false, blocked: false, muted: false };
  }
}

/** Blocks target user from social graph and content surfaces. */
export async function blockUser(targetUserId: string): Promise<void> {
  await request('/social/block', {
    method: 'POST',
    body: JSON.stringify({ targetUserId }),
  });
}

/** Removes block relationship for target user. */
export async function unblockUser(targetUserId: string): Promise<void> {
  await request(`/social/block/${encodeURIComponent(targetUserId)}`, {
    method: 'DELETE',
  });
}

/** Mutes target user content without removing friendship. */
export async function muteUser(targetUserId: string): Promise<void> {
  await request('/social/mute', {
    method: 'POST',
    body: JSON.stringify({ targetUserId }),
  });
}

/** Restores target user content visibility by removing mute relationship. */
export async function unmuteUser(targetUserId: string): Promise<void> {
  await request(`/social/mute/${encodeURIComponent(targetUserId)}`, {
    method: 'DELETE',
  });
}

/** Submits a moderation report for a user with a reason slug. */
export async function reportUser(targetUserId: string, reason: string): Promise<void> {
  await request('/social/report', {
    method: 'POST',
    body: JSON.stringify({ targetUserId, reason }),
  });
}
