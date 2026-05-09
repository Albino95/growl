/**
 * Friends graph API — mutual edges stored as type friend on user_relationships.
 */

import { request } from './http';

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
