import { useAppDispatch, useAppSelector } from './store';
import {
  signIn,
  signUp,
  verifyEmail,
  signInWithSSO,
  signOut,
  hydrateAuth,
  refreshProfile,
  updateUser,
  setOnboardingComplete,
  markSignupOnboardingRequired,
  clearError,
} from './slices/authSlice';
import type { User } from './slices/authSlice';

export const useAuth = () => {
  const dispatch = useAppDispatch();
  const { user, token, hydrated, isLoading, error } = useAppSelector((state) => state.auth);

  return {
    user,
    token,
    hydrated,
    isLoading,
    error,
    signUp: (email: string, password: string, username?: string) =>
      dispatch(signUp({ email, password, username })),
    verifyEmail: (email: string, code: string) => dispatch(verifyEmail({ email, code })),
    signIn: (email: string, password: string) => dispatch(signIn({ email, password })),
    signInWithSSO: (payload: {
      provider: 'google' | 'facebook' | 'apple';
      idToken?: string;
      accessToken?: string;
    }) => dispatch(signInWithSSO(payload)),
    signOut: () => dispatch(signOut()),
    hydrate: () => dispatch(hydrateAuth()),
    refreshProfile: (opts?: { stats?: boolean }) => dispatch(refreshProfile(opts)),
    updateUser: (updates: Partial<User>) => dispatch(updateUser(updates)),
    setOnboardingComplete: (categories: string[]) => dispatch(setOnboardingComplete(categories)),
    markSignupOnboardingRequired: () => dispatch(markSignupOnboardingRequired()),
    clearError: () => dispatch(clearError()),
  };
};

export { useAppDispatch, useAppSelector };
