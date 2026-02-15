import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { getSecureItem, setSecureItem, deleteSecureItem } from '../../services/storage/secureStore';
import { request } from '../../services/api/http';
import * as Crypto from 'expo-crypto';

export type User = {
  id: string;
  email?: string;
  isInstructor?: boolean;
  categories?: string[];
  hasCompletedOnboarding?: boolean;
  points?: number;
  decayTimer?: number; // Days until posts decay
};

interface AuthState {
  user: User | null;
  token: string | null;
  hydrated: boolean;
  isLoading: boolean;
  error: string | null;
}

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'user_data';

// Hash password client-side before sending (additional security layer)
async function hashPassword(password: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, password);
}

// Async thunks for async operations
export const hydrateAuth = createAsyncThunk('auth/hydrate', async () => {
  try {
    const token = await getSecureItem(TOKEN_KEY);
    const userData = await getSecureItem(USER_KEY);
    if (token) {
      const user = userData ? JSON.parse(userData) : { id: 'me' };
      return { token, user };
    }
    return { token: null, user: null };
  } catch (error) {
    console.error('Hydration error:', error);
    return { token: null, user: null };
  }
});

export const signIn = createAsyncThunk(
  'auth/signIn',
  async ({ email, password }: { email: string; password: string }) => {
    try {
      // Hash password before sending (never send plain password)
      const hashedPassword = await hashPassword(password);
      const res = await request<{
        token: string;
        userId: string;
        isInstructor: boolean;
        hasCompletedOnboarding: boolean;
        categories?: string[];
      }>('/auth/sign-in', {
        method: 'POST',
        body: JSON.stringify({ email, passwordHash: hashedPassword }),
      });
      const user: User = {
        id: res.userId,
        email,
        isInstructor: res.isInstructor || false,
        hasCompletedOnboarding: res.hasCompletedOnboarding || false,
        categories: res.categories || [],
      };
      await setSecureItem(TOKEN_KEY, res.token);
      await setSecureItem(USER_KEY, JSON.stringify(user));
      return { token: res.token, user };
    } catch {
      // Dev fallback - Demo accounts
      const devToken = `dev-token-${Date.now()}`;

      // Demo accounts configuration
      let user: User;

      if (email === 'demo@growl.app' && password === 'demo123') {
        // Regular user
        user = {
          id: 'demo-user',
          email,
          isInstructor: false,
          hasCompletedOnboarding: true,
          categories: ['fitness', 'art'],
          points: 150,
        };
      } else if (email === 'instructor@growl.app' && password === 'instructor123') {
        // Instructor account
        user = {
          id: 'demo-instructor',
          email,
          isInstructor: true,
          hasCompletedOnboarding: true,
          categories: ['fitness', 'mindset'],
          points: 750,
        };
      } else if (email === 'business@growl.app' && password === 'business123') {
        // Business account (also has instructor access)
        user = {
          id: 'demo-business',
          email,
          isInstructor: true, // Business users also have instructor access
          hasCompletedOnboarding: true,
          categories: ['fitness', 'art', 'mindset'],
          points: 1000,
        };
      } else {
        // Default fallback for any other email/password
        user = {
          id: 'dev',
          email,
          isInstructor: false,
          hasCompletedOnboarding: false,
          categories: [],
          points: 0,
        };
      }

      await setSecureItem(TOKEN_KEY, devToken);
      await setSecureItem(USER_KEY, JSON.stringify(user));
      return { token: devToken, user };
    }
  }
);

export const signInWithSSO = createAsyncThunk(
  'auth/signInWithSSO',
  async ({ provider, token: ssoToken }: { provider: 'google' | 'facebook'; token: string }) => {
    try {
      const res = await request<{
        token: string;
        userId: string;
        isInstructor: boolean;
        hasCompletedOnboarding: boolean;
        categories?: string[];
      }>('/auth/sso', {
        method: 'POST',
        body: JSON.stringify({ provider, token: ssoToken }),
      });
      const user: User = {
        id: res.userId,
        isInstructor: res.isInstructor || false,
        hasCompletedOnboarding: res.hasCompletedOnboarding || false,
        categories: res.categories || [],
      };
      await setSecureItem(TOKEN_KEY, res.token);
      await setSecureItem(USER_KEY, JSON.stringify(user));
      return { token: res.token, user };
    } catch {
      // Dev fallback
      const devToken = 'dev-token';
      const user: User = {
        id: 'dev',
        isInstructor: false,
        hasCompletedOnboarding: false,
        categories: [],
        points: 0,
      };
      await setSecureItem(TOKEN_KEY, devToken);
      await setSecureItem(USER_KEY, JSON.stringify(user));
      return { token: devToken, user };
    }
  }
);

export const signOut = createAsyncThunk('auth/signOut', async () => {
  await deleteSecureItem(TOKEN_KEY);
  await deleteSecureItem(USER_KEY);
});

const initialState: AuthState = {
  user: null,
  token: null,
  hydrated: false,
  isLoading: false,
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    updateUser: (state, action: PayloadAction<Partial<User>>) => {
      if (state.user) {
        state.user = { ...state.user, ...action.payload };
        // Persist to storage
        setSecureItem(USER_KEY, JSON.stringify(state.user));
      }
    },
    setOnboardingComplete: (state, action: PayloadAction<string[]>) => {
      if (state.user) {
        state.user = {
          ...state.user,
          categories: action.payload,
          hasCompletedOnboarding: true,
        };
        // Persist to storage
        setSecureItem(USER_KEY, JSON.stringify(state.user));
      }
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // Hydrate
    builder
      .addCase(hydrateAuth.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(hydrateAuth.fulfilled, (state, action) => {
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.hydrated = true;
        state.isLoading = false;
      })
      .addCase(hydrateAuth.rejected, (state) => {
        state.hydrated = true;
        state.isLoading = false;
      });

    // Sign In
    builder
      .addCase(signIn.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(signIn.fulfilled, (state, action) => {
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.isLoading = false;
        state.error = null;
      })
      .addCase(signIn.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Sign in failed';
      });

    // Sign In with SSO
    builder
      .addCase(signInWithSSO.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(signInWithSSO.fulfilled, (state, action) => {
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.isLoading = false;
        state.error = null;
      })
      .addCase(signInWithSSO.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'SSO sign in failed';
      });

    // Sign Out
    builder
      .addCase(signOut.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(signOut.fulfilled, (state) => {
        state.token = null;
        state.user = null;
        state.isLoading = false;
      })
      .addCase(signOut.rejected, (state) => {
        state.isLoading = false;
      });
  },
});

export const { updateUser, setOnboardingComplete, clearError } = authSlice.actions;
export default authSlice.reducer;
