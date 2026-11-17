/**
 * Pure avatar URL resolution — no React Native / asset imports so it is unit-testable.
 *
 * The API returns a user's photo under several names depending on the endpoint
 * (`metadata.avatar` on posts, `avatar` on stories/friends/notifications,
 * `avatar_url` on search/mentions/buddies, …). Every screen should go through
 * `resolveAvatarUrlFrom(...)` so field names, relative paths, bare R2 keys,
 * `http://` and wrong-host media URLs are all handled the same way.
 */

/** Field names that may carry a profile photo, in priority order. */
export const AVATAR_FIELDS = [
  'avatar',
  'avatar_url',
  'avatarUrl',
  'user_avatar',
  'userAvatar',
  'author_avatar',
  'profile_image',
  'profileImage',
  'profile_picture',
  'profilePicture',
  'picture',
] as const;

/** Nested objects that may hold the user (checked after the top level). */
const NESTED_FIELDS = ['metadata', 'user', 'author', 'profile', 'owner'] as const;

/** R2 key prefixes written by POST /media/upload (purpose/userId/file). */
const R2_KEY_RE = /^(avatar|post|reel|story|cover|product|journal|seed|message|media|upload)s?\/[^\s?#]+$/i;

const LOCAL_SCHEMES = ['file://', 'content://', 'ph://', 'assets-library://'];

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h.endsWith('.local') ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
}

/** Our own Worker hosts (dev/qa/production). Each has its own R2 bucket. */
function isBackendHost(host: string): boolean {
  return /^growl-backend(-[a-z0-9]+)?\./i.test(host);
}

function splitApiBase(apiBase: string | null | undefined): { origin: string; base: string } | null {
  const raw = (apiBase || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    const u = new URL(raw);
    return { origin: u.origin, base: raw };
  } catch {
    return null;
  }
}

/**
 * Normalize one stored avatar/media string into something an <Image> can load.
 * Returns '' when it can't be made loadable (caller shows the default avatar).
 */
export function normalizeAvatarUrl(raw: unknown, apiBase?: string | null): string {
  if (typeof raw !== 'string') return '';
  let s = raw.trim();
  if (!s || s === 'null' || s === 'undefined') return '';
  const lower = s.toLowerCase();

  if (lower.startsWith('data:image/')) return s;
  if (lower.startsWith('data:') || lower.startsWith('blob:')) return '';
  // Local picks (EditProfile preview before / during upload) only exist on this device.
  if (LOCAL_SCHEMES.some((p) => lower.startsWith(p))) return s;

  const api = splitApiBase(apiBase);

  if (s.startsWith('//')) s = `https:${s}`;
  else if (s.startsWith('/')) {
    if (!api) return '';
    // `/api/v1/media/…` → API origin; `/media/…` → API base (which ends in /api/v1).
    s = /^\/api\//i.test(s) ? `${api.origin}${s}` : `${api.base}${s}`;
  } else if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    // Bare R2 key saved without the media route (e.g. "avatar/user_1/abc.jpg").
    if (!api || !R2_KEY_RE.test(s)) return '';
    s = `${api.base}/media/${encodeURIComponent(s)}`;
  }

  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return '';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';

  // iOS App Transport Security blocks cleartext loads — upgrade public hosts.
  if (url.protocol === 'http:' && !isPrivateHost(url.hostname)) {
    s = `https://${s.slice('http://'.length)}`;
  }

  // Media saved with the marketing/app host (APP_PUBLIC_URL) must be served by the API.
  // Never move between backend hosts: dev/qa/production each have their own bucket.
  if (api && /\/api\/[^/]+\/media\//i.test(url.pathname) && !isBackendHost(url.hostname)) {
    const apiOrigin = new URL(api.origin);
    if (url.host !== apiOrigin.host) {
      return `${api.origin}${url.pathname}${url.search}`;
    }
  }

  // Keep the string as stored (only scheme-fixed) so cache keys stay stable.
  return s;
}

/** First non-empty avatar string on a user-like object (top level, then nested). */
export function pickAvatarField(source: unknown, depth = 0): string {
  if (typeof source === 'string') return source.trim();
  if (!source || typeof source !== 'object' || depth > 2) return '';
  const obj = source as Record<string, unknown>;
  for (const key of AVATAR_FIELDS) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim() && v.trim() !== 'null') return v.trim();
  }
  for (const key of NESTED_FIELDS) {
    const nested = obj[key];
    let value: unknown = nested;
    if (typeof nested === 'string' && key === 'metadata') {
      try {
        value = JSON.parse(nested);
      } catch {
        value = null;
      }
    }
    const found = pickAvatarField(typeof value === 'object' ? value : null, depth + 1);
    if (found) return found;
  }
  return '';
}

/**
 * Resolve a profile photo from a raw string or any user-like API object
 * (post, story, comment.user, friend, search hit, …). '' → use the default avatar.
 */
export function resolveAvatarUrlFrom(source: unknown, apiBase?: string | null): string {
  return normalizeAvatarUrl(pickAvatarField(source), apiBase);
}

/** True when `uri` can be handed to an Image as a remote/local source. */
export function isLoadableAvatarUri(uri: string | null | undefined): boolean {
  const s = (uri || '').trim().toLowerCase();
  if (!s) return false;
  return (
    s.startsWith('https://') ||
    s.startsWith('http://') ||
    s.startsWith('data:image/') ||
    LOCAL_SCHEMES.some((p) => s.startsWith(p))
  );
}
