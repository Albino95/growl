/** Auth-only canned copy — never use these for feed/media/generic APIs. */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  USER_EXISTS: 'An account with this email already exists. Sign in instead.',
  INVALID_CREDENTIALS: 'Invalid email or password.',
  EMAIL_NOT_VERIFIED: 'Confirm your email before signing in. Enter the code we sent you.',
  CODE_EXPIRED: 'This verification code expired after 24 hours. Sign up again.',
  SIGNUP_EXPIRED: 'This signup expired after 24 hours. Create your account again.',
  WEAK_PASSWORD: 'Password does not meet security requirements.',
  EMAIL_SEND_FAILED: 'Could not send verification email. Try again later.',
  AUTH_TEMPORARILY_UNAVAILABLE: 'Account creation is temporarily unavailable. Please try again shortly.',
  AUTH_MISCONFIGURED: 'Sign-in is temporarily unavailable. Please try again shortly.',
  SSO_ERROR: 'Sign-in with Google or Facebook failed. Try again.',
};

/** Shared product copy for non-auth failures. */
const APP_ERROR_MESSAGES: Record<string, string> = {
  MEDIA_NOT_CONFIGURED: 'Media upload is not configured yet. Please contact support.',
  PAYLOAD_TOO_LARGE: 'File is too large. Please choose a smaller video or image.',
  METHOD_NOT_ALLOWED: 'Invalid request. Please update the app.',
  RATE_LIMITED: 'Too many uploads. Try again in a bit.',
  UNAUTHORIZED: 'Please sign in again to continue.',
  INVALID_JSON: 'Upload failed — please try again.',
  DATABASE_ERROR: 'Something went wrong saving. Please try again.',
};

type ApiErrorShape = {
  code?: string;
  message?: string;
  details?: unknown;
};

function firstZodDetail(details: unknown): string | null {
  if (!Array.isArray(details) || details.length === 0) return null;
  const first = details[0] as { message?: string; path?: Array<string | number> };
  if (first?.message && typeof first.message === 'string') {
    const path = Array.isArray(first.path) && first.path.length ? `${first.path.join('.')}: ` : '';
    return `${path}${first.message}`;
  }
  return null;
}

export function messageFromApiError(data: unknown, httpStatus?: number): string {
  if (data && typeof data === 'object') {
    const err = (data as { error?: ApiErrorShape }).error;
    const code = err?.code;

    if (code && AUTH_ERROR_MESSAGES[code]) {
      return AUTH_ERROR_MESSAGES[code];
    }

    // Prefer specific Zod field messages over generic validation text
    if (code === 'VALIDATION_ERROR') {
      const detail = firstZodDetail(err?.details);
      if (detail) return detail;
      if (err?.message && err.message !== 'Invalid request data') return err.message;
      return 'Some details look invalid. Check your media and try again.';
    }

    if (err?.message && typeof err.message === 'string' && err.message.trim()) {
      return err.message;
    }

    if (code && APP_ERROR_MESSAGES[code]) {
      return APP_ERROR_MESSAGES[code];
    }
  }

  if (httpStatus === 409) return AUTH_ERROR_MESSAGES.USER_EXISTS;
  if (httpStatus === 401) return AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS;
  if (httpStatus === 403) return AUTH_ERROR_MESSAGES.EMAIL_NOT_VERIFIED;
  if (httpStatus === 410) return AUTH_ERROR_MESSAGES.SIGNUP_EXPIRED;
  if (httpStatus === 413) return APP_ERROR_MESSAGES.PAYLOAD_TOO_LARGE;

  return `Request failed${httpStatus ? ` (${httpStatus})` : ''}`;
}

export function errorCodeFromApi(data: unknown): string | undefined {
  if (data && typeof data === 'object') {
    const code = (data as { error?: { code?: string } }).error?.code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}
