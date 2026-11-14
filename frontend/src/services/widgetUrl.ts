/**
 * Pure parsing for widget deep links (no React Native imports — vitest).
 *
 *   growl://home                → open Home
 *   growl://checkin             → open Home
 *   growl://checkin?mood=good   → open Home + mood-only check-in
 *
 * Mood keys: heavy | tired | okay | good | bright (also accepts 1…5).
 */
import type { Mood } from './api/growth';
import { widgetKeyToMood } from './widgetSnapshot';

export type WidgetLink = { kind: 'home' } | { kind: 'checkin'; mood: Mood | null };

/** A pending widget tap older than this is ignored (user opened the app much later). */
export const WIDGET_PENDING_MAX_AGE_MS = 10 * 60 * 1000;

export function parseWidgetUrl(url: string | null | undefined): WidgetLink | null {
  if (typeof url !== 'string') return null;
  const m = /^growl:\/\/(home|checkin)\/?(?:\?([^#]*))?(?:#.*)?$/i.exec(url.trim());
  if (!m) return null;
  if (m[1].toLowerCase() === 'home') return { kind: 'home' };
  let mood: Mood | null = null;
  for (const pair of (m[2] ?? '').split('&')) {
    const [k, v = ''] = pair.split('=');
    if (k !== 'mood') continue;
    let value = v;
    try {
      value = decodeURIComponent(v.replace(/\+/g, ' '));
    } catch {
      // keep raw
    }
    const n = Number(value);
    mood = Number.isInteger(n) && n >= 1 && n <= 5 ? (n as Mood) : widgetKeyToMood(value);
    break;
  }
  return { kind: 'checkin', mood };
}

/**
 * The widget's CheckInMoodIntent stores `{ "url": "growl://checkin?mood=…", "at": <ms> }`
 * in the App Group. Returns the URL when it is well formed and recent.
 */
export function parsePendingWidgetCheckin(raw: string | null | undefined, now: number): string | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as { url?: unknown; at?: unknown };
    if (typeof data?.url !== 'string' || typeof data.at !== 'number') return null;
    const age = now - data.at;
    if (!(age >= -60_000 && age <= WIDGET_PENDING_MAX_AGE_MS)) return null;
    return parseWidgetUrl(data.url)?.kind === 'checkin' ? data.url : null;
  } catch {
    return null;
  }
}
