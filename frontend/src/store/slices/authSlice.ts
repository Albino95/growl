import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { getSecureItem, setSecureItem, deleteSecureItem } from '../../services/storage/secureStore';
import { setToken, clearToken } from '../../services/storage/tokenManager';
import {
  signInApi,
  signUpApi,
  verifyEmailApi,
  signInSsoApi,
  signOutApi,
  refreshSessionApi,
  type SessionResponse,
} from '../../services/api/auth';
import { fetchCurrentProfile } from '../../services/api/profile';

export type User = {
  id: string;
  email?: string;
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

function isTransientAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('could not reach') ||
    msg.includes('failed to fetch') ||
    msg.includes('network request failed') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('timed out') ||
    msg.includes('timeout')
  );
}

async function persistSession(token: string, refreshToken?: string) {
  await setSecureItem(TOKEN_KEY, token);
  setToken(token);
  if (refreshToken) {
    await setSecureItem(REFRESH_KEY, refreshToken);
  }
}

async function cacheUserSnapshot(user: User) {
  try {
    await setSecureItem(USER_CACHE_KEY, JSON.stringify(user));
  } catch {
    // non-fatal
  }
}

async function readCachedUser(): Promise<User | null> {
  try {
    const raw = await getSecureItem(USER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as User;
    return parsed?.id ? parsed : null;
  } catch {
    return null;
  }
}

async function clearSessionStorage() {
  await deleteSecureItem(TOKEN_KEY);
  await deleteSecureItem(REFRESH_KEY);
  await deleteSecureItem(USER_CACHE_KEY);
  clearToken();
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
  };
}

export const hydrateAuth = createAsyncThunk('auth/hydrate', async (_, { rejectWithValue }) => {
  try {
    const token = await getSecureItem(TOKEN_KEY);
    const refreshToken = await getSecureItem(REFRESH_KEY);
    const cachedUser = await readCachedUser();

    if (!token && !refreshToken) {
      clearToken();
      return { token: null, user: null };
    }

    if (token) {
      setToken(token);
      try {
        // Lite profile — avoid streak/eligibility queries on every cold start
        const user = await loadUserFromApi(undefined, { stats: false });
        await cacheUserSnapshot(user);
        return { token, user };
      } catch (error) {
        // Network blip with a still-valid access token — stay signed in offline
        if (isTransientAuthError(error) && cachedUser) {
          console.warn('[Auth] hydrate: profile unreachable, using cache');
          return { token, user: cachedUser };
        }
        // Access token may be expired — try refresh below
      }
    }

    if (refreshToken) {
      try {
        const res = await refreshSessionApi(refreshToken);
        await persistSession(res.token, res.refreshToken);
        const user = userFromSession(res);
        await cacheUserSnapshot(user);
        return { token: res.token, user };
      } catch (error) {
        // Keep session on network errors — only wipe on definitive auth failure
        if (isTransientAuthError(error)) {
          if (token && cachedUser) {
            console.warn('[Auth] hydrate: refresh unreachable, keeping session');
            setToken(token);
            return { token, user: cachedUser };
          }
          // Tokens exist but we can't reach the server — don't force logout
          if (token) {
            setToken(token);
            return {
              token,
              user:
                cachedUser ||
                ({
                  id: 'offline',
                  hasCompletedOnboarding: true,
                  categories: [],
                } satisfies User),
            };
          }
          return rejectWithValue(
            'Could not reach Grow! servers. Check your connection and try again.'
          );
        }
        // Invalid / expired refresh — real sign-out
        await clearSessionStorage();
        return rejectWithValue('Session expired. Please sign in again.');
      }
    }

    await clearSessionStorage();
    return rejectWithValue('Session expired. Please sign in again.');
  } catch (error) {
    console.error('[Auth] hydrate failed:', error);
    // Never wipe tokens on unexpected/transient failures
    if (isTransientAuthError(error)) {
      const token = await getSecureItem(TOKEN_KEY);
      const cachedUser = await readCachedUser();
      if (token && cachedUser) {
        setToken(token);
        return { token, user: cachedUser };
      }
      return rejectWithValue(
        'Could not reach Grow! servers. Check your connection and try again.'
      );
    }
    await clearSessionStorage();
    return rejectWithValue('Session expired. Please sign in again.');
  }
});

export const signUp = createAsyncThunk(
  'auth/signUp',
  async (
    payload: { email: string; password: string; username?: string },
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

export const signOut = createAsyncThunk('auth/signOut', async (_, { rejectWithValue }) => {
  try {
    const refreshToken = await getSecureItem(REFRESH_KEY);
    await signOutApi(refreshToken);
    await clearSessionStorage();
    return { success: true };
  } catch (error: unknown) {
    await clearSessionStorage();
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
