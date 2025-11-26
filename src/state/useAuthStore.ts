import { create } from 'zustand';
import { getSecureItem, setSecureItem, deleteSecureItem } from '../services/storage/secureStore';
import { request } from '../services/api/http';
import * as Crypto from 'expo-crypto';

type User = { 
  id: string; 
  email?: string; 
  isInstructor?: boolean;
  categories?: string[];
  hasCompletedOnboarding?: boolean;
  points?: number;
};

type State = {
  user: User | null;
  token: string | null;
  hydrated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithSSO: (provider: 'google' | 'facebook', token: string) => Promise<void>;
  signOut: () => Promise<void>;
  hydrate: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  setOnboardingComplete: (categories: string[]) => void;
};

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'user_data';

// Hash password client-side before sending (additional security layer)
async function hashPassword(password: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, password);
}

export const useAuthStore = create<State>((set, get) => ({
  user: null,
  token: null,
  hydrated: false,
  hydrate: async () => {
    try {
      const token = await getSecureItem(TOKEN_KEY);
      const userData = await getSecureItem(USER_KEY);
      if (token) {
        const user = userData ? JSON.parse(userData) : { id: 'me' };
        set({ token, user });
      }
    } catch (error) {
      console.error('Hydration error:', error);
    } finally {
      set({ hydrated: true });
    }
  },
  signIn: async (email, password) => {
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
      const user = { 
        id: res.userId, 
        email,
        isInstructor: res.isInstructor || false,
        hasCompletedOnboarding: res.hasCompletedOnboarding || false,
        categories: res.categories || [],
      };
      set({ token: res.token, user });
      await setSecureItem(TOKEN_KEY, res.token);
      await setSecureItem(USER_KEY, JSON.stringify(user));
    } catch {
      // Dev fallback
      const devToken = 'dev-token';
      const user = { 
        id: 'dev', 
        email,
        isInstructor: false,
        hasCompletedOnboarding: false,
        categories: [],
        points: 0,
      };
      set({ token: devToken, user });
      await setSecureItem(TOKEN_KEY, devToken);
      await setSecureItem(USER_KEY, JSON.stringify(user));
    }
  },
  signInWithSSO: async (provider, ssoToken) => {
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
      const user = { 
        id: res.userId, 
        isInstructor: res.isInstructor || false,
        hasCompletedOnboarding: res.hasCompletedOnboarding || false,
        categories: res.categories || [],
      };
      set({ token: res.token, user });
      await setSecureItem(TOKEN_KEY, res.token);
      await setSecureItem(USER_KEY, JSON.stringify(user));
    } catch {
      // Dev fallback
      const devToken = 'dev-token';
      const user = { 
        id: 'dev', 
        isInstructor: false,
        hasCompletedOnboarding: false,
        categories: [],
        points: 0,
      };
      set({ token: devToken, user });
      await setSecureItem(TOKEN_KEY, devToken);
      await setSecureItem(USER_KEY, JSON.stringify(user));
    }
  },
  signOut: async () => {
    await deleteSecureItem(TOKEN_KEY);
    await deleteSecureItem(USER_KEY);
    set({ token: null, user: null });
  },
  updateUser: (updates) => {
    const currentUser = get().user;
    if (currentUser) {
      const updatedUser = { ...currentUser, ...updates };
      set({ user: updatedUser });
      setSecureItem(USER_KEY, JSON.stringify(updatedUser));
    }
  },
  setOnboardingComplete: (categories) => {
    const currentUser = get().user;
    if (currentUser) {
      const updatedUser = { 
        ...currentUser, 
        categories,
        hasCompletedOnboarding: true,
      };
      set({ user: updatedUser });
      setSecureItem(USER_KEY, JSON.stringify(updatedUser));
    }
  },
}));
