import Constants from 'expo-constants';
import { getSecureItem, trySetSecureItem, deleteSecureItem } from '../storage/secureStore';
import { getToken, setToken, clearToken } from '../storage/tokenManager';
import { messageFromApiError } from './apiErrors';
import { reportError } from '../monitoring';

export { withIdempotency, newIdempotencyKey } from './idempotency';

const DEFAULT_API_BASE = 'https://growl-backend-qa.wispy-leaf-4e8b.workers.dev/api/v1';

function resolveApiBaseUrl(): string {
  const extra = (Constants?.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const fromExtra = typeof extra.API_BASE_URL === 'string' ? extra.API_BASE_URL.trim() : '';
  const fromPublic =
    typeof process.env.EXPO_PUBLIC_API_BASE_URL === 'string'
      ? process.env.EXPO_PUBLIC_API_BASE_URL.trim()
      : '';
  const raw = fromExtra || fromPublic || DEFAULT_API_BASE;
  // Guard against misconfigured empty / relative values that break fetch
  if (!/^https?:\/\//i.test(raw)) {
    console.warn('[HTTP] Invalid API_BASE_URL, using default:', raw);
    return DEFAULT_API_BASE;
  }
  return raw.replace(/\/$/, '');
}

const BASE_URL = resolveApiBaseUrl();

const TOKEN_KEY = 'auth_token';
const REFRESH_KEY = 'auth_refresh_token';

/** Paths that must not send a Bearer token / must not trigger refresh loops. */
function isAuthBootstrapPath(path: string): boolean {
  return (
    path.startsWith('/auth/sign-in') ||
    path.startsWith('/auth/sign-up') ||
    path.startsWith('/auth/refresh') ||
    path.startsWith('/auth/forgot-password') ||
    path.startsWith('/auth/reset-password') ||
    path.startsWith('/auth/verify-email') ||
    path.startsWith('/auth/resend-verification') ||
    path.startsWith('/auth/sso') ||
    path.startsWith('/auth/sign-out')
  );
}

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  // Do NOT treat every TypeError as offline — that hid real bugs (CORS, bad URL, crypto).
  return (
    msg.includes('failed to fetch') ||
    msg.includes('network request failed') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('the internet connection appears to be offline') ||
    msg.includes('could not connect to the server') ||
    msg.includes('network is unreachable')
  );
}

function networkErrorMessage(error: unknown): string {
  const host = (() => {
    try {
      return new URL(BASE_URL).host;
    } catch {
      return BASE_URL;
    }
  })();
  const detail =
    error instanceof Error && error.message ? ` (${error.message})` : '';
  if (__DEV__) {
    return `Could not reach Grow! API at ${host}${detail}. If you pointed Expo at localhost, start the worker or use the production API URL.`;
  }
  return `Could not reach Grow! servers (${host}). Please try again in a moment.`;
}

/** Default per-attempt timeout so a dead network can't hang a screen (or the splash). */
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
/** Base64 media uploads go through `request` too and can legitimately take longer. */
const UPLOAD_REQUEST_TIMEOUT_MS = 120_000;
const REFRESH_TIMEOUT_MS = 10_000;

export const REQUEST_TIMEOUT_MESSAGE = 'Request timed out. Check your connection.';

export function isRequestTimeoutError(error: unknown): boolean {
  return error instanceof RequestTimeoutError;
}

