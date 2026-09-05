import { Env } from '../types';
import { json, error } from '../utils/response';
import {
  validateRequest,
  signUpSchema,
  signInSchema,
  ssoSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  refreshTokenSchema,
} from '../utils/validation';
import {
  hashPassword,
  verifyPassword,
  hashClientSecret,
  generateVerificationToken,
  hashVerificationToken,
} from '../utils/password';
import { getRequestContext, userAuthPayload } from '../utils/auth';
import { generateId } from '../utils/id';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/email';
import { verifyAppleIdToken } from '../utils/appleAuth';
import { checkRateLimit, clientIp } from '../utils/rateLimit';
import {
  issueSessionTokens,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
} from '../utils/sessions';

async function sessionResponse(user: Parameters<typeof userAuthPayload>[0], env: Env) {
  const base = userAuthPayload(user);
  const tokens = await issueSessionTokens(env, user.id);
  return json({
    ...base,
    token: tokens.token,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
  });
}

async function rateLimitOrError(
  request: Request,
  env: Env,
  action: string,
  limit: number,
  windowSeconds: number
): Promise<Response | null> {
  const ip = clientIp(request);
  const { allowed } = await checkRateLimit(env, `${action}:${ip}`, limit, windowSeconds);
  if (!allowed) {
    return error('RATE_LIMITED', 'Too many requests. Try again later.', 429);
  }
  return null;
}

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

function isVerificationExpired(expiresAt?: string | null): boolean {
  if (!expiresAt) return true;
  const expires = new Date(expiresAt).getTime();
  return Number.isNaN(expires) || expires < Date.now();
}

async function deleteUnverifiedUser(env: Env, userId: string): Promise<void> {
  await env.DB.prepare('DELETE FROM users WHERE id = ? AND COALESCE(email_verified, 0) = 0')
    .bind(userId)
    .run();
}

function pendingVerificationPayload(
  env: Env,
  email: string,
  verifyToken: string,
  expiresAt: string
) {
  return {
    requiresEmailVerification: true as const,
    email,
    expiresAt,
    message:
      'Check your email for a verification code, then confirm before signing in. Your pending account is kept for 24 hours.',
    ...(env.ENVIRONMENT === 'development' || env.ENVIRONMENT === 'qa'
      ? { devVerificationCode: verifyToken }
      : {}),
  };
}

async function sendPendingVerification(
  env: Env,
  to: string,
  verifyToken: string
): Promise<Response | null> {
  try {
    await sendVerificationEmail(env, to, verifyToken);
    return null;
  } catch (mailErr) {
    console.error('[auth] Email send failed:', mailErr);
    if (env.ENVIRONMENT === 'production') {
      return error('EMAIL_SEND_FAILED', 'Could not send verification email. Try again later.', 503);
    }
    return null;
  }
}

/**
 * POST /api/v1/auth/sign-up
 * Register — does not return a session until email is verified.
 * Pending (unverified) accounts are kept for 24 hours so the user can come back
 * and enter the code. After expiry they are deleted and the email can sign up again.
 */
