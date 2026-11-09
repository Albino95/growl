import { Env } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { validateRequest, updateUserSchema } from '../utils/validation';
import { resyncCategoryCohortFriends } from './friends';
import {
  computeEligibility,
  countEndorsements,
  countUserPosts,
  resolveUserCategories,
} from '../utils/instructorEligibility';
import { countEndorsementsGiven, computePostStreak } from '../utils/points';
import {
  countCompletedPlans,
  getOffering,
  loadClientFollowThrough,
  loadInstructorRatings,
} from '../utils/coachingAccess';

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

    const categories = await resolveUserCategories(env, targetUserId, row.metadata);
    const endorsements_received = await countEndorsements(env, targetUserId);
    const pinned_post_ids = Array.isArray(meta.pinned_post_ids)
      ? meta.pinned_post_ids.filter((x: unknown) => typeof x === 'string').slice(0, 3)
      : [];
    const offering = row.is_instructor ? await getOffering(env, targetUserId) : null;
    const completed_plans = row.is_instructor ? await countCompletedPlans(env, targetUserId) : 0;
    const instructorRating = row.is_instructor
      ? (await loadInstructorRatings(env, [targetUserId])).get(targetUserId)
      : null;
    const followThrough = !row.is_instructor ? await loadClientFollowThrough(env, targetUserId) : null;
    let testimonials: Array<{
      id: string;
      stars: number;
      body: string | null;
      created_at: string;
      reviewer: { id: string; username: string; avatar: string | null };
    }> = [];
    if (row.is_instructor) {
      try {
        const reviewRows = await env.DB.prepare(
          `SELECT r.id, r.stars, r.body, r.created_at, r.reviewer_id, u.metadata
           FROM coaching_reviews r
           JOIN users u ON u.id = r.reviewer_id
           WHERE r.instructor_id = ? AND r.direction = 'client_to_instructor'
           ORDER BY r.created_at DESC
           LIMIT 4`
        )
          .bind(targetUserId)
          .all<{
            id: string;
            stars: number;
            body: string | null;
            created_at: string;
            reviewer_id: string;
            metadata: string;
          }>();
        testimonials = (reviewRows.results || []).map((t) => {
          let name = 'Client';
          let avatar: string | null = null;
          try {
            const m = JSON.parse(t.metadata || '{}');
            if (typeof m.username === 'string') name = m.username;
            if (typeof m.avatar === 'string') avatar = m.avatar;
          } catch {
            /* ignore */
          }
          return {
            id: t.id,
            stars: Number(t.stars) || 0,
            body: t.body,
            created_at: t.created_at,
            reviewer: { id: t.reviewer_id, username: name, avatar },
          };
        });
      } catch {
        testimonials = [];
      }
    }

    return json({
      id: row.id,
      username: meta.username ?? null,
      avatar: meta.avatar ?? null,
      bio: typeof meta.bio === 'string' ? meta.bio : null,
      status: typeof meta.status === 'string' ? meta.status : null,
      points: row.points,
      is_instructor: !!row.is_instructor,
      is_business: !!row.is_business,
      categories,
      posts_count: Number(postsRow?.n ?? 0),
      stories_count: Number(storiesRow?.n ?? 0),
      endorsements_received,
      teaching_headline:
        typeof meta.teaching_headline === 'string' ? meta.teaching_headline : null,
      pinned_post_ids,
      offering,
      completed_plans,
      rating:
        instructorRating && instructorRating.count > 0
          ? instructorRating
          : { avg: 0, count: 0 },
      follow_through: followThrough && followThrough.count > 0 ? followThrough : null,
      testimonials,
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
    teaching_headline:
      typeof metadata.teaching_headline === 'string' ? metadata.teaching_headline : null,
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
export async function updateProfile(
  request: Request,
  env: Env,
  executionCtx?: Pick<ExecutionContext, 'waitUntil'>
): Promise<Response> {
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
    const incomingMeta =
      metadata && typeof metadata === 'object' ? { ...metadata } : {};
    // Avatar must come from top-level field (https-validated). Never accept arbitrary metadata.avatar.
    delete (incomingMeta as Record<string, unknown>).avatar;

    const updatedMetadata: Record<string, unknown> = {
      ...currentMetadata,
      ...incomingMeta,
      ...(username && { username }),
      ...(categories && { categories }),
    };

    if (avatar !== undefined) {
      updatedMetadata.avatar = avatar || null;
    } else if (
      typeof updatedMetadata.avatar === 'string' &&
      updatedMetadata.avatar &&
      !/^https:\/\//i.test(updatedMetadata.avatar)
    ) {
      updatedMetadata.avatar = null;
    }

    if (typeof decay_timer === 'number') {
      updatedMetadata.decay_timer = decay_timer;
    }

    await env.DB.prepare('UPDATE users SET metadata = ?, updated_at = datetime("now") WHERE id = ?')
      .bind(JSON.stringify(updatedMetadata), ctx.userId)
      .run();

    if (categories && categories.length > 0) {
      // Cohort resync can be O(users) on D1 — never block onboarding/profile save on it.
      // Background via waitUntil; short soft-await so path-change clients usually see links soon.
      const syncWork = resyncCategoryCohortFriends(env, ctx.userId).catch((syncErr) => {
        console.error('[updateProfile] Category cohort friend sync failed:', syncErr);
        return { detached: 0, linked: 0 };
      });
      if (executionCtx) {
        executionCtx.waitUntil(syncWork.then(() => undefined));
        await Promise.race([
          syncWork,
          new Promise<{ detached: number; linked: number }>((resolve) =>
            setTimeout(() => resolve({ detached: 0, linked: 0 }), 2500)
          ),
        ]);
      } else {
        await syncWork;
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
