/**
 * Media URI helpers — normalize API-hosted URLs only.
 * Content images/avatars come from the backend (R2 media or seeded HTTPS URLs).
 * No Unsplash / Picsum / Pravatar catalogs live in the client.
 */

/** Local brand mark when a remote avatar URL is missing (not a content catalog). */
export const DEFAULT_AVATAR_ASSET = require('../../assets/brand-mark.png');

/**
 * Post image URL from API may be https, device URI, or legacy bare paths — normalize for Image source.
 * Also rewrites media URLs that were wrongly saved with APP_PUBLIC_URL (marketing site) to the API host.
 */
export function rewriteMediaUrlToApiHost(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return s;
  try {
    const u = new URL(s);
    const path = u.pathname || '';
    if (!/\/api\/[^/]+\/media\//i.test(path)) return s;
    // Lazy require avoids circular imports at module init in some bundlers.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getApiBaseUrl } = require('../services/api/http') as { getApiBaseUrl: () => string };
    const apiBase = getApiBaseUrl();
    const api = new URL(apiBase);
    return `${api.origin}${path}${u.search}`;
  } catch {
    return s;
  }
}

function absolutizeApiMediaPath(s: string): string {
  if (!s.startsWith('/')) return s;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getApiBaseUrl } = require('../services/api/http') as { getApiBaseUrl: () => string };
    const api = new URL(getApiBaseUrl());
    return `${api.origin}${s}`;
  } catch {
    return s;
  }
}

function normalizeRemoteUri(raw: string | null | undefined): string {
  let s = absolutizeApiMediaPath(rewriteMediaUrlToApiHost((raw || '').trim()));
  if (!s) return '';
  const lower = s.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('data:')) {
    return s;
  }
  if (
    lower.startsWith('file://') ||
    lower.startsWith('content://') ||
    lower.startsWith('ph://')
  ) {
    return s;
  }
  // blob: and bare/legacy paths are not portable — treat as missing.
  return '';
}

/**
 * Resolve post media from the API. Returns '' when missing so UI can show a soft placeholder.
 * Does not invent category stock photos on the client.
 */
export function resolvePostMediaUri(
  raw: string | null | undefined,
  _category?: string,
  _postId?: string
): string {
  const s = normalizeRemoteUri(raw);
  if (!s) return '';
  const lower = s.toLowerCase();
  // Persisted blob: URLs are browser-session local and break after refresh.
  if (lower.startsWith('blob:')) return '';
  // Device-local URIs only work on the creating device.
  if (
    lower.startsWith('file://') ||
    lower.startsWith('content://') ||
    lower.startsWith('ph://')
  ) {
    return '';
  }
  return s;
}

/**
 * Story display URI from API. Returns '' when not loadable remotely.
 */
export function resolveStoryDisplayUri(
  raw: string | null | undefined,
  _userId?: string,
  _storyId?: string
): string {
  return normalizeRemoteUri(raw);
}

/**
 * Avatar from user metadata (backend). Returns '' when unset — use DEFAULT_AVATAR_ASSET or initials.
 */
export function resolveAvatarUri(
  _userId: string,
  _username?: string,
  raw?: string | null
): string {
  return normalizeRemoteUri(raw);
}

/** Image source for avatars: remote URL or local brand mark. */
export function avatarSource(uri: string | null | undefined): { uri: string } | number {
  const s = (uri || '').trim();
  if (s && (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:'))) {
    return { uri: s };
  }
  return DEFAULT_AVATAR_ASSET;
}

/** Product image from API fields only — no client-side stock fallbacks. */
export function resolveProductImageUri(
  imageUrl?: string | null,
  images?: string[] | null
): string {
  const first = (images || []).find((u) => typeof u === 'string' && u.trim());
  return normalizeRemoteUri(imageUrl || first || '');
}
