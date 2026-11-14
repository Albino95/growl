import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

(globalThis as { __DEV__?: boolean }).__DEV__ = false;
vi.mock('expo-modules-core', () => ({ requireOptionalNativeModule: () => null, requireNativeModule: () => ({}) }));
vi.mock('expo', () => ({}));
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));
const kv = vi.hoisted(() => new Map<string, string>());
const ss = vi.hoisted(() => ({ failReads: 0 }));
vi.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
  getItemAsync: async (k: string) => {
    if (ss.failReads > 0) {
      ss.failReads -= 1;
      throw new Error('User interaction is not allowed');
    }
    return kv.get(k) ?? null;
  },
  setItemAsync: async (k: string, v: string) => void kv.set(k, v),
  deleteItemAsync: async (k: string) => void kv.delete(k),
}));

const files = vi.hoisted(() => new Map<string, string>());
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  getInfoAsync: async (p: string) => ({ exists: p.endsWith('/') || files.has(p) }),
  makeDirectoryAsync: async () => undefined,
  readAsStringAsync: async (p: string) => files.get(p) ?? '',
  writeAsStringAsync: async (p: string, v: string) => void files.set(p, v),
  deleteAsync: async (p: string) => void files.delete(p),
}));

const { default: authReducer, hydrateAuth, PENDING_REFRESH_TOKEN } = await import(
  '../slices/authSlice'
);
const { clearToken } = await import('../../services/storage/tokenManager');

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Profile calls 401 (expired access token); /auth/refresh answers `refreshStatus`. */
function serverWithRefresh(refreshStatus: number) {
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).includes('/auth/refresh')) {
      return refreshStatus === 200
        ? json(200, {
            success: true,
            data: { token: 'new', refreshToken: 'r2', userId: 'u1', isInstructor: false, hasCompletedOnboarding: true },
          })
        : json(refreshStatus, { success: false, error: { code: 'X' } });
    }
    return json(401, { success: false, error: { code: 'UNAUTHORIZED' } });
  });
}

const makeStore = () => configureStore({ reducer: { auth: authReducer } });
const cachedUser = { id: 'u1', username: 'ana', hasCompletedOnboarding: true, categories: ['fitness'] };

beforeEach(() => {
  kv.clear();
  files.clear();
  ss.failReads = 0;
  fetchMock.mockReset();
  clearToken();
});

describe('hydrateAuth on cold start', () => {
  it('keeps the session when refresh returns 500', async () => {
    kv.set('auth_token', 'old');
    kv.set('auth_refresh_token', 'r1');
    serverWithRefresh(500);
    const store = makeStore();
    await store.dispatch(hydrateAuth());
    expect(store.getState().auth.token).toBe('old');
    expect(kv.get('auth_refresh_token')).toBe('r1');
  });

  it('keeps the user in on the cached snapshot with only a refresh token and a 503', async () => {
    kv.set('auth_refresh_token', 'r1');
    kv.set('auth_user_cache', JSON.stringify(cachedUser)); // legacy location
    serverWithRefresh(503);
    const store = makeStore();
    await store.dispatch(hydrateAuth());
    expect(store.getState().auth.token).toBe(PENDING_REFRESH_TOKEN);
    expect(store.getState().auth.user?.id).toBe('u1');
    expect(kv.get('auth_refresh_token')).toBe('r1');
    // Snapshot moved out of the keychain into the local file store.
    expect(kv.has('auth_user_cache')).toBe(false);
    expect([...files.values()].some((v) => v.includes('"u1"'))).toBe(true);
  });

  it('keeps the session on 429', async () => {
    kv.set('auth_token', 'old');
    kv.set('auth_refresh_token', 'r1');
    serverWithRefresh(429);
    const store = makeStore();
    await store.dispatch(hydrateAuth());
    expect(store.getState().auth.token).toBe('old');
  });

  it('signs out and clears storage when refresh returns 401', async () => {
    kv.set('auth_token', 'old');
    kv.set('auth_refresh_token', 'r1');
    serverWithRefresh(401);
    const store = makeStore();
    const res = await store.dispatch(hydrateAuth());
    expect(res.type).toBe(hydrateAuth.rejected.type);
    expect(store.getState().auth.token).toBeNull();
    expect(kv.has('auth_token')).toBe(false);
    expect(kv.has('auth_refresh_token')).toBe(false);
  });

  it('signs in with the rotated pair when refresh succeeds', async () => {
    kv.set('auth_refresh_token', 'r1');
    serverWithRefresh(200);
    const store = makeStore();
    await store.dispatch(hydrateAuth());
    expect(store.getState().auth.token).toBe('new');
    expect(kv.get('auth_refresh_token')).toBe('r2');
  });

  it('retries a keychain read that threw before deciding', async () => {
    kv.set('auth_token', 'tok');
    kv.set('auth_refresh_token', 'r1');
    kv.set('auth_user_cache', JSON.stringify(cachedUser));
    ss.failReads = 1;
    fetchMock.mockImplementation(async () => json(200, { success: true, data: {} }));
    const store = makeStore();
    await store.dispatch(hydrateAuth());
    expect(store.getState().auth.token).toBe('tok');
  });

  it('never clears tokens when the keychain stays unreadable', async () => {
    kv.set('auth_token', 'tok');
    kv.set('auth_refresh_token', 'r1');
    ss.failReads = 10;
    const store = makeStore();
    await store.dispatch(hydrateAuth());
    expect(store.getState().auth.token).toBeNull();
    expect(kv.get('auth_token')).toBe('tok');
    expect(kv.get('auth_refresh_token')).toBe('r1');
  });

  it('resumes onboarding when the hydrated user never finished it', async () => {
    kv.set('auth_token', 'tok');
    kv.set('auth_user_cache', JSON.stringify({ id: 'u2', hasCompletedOnboarding: false, categories: [] }));
    fetchMock.mockImplementation(async () => json(200, { success: true, data: {} }));
    const store = makeStore();
    await store.dispatch(hydrateAuth());
    expect(store.getState().auth.shouldCompleteSignupOnboarding).toBe(true);
  });
});
