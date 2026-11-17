import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import {
  getSecureItem,
  readSecureItem,
  setSecureItem,
  deleteSecureItem,
  type SecureReadResult,
} from '../../services/storage/secureStore';
import { getLocalItem, setLocalItem, deleteLocalItem } from '../../services/storage/localStore';
import { hasSignedInBefore, markSignedInBefore } from '../../services/storage/signInHistory';
import { setToken, clearToken } from '../../services/storage/tokenManager';
import {
  signInApi,
  signUpApi,
  verifyEmailApi,
  signInSsoApi,
  signOutApi,
  type SessionResponse,
} from '../../services/api/auth';
import {
  clearUnsavedRefreshToken,
  isTransientApiError,
  persistSessionTokens,
  refreshSession,
} from '../../services/api/http';
import { fetchCurrentProfile } from '../../services/api/profile';

export type User = {
  id: string;
  email?: string;
  username?: string;
  avatar?: string;
  isInstructor?: boolean;
  isBusiness?: boolean;
  categories?: string[];
  hasCompletedOnboarding?: boolean;
  points?: number;
  decayTimer?: number;
  postCount?: number;
  endorsementsReceived?: number;
  endorsementsGiven?: number;
  streakDays?: number;
  bio?: string | null;
  status?: string | null;
};

interface AuthState {
  user: User | null;
  token: string | null;
  hydrated: boolean;
  isLoading: boolean;
  error: string | null;
  shouldCompleteSignupOnboarding: boolean;
}

const TOKEN_KEY = 'auth_token';
const REFRESH_KEY = 'auth_refresh_token';
const USER_CACHE_KEY = 'auth_user_cache';
/** Set once tokens were rewritten with AFTER_FIRST_UNLOCK keychain access. */
const KEYCHAIN_MIGRATED_KEY = 'auth_keychain_v2';
/** Gap before the one retry of a keychain read that threw. */
const KEYCHAIN_RETRY_MS = 300;

const SESSION_EXPIRED = 'Session expired. Please sign in again.';
const UNREACHABLE = 'Could not reach Grow! servers. Check your connection and try again.';

/**
 * Signed in, but we hold only the refresh token and can't reach the server.
 * Not a credential: the first request 401s, http refreshes, and real tokens
 * take over. Lets the user in on the cached snapshot instead of signing out.
 */
export const PENDING_REFRESH_TOKEN = 'pending-refresh';

/** Offline / timeout / 5xx / 429 — keep the session, try again later. */
function isTransientAuthError(error: unknown): boolean {
  if (isTransientApiError(error)) return true;
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return msg.includes('timed out') || msg.includes('timeout');
}

async function persistSession(token: string, refreshToken?: string) {
  // Same retry + in-memory fallback http uses for rotated tokens.
  await persistSessionTokens(token, refreshToken);
}

/**
 * The cached profile isn't a secret, so it lives in a plain local file — the
 * keychain only holds tokens. Older builds kept it in SecureStore; read there
 * once as a fallback and move it over.
 */
async function cacheUserSnapshot(user: User) {
  try {
    await setLocalItem(USER_CACHE_KEY, JSON.stringify(user));
  } catch {
    // non-fatal
  }
}

function parseUser(raw: string | null): User | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as User;
    return parsed?.id ? parsed : null;
  } catch {
    return null;
  }
}

async function readCachedUser(): Promise<User | null> {
  try {
    const local = parseUser(await getLocalItem(USER_CACHE_KEY));
    if (local) return local;
    const legacy = parseUser(await getSecureItem(USER_CACHE_KEY));
    if (legacy) {
      if (await setLocalItem(USER_CACHE_KEY, JSON.stringify(legacy))) {
        await deleteSecureItem(USER_CACHE_KEY);
      }
    }
    return legacy;
  } catch {
    return null;
  }
}

async function clearSessionStorage() {
  await deleteSecureItem(TOKEN_KEY);
  await deleteSecureItem(REFRESH_KEY);
  await deleteSecureItem(USER_CACHE_KEY);
  await deleteLocalItem(USER_CACHE_KEY);
  clearUnsavedRefreshToken();
  clearToken();
}

/** Keychain read that retries once after a short pause if it threw. */
async function readTokenItem(key: string): Promise<SecureReadResult> {
  const first = await readSecureItem(key);
  if (first.ok) return first;
  await new Promise((r) => setTimeout(r, KEYCHAIN_RETRY_MS));
  return readSecureItem(key);
}

