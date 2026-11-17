import { useMemo } from 'react';
import { shallowEqual } from 'react-redux';
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
  // Pick only these fields (shallow-compared) so unrelated auth changes don't
  // re-render every screen that uses this hook.
  const { user, token, hydrated, isLoading, error } = useAppSelector(
    (state) => ({
      user: state.auth.user,
      token: state.auth.token,
      hydrated: state.auth.hydrated,
      isLoading: state.auth.isLoading,
      error: state.auth.error,
    }),
    shallowEqual
  );

  // Stable action helpers: same function identities across renders.
  const actions = useMemo(
    () => ({
      signUp: (email: string, password: string, username?: string, inviteCode?: string) =>
        dispatch(
          signUp({
            email,
            password,
            username,
            ...(inviteCode ? { invite_code: inviteCode } : {}),
          })
        ),
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
    }),
    [dispatch]
  );

  return { user, token, hydrated, isLoading, error, ...actions };
};

export { useAppDispatch, useAppSelector };
