/**
 * Friends graph API — mutual edges stored as type friend on user_relationships.
 */

import { request } from './http';

export type FriendSummary = {
  id: string;
  username: string;
  avatar?: string | null;
  categories?: string[];
  is_instructor?: boolean;
  is_business?: boolean;
};

export type ConnectionsPayload = {
  following: FriendSummary[];
  followers: FriendSummary[];
  followingCount: number;
  followersCount: number;
};

export type FriendMutationResult = {
  ok: boolean;
  connected: boolean;
  requestSent: boolean;
  message?: string;
};

/** Re-run cohort attach/detach and return following / followers lists */
export async function syncCohortFriends(): Promise<
  ConnectionsPayload & { linked: number; detached: number }
> {
  const res = await request<{
    success: boolean;
    data: ConnectionsPayload & { linked: number; detached?: number };
  }>('/social/friends/sync-cohort', { method: 'POST' });
  const d = res.data;
  return {
    linked: d?.linked ?? 0,
    detached: d?.detached ?? 0,
    following: d?.following ?? [],
    followers: d?.followers ?? [],
    followingCount: d?.followingCount ?? d?.following?.length ?? 0,
    followersCount: d?.followersCount ?? d?.followers?.length ?? 0,
  };
}

export type PeopleSearchHit = {
  id: string;
  username: string;
  avatar?: string | null;
  categories?: string[];
  isFriend?: boolean;
  is_instructor?: boolean;
  is_business?: boolean;
  account_type?: 'people' | 'instructor' | 'business';
};

export type PostSearchHit = {
  id: string;
  user_id: string;
  caption?: string | null;
  category: string;
  subcategory?: string | null;
  image_url?: string | null;
  created_at: string;
  username: string;
  avatar?: string | null;
};

export type SocialSearchResult = {
  people: PeopleSearchHit[];
  posts: PostSearchHit[];
};

export type SocialSearchOpts = {
  limit?: number;
  type?: 'all' | 'accounts' | 'posts';
  role?: 'all' | 'people' | 'instructor' | 'business';
};

/** Search people + posts for Explore. Throws on hard failures so UI can show errors. */
export async function searchSocial(
  query: string,
  opts: SocialSearchOpts = {}
): Promise<SocialSearchResult> {
  const q = query.trim();
  if (!q) return { people: [], posts: [] };
  const params = new URLSearchParams({
    q,
    limit: String(opts.limit ?? 24),
    type: opts.type ?? 'all',
    role: opts.role ?? 'all',
  });
  const res = await request<{
    success: boolean;
    data: { people?: PeopleSearchHit[]; posts?: PostSearchHit[] };
  }>(`/social/search?${params.toString()}`);
  if (!res.success) {
    throw new Error('Search failed');
  }
  return {
    people: Array.isArray(res.data?.people) ? res.data.people : [],
    posts: Array.isArray(res.data?.posts) ? res.data.posts : [],
  };
}

/** @deprecated Prefer searchSocial — kept for call sites that only need people. */
export async function searchPeople(query: string, limit = 24): Promise<PeopleSearchHit[]> {
  try {
    const res = await searchSocial(query, { limit, type: 'accounts' });
    return res.people;
  } catch (e) {
    console.warn('[friends] searchPeople failed', e);
    return [];
  }
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

/** Sends or accepts a friend request with target user. */
export async function addFriend(targetUserId: string): Promise<FriendMutationResult> {
  const res = await request<{
    success: boolean;
    data?: FriendMutationResult;
  }>('/social/friends', {
    method: 'POST',
    body: JSON.stringify({ targetUserId }),
  });
  return {
    ok: !!res.data?.ok,
    connected: !!res.data?.connected,
    requestSent: !!res.data?.requestSent,
    message: res.data?.message,
  };
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
  requestSent: boolean;
  requestReceived: boolean;
}> {
  try {
    const res = await request<{
      success: boolean;
      data?: {
        connected: boolean;
        isSelf?: boolean;
        blocked?: boolean;
        muted?: boolean;
        requestSent?: boolean;
        requestReceived?: boolean;
      };
    }>(`/social/friends/status/${encodeURIComponent(targetUserId)}`);
    if (!res.success || !res.data) {
      return {
        connected: false,
        isSelf: false,
        blocked: false,
        muted: false,
        requestSent: false,
        requestReceived: false,
      };
    }
    return {
      connected: !!res.data.connected,
      isSelf: !!res.data.isSelf,
      blocked: !!res.data.blocked,
      muted: !!res.data.muted,
      requestSent: !!res.data.requestSent,
      requestReceived: !!res.data.requestReceived,
    };
  } catch {
    return {
      connected: false,
      isSelf: false,
      blocked: false,
      muted: false,
      requestSent: false,
      requestReceived: false,
    };
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

/** Submits a moderation report for a user or post with a reason slug. */
export async function reportContent(
  targetId: string,
  targetType: 'user' | 'post' | 'journal',
  reason: string
): Promise<void> {
  await request('/social/report', {
    method: 'POST',
    body: JSON.stringify({ targetId, targetType, reason }),
  });
}

/** @deprecated Use reportContent with targetType 'user' */
export async function reportUser(targetUserId: string, reason: string): Promise<void> {
  await reportContent(targetUserId, 'user', reason);
}