/**
 * Tokens written by older builds use the default WHEN_UNLOCKED access, and
 * updating an item never changes its access class. Re-create them once so
 * they're readable after first unlock. Runs before any network call, so a
 * concurrent rotation can't be overwritten.
 */
async function migrateTokenAccessibility(token: string, refreshToken: string | null) {
  try {
    if ((await getSecureItem(KEYCHAIN_MIGRATED_KEY)) === '1') return;
    await deleteSecureItem(TOKEN_KEY);
    if (refreshToken) await deleteSecureItem(REFRESH_KEY);
    await persistSessionTokens(token, refreshToken ?? undefined);
    await setSecureItem(KEYCHAIN_MIGRATED_KEY, '1');
  } catch {
    /* best effort; tokens stay in memory for this run */
  }
}

/** Instant user from auth/session payload — no extra /profile round-trip. */
function userFromSession(res: SessionResponse, emailFallback?: string): User {
  return {
    id: res.userId,
    email: res.email || emailFallback,
    isInstructor: res.isInstructor,
    isBusiness: !!res.isBusiness,
    categories: Array.isArray(res.categories) ? res.categories : [],
    hasCompletedOnboarding: res.hasCompletedOnboarding,
    points: res.points ?? 0,
    decayTimer: res.decayTimer ?? 7,
  };
}

/** Lite profile by default (fast boot). Pass stats:true for You-tab achievements. */
async function loadUserFromApi(
  email?: string,
  opts?: { stats?: boolean }
): Promise<User> {
  const profile = await fetchCurrentProfile({ stats: opts?.stats });
  return {
    id: profile.id,
    email: profile.email || email,
    username: profile.username || undefined,
    avatar: profile.avatar || undefined,
    isInstructor: profile.is_instructor,
    isBusiness: profile.is_business,
    categories: profile.categories,
    hasCompletedOnboarding: profile.categories.length > 0,
    points: profile.points,
    decayTimer: profile.decay_timer ?? 7,
    postCount: profile.post_count ?? 0,
    endorsementsReceived:
      profile.endorsements_received ?? profile.instructor?.endorsementsReceived ?? 0,
    endorsementsGiven: profile.endorsements_given ?? 0,
    streakDays: profile.streak_days ?? 0,
    bio: profile.bio ?? null,
    status: profile.status ?? null,
  };
}

/** Cold-start profile check must not hold the splash on a slow network. */
const HYDRATE_PROFILE_TIMEOUT_MS = 6_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Request timed out. Check your connection.')),
      ms
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export const hydrateAuth = createAsyncThunk(
  'auth/hydrate',
  async (_, { rejectWithValue, dispatch }) => {
    const revalidateSoon = () =>
      setTimeout(() => {
        void dispatch(refreshProfile({ stats: false }));
      }, 0);

    try {
      const tokenRead = await readTokenItem(TOKEN_KEY);
      const refreshRead = await readTokenItem(REFRESH_KEY);

      if (!tokenRead.ok || !refreshRead.ok) {
        // Keychain unreadable (locked, busy) even after a retry. Show sign-in
        // for now but leave storage alone so the next launch still works.
        console.warn('[Auth] hydrate: keychain unreadable, not clearing session');
        clearToken();
        return { token: null, user: null };
      }

      const token = tokenRead.value;
      const refreshToken = refreshRead.value;

      if (!token && !refreshToken) {
        clearToken();
        return { token: null, user: null };
      }

      // Existing installs that update into this build should open on Sign in later.
      void hasSignedInBefore().then((seen) => {
        if (!seen) markSignedInBefore();
      });
      if (token) await migrateTokenAccessibility(token, refreshToken);
      const cachedUser = await readCachedUser();

      // Fast path: a signed-in user with a cached snapshot enters the app
      // immediately; the profile is revalidated in the background. An expired
      // access token is handled by http's refresh-on-401, and a definitively
      // dead session by the session-expired handler — never by a network error.
      if (token && cachedUser) {
        setToken(token);
        revalidateSoon();
        return { token, user: cachedUser };
      }

      if (token) {
        setToken(token);
        try {
          // Lite profile — avoid streak/eligibility queries on every cold start
          const user = await withTimeout(
            loadUserFromApi(undefined, { stats: false }),
            HYDRATE_PROFILE_TIMEOUT_MS
          );
          await cacheUserSnapshot(user);
          return { token, user };
        } catch (error) {
          if (isTransientAuthError(error)) {
            // Server unreachable with a stored access token: stay signed in.
            console.warn('[Auth] hydrate: profile unreachable, keeping session');
            revalidateSoon();
            return { token, user: offlineUser() };
          }
          // 401 etc: access token is dead — fall through to an explicit refresh.
        }
      }

      if (refreshToken) {
        // Same single-flight refresh http uses, so a parallel 401 can't rotate
        // the token out from under us (and revoke the family).
        const outcome = await refreshSession(refreshToken);
        if (outcome.kind === 'ok') {
          const user = userFromSession(outcome.data as unknown as SessionResponse);
          await cacheUserSnapshot(user);
          return { token: outcome.token, user };
        }
        if (outcome.kind === 'rejected') {
          // The only real sign-out: server said this refresh token is invalid.
          await clearSessionStorage();
          return rejectWithValue(SESSION_EXPIRED);
        }
        // Offline / timeout / 5xx / 429: keep the session, retry later.
        if (token) {
          console.warn('[Auth] hydrate: refresh unreachable, keeping session');
          setToken(token);
          revalidateSoon();
          return { token, user: cachedUser || offlineUser() };
        }
        if (cachedUser) {
          revalidateSoon();
          return { token: PENDING_REFRESH_TOKEN, user: cachedUser };
        }
        return rejectWithValue(UNREACHABLE);
      }

      // Access token rejected and there's no refresh token to try.
      await clearSessionStorage();
      return rejectWithValue(SESSION_EXPIRED);
    } catch (error) {
      // Unexpected failure: never wipe tokens for it. Show sign-in for now;
      // storage stays intact so the next launch can restore the session.
      console.error('[Auth] hydrate failed:', error);
      return rejectWithValue(UNREACHABLE);
    }
  }
);