/**
 * Every failure thrown by `request` once a request was attempted. `status` is
 * the HTTP status, or 0 when the server was never reached (offline, DNS,
 * timeout). Callers decide on status, never on message text.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly data: unknown;
  constructor(message: string, status: number, data: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    const err = data && typeof data === 'object' ? (data as { error?: { code?: unknown } }).error : null;
    this.code = err && typeof err.code === 'string' ? err.code : null;
  }
  /** Server unreachable (offline / DNS / connection reset). */
  get isNetwork(): boolean {
    return this.status === 0;
  }
  /** Worth retrying later: offline, 408, 429, or a server-side 5xx. */
  get isTransient(): boolean {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

/** Our own per-attempt deadline fired. Counts as "unreachable" (status 0). */
class RequestTimeoutError extends ApiError {
  constructor() {
    super(REQUEST_TIMEOUT_MESSAGE, 0);
    this.name = 'RequestTimeoutError';
  }
}

/** Status of an error from `request` (0 = unreachable / timeout), or null if unknown. */
export function apiErrorStatus(error: unknown): number | null {
  if (error instanceof ApiError) return error.status;
  if (error instanceof RequestTimeoutError) return 0;
  return null;
}

/** True when the failure means "try again later" rather than "this is wrong". */
export function isTransientApiError(error: unknown): boolean {
  if (error instanceof ApiError) return error.isTransient;
  if (error instanceof RequestTimeoutError) return true;
  return isNetworkError(error);
}

/** Extra options accepted by `request` on top of `fetch`'s RequestInit. */
export type RequestOptions = RequestInit & {
  /** Per-attempt timeout in ms (default 15s). */
  timeoutMs?: number;
  /**
   * Sent as `Idempotency-Key`. Use `...withIdempotency(stableKey)` for creates
   * so a manual retry of the same item can't create a duplicate.
   */
  idempotencyKey?: string;
};

/**
 * fetch with an AbortController deadline. Honours a caller-supplied `signal`
 * (caller aborts propagate as the normal AbortError); our own deadline is
 * reported as a RequestTimeoutError with a user-facing message.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const outer = init.signal;
  const onOuterAbort = () => controller.abort();
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener('abort', onOuterAbort);
  }

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new RequestTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onOuterAbort);
  }
}

/** Outcome of a refresh attempt, so callers can tell "dead session" from "try later". */
export type RefreshOutcome =
  | { kind: 'ok'; token: string; refreshToken?: string; data: Record<string, unknown> }
  /** Server definitively rejected the refresh token (401/403). Storage is cleared. */
  | { kind: 'rejected'; status: number }
  /** Offline, timeout, 5xx, 429, unreadable body: keep the session, retry later. */
  | { kind: 'transient'; status: number }
  | { kind: 'no-token' };

let refreshInFlight: Promise<RefreshOutcome> | null = null;

/**
 * A rotated refresh token we could not write to the keychain. Kept in memory
 * (and preferred over the stored one) so the next refresh doesn't present the
 * old, already-rotated token; the write is retried on the next refresh.
 */
let unsavedRefreshToken: string | null = null;

async function persistTokens(access: string, refresh?: string) {
  setToken(access);
  const accessOk = await trySetSecureItem(TOKEN_KEY, access);
  if (!accessOk) {
    reportError(new Error('Could not persist access token'), { where: 'http.persistTokens' });
  }
  if (refresh) {
    const refreshOk = await trySetSecureItem(REFRESH_KEY, refresh);
    if (refreshOk) {
      unsavedRefreshToken = null;
    } else {
      unsavedRefreshToken = refresh;
      reportError(new Error('Could not persist rotated refresh token'), {
        where: 'http.persistTokens',
      });
    }
  }
}

/** Save tokens after sign-in / hydrate refresh with the same retry + fallback as http. */
export async function persistSessionTokens(access: string, refresh?: string): Promise<void> {
  await persistTokens(access, refresh);
}

/** Forget any refresh token held in memory (sign-out). */
export function clearUnsavedRefreshToken(): void {
  unsavedRefreshToken = null;
}

let onSessionExpired: (() => void) | null = null;

/**
 * Register what to do when the server definitively rejects the refresh token
 * (expired, revoked, banned/suspended). The app signs out and returns to Auth
 * so the UI never looks logged in while every request fails.
 */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

/**
 * Single-flight refresh so concurrent 401s (and cold-start hydration) don't
 * rotate/revoke each other. `knownRefreshToken` lets hydrate pass the token it
 * already read instead of re-reading the keychain.
 */
export function refreshSession(knownRefreshToken?: string | null): Promise<RefreshOutcome> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async (): Promise<RefreshOutcome> => {
    try {
      if (unsavedRefreshToken) {
        // Last rotation never reached the keychain: try once more now.
        const saved = await trySetSecureItem(REFRESH_KEY, unsavedRefreshToken);
        const token = unsavedRefreshToken;
        if (saved) unsavedRefreshToken = null;
        knownRefreshToken = token;
      }
      const refreshToken = knownRefreshToken || (await getSecureItem(REFRESH_KEY));
      if (!refreshToken) return { kind: 'no-token' };

      let res: Response;
      try {
        res = await fetchWithTimeout(
          `${BASE_URL}/auth/refresh`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          },
          REFRESH_TIMEOUT_MS
        );
      } catch {
        return { kind: 'transient', status: 0 };
      }

      // Only wipe the session on a definitive invalid refresh — not on 5xx/429/network.
      if (res.status === 401 || res.status === 403) {
        clearToken();
        unsavedRefreshToken = null;
        await deleteSecureItem(TOKEN_KEY);
        await deleteSecureItem(REFRESH_KEY);
        try {
          onSessionExpired?.();
        } catch {
          /* never let the handler break the request path */
        }
        return { kind: 'rejected', status: res.status };
      }

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        return { kind: 'transient', status: res.status };
      }

      if (!res.ok || !data?.success || !data?.data?.token) {
        return { kind: 'transient', status: res.status };
      }

      const nextAccess = data.data.token as string;
      const nextRefresh = data.data.refreshToken as string | undefined;
      await persistTokens(nextAccess, nextRefresh);
      return {
        kind: 'ok',
        token: nextAccess,
        refreshToken: nextRefresh,
        data: data.data as Record<string, unknown>,
      };
    } catch {
      return { kind: 'transient', status: 0 };
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function refreshAccessToken(): Promise<string | null> {
  const outcome = await refreshSession();
  return outcome.kind === 'ok' ? outcome.token : null;
}

async function readAccessToken(): Promise<string | null> {
  let token: string | null = getToken();
  if (!token) {
    try {
      token = await getSecureItem(TOKEN_KEY);
      if (token) setToken(token);
    } catch (error) {
      console.warn('[HTTP] Could not load auth token from secure storage:', error);
    }
  }
  return token;
}

/** Methods safe to resend automatically after a network failure. POST never is. */
function isRetryableMethod(method: string | undefined): boolean {
  const m = String(method || 'GET').toUpperCase();
  return m === 'GET' || m === 'HEAD' || m === 'PUT' || m === 'DELETE';
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 1,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
): Promise<Response> {
  // A POST that failed mid-flight may still have been created server-side;
  // resending it silently is how duplicates happen. The user retries instead.
  if (!isRetryableMethod(init.method)) retries = 0;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchWithTimeout(url, init, timeoutMs);
    } catch (error) {
      lastError = error;
      // Timeouts are not retried — that would just double the wait on a dead link.
      if (!isNetworkError(error) || attempt === retries) throw error;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Network request failed');
}

export function getApiBaseUrl(): string {
  return BASE_URL;
}

const getInflight = new Map<string, Promise<unknown>>();

/** IANA timezone of the device, e.g. "Europe/Luxembourg" (null if unavailable). */
export const DEVICE_TIMEZONE: string | null = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
})();

