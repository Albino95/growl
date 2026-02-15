/**
 * Redux hooks and selectors
 * Provides convenient hooks for accessing Redux state
 */

import { useAppDispatch, useAppSelector } from './store';
import { signIn, signInWithSSO, signOut, hydrateAuth, updateUser, setOnboardingComplete } from './slices/authSlice';
import type { User } from './slices/authSlice';

/**
 * Auth hooks - provides Zustand-like API for easier migration
 */
export const useAuth = () => {
  const dispatch = useAppDispatch();
  const { user, token, hydrated, isLoading, error } = useAppSelector((state) => state.auth);

  return {
    user,
    token,
    hydrated,
    isLoading,
    error,
    signIn: (email: string, password: string) => dispatch(signIn({ email, password })),
    signInWithSSO: (provider: 'google' | 'facebook', ssoToken: string) =>
      dispatch(signInWithSSO({ provider, token: ssoToken })),
    signOut: () => dispatch(signOut()),
    hydrate: () => dispatch(hydrateAuth()),
    updateUser: (updates: Partial<User>) => dispatch(updateUser(updates)),
    setOnboardingComplete: (categories: string[]) => dispatch(setOnboardingComplete(categories)),
  };
};

// Re-export Redux hooks for convenience
export { useAppDispatch, useAppSelector };