export async function signUp(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return error('METHOD_NOT_ALLOWED', 'Use POST', 405);
  }

  const limited = await rateLimitOrError(request, env, 'signup', 10, 3600);
  if (limited) return limited;

  try {
    const validation = await validateRequest(request, signUpSchema);
    if (!validation.success) return validation.response;

    const { email, password, passwordHash, username } = validation.data;
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await env.DB.prepare(
      `SELECT id, email_verified, email_verification_expires_at FROM users WHERE email = ?`
    )
      .bind(normalizedEmail)
      .first<{
        id: string;
        email_verified: number | null;
        email_verification_expires_at: string | null;
      }>();

    const credentialSecret = passwordHash || password;
    if (!credentialSecret) {
      return error('VALIDATION_ERROR', 'Password is required', 400);
    }

    if (existingUser) {
      if (existingUser.email_verified) {
        return error('USER_EXISTS', 'User with this email already exists', 409);
      }

      if (isVerificationExpired(existingUser.email_verification_expires_at)) {
        await deleteUnverifiedUser(env, existingUser.id);
      } else {
        const passwordHashToStore = await hashPassword(credentialSecret);
        const verifyToken = generateVerificationToken();
        const tokenHash = await hashVerificationToken(verifyToken);
        const expiresAt = existingUser.email_verification_expires_at as string;
        await env.DB.prepare(
          `UPDATE users SET password_hash = ?, email_verification_token_hash = ?,
           updated_at = datetime('now') WHERE id = ? AND COALESCE(email_verified, 0) = 0`
        )
          .bind(passwordHashToStore, tokenHash, existingUser.id)
          .run();

        const mailError = await sendPendingVerification(env, normalizedEmail, verifyToken);
        if (mailError) return mailError;

        return json(pendingVerificationPayload(env, normalizedEmail, verifyToken, expiresAt), 201);
      }
    }

    const passwordHashToStore = await hashPassword(credentialSecret);
    const userId = generateId('user');
    const verifyToken = generateVerificationToken();
    const tokenHash = await hashVerificationToken(verifyToken);
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS).toISOString();

    const metadata = {
      username: username || normalizedEmail.split('@')[0],
      categories: [],
      engagementHistory: [],
      instructorVotes: [],
      purchaseHistory: [],
      timePreferences: [],
      blockedUsers: [],
      mutedUsers: [],
    };

    await env.DB.prepare(
      `INSERT INTO users (
        id, email, password_hash, points, is_instructor, is_business, metadata,
        email_verified, email_verification_token_hash, email_verification_expires_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, 0, 0, 0, ?, 0, ?, ?, datetime('now'), datetime('now'))`
    )
      .bind(
        userId,
        normalizedEmail,
        passwordHashToStore,
        JSON.stringify(metadata),
        tokenHash,
        expiresAt
      )
      .run();

    const mailError = await sendPendingVerification(env, normalizedEmail, verifyToken);
    if (mailError) return mailError;

    return json(pendingVerificationPayload(env, normalizedEmail, verifyToken, expiresAt), 201);
  } catch (err: unknown) {
    console.error('[signUp] Error:', err);
    if (
      err instanceof Error &&
      /pbkdf2|iteration|not supported|notsupported/i.test(err.message)
    ) {
      return error(
        'AUTH_TEMPORARILY_UNAVAILABLE',
        'Account creation is temporarily unavailable. Please try again shortly.',
        503
      );
    }
    return error('DATABASE_ERROR', 'Failed to create user', 500);
  }
}

/**
 * POST /api/v1/auth/verify-email
 */
