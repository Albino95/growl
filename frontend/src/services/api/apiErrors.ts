/** Map backend error codes to user-facing copy */
const ERROR_MESSAGES: Record<string, string> = {
  USER_EXISTS: 'An account with this email already exists. Sign in instead.',
  INVALID_CREDENTIALS: 'Invalid email or password.',
  EMAIL_NOT_VERIFIED: 'Confirm your email before signing in. Check your inbox for the code.',
  VALIDATION_ERROR: 'Please check your email and password.',
  WEAK_PASSWORD: 'Password does not meet security requirements.',
  EMAIL_SEND_FAILED: 'Could not send verification email. Try again later.',
  AUTH_TEMPORARILY_UNAVAILABLE: 'Account creation is temporarily unavailable. Please try again shortly.',
  AUTH_MISCONFIGURED: 'Sign-in is temporarily unavailable. Please try again shortly.',
  DATABASE_ERROR: 'We could not create your account right now. Please try again in a minute.',
  MEDIA_NOT_CONFIGURED: 'Image upload is not configured yet. Please contact support.',
  PAYLOAD_TOO_LARGE: 'Image is too large. Please choose a smaller file.',
  SSO_ERROR: 'Sign-in with Google or Facebook failed. Try again.',
  METHOD_NOT_ALLOWED: 'Invalid request. Please update the app.',
};

export function messageFromApiError(data: unknown, httpStatus?: number): string {
  if (data && typeof data === 'object') {
    const err = (data as { error?: { code?: string; message?: string } }).error;
    if (err?.code && ERROR_MESSAGES[err.code]) {
      return ERROR_MESSAGES[err.code];
    }
    if (err?.message && typeof err.message === 'string') {
      return err.message;
    }
  }
  if (httpStatus === 409) {
    return ERROR_MESSAGES.USER_EXISTS;
  }
  if (httpStatus === 401) {
    return ERROR_MESSAGES.INVALID_CREDENTIALS;
  }
  if (httpStatus === 403) {
    return ERROR_MESSAGES.EMAIL_NOT_VERIFIED;
  }
  return `Request failed${httpStatus ? ` (${httpStatus})` : ''}`;
}

export function errorCodeFromApi(data: unknown): string | undefined {
  if (data && typeof data === 'object') {
    const code = (data as { error?: { code?: string } }).error?.code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}
