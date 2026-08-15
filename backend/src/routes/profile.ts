import { Env } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { validateRequest, updateUserSchema } from '../utils/validation';
import { syncCategoryCohortFriends } from './friends';
import { computeEligibility, countEndorsements, countUserPosts } from '../utils/instructorEligibility';
import { countEndorsementsGiven, computePostStreak } from '../utils/points';

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
      bio: typeof meta.bio === 'string' ? meta.bio : null,
      status: typeof meta.status === 'string' ? meta.status : null,
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
 * Fast by default (auth/boot). Pass ?stats=1 for achievement / eligibility counters.
 */
export async function getProfile(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId || !ctx.user) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  const url = new URL(request.url);
  const wantStats = url.searchParams.get('stats') === '1';

  const metadata = JSON.parse(ctx.user.metadata || '{}');
  const categories = metadata.categories || [];
  const decayTimer =
    typeof metadata.decay_timer === 'number' && metadata.decay_timer >= 1
      ? Math.min(365, Math.floor(metadata.decay_timer))
      : 7;

  const base = {
    id: ctx.user.id,
    email: ctx.user.email,
    username: metadata.username,
    avatar: metadata.avatar,
    bio: typeof metadata.bio === 'string' ? metadata.bio : null,
    status: typeof metadata.status === 'string' ? metadata.status : null,
    points: Number(ctx.user.points) || 0,
    is_instructor: ctx.user.is_instructor,
    is_business: ctx.user.is_business,
    categories,
    notifications_prefs: metadata.notifications_prefs || {},
    decay_timer: decayTimer,
    created_at: ctx.user.created_at,
  };

  if (!wantStats) {
    return json(base);
  }

  let instructor;
  try {
    instructor = await computeEligibility(env, ctx.userId, ctx.user.is_instructor);
  } catch (e) {
    console.error('[getProfile] eligibility failed:', e);
    instructor = undefined;
  }

  const [endorsementsGiven, streakDays] = await Promise.all([
    countEndorsementsGiven(env, ctx.userId),
    computePostStreak(env, ctx.userId),
  ]);

  const postCount = instructor?.postCount ?? (await countUserPosts(env, ctx.userId));
  const endorsementsReceived =
    instructor?.endorsementsReceived ?? (await countEndorsements(env, ctx.userId));

  return json({
    ...base,
    instructor,
    post_count: postCount,
    endorsements_received: endorsementsReceived,
    endorsements_given: endorsementsGiven,
    streak_days: streakDays,
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

  const { username, avatar, categories, metadata, decay_timer } = validation.data;

  try {
    const user = await env.DB.prepare('SELECT metadata FROM users WHERE id = ?')
      .bind(ctx.userId)
      .first<{ metadata: string }>();

    if (!user) {
      return error('USER_NOT_FOUND', 'User not found', 404);
    }

    const currentMetadata = JSON.parse(user.metadata || '{}');
    const updatedMetadata: Record<string, unknown> = {
      ...currentMetadata,
      ...(metadata || {}),
      ...(username && { username }),
      ...(categories && { categories }),
    };

    if (avatar !== undefined) {
      updatedMetadata.avatar = avatar || null;
    }

    if (typeof decay_timer === 'number') {
      updatedMetadata.decay_timer = decay_timer;
    }

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
      decay_timer: updatedMetadata.decay_timer ?? 7,
      message: 'Profile updated successfully',
    });
  } catch (err) {
    console.error('[updateProfile] Error:', err);
    return error('DATABASE_ERROR', 'Failed to update profile', 500);
  }
}
