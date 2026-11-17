/**
 * Consumer in-app activity notifications.
 */
import { request } from './http';

export type NotificationPreview = {
  kind: 'post' | 'seed' | 'group' | 'person';
  image: string | null;
  title: string;
  subtitle: string | null;
  category: string | null;
};

export type ActivityNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  ref_type: string | null;
  ref_id: string | null;
  read_at: string | null;
  created_at: string;
  unread: boolean;
  actor: { id: string; username: string; avatar: string | null } | null;
  preview?: NotificationPreview | null;
};

export async function listNotifications(params?: {
  limit?: number;
  offset?: number;
}): Promise<{ notifications: ActivityNotification[]; unread_count: number }> {
  const query = new URLSearchParams();
  if (params?.limit) query.append('limit', String(params.limit));
  if (params?.offset) query.append('offset', String(params.offset));
  const qs = query.toString();
  const res = await request<{
    success: boolean;
    data: { notifications: ActivityNotification[]; unread_count: number };
  }>(`/notifications${qs ? `?${qs}` : ''}`);
  if (!res.success || !res.data) throw new Error('Failed to load notifications');
  return {
    notifications: res.data.notifications ?? [],
    unread_count: res.data.unread_count ?? 0,
  };
}

export async function getUnreadNotificationCount(): Promise<number> {
  const res = await request<{ success: boolean; data: { unread_count: number } }>(
    '/notifications/unread-count'
  );
  if (!res.success) return 0;
  return res.data?.unread_count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  await request(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' });
}

export async function markAllNotificationsRead(): Promise<void> {
  await request('/notifications/read-all', { method: 'POST', body: JSON.stringify({}) });
}
