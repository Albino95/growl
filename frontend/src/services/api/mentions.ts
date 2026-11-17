/**
 * @mention suggestions (GET /mentions/suggest). Degrades quietly: a 404 (backend
 * not deployed yet) switches the feature off for the session.
 */
import { ApiError, request } from './http';

export type MentionSuggestion = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

let unavailable = false;

/** False once the server said the endpoint doesn't exist. */
export function mentionsAvailable(): boolean {
  return !unavailable;
}

export async function suggestMentions(query: string): Promise<MentionSuggestion[]> {
  if (unavailable) return [];
  try {
    const res = await request<{ success: boolean; data?: { users?: MentionSuggestion[] } }>(
      `/mentions/suggest?q=${encodeURIComponent(query)}`,
      { method: 'GET' }
    );
    return Array.isArray(res?.data?.users) ? res.data!.users! : [];
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) unavailable = true;
    return [];
  }
}

const resolved = new Map<string, MentionSuggestion | null>();

/**
 * username → user (exact, case-insensitive) for tapping an @mention. Cached per
 * session; null when nobody has that name.
 */
export async function resolveMentionUsername(username: string): Promise<MentionSuggestion | null> {
  const key = username.toLowerCase();
  if (resolved.has(key)) return resolved.get(key) ?? null;
  const list = await suggestMentions(key);
  const hit = list.find((u) => u.username.toLowerCase() === key) ?? null;
  if (hit || list.length) resolved.set(key, hit);
  return hit;
}