/** The device's local calendar day as YYYY-MM-DD. */
export function localDayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const method = String(options.method || 'GET').toUpperCase();
  if (method === 'GET') {
    const existing = getInflight.get(url);
    if (existing) return existing as Promise<T>;
  }

  const run = requestOnce<T>(path, options, url);
  if (method === 'GET') {
    const wrapped = run.finally(() => {
      if (getInflight.get(url) === wrapped) getInflight.delete(url);
    });
    getInflight.set(url, wrapped);
    return wrapped;
  }
  return run;
}

/** Wait before resending a keyed request the server reports as still in progress. */
const IDEMPOTENCY_IN_PROGRESS_RETRY_MS = 1_000;

async function requestOnce<T>(
  path: string,
  requestOptions: RequestOptions,
  url: string,
  idempotencyRetried = false
): Promise<T> {
  const { timeoutMs: timeoutOverride, idempotencyKey, ...options } = requestOptions;
  const timeoutMs =
    timeoutOverride ??
    (path.startsWith('/media/upload') ? UPLOAD_REQUEST_TIMEOUT_MS : DEFAULT_REQUEST_TIMEOUT_MS);
  const bootstrap = isAuthBootstrapPath(path);
  const method = String(options.method || 'GET').toUpperCase();

  const headers: Record<string, string> = {
    ...(method !== 'GET' && method !== 'HEAD' ? { 'Content-Type': 'application/json' } : {}),
    // Lets the API count streaks / check-ins on the user's own calendar day.
    ...(DEVICE_TIMEZONE ? { 'X-Timezone': DEVICE_TIMEZONE } : {}),
    ...((options.headers as Record<string, string>) || {}),
    // Same key on the post-refresh resend below, so the server dedupes it too.
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
  };

  if (!bootstrap) {
    const token = await readAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } else {
    // Never send a stale Bearer on sign-in / refresh
    delete headers.Authorization;
  }

  let res: Response;
  try {
    res = await fetchWithRetry(url, { ...options, headers }, bootstrap ? 2 : 1, timeoutMs);
  } catch (error: unknown) {
    console.warn('[HTTP] fetch failed', { url, error });
    if (isNetworkError(error)) {
      throw new ApiError(networkErrorMessage(error), 0);
    }
    if (error instanceof Error) throw error;
    throw new ApiError('Network request failed', 0);
  }

  // Expired access token → refresh once and retry (skip for auth bootstrap routes)
  if (res.status === 401 && !bootstrap) {
    const next = await refreshAccessToken();
    if (next) {
      headers.Authorization = `Bearer ${next}`;
      try {
        res = await fetchWithRetry(url, { ...options, headers }, 1, timeoutMs);
      } catch (error: unknown) {
        console.warn('[HTTP] retry after refresh failed', { url, error });
        if (isNetworkError(error)) {
          throw new ApiError(networkErrorMessage(error), 0);
        }
        throw error instanceof Error ? error : new ApiError('Network request failed', 0);
      }
    }
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    if (!res.ok) {
      throw new ApiError(messageFromApiError(null, res.status), res.status);
    }
    if (res.status === 204) return undefined as unknown as T;
    throw new ApiError('Invalid server response', res.status);
  }

  // Same key is still being processed server-side (a previous attempt is in
  // flight). Safe to resend once after a beat because the request is keyed.
  if (
    res.status === 409 &&
    idempotencyKey &&
    !idempotencyRetried &&
    data?.error?.code === 'IDEMPOTENCY_IN_PROGRESS'
  ) {
    await new Promise((r) => setTimeout(r, IDEMPOTENCY_IN_PROGRESS_RETRY_MS));
    return requestOnce<T>(path, requestOptions, url, true);
  }

  if (!res.ok || (data && data.success === false)) {
    throw new ApiError(messageFromApiError(data, res.status), res.status, data);
  }

  if (res.status === 204) return undefined as unknown as T;
  // Any write that earned badges (post, story, journal, check-in…) hands them
  // to the celebration queue without each screen having to know about badges.
  if (method !== 'GET' && onBadgesEarned) {
    const earned = data?.data?.new_badges ?? data?.new_badges;
    if (Array.isArray(earned) && earned.length > 0) {
      try {
        onBadgesEarned(earned);
      } catch {
        /* never break the request path */
      }
    }
  }
  return data as T;
}

let onBadgesEarned: ((badges: { id: string; name: string; description: string; points: number }[]) => void) | null =
  null;

/** Register the app-wide handler for `new_badges` returned by write requests. */
export function setBadgesEarnedHandler(
  handler: ((badges: { id: string; name: string; description: string; points: number }[]) => void) | null
): void {
  onBadgesEarned = handler;
}
