/**
 * Apple App Review + demo account protection.
 * Admin enforcement must never target these emails while review is active.
 */

const PROTECTED_EMAILS = new Set(
  [
    'review@growl.app',
    'demo@growl.app',
    'instructor@growl.app',
    'business@growl.app',
  ].map((e) => e.toLowerCase())
);

export function isProtectedReviewEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return PROTECTED_EMAILS.has(email.trim().toLowerCase());
}

export function protectedReviewEmailsList(): string[] {
  return [...PROTECTED_EMAILS];
}
