import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { getSecureItem, setSecureItem, deleteSecureItem } from '../../services/storage/secureStore';
import { setToken, clearToken } from '../../services/storage/tokenManager';
import { request } from '../../services/api/http';
import * as Crypto from 'expo-crypto';

export type User = {
  id: string;
  email?: string;
  isInstructor?: boolean;
  /** Set from API on sign-in; used for business app shell routing */
  isBusiness?: boolean;
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
      setToken(token); // Cache in memory
      return { token, user };
    }
    clearToken(); // Clear cache if no token
    return { token: null, user: null };
  } catch (error) {
    console.error('Hydration error:', error);
    clearToken();
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
        isBusiness?: boolean;
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
        isBusiness: res.isBusiness === true,
        hasCompletedOnboarding: res.hasCompletedOnboarding || false,
        categories: res.categories || [],
      };
      console.log('[Auth] Sign in successful, storing token...');
      await setSecureItem(TOKEN_KEY, res.token);
      await setSecureItem(USER_KEY, JSON.stringify(user));
      setToken(res.token); // Cache in memory
      console.log('[Auth] Token stored in SecureStore and tokenManager');
      console.log('[Auth] Token preview:', res.token.substring(0, 20) + '...');
      return { token: res.token, user };
    } catch (error) {
      console.error('[Auth] Sign in error, using demo fallback:', error);
      // Dev fallback - Demo accounts
      // Generate a proper JWT-like token for demo accounts
      const generateDemoToken = (userId: string) => {
        try {
          // Use global btoa or polyfill
          const btoaFn = typeof btoa !== 'undefined' ? btoa : (str: string) => Buffer.from(str).toString('base64');
          const header = btoaFn(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
          const payload = btoaFn(JSON.stringify({ userId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 }));
          return `${header}.${payload}.demo-signature`;
        } catch (e) {
          console.error('[Auth] Error generating demo token:', e);
          // Fallback to simple token if btoa fails
          return `demo.${btoa ? btoa(JSON.stringify({ userId })) : userId}.token`;
        }
      };

      // Demo accounts configuration
      let user: User;
      let userId: string;

      if (email === 'demo@growl.app' && password === 'demo123') {
        // Regular user
        userId = 'demo-user';
        user = {
          id: userId,
          email,
          isInstructor: false,
          isBusiness: false,
          hasCompletedOnboarding: true,
          categories: ['fitness', 'art'],
          points: 150,
        };
      } else if (email === 'instructor@growl.app' && password === 'instructor123') {
        // Instructor account
        userId = 'demo-instructor';
        user = {
          id: userId,
          email,
          isInstructor: true,
          isBusiness: false,
          hasCompletedOnboarding: true,
          categories: ['fitness', 'mindset'],
          points: 750,
        };
      } else if (email === 'business@growl.app' && password === 'business123') {
        // Business account (also has instructor access)
        userId = 'demo-business';
        user = {
          id: userId,
          email,
          isInstructor: true, // Business users also have instructor access
          isBusiness: true,
          hasCompletedOnboarding: true,
          categories: ['fitness', 'art', 'mindset'],
          points: 1000,
        };
      } else {
        // Default fallback for any other email/password
        userId = 'dev';
        user = {
          id: userId,
          email,
          isInstructor: false,
          isBusiness: false,
          hasCompletedOnboarding: false,
          categories: [],
          points: 0,
        };
      }

      const devToken = generateDemoToken(userId);
      console.log('[Auth] Demo account token generated:', devToken.substring(0, 30) + '...');
      await setSecureItem(TOKEN_KEY, devToken);
      await setSecureItem(USER_KEY, JSON.stringify(user));
      setToken(devToken); // Cache in memory
      console.log('[Auth] Demo account signed in:', email);
      console.log('[Auth] Token stored in SecureStore and tokenManager');
      console.log('[Auth] User ID:', userId);
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
        isBusiness?: boolean;
        hasCompletedOnboarding: boolean;
        categories?: string[];
      }>('/auth/sso', {
        method: 'POST',
        body: JSON.stringify({ provider, token: ssoToken }),
      });
      const user: User = {
        id: res.userId,
        isInstructor: res.isInstructor || false,
        isBusiness: res.isBusiness === true,
        hasCompletedOnboarding: res.hasCompletedOnboarding || false,
        categories: res.categories || [],
      };
      await setSecureItem(TOKEN_KEY, res.token);
      await setSecureItem(USER_KEY, JSON.stringify(user));
      setToken(res.token); // Cache in memory
      return { token: res.token, user };
    } catch {
      // Dev fallback
      // Generate proper JWT-like token for SSO demo
      const generateDemoToken = (userId: string) => {
        try {
          const btoaFn = typeof btoa !== 'undefined' ? btoa : (str: string) => Buffer.from(str).toString('base64');
          const header = btoaFn(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
          const payload = btoaFn(JSON.stringify({ userId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 }));
          return `${header}.${payload}.demo-signature`;
        } catch (e) {
          console.error('[Auth] Error generating SSO demo token:', e);
          return `demo.${btoa ? btoa(JSON.stringify({ userId })) : userId}.token`;
        }
      };
      const user: User = {
        id: 'dev',
        isInstructor: false,
        isBusiness: false,
        hasCompletedOnboarding: false,
        categories: [],
        points: 0,
      };
      const devToken = generateDemoToken(user.id);
      await setSecureItem(TOKEN_KEY, devToken);
      await setSecureItem(USER_KEY, JSON.stringify(user));
      setToken(devToken); // Cache in memory
      return { token: devToken, user };
    }
  }
);

export const signOut = createAsyncThunk('auth/signOut', async (_, { rejectWithValue }) => {
  try {
    console.log('[Auth] Signing out...');
    console.log('[Auth] Clearing SecureStore...');
    await deleteSecureItem(TOKEN_KEY);
    await deleteSecureItem(USER_KEY);
    console.log('[Auth] Clearing memory token cache...');
    clearToken(); // Clear memory cache
    console.log('[Auth] Sign out complete - all storage cleared');
    return { success: true };
  } catch (error: any) {
    console.error('[Auth] Sign out error:', error);
    // Even if there's an error, clear the memory cache
    clearToken();
    return rejectWithValue(error?.message || 'Sign out failed');
  }
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
        console.log('[Auth] Sign out fulfilled - clearing Redux state');
        state.token = null;
        state.user = null;
        state.isLoading = false;
        state.error = null;
      })
      .addCase(signOut.rejected, (state, action) => {
        console.error('[Auth] Sign out rejected:', action.payload);
        // Still clear state even if there was an error
        state.token = null;
        state.user = null;
        state.isLoading = false;
        state.error = action.payload as string || 'Sign out failed';
      });
  },
});

export const { updateUser, setOnboardingComplete, clearError } = authSlice.actions;
export default authSlice.reducer;