export async function verifyEmail(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return error('METHOD_NOT_ALLOWED', 'Use POST', 405);
  }

  const validation = await validateRequest(request, verifyEmailSchema);
  if (!validation.success) return validation.response;

  const { email, code } = validation.data;
  const normalizedEmail = email.trim().toLowerCase();
  const tokenHash = await hashVerificationToken(code.trim().replace(/\s/g, ''));

  const user = await env.DB.prepare(
    `SELECT * FROM users WHERE email = ? AND email_verification_token_hash = ?`
  )
    .bind(normalizedEmail, tokenHash)
    .first<{
      id: string;
      email_verification_expires_at: string;
      email_verified: number;
    } & Record<string, unknown>>();

  if (!user) {
    return error('INVALID_CODE', 'Invalid verification code', 400);
  }

  if (user.email_verified) {
    return json({ verified: true, message: 'Email already verified' });
  }

  const expires = new Date(user.email_verification_expires_at).getTime();
  if (Number.isNaN(expires) || expires < Date.now()) {
    await deleteUnverifiedUser(env, user.id);
    return error(
      'CODE_EXPIRED',
      'This verification code expired after 24 hours. Sign up again to create your account.',
      400
    );
  }

  await env.DB.prepare(
    `UPDATE users SET email_verified = 1, email_verification_token_hash = NULL,
     email_verification_expires_at = NULL, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(user.id)
    .run();

  return json({ verified: true, message: 'Email verified. You can sign in now.' });
}

/**
 * POST /api/v1/auth/resend-verification
 * Rotates the code on a pending account without extending the original 24h window.
 */
export async function resendVerification(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return error('METHOD_NOT_ALLOWED', 'Use POST', 405);
  }

  const limited = await rateLimitOrError(request, env, 'resend-verification', 8, 3600);
  if (limited) return limited;

  const validation = await validateRequest(request, resendVerificationSchema);
  if (!validation.success) return validation.response;

  const normalizedEmail = validation.data.email.trim().toLowerCase();
  const user = await env.DB.prepare(
    `SELECT id, email_verified, email_verification_expires_at FROM users WHERE email = ?`
  )
    .bind(normalizedEmail)
    .first<{
      id: string;
      email_verified: number | null;
      email_verification_expires_at: string | null;
    }>();

  if (!user || user.email_verified) {
    return json({
      sent: true,
      message: 'If this email is waiting for verification, we sent a new code.',
    });
  }

  if (isVerificationExpired(user.email_verification_expires_at)) {
    await deleteUnverifiedUser(env, user.id);
    return error(
      'CODE_EXPIRED',
      'This signup expired after 24 hours. Sign up again to create your account.',
      400
    );
  }

  const verifyToken = generateVerificationToken();
  const tokenHash = await hashVerificationToken(verifyToken);
  const expiresAt = user.email_verification_expires_at as string;
  await env.DB.prepare(
    `UPDATE users SET email_verification_token_hash = ?, updated_at = datetime('now')
     WHERE id = ? AND COALESCE(email_verified, 0) = 0`
  )
    .bind(tokenHash, user.id)
    .run();

  const mailError = await sendPendingVerification(env, normalizedEmail, verifyToken);
  if (mailError) return mailError;

  return json(pendingVerificationPayload(env, normalizedEmail, verifyToken, expiresAt));
}

/**
 * POST /api/v1/auth/sign-in
 */
export async function signIn(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return error('METHOD_NOT_ALLOWED', 'Use POST', 405);
  }

  const limited = await rateLimitOrError(request, env, 'signin', 30, 900);
  if (limited) return limited;

  try {
    const validation = await validateRequest(request, signInSchema);
    if (!validation.success) return validation.response;

    const { email, password, passwordHash } = validation.data;
    const normalizedEmail = email.trim().toLowerCase();

    const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?')
      .bind(normalizedEmail)
      .first<{
        id: string;
        email: string;
        password_hash: string;
        points: number;
        is_instructor: number;
        is_business: number;
        metadata: string;
        email_verified?: number;
        email_verification_expires_at?: string | null;
      }>();

    if (!user) {
      return error('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    const secrets = new Set<string>();
    if (passwordHash) secrets.add(passwordHash);
    if (password) {
      secrets.add(password);
      secrets.add(await hashClientSecret(password));
    }

    let isValid = false;
    for (const secret of secrets) {
      if (await verifyPassword(secret, user.password_hash)) {
        isValid = true;
        break;
      }
    }

    if (!isValid) {
      return error('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    if (!user.email_verified) {
      if (isVerificationExpired(user.email_verification_expires_at)) {
        await deleteUnverifiedUser(env, user.id);
        return error(
          'SIGNUP_EXPIRED',
          'This signup expired after 24 hours. Create your account again.',
          410
        );
      }
      return error(
        'EMAIL_NOT_VERIFIED',
        'Confirm your email before signing in. Check your inbox for the verification code.',
        403
      );
    }

    return sessionResponse(user as unknown as Parameters<typeof userAuthPayload>[0], env);
  } catch (err) {
    console.error('[signIn] Error:', err);
    if (err instanceof Error && /JWT_SECRET/.test(err.message)) {
      return error('AUTH_MISCONFIGURED', 'Authentication is not configured', 503);
    }
    return error('INTERNAL_ERROR', 'An error occurred during sign in', 500);
  }
}

export async function signOut(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as { refreshToken?: string };
    if (body.refreshToken) {
      await revokeRefreshToken(env, body.refreshToken);
    } else {
      const ctx = await getRequestContext(request, env);
      if (ctx.userId) {
        await revokeAllUserRefreshTokens(env, ctx.userId);
      }
    }
  } catch (err) {
    console.error('[signOut] Error:', err);
  }
  return json({ message: 'Signed out successfully' });
}

async function verifyGoogleIdToken(idToken: string, env: Env): Promise<{ email: string; name?: string }> {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!res.ok) throw new Error('Invalid Google token');
  const data = (await res.json()) as { email?: string; name?: string; aud?: string };
  if (!data.email) throw new Error('Google account has no email');
  if (env.GOOGLE_CLIENT_ID && data.aud && data.aud !== env.GOOGLE_CLIENT_ID) {
    throw new Error('Google token audience mismatch');
  }
  return { email: data.email.toLowerCase(), name: data.name };
}

async function verifyFacebookAccessToken(
  accessToken: string,
  env: Env
): Promise<{ email: string; name?: string }> {
  const res = await fetch(
    `https://graph.facebook.com/me?fields=email,name&access_token=${encodeURIComponent(accessToken)}`
  );
  if (!res.ok) throw new Error('Invalid Facebook token');
  const data = (await res.json()) as { email?: string; name?: string; error?: { message: string }; id?: string };
  if (data.error) throw new Error(data.error.message);
  if (!data.email) throw new Error('Facebook account must share email to use Growl');

  if (env.FACEBOOK_APP_ID) {
    const dbg = await fetch(
      `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(accessToken)}`
    );
    if (dbg.ok) {
      const info = (await dbg.json()) as { data?: { app_id?: string; is_valid?: boolean } };
      if (info.data?.app_id && info.data.app_id !== env.FACEBOOK_APP_ID) {
        throw new Error('Facebook token audience mismatch');
      }
      if (info.data && info.data.is_valid === false) {
        throw new Error('Facebook token invalid');
      }
    }
  }

  return { email: data.email.toLowerCase(), name: data.name };
}

