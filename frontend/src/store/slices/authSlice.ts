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

async function persistSession(token: string, refreshToken?: string) {
  await setSecureItem(TOKEN_KEY, token);
  setToken(token);
  if (refreshToken) {
    await setSecureItem(REFRESH_KEY, refreshToken);
  }
}

async function clearSessionStorage() {
  await deleteSecureItem(TOKEN_KEY);
  await deleteSecureItem(REFRESH_KEY);
  clearToken();
}

async function loadUserFromApi(email?: string): Promise<User> {
  const profile = await fetchCurrentProfile();
  return {
    id: profile.id,
    email: profile.email || email,
    isInstructor: profile.is_instructor,
    isBusiness: profile.is_business,
    categories: profile.categories,
    hasCompletedOnboarding: profile.categories.length > 0,
    points: profile.points,
  };
}

export const hydrateAuth = createAsyncThunk('auth/hydrate', async (_, { rejectWithValue }) => {
  try {
    let token = await getSecureItem(TOKEN_KEY);
    const refreshToken = await getSecureItem(REFRESH_KEY);

    if (!token && !refreshToken) {
      clearToken();
      return { token: null, user: null };
    }

    if (token) {
      setToken(token);
      try {
        const user = await loadUserFromApi();
        return { token, user };
      } catch {
        // Access token may be expired — try refresh below
      }
    }

    if (refreshToken) {
      const res = await refreshSessionApi(refreshToken);
      await persistSession(res.token, res.refreshToken);
      const user = await loadUserFromApi();
      return { token: res.token, user };
    }

    await clearSessionStorage();
    return rejectWithValue('Session expired. Please sign in again.');
  } catch (error) {
    console.error('[Auth] hydrate failed:', error);
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
      const user = await loadUserFromApi(email.trim());
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
      const user = await loadUserFromApi();
      return { token: res.token, user };
    } catch (e: unknown) {
      return rejectWithValue(e instanceof Error ? e.message : 'SSO sign in failed');
    }
  }
);

export const refreshProfile = createAsyncThunk('auth/refreshProfile', async (_, { rejectWithValue }) => {
  try {
    const user = await loadUserFromApi();
    return user;
  } catch (e: unknown) {
    return rejectWithValue(e instanceof Error ? e.message : 'Failed to refresh profile');
  }
});

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
        state.token = null;
        state.user = null;
        state.hydrated = true;
        state.isLoading = false;
        state.error = (action.payload as string) || null;
        state.shouldCompleteSignupOnboarding = false;
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
      if (state.user) {
        state.user = { ...state.user, ...action.payload };
      }
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
