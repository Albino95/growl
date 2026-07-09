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
  decayTimer?: number;
};

type State = {
  user: User | null;
  token: string | null;
  hydrated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithSSO: (provider: 'google' | 'facebook' | 'apple', token: string) => Promise<void>;
  signOut: () => Promise<void>;
  hydrate: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  setOnboardingComplete: (categories: string[]) => void;
};

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'user_data';

async function hashPassword(password: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, password);
}

/**
 * @deprecated Legacy Zustand auth store — use Redux `useAuth()` instead.
 * Dev bypass removed for store compliance; failures propagate to callers.
 */
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
  },
  signInWithSSO: async (provider, ssoToken) => {
    const res = await request<{
      token: string;
      userId: string;
      isInstructor: boolean;
      hasCompletedOnboarding: boolean;
      categories?: string[];
    }>('/auth/sso', {
      method: 'POST',
      body: JSON.stringify({
        provider,
        ...(provider === 'facebook' ? { accessToken: ssoToken } : { idToken: ssoToken }),
      }),
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