/** Placeholder user while signed in but the profile can't be fetched yet. */
function offlineUser(): User {
  return { id: 'offline', hasCompletedOnboarding: true, categories: [] };
}

export const signUp = createAsyncThunk(
  'auth/signUp',
  async (
    payload: { email: string; password: string; username?: string; invite_code?: string },
    { rejectWithValue }
  ) => {
    try {
      return await signUpApi(payload);
    } catch (e: unknown) {
      return rejectWithValue(e instanceof Error ? e.message : 'Sign up failed');
    }
  }
);

export const verifyEmail = createAsyncThunk(
  'auth/verifyEmail',
  async (payload: { email: string; code: string }, { rejectWithValue }) => {
    try {
      await verifyEmailApi(payload.email, payload.code);
      return payload;
    } catch (e: unknown) {
      return rejectWithValue(e instanceof Error ? e.message : 'Verification failed');
    }
  }
);

export const signIn = createAsyncThunk(
  'auth/signIn',
  async ({ email, password }: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const res = await signInApi(email.trim(), password);
      await persistSession(res.token, res.refreshToken);
      const user = userFromSession(res, email.trim());
      await cacheUserSnapshot(user);
      markSignedInBefore();
      // Do not await /profile here — session payload is enough to enter the app
      return { token: res.token, user };
    } catch (e: unknown) {
      return rejectWithValue(e instanceof Error ? e.message : 'Sign in failed');
    }
  }
);

export const signInWithSSO = createAsyncThunk(
  'auth/signInWithSSO',
  async (
    payload: { provider: 'google' | 'facebook' | 'apple'; idToken?: string; accessToken?: string },
    { rejectWithValue }
  ) => {
    try {
      const res = await signInSsoApi(payload);
      await persistSession(res.token, res.refreshToken);
      const user = userFromSession(res);
      await cacheUserSnapshot(user);
      markSignedInBefore();
      return { token: res.token, user };
    } catch (e: unknown) {
      return rejectWithValue(e instanceof Error ? e.message : 'SSO sign in failed');
    }
  }
);

export const refreshProfile = createAsyncThunk(
  'auth/refreshProfile',
  async (opts: { stats?: boolean } | undefined, { rejectWithValue }) => {
    try {
      const user = await loadUserFromApi(undefined, { stats: opts?.stats });
      await cacheUserSnapshot(user);
      return user;
    } catch (e: unknown) {
      // Soft failure — never treat profile refresh as a sign-out signal
      return rejectWithValue(e instanceof Error ? e.message : 'Failed to refresh profile');
    }
  }
);

