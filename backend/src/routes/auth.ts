import { Env } from '../types';
import { json, error } from '../utils/response';
import { validateRequest, signUpSchema, signInSchema, ssoSchema } from '../utils/validation';
import { hashPassword, verifyPassword, generateToken } from '../utils/auth';
import { generateId } from '../utils/id';
import { shouldBootstrapBusinessPrivileges } from '../config/businessBootstrap';

/**
 * POST /api/v1/auth/sign-up
 * Register a new user
 */
export async function signUp(request: Request, env: Env): Promise<Response> {
  try {
    const validation = await validateRequest(request, signUpSchema);
    if (!validation.success) return validation.response;

    const { email, password, username } = validation.data;

    // Check if user already exists
    const existingUser = await env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    )
      .bind(email)
      .first();

    if (existingUser) {
      return error('USER_EXISTS', 'User with this email already exists', 409);
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const userId = generateId('user');
    const metadata = {
      username: username || email.split('@')[0],
      categories: [],
      engagementHistory: [],
      instructorVotes: [],
      purchaseHistory: [],
      timePreferences: [],
      blockedUsers: [],
      mutedUsers: [],
    };

    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, points, is_instructor, is_business, metadata, created_at, updated_at)
       VALUES (?, ?, ?, 0, 0, 0, ?, datetime('now'), datetime('now'))`
    )
      .bind(userId, email, passwordHash, JSON.stringify(metadata))
      .run();

    // Generate token
    const token = generateToken(userId, env);

    return json(
      {
        user: {
          id: userId,
          email,
          username: metadata.username,
          points: 0,
          is_instructor: false,
          is_business: false,
        },
        token,
      },
      201
    );
  } catch (err: any) {
    console.error('[signUp] Error:', err);
    const errorMessage = err?.message || 'Failed to create user';
    // Provide more helpful error message if tables don't exist
    if (errorMessage.includes('no such table')) {
      return error('DATABASE_ERROR', 'Database tables not initialized. Please run migrations.', 500);
    }
    return error('DATABASE_ERROR', errorMessage, 500, env.ENVIRONMENT === 'development' ? String(err) : undefined);
  }
}

/**
 * POST /api/v1/auth/sign-in
 * Authenticate user
 */
export async function signIn(request: Request, env: Env): Promise<Response> {
  try {
    const validation = await validateRequest(request, signInSchema);
    if (!validation.success) return validation.response;

    const { email, password, passwordHash } = validation.data;
    
    // If passwordHash is provided, use it directly (frontend hashed it)
    // Otherwise, use the plain password
    const passwordToVerify = passwordHash || password;

    // Find user
    const user = await env.DB.prepare(
      'SELECT * FROM users WHERE email = ?'
    )
      .bind(email)
      .first<{
        id: string;
        email: string;
        password_hash: string;
        points: number;
        is_instructor: boolean;
        is_business: boolean;
        metadata: string;
      }>();

    if (!user) {
      return error('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    // Verify password
    // If frontend sent passwordHash, compare directly (for dev/demo)
    // Otherwise, verify the hashed password
    let isValid = false;
    if (passwordHash) {
      // For demo/dev: compare hashed passwords directly
      isValid = passwordHash === user.password_hash;
    } else {
      isValid = await verifyPassword(password, user.password_hash);
    }
    
    if (!isValid) {
      return error('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    const metadata = JSON.parse(user.metadata || '{}');
    const accountType = typeof metadata.account_type === 'string' ? metadata.account_type.toLowerCase() : '';
    const treatAsBusiness =
      shouldBootstrapBusinessPrivileges(email, env) || accountType === 'business';

    if (treatAsBusiness) {
      await env.DB.prepare(
        'UPDATE users SET is_business = 1, is_instructor = 1 WHERE id = ?'
      )
        .bind(user.id)
        .run();
      user.is_business = true;
      user.is_instructor = true;
    }

    // Generate token
    const token = generateToken(user.id, env);

    const categories = metadata.categories || [];
    const hasCompletedOnboarding = categories.length > 0;
    const isBusiness = !!user.is_business;

    // Return format that matches frontend expectations
    return json({
      token,
      userId: user.id,
      isInstructor: user.is_instructor ? true : false,
      isBusiness,
      hasCompletedOnboarding,
      categories,
    });
  } catch (err) {
    console.error('[signIn] Error:', err);
    return error('INTERNAL_ERROR', 'An error occurred during sign in', 500, env.ENVIRONMENT === 'development' ? String(err) : undefined);
  }
}

/**
 * POST /api/v1/auth/sign-out
 * Sign out user (client-side token removal, but we can invalidate if needed)
 */
export async function signOut(request: Request, env: Env): Promise<Response> {
  // In a full implementation, you might want to invalidate the token
  // For now, just return success (client removes token)
  return json({ message: 'Signed out successfully' });
}

/**
 * POST /api/v1/auth/sso
 * Sign in with SSO (Google, Facebook)
 */
export async function signInWithSSO(request: Request, env: Env): Promise<Response> {
  try {
    const validation = await validateRequest(request, ssoSchema);
    if (!validation.success) return validation.response;

    const { provider, token: ssoToken } = validation.data;

    // In a real implementation, verify the SSO token with the provider
    // For MVP, we'll create or find a user based on the token
    // Extract email from token (in production, verify with provider API)
    
    // For demo purposes, we'll use a mock approach
    // In production, verify token with Google/Facebook APIs
    let email: string;
    let username: string;
    
    // Mock: Extract info from token (in production, verify with provider)
    if (ssoToken.startsWith('sso-google-')) {
      email = ssoToken.replace('sso-google-token-', '') + '@google.com';
      username = email.split('@')[0];
    } else if (ssoToken.startsWith('sso-facebook-')) {
      email = ssoToken.replace('sso-facebook-token-', '') + '@facebook.com';
      username = email.split('@')[0];
    } else {
      // Try to extract email from token (mock)
      email = `sso-${provider}-${Date.now()}@example.com`;
      username = email.split('@')[0];
    }

    // Check if user exists
    let user = await env.DB.prepare(
      'SELECT * FROM users WHERE email = ?'
    )
      .bind(email)
      .first<{
        id: string;
        email: string;
        password_hash: string;
        points: number;
        is_instructor: boolean;
        is_business: boolean;
        metadata: string;
      }>();

    // If user doesn't exist, create one
    if (!user) {
      const userId = generateId('user');
      const metadata = {
        username,
        categories: [],
        engagementHistory: [],
        instructorVotes: [],
        purchaseHistory: [],
        timePreferences: [],
        blockedUsers: [],
        mutedUsers: [],
        ssoProvider: provider,
      };

      await env.DB.prepare(
        `INSERT INTO users (id, email, password_hash, points, is_instructor, is_business, metadata, created_at, updated_at)
         VALUES (?, ?, ?, 0, 0, 0, ?, datetime('now'), datetime('now'))`
      )
        .bind(userId, email, `sso-${provider}`, JSON.stringify(metadata))
        .run();

      // Fetch the newly created user
      user = await env.DB.prepare(
        'SELECT * FROM users WHERE id = ?'
      )
        .bind(userId)
        .first<{
          id: string;
          email: string;
          password_hash: string;
          points: number;
          is_instructor: boolean;
          is_business: boolean;
          metadata: string;
        }>();
    }

    if (!user) {
      return error('SSO_ERROR', 'Failed to create or find user', 500);
    }

    // Generate token
    const token = generateToken(user.id, env);
    const metadata = JSON.parse(user.metadata || '{}');
    const categories = metadata.categories || [];
    const hasCompletedOnboarding = categories.length > 0;

    return json({
      token,
      userId: user.id,
      isInstructor: user.is_instructor ? true : false,
      isBusiness: !!user.is_business,
      hasCompletedOnboarding,
      categories,
    });
  } catch (err) {
    console.error('[signInWithSSO] Error:', err);
    return error('INTERNAL_ERROR', 'An error occurred during SSO sign in', 500, env.ENVIRONMENT === 'development' ? String(err) : undefined);
  }
}

/**
 * POST /api/v1/auth/refresh
 * Refresh authentication token
 */
export async function refresh(request: Request, env: Env): Promise<Response> {
  // In a full implementation, verify the refresh token and issue a new access token
  // For MVP, just return an error indicating it's not implemented
  return error('NOT_IMPLEMENTED', 'Token refresh not implemented', 501);
}