/**
 * POST /api/v1/auth/sso
 */
export async function signInWithSSO(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return error('METHOD_NOT_ALLOWED', 'Use POST', 405);
  }

  const limited = await rateLimitOrError(request, env, 'sso', 30, 900);
  if (limited) return limited;

  try {
    const validation = await validateRequest(request, ssoSchema);
    if (!validation.success) return validation.response;

    const { provider, idToken, accessToken } = validation.data;

    let email: string;
    let username: string | undefined;

    if (provider === 'google') {
      if (!idToken) return error('VALIDATION_ERROR', 'idToken required for Google', 400);
      const profile = await verifyGoogleIdToken(idToken, env);
      email = profile.email;
      username = profile.name;
    } else if (provider === 'apple') {
      if (!idToken) return error('VALIDATION_ERROR', 'idToken required for Apple', 400);
      const profile = await verifyAppleIdToken(idToken, env);
      email = profile.email;
      username = profile.email.split('@')[0];
    } else {
      if (!accessToken) return error('VALIDATION_ERROR', 'accessToken required for Facebook', 400);
      const profile = await verifyFacebookAccessToken(accessToken, env);
      email = profile.email;
      username = profile.name;
    }

    let user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();

    if (!user) {
      const userId = generateId('user');
      const metadata = {
        username: username || email.split('@')[0],
        categories: [],
        ssoProvider: provider,
      };
      const placeholderHash = await hashPassword(crypto.randomUUID());

      await env.DB.prepare(
        `INSERT INTO users (
          id, email, password_hash, points, is_instructor, is_business, metadata,
          email_verified, created_at, updated_at
        ) VALUES (?, ?, ?, 0, 0, 0, ?, 1, datetime('now'), datetime('now'))`
      )
        .bind(userId, email, placeholderHash, JSON.stringify(metadata))
        .run();

      user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<UserRow>();
    } else if (!user.email_verified) {
      await env.DB.prepare(
        'UPDATE users SET email_verified = 1, updated_at = datetime("now") WHERE id = ?'
      )
        .bind(user.id)
        .run();
      user.email_verified = 1;
    }

    if (!user) {
      return error('SSO_ERROR', 'Failed to create or find user', 500);
    }

    return sessionResponse(user, env);
  } catch (err: unknown) {
    console.error('[signInWithSSO] Error:', err);
    const msg = err instanceof Error ? err.message : 'SSO sign in failed';
    return error('SSO_ERROR', msg, 401);
  }
}

type UserRow = Parameters<typeof userAuthPayload>[0] & { email_verified?: number };

