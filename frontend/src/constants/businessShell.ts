import type { User } from '../store/slices/authSlice';

/**
 * Emails that open the business app shell when `user.isBusiness` is missing from cached storage.
 * Prefer `isBusiness` from the sign-in API; extend this set for extra demo accounts only.
 */
export const BUSINESS_SHELL_FALLBACK_EMAILS = new Set<string>(['business@growl.app']);

export function shouldShowBusinessShell(user: User | null): boolean {
  if (!user) return false;
  if (user.isBusiness) return true;
  const e = user.email?.trim().toLowerCase();
  return !!e && BUSINESS_SHELL_FALLBACK_EMAILS.has(e);
}
