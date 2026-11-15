/**
 * Sunday circle recap (backend/src/routes/wave3/userx.ts → GET /me/circle/week).
 * Counts always; faces + friends' shared moments once you've shared one this week.
 */
import { request, ApiError } from './http';

export type CircleWeekMember = {
  id: string;
  display_name: string;
  initial: string;
  avatar: string | null;
  days: number;
};

export type CircleWeekMoment = {
  id: string;
  user_id: string;
  display_name: string;
  avatar: string | null;
  excerpt: string;
  mood: string | null;
  created_at: string;
};

export type CircleWeek = {
  week_start: string;
  today: string;
  shared: boolean;
  friends_total: number;
  friends_active: number;
  checkins: number;
  members: CircleWeekMember[];
  moments: CircleWeekMoment[];
};

/** null when the server doesn't have the endpoint yet (404) — the card just hides. */
export async function getCircleWeek(): Promise<CircleWeek | null> {
  try {
    const res = await request<{ success: boolean; data: Partial<CircleWeek> }>('/me/circle/week');
    const d = res?.data;
    if (!d || typeof d.week_start !== 'string') return null;
    return {
      week_start: d.week_start,
      today: d.today ?? '',
      shared: !!d.shared,
      friends_total: Number(d.friends_total) || 0,
      friends_active: Number(d.friends_active) || 0,
      checkins: Number(d.checkins) || 0,
      members: Array.isArray(d.members) ? d.members : [],
      moments: Array.isArray(d.moments) ? d.moments : [],
    };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
