import { Env } from '../types';
import { json, error } from '../utils/response';
import { validateRequest, signUpSchema, signInSchema } from '../utils/validation';
import { hashPassword, verifyPassword, generateToken } from '../utils/auth';
import { generateId } from '../utils/id';

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

    const { email, password } = validation.data;

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
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return error('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    // Generate token
    const token = generateToken(user.id, env);

    const metadata = JSON.parse(user.metadata || '{}');

    return json({
      user: {
        id: user.id,
        email: user.email,
        username: metadata.username,
        points: user.points,
        is_instructor: user.is_instructor,
        is_business: user.is_business,
        categories: metadata.categories || [],
      },
      token,
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
 * POST /api/v1/auth/refresh
 * Refresh authentication token
 */
export async function refresh(request: Request, env: Env): Promise<Response> {
  // In a full implementation, verify the refresh token and issue a new access token
  // For MVP, just return an error indicating it's not implemented
  return error('NOT_IMPLEMENTED', 'Token refresh not implemented', 501);
}


