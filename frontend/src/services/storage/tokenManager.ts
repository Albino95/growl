/**
 * Token Manager
 * Manages auth token in memory and syncs with SecureStore
 * This allows http.ts to access the token without circular dependencies
 */

let tokenCache: string | null = null;

export function setToken(token: string | null) {
  tokenCache = token;
}

export function getToken(): string | null {
  return tokenCache;
}

export function clearToken() {
  tokenCache = null;
}
