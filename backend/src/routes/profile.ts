import { Env } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { validateRequest, updateUserSchema } from '../utils/validation';

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

  return json({
    id: ctx.user.id,
    email: ctx.user.email,
    username: metadata.username,
    avatar: metadata.avatar,
    points: ctx.user.points,
    is_instructor: ctx.user.is_instructor,
    is_business: ctx.user.is_business,
    categories: metadata.categories || [],
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