/**
 * POST /api/v1/auth/refresh
 */
export async function refresh(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return error('METHOD_NOT_ALLOWED', 'Use POST', 405);
  }

  const validation = await validateRequest(request, refreshTokenSchema);
  if (!validation.success) return validation.response;

  const rotated = await rotateRefreshToken(env, validation.data.refreshToken);
  if (!rotated) {
    return error('INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired', 401);
  }

  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(rotated.userId)
    .first<UserRow>();

  if (!user) {
    return error('INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired', 401);
  }

  const base = userAuthPayload(user);
  return json({
    ...base,
    token: rotated.token,
    refreshToken: rotated.refreshToken,
    expiresIn: rotated.expiresIn,
  });
}

/**
 * POST /api/v1/auth/forgot-password
 * Always returns success to avoid email enumeration.
 */
export async function forgotPassword(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return error('METHOD_NOT_ALLOWED', 'Use POST', 405);
  }

  const limited = await rateLimitOrError(request, env, 'forgot', 5, 3600);
  if (limited) return limited;

  const validation = await validateRequest(request, forgotPasswordSchema);
  if (!validation.success) return validation.response;

  const normalizedEmail = validation.data.email.trim().toLowerCase();
  const generic = {
    message: 'If an account exists for that email, a reset code has been sent.',
  };

  const user = await env.DB.prepare('SELECT id, email_verified FROM users WHERE email = ?')
    .bind(normalizedEmail)
    .first<{ id: string; email_verified: number }>();

  if (!user || !user.email_verified) {
    return json(generic);
  }

  const resetCode = generateVerificationToken();
  const tokenHash = await hashVerificationToken(resetCode);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    `UPDATE users SET password_reset_token_hash = ?, password_reset_expires_at = ?,
     updated_at = datetime('now') WHERE id = ?`
  )
    .bind(tokenHash, expiresAt, user.id)
    .run();

  try {
    await sendPasswordResetEmail(env, normalizedEmail, resetCode);
  } catch (mailErr) {
    console.error('[forgotPassword] Email send failed:', mailErr);
    if (env.ENVIRONMENT === 'production') {
      return error('EMAIL_SEND_FAILED', 'Could not send reset email. Try again later.', 503);
    }
  }

  return json({
    ...generic,
    ...((env.ENVIRONMENT === 'development' || env.ENVIRONMENT === 'qa') && {
      devResetCode: resetCode,
    }),
  });
}

/**
 * POST /api/v1/auth/reset-password
 */
export async function resetPassword(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return error('METHOD_NOT_ALLOWED', 'Use POST', 405);
  }

  const limited = await rateLimitOrError(request, env, 'reset', 10, 3600);
  if (limited) return limited;

  const validation = await validateRequest(request, resetPasswordSchema);
  if (!validation.success) return validation.response;

  const { email, code, password, passwordHash } = validation.data;
  const normalizedEmail = email.trim().toLowerCase();
  const tokenHash = await hashVerificationToken(code.trim().replace(/\s/g, ''));

  const user = await env.DB.prepare(
    `SELECT id, password_reset_expires_at FROM users
     WHERE email = ? AND password_reset_token_hash = ?`
  )
    .bind(normalizedEmail, tokenHash)
    .first<{ id: string; password_reset_expires_at: string }>();

  if (!user) {
    return error('INVALID_CODE', 'Invalid or expired reset code', 400);
  }

  const expires = new Date(user.password_reset_expires_at).getTime();
  if (Number.isNaN(expires) || expires < Date.now()) {
    return error('CODE_EXPIRED', 'Reset code expired. Request a new one.', 400);
  }

  const credentialSecret = passwordHash || password;
  if (!credentialSecret) {
    return error('VALIDATION_ERROR', 'Password is required', 400);
  }

  const passwordHashToStore = await hashPassword(credentialSecret);

  await env.DB.prepare(
    `UPDATE users SET password_hash = ?, password_reset_token_hash = NULL,
     password_reset_expires_at = NULL, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(passwordHashToStore, user.id)
    .run();

  await revokeAllUserRefreshTokens(env, user.id);

  return json({ message: 'Password updated. You can sign in with your new password.' });
}
