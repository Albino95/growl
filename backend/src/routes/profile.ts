import { Env } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { validateRequest, updateUserSchema } from '../utils/validation';
import { syncCategoryCohortFriends } from './friends';

/**
 * GET /api/v1/profile/user/:userId
 * Public-ish profile for another user (authenticated viewer). Omits email.
 */
export async function getPublicProfile(request: Request, env: Env, targetUserId: string): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  try {
    const row = await env.DB.prepare(
      `SELECT id, points, is_instructor, is_business, metadata, created_at FROM users WHERE id = ?`
    )
      .bind(targetUserId)
      .first<{
        id: string;
        points: number;
        is_instructor: number;
        is_business: number;
        metadata: string;
        created_at: string;
      }>();

    if (!row) {
      return error('USER_NOT_FOUND', 'User not found', 404);
    }

    const meta = JSON.parse(row.metadata || '{}');
    const postsRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = ?`)
      .bind(targetUserId)
      .first<{ n: number }>();
    const storiesRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM stories WHERE user_id = ?`)
      .bind(targetUserId)
      .first<{ n: number }>();

    return json({
      id: row.id,
      username: meta.username ?? null,
      avatar: meta.avatar ?? null,
      points: row.points,
      is_instructor: !!row.is_instructor,
      is_business: !!row.is_business,
      categories: Array.isArray(meta.categories) ? meta.categories : [],
      posts_count: Number(postsRow?.n ?? 0),
      stories_count: Number(storiesRow?.n ?? 0),
      created_at: row.created_at,
    });
  } catch (err) {
    console.error('[getPublicProfile]', err);
    return error('DATABASE_ERROR', 'Failed to load profile', 500);
  }
}

/**
 * GET /api/v1/profile
 * Get current user profile
 */
export async function getProfile(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId || !ctx.user) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  const metadata = JSON.parse(ctx.user.metadata || '{}');
  const categories = metadata.categories || [];

  let cohortFriendsLinked = 0;
  if (categories.length > 0) {
    try {
      cohortFriendsLinked = await syncCategoryCohortFriends(env, ctx.userId);
    } catch (syncErr) {
      console.error('[getProfile] cohort friend sync failed:', syncErr);
    }
  }

  return json({
    id: ctx.user.id,
    email: ctx.user.email,
    username: metadata.username,
    avatar: metadata.avatar,
    points: ctx.user.points,
    is_instructor: ctx.user.is_instructor,
    is_business: ctx.user.is_business,
    categories,
    notifications_prefs: metadata.notifications_prefs || {},
    cohort_friends_linked: cohortFriendsLinked,
    created_at: ctx.user.created_at,
  });
}

/**
 * PUT /api/v1/profile
 * Update user profile
 */
export async function updateProfile(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  const validation = await validateRequest(request, updateUserSchema);
  if (!validation.success) return validation.response;

  const { username, avatar, categories, metadata } = validation.data;

  try {
    // Get current user metadata
    const user = await env.DB.prepare('SELECT metadata FROM users WHERE id = ?')
      .bind(ctx.userId)
      .first<{ metadata: string }>();

    if (!user) {
      return error('USER_NOT_FOUND', 'User not found', 404);
    }

    const currentMetadata = JSON.parse(user.metadata || '{}');
    const updatedMetadata = {
      ...currentMetadata,
      ...(username && { username }),
      ...(avatar && { avatar }),
      ...(categories && { categories }),
      ...(metadata && { ...currentMetadata, ...metadata }),
    };

    await env.DB.prepare('UPDATE users SET metadata = ?, updated_at = datetime("now") WHERE id = ?')
      .bind(JSON.stringify(updatedMetadata), ctx.userId)
      .run();

    if (categories && categories.length > 0) {
      try {
        await syncCategoryCohortFriends(env, ctx.userId);
      } catch (syncErr) {
        console.error('[updateProfile] Category cohort friend sync failed:', syncErr);
      }
    }

    return json({
      id: ctx.userId,
      username: updatedMetadata.username,
      avatar: updatedMetadata.avatar,
      categories: updatedMetadata.categories || [],
      message: 'Profile updated successfully',
    });
  } catch (err) {
    console.error('[updateProfile] Error:', err);
    return error('DATABASE_ERROR', 'Failed to update profile', 500);
  }
}
