/**
 * Gentle insights for the owner's Progress tab (GET /me/insights).
 * Returns null when the backend doesn't have the endpoint yet (404) so the
 * section can quietly hide itself.
 */
import { request, ApiError } from './http';

export type InsightStrength = 'tentative' | 'clear';

export type InsightKind =
  | 'mood_by_path'
  | 'mood_by_weekday'
  | 'mood_trend'
  | 'mood_by_activity'
  | 'rest_bounce'
  | 'intention_follow_through'
  | 'consistency';

export type Insight = {
  id: string;
  kind: InsightKind | string;
  title: string;
  body: string;
  strength: InsightStrength;
  data: Record<string, unknown>;
};

export type InsightsPayload = {
  ready: boolean;
  checkins_needed: number;
  days: number;
  insights: Insight[];
};

export type InsightsRange = 30 | 90;

export async function getInsights(days: InsightsRange = 30): Promise<InsightsPayload | null> {
  try {
    const res = await request<{ success: boolean; data: InsightsPayload }>(`/me/insights?days=${days}`);
    const d = res?.data;
    if (!d || typeof d.ready !== 'boolean' || !Array.isArray(d.insights)) return null;
    return d;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 405)) return null;
    throw e;
  }
}
