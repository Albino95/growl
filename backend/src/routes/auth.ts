import { Env } from '../types';
import { json, error } from '../utils/response';
import {
  validateRequest,
  signUpSchema,
  signInSchema,
  ssoSchema,
  verifyEmailSchema,
} from '../utils/validation';
import {
  hashPassword,
  verifyPassword,
  hashClientSecret,
  generateVerificationToken,
  hashVerificationToken,
} from '../utils/password';
import { signAccessToken } from '../utils/jwt';
import { getRequestContext, userAuthPayload } from '../utils/auth';
import { generateId } from '../utils/id';
import { sendVerificationEmail } from '../utils/email';

function sessionResponse(user: Parameters<typeof userAuthPayload>[0], env: Env) {
  const base = userAuthPayload(user);
  return signAccessToken(user.id, env).then((token) =>
    json({
      ...base,
      token,
    })
  );
}

/**
 * POST /api/v1/auth/sign-up
 * Register — does not return a session until email is verified.
 */
export async function signUp(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return error('METHOD_NOT_ALLOWED', 'Use POST', 405);
  }

  try {
    const validation = await validateRequest(request, signUpSchema);
    if (!validation.success) return validation.response;

    const { email, password, passwordHash, username } = validation.data;
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
      .bind(normalizedEmail)
      .first();

    if (existingUser) {
      return error('USER_EXISTS', 'User with this email already exists', 409);
    }

    const credentialSecret = passwordHash || password;
    if (!credentialSecret) {
      return error('VALIDATION_ERROR', 'Password is required', 400);
    }
    const passwordHashToStore = await hashPassword(credentialSecret);
    const userId = generateId('user');
    const verifyToken = generateVerificationToken();
    const tokenHash = await hashVerificationToken(verifyToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

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

    try {
      await sendVerificationEmail(env, normalizedEmail, verifyToken);
    } catch (mailErr) {
      console.error('[signUp] Email send failed:', mailErr);
      if (env.ENVIRONMENT === 'production') {
        return error('EMAIL_SEND_FAILED', 'Could not send verification email. Try again later.', 503);
      }
    }

    return json(
      {
        requiresEmailVerification: true,
        email: normalizedEmail,
        message: 'Check your email for a verification code, then confirm before signing in.',
        ...(env.ENVIRONMENT === 'development' ? { devVerificationCode: verifyToken } : {}),
      },
      201
    );
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
    return error('CODE_EXPIRED', 'Verification code expired. Sign up again or request a new code.', 400);
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
 * POST /api/v1/auth/sign-in
 */
export async function signIn(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return error('METHOD_NOT_ALLOWED', 'Use POST', 405);
  }

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
      return error(
        'EMAIL_NOT_VERIFIED',
        'Confirm your email before signing in. Check your inbox for the verification code.',
        403
      );
    }

    return sessionResponse(user as unknown as Parameters<typeof userAuthPayload>[0], env);
  } catch (err) {
    console.error('[signIn] Error:', err);
    return error('INTERNAL_ERROR', 'An error occurred during sign in', 500);
  }
}

export async function signOut(request: Request, env: Env): Promise<Response> {
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
  accessToken: string
): Promise<{ email: string; name?: string }> {
  const res = await fetch(
    `https://graph.facebook.com/me?fields=email,name&access_token=${encodeURIComponent(accessToken)}`
  );
  if (!res.ok) throw new Error('Invalid Facebook token');
  const data = (await res.json()) as { email?: string; name?: string; error?: { message: string } };
  if (data.error) throw new Error(data.error.message);
  if (!data.email) throw new Error('Facebook account must share email to use Growl');
  return { email: data.email.toLowerCase(), name: data.name };
}

/** Decode Apple identity JWT payload (signature verification should use Apple JWKS in production). */
function verifyAppleIdToken(
  idToken: string,
  env: Env
): { email: string; name?: string; sub: string } {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid Apple identity token');

  let payload: { email?: string; sub?: string; aud?: string; iss?: string };
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    payload = JSON.parse(json) as typeof payload;
  } catch {
    throw new Error('Invalid Apple identity token payload');
  }

  if (payload.iss !== 'https://appleid.apple.com') {
    throw new Error('Apple token issuer mismatch');
  }
  if (env.APPLE_CLIENT_ID && payload.aud && payload.aud !== env.APPLE_CLIENT_ID) {
    throw new Error('Apple token audience mismatch');
  }
  if (!payload.sub) throw new Error('Apple token missing subject');

  const email = payload.email?.toLowerCase();
  if (!email) {
    return { email: `${payload.sub}@privaterelay.appleid.com`, sub: payload.sub };
  }
  return { email, sub: payload.sub };
}

/**
 * POST /api/v1/auth/sso
 */
export async function signInWithSSO(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return error('METHOD_NOT_ALLOWED', 'Use POST', 405);
  }

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
      const profile = verifyAppleIdToken(idToken, env);
      email = profile.email;
      username = profile.email.split('@')[0];
    } else {
      if (!accessToken) return error('VALIDATION_ERROR', 'accessToken required for Facebook', 400);
      const profile = await verifyFacebookAccessToken(accessToken);
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

type UserRow = Parameters<typeof userAuthPayload>[0];

export async function refresh(request: Request, env: Env): Promise<Response> {
  return error('NOT_IMPLEMENTED', 'Token refresh not implemented', 501);
}
