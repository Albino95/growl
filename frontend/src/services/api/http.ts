import Constants from 'expo-constants';
import { getSecureItem, setSecureItem, deleteSecureItem } from '../storage/secureStore';
import { getToken, setToken, clearToken } from '../storage/tokenManager';
import { messageFromApiError } from './apiErrors';

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

let refreshInFlight: Promise<string | null> | null = null;

async function persistTokens(access: string, refresh?: string) {
  setToken(access);
  await setSecureItem(TOKEN_KEY, access);
  if (refresh) {
    await setSecureItem(REFRESH_KEY, refresh);
  }
}

/** Single-flight refresh so concurrent 401s don't rotate/revoke each other. */
async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const refreshToken = await getSecureItem(REFRESH_KEY);
      if (!refreshToken) return null;

      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        return null;
      }

      if (!res.ok || !data?.success || !data?.data?.token) {
        // Only wipe session on definitive invalid refresh — not on 5xx/network
        if (res.status === 401 || res.status === 403) {
          clearToken();
          await deleteSecureItem(TOKEN_KEY);
          await deleteSecureItem(REFRESH_KEY);
        }
        return null;
      }

      const nextAccess = data.data.token as string;
      const nextRefresh = data.data.refreshToken as string | undefined;
      await persistTokens(nextAccess, nextRefresh);
      return nextAccess;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
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

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 1
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      if (!isNetworkError(error) || attempt === retries) throw error;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Network request failed');
}

export function getApiBaseUrl(): string {
  return BASE_URL;
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const bootstrap = isAuthBootstrapPath(path);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
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
    res = await fetchWithRetry(url, { ...options, headers }, bootstrap ? 2 : 1);
  } catch (error: unknown) {
    console.warn('[HTTP] fetch failed', { url, error });
    if (isNetworkError(error)) {
      throw new Error(networkErrorMessage(error));
    }
    if (error instanceof Error) throw error;
    throw new Error('Network request failed');
  }

  // Expired access token → refresh once and retry (skip for auth bootstrap routes)
  if (res.status === 401 && !bootstrap) {
    const next = await refreshAccessToken();
    if (next) {
      headers.Authorization = `Bearer ${next}`;
      try {
        res = await fetchWithRetry(url, { ...options, headers }, 1);
      } catch (error: unknown) {
        console.warn('[HTTP] retry after refresh failed', { url, error });
        if (isNetworkError(error)) {
          throw new Error(networkErrorMessage(error));
        }
        throw error instanceof Error ? error : new Error('Network request failed');
      }
    }
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    if (!res.ok) {
      throw new Error(messageFromApiError(null, res.status));
    }
    if (res.status === 204) return undefined as unknown as T;
    throw new Error('Invalid server response');
  }

  if (!res.ok || (data && data.success === false)) {
    throw new Error(messageFromApiError(data, res.status));
  }

  if (res.status === 204) return undefined as unknown as T;
  return data as T;
}