export const signOut = createAsyncThunk('auth/signOut', async (_, { dispatch, rejectWithValue }) => {
  try {
    const refreshToken = await getSecureItem(REFRESH_KEY);
    await signOutApi(refreshToken);
    await clearSessionStorage();
    // Drop cached feed so next login hydrates fresh has_liked from the API.
    const { clearFeed } = await import('./feedSlice');
    dispatch(clearFeed());
    return { success: true };
  } catch (error: unknown) {
    await clearSessionStorage();
    try {
      const { clearFeed } = await import('./feedSlice');
      dispatch(clearFeed());
    } catch {
      /* ignore */
    }
    return rejectWithValue(error instanceof Error ? error.message : 'Sign out failed');
  }
});

const initialState: AuthState = {
  user: null,
  token: null,
  hydrated: false,
  isLoading: false,
  error: null,
  shouldCompleteSignupOnboarding: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    updateUser: (state, action: PayloadAction<Partial<User>>) => {
      if (state.user) {
        state.user = { ...state.user, ...action.payload };
      }
    },
    setOnboardingComplete: (state, action: PayloadAction<string[]>) => {
      if (state.user) {
        state.user = {
          ...state.user,
          categories: action.payload,
          hasCompletedOnboarding: action.payload.length > 0,
        };
      }
      state.shouldCompleteSignupOnboarding = false;
    },
    markSignupOnboardingRequired: (state) => {
      state.shouldCompleteSignupOnboarding = true;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(hydrateAuth.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(hydrateAuth.fulfilled, (state, action) => {
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.hydrated = true;
        state.isLoading = false;
        state.error = null;
        if (!action.payload.token) {
          state.shouldCompleteSignupOnboarding = false;
        } else if (
          action.payload.user &&
          action.payload.user.id !== 'offline' &&
          action.payload.user.hasCompletedOnboarding === false
        ) {
          // Quit mid-onboarding last time: pick path setup up again.
          state.shouldCompleteSignupOnboarding = true;
        }
      })
      .addCase(hydrateAuth.rejected, (state, action) => {
        const msg = (action.payload as string) || null;
        const transient =
          !!msg &&
          (msg.toLowerCase().includes('could not reach') ||
            msg.toLowerCase().includes('connection'));
        // Only clear local auth state on definitive session expiry
        if (!transient) {
          state.token = null;
          state.user = null;
          state.shouldCompleteSignupOnboarding = false;
        }
        state.hydrated = true;
        state.isLoading = false;
        state.error = msg;
      });

    builder
      .addCase(signIn.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(signIn.fulfilled, (state, action) => {
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.isLoading = false;
        if (action.payload.user && !action.payload.user.hasCompletedOnboarding) {
          state.shouldCompleteSignupOnboarding = true;
        }
      })
      .addCase(signIn.rejected, (state, action) => {
        state.isLoading = false;
        state.error = (action.payload as string) || 'Sign in failed';
      });

    builder
      .addCase(signInWithSSO.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(signInWithSSO.fulfilled, (state, action) => {
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.isLoading = false;
        if (action.payload.user && !action.payload.user.hasCompletedOnboarding) {
          state.shouldCompleteSignupOnboarding = true;
        }
      })
      .addCase(signInWithSSO.rejected, (state, action) => {
        state.isLoading = false;
        state.error = (action.payload as string) || 'SSO sign in failed';
      });

    builder
      .addCase(signUp.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(signUp.fulfilled, (state) => {
        state.isLoading = false;
      })
      .addCase(signUp.rejected, (state, action) => {
        state.isLoading = false;
        state.error = (action.payload as string) || 'Sign up failed';
      });

    builder
      .addCase(verifyEmail.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(verifyEmail.fulfilled, (state) => {
        state.isLoading = false;
      })
      .addCase(verifyEmail.rejected, (state, action) => {
        state.isLoading = false;
        state.error = (action.payload as string) || 'Verification failed';
      });

    builder.addCase(refreshProfile.fulfilled, (state, action) => {
      state.user = state.user ? { ...state.user, ...action.payload } : action.payload;
    });

    builder
      .addCase(signOut.fulfilled, (state) => {
        state.token = null;
        state.user = null;
        state.isLoading = false;
        state.error = null;
        state.shouldCompleteSignupOnboarding = false;
      })
      .addCase(signOut.rejected, (state) => {
        state.token = null;
        state.user = null;
        state.isLoading = false;
        state.shouldCompleteSignupOnboarding = false;
      });
  },
});

export const { updateUser, setOnboardingComplete, markSignupOnboardingRequired, clearError } =
  authSlice.actions;
export default authSlice.reducer;
