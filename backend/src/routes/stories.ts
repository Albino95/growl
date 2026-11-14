import { Env } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { generateId } from '../utils/id';
import { validateRequest } from '../utils/validation';
import { z } from 'zod';
import { isBlocked } from './friends';
import { recordActivity } from '../utils/activity';

const createStorySchema = z.object({
  image_url: z
    .string()
    .trim()
    .min(1, 'Image is required')
    .refine(
      (v) => {
        if (!/^https:\/\//i.test(v)) return false;
        try {
          return /\/api\/[^/]+\/media\//i.test(new URL(v).pathname || '');
        } catch {
          return false;
        }
      },
      {
        message:
          'Your photo was not uploaded successfully. The story was not published — try again.',
      }
    ),
  caption: z.string().max(500, 'Caption too long').optional(),
});

/**
 * Stories (and their views) are hard-deleted by the hourly cron after this many
 * days. Matches the owner's own-story history window in getUserStories so the
 * purge never removes something the app still shows. R2 media is kept.
 */
export const STORY_PURGE_AFTER_DAYS = 90;

/**
 * GET /api/v1/stories
 * Get all active stories (stories from last 24 hours)
 */
export async function getStories(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  const viewerId = ctx.userId || '';
  
  try {
    // Prefer correlated subqueries over JOIN+GROUP BY so D1 does not multiply
    // story rows by every story_views row (blows free-tier row reads).
    const storiesQuery = `
      SELECT
        s.id,
        s.user_id,
        s.image_url,
        s.caption,
        s.views,
        s.expires_at,
        s.created_at,
        s.updated_at,
        u.metadata as user_metadata,
        (SELECT COUNT(*) FROM story_views sv WHERE sv.story_id = s.id) as view_count,
        CASE
          WHEN ? != '' AND EXISTS (
            SELECT 1 FROM story_views sv_viewer
            WHERE sv_viewer.story_id = s.id AND sv_viewer.user_id = ?
          ) THEN 1 ELSE 0
        END as has_viewed
      FROM stories s
      JOIN users u ON s.user_id = u.id
      WHERE s.created_at > datetime('now', '-24 hours')
        AND s.image_url IS NOT NULL
        AND trim(s.image_url) != ''
        AND s.image_url LIKE 'https://%'
      ${
        viewerId
          ? `AND NOT EXISTS (
              SELECT 1
              FROM user_relationships r
              WHERE r.type IN ('block', 'mute')
                AND (
                  (r.user_id = ? AND r.target_user_id = s.user_id)
                  OR (r.user_id = s.user_id AND r.target_user_id = ? AND r.type = 'block')
                )
            )`
          : ''
      }
      ORDER BY s.created_at DESC
      LIMIT 200
    `;
    const stories = await env.DB.prepare(storiesQuery)
      .bind(...(viewerId ? [viewerId, viewerId, viewerId, viewerId] : ['', '']))
      .all<{
        id: string;
        user_id: string;
        image_url: string;
        caption: string | null;
        views: number;
        expires_at: string | null;
        created_at: string;
        updated_at: string;
        user_metadata: string;
        view_count: number;
        has_viewed: number;
      }>();

    // Story viewer consumes grouped stories by author for ring-style UI.
    const groupedStories: Record<string, any[]> = {};
    
    for (const story of stories.results || []) {
      const userId = story.user_id;
      if (!groupedStories[userId]) {
        groupedStories[userId] = [];
      }
      
      let userMeta: Record<string, unknown> = {};
      try {
        userMeta = JSON.parse(story.user_metadata || '{}') as Record<string, unknown>;
      } catch {
        userMeta = {};
      }
      groupedStories[userId].push({
        id: story.id,
        userId: story.user_id,
        username: (typeof userMeta.username === 'string' && userMeta.username) || 'User',
        avatar: (typeof userMeta.avatar === 'string' && userMeta.avatar) || null,
        image: story.image_url,
        caption: story.caption,
        views: story.view_count,
        hasViewed: story.has_viewed === 1,
        createdAt: story.created_at,
      });
    }

    const grouped = Object.entries(groupedStories).map(([userId, stories]) => ({
      userId,
      username: stories[0]?.username || 'User',
      avatar: stories[0]?.avatar || null,
      stories,
    }));

    return json({
      stories: Object.values(groupedStories).flat(),
      grouped,
    });
  } catch (err) {
    console.error('[getStories] Error:', err);
    return error('DATABASE_ERROR', 'Failed to fetch stories', 500);
  }
}

/**
 * GET /api/v1/stories/user/:userId
 * Get stories for a specific user
 */
export async function getUserStories(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  // Owners can review longer history; other viewers see only active 24h stories.
  const ctx = await getRequestContext(request, env);

  try {
    const viewerId = ctx.userId || '';
    const viewingSelf = !!ctx.userId && ctx.userId === userId;

    // Blocked either way: behave as if the user has no stories (same rule as the tray).
    if (!viewingSelf && viewerId && (await isBlocked(env, viewerId, userId))) {
      return json({ stories: [] });
    }

    const timeClause = viewingSelf
      ? `s.user_id = ? AND s.created_at > datetime('now', '-${STORY_PURGE_AFTER_DAYS} days')`
      : `s.user_id = ? AND s.created_at > datetime('now', '-24 hours')`;

    const stories = await env.DB.prepare(
      `SELECT 
        s.*,
        CASE WHEN sv.user_id IS NOT NULL THEN 1 ELSE 0 END as has_viewed,
        (SELECT COUNT(*) FROM story_views sv2 WHERE sv2.story_id = s.id) as view_count
      FROM stories s
      LEFT JOIN story_views sv ON s.id = sv.story_id AND sv.user_id = ?
      WHERE ${timeClause}
      ORDER BY s.created_at DESC`
    )
      .bind(viewerId, userId)
      .all<{
        id: string;
        user_id: string;
        image_url: string;
        caption: string | null;
        views: number;
        created_at: string;
        has_viewed: number;
        view_count: number;
      }>();

    const user = await env.DB.prepare('SELECT metadata FROM users WHERE id = ?')
      .bind(userId)
      .first<{ metadata: string }>();

    let userMeta: Record<string, unknown> = {};
    try {
      userMeta = JSON.parse(user?.metadata || '{}') as Record<string, unknown>;
    } catch {
      userMeta = {};
    }

    return json({
      stories: (stories.results || []).map((story) => ({
        id: story.id,
        userId: story.user_id,
        username: (typeof userMeta.username === 'string' && userMeta.username) || 'User',
        avatar: (typeof userMeta.avatar === 'string' && userMeta.avatar) || null,
        image: story.image_url,
        caption: story.caption,
        views: typeof story.view_count === 'number' ? story.view_count : story.views,
        hasViewed: story.has_viewed === 1,
        createdAt: story.created_at,
      })),
    });
  } catch (err) {
    console.error('[getUserStories] Error:', err);
    return error('DATABASE_ERROR', 'Failed to fetch user stories', 500);
  }
}

/**
 * POST /api/v1/stories
 * Create a new story
 */
export async function createStory(request: Request, env: Env): Promise<Response> {
  // Story creation requires auth and stores an explicit expires_at timestamp.
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  const validation = await validateRequest(request, createStorySchema);
  if (!validation.success) return validation.response;

  const { image_url, caption } = validation.data;
  const storyId = generateId('story');
  
  // Stories expire after 24 hours
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  try {
    await env.DB.prepare(
      `INSERT INTO stories (id, user_id, image_url, caption, views, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, datetime('now'), datetime('now'))`
    )
      .bind(storyId, ctx.userId, image_url, caption || null, expiresAt.toISOString())
      .run();

    const growth = await recordActivity(env, ctx.userId, 'story');

    return json(
      {
        id: storyId,
        userId: ctx.userId,
        image: image_url,
        caption,
        views: 0,
        createdAt: new Date().toISOString(),
        new_badges: growth.newBadges,
      },
      201
    );
  } catch (err) {
    console.error('[createStory] Error:', err);
    return error('DATABASE_ERROR', 'Failed to create story', 500);
  }
}

/**
 * POST /api/v1/stories/:storyId/view
 * Mark a story as viewed
 */
export async function viewStory(
  request: Request,
  env: Env,
  storyId: string
): Promise<Response> {
  // View events are idempotent per (story, viewer) and skip self-views.
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  try {
    // Check if story exists (and is still inside its 24h window)
    const story = await env.DB.prepare(
      `SELECT id, user_id,
        CASE WHEN created_at > datetime('now', '-24 hours') THEN 1 ELSE 0 END AS active
       FROM stories WHERE id = ?`
    )
      .bind(storyId)
      .first<{ id: string; user_id: string; active: number }>();

    if (!story) {
      return error('STORY_NOT_FOUND', 'Story not found', 404);
    }

    // Don't count own views
    if (story.user_id === ctx.userId) {
      return json({ viewed: true });
    }

    // Hide existence from blocked pairs; expired stories no longer collect views.
    if (await isBlocked(env, ctx.userId, story.user_id)) {
      return error('STORY_NOT_FOUND', 'Story not found', 404);
    }
    if (!Number(story.active)) {
      return error('STORY_EXPIRED', 'This story has expired', 410);
    }

    // Check if already viewed
    const existingView = await env.DB.prepare(
      'SELECT id FROM story_views WHERE story_id = ? AND user_id = ?'
    )
      .bind(storyId, ctx.userId)
      .first();

    if (!existingView) {
      // Record view
      const viewId = generateId('story_view');
      await env.DB.prepare(
        `INSERT INTO story_views (id, story_id, user_id, viewed_at)
         VALUES (?, ?, ?, datetime('now'))`
      )
        .bind(viewId, storyId, ctx.userId)
        .run();

      // Update story view count
      await env.DB.prepare(
        'UPDATE stories SET views = views + 1 WHERE id = ?'
      )
        .bind(storyId)
        .run();
    }

    return json({ viewed: true });
  } catch (err) {
    console.error('[viewStory] Error:', err);
    return error('DATABASE_ERROR', 'Failed to record story view', 500);
  }
}

/**
 * DELETE /api/v1/stories/:storyId
 * Delete a story
 */
export async function deleteStory(
  request: Request,
  env: Env,
  storyId: string
): Promise<Response> {
  // Delete is owner-only; DB cascade handles dependent story view cleanup.
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  try {
    // Check if story exists and belongs to user
    const story = await env.DB.prepare('SELECT user_id FROM stories WHERE id = ?')
      .bind(storyId)
      .first<{ user_id: string }>();

    if (!story) {
      return error('STORY_NOT_FOUND', 'Story not found', 404);
    }

    if (story.user_id !== ctx.userId) {
      return error('FORBIDDEN', 'You can only delete your own stories', 403);
    }

    // Delete story (cascade will delete views)
    await env.DB.prepare('DELETE FROM stories WHERE id = ?')
      .bind(storyId)
      .run();

    return json({ message: 'Story deleted successfully' });
  } catch (err) {
    console.error('[deleteStory] Error:', err);
    return error('DATABASE_ERROR', 'Failed to delete story', 500);
  }
}

/**
 * GET /api/v1/stories/:storyId/viewers
 * Owner-only list of who viewed a story (newest first).
 */
export async function getStoryViewers(
  request: Request,
  env: Env,
  storyId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  try {
    const story = await env.DB.prepare('SELECT id, user_id FROM stories WHERE id = ?')
      .bind(storyId)
      .first<{ id: string; user_id: string }>();
    if (!story) {
      return error('STORY_NOT_FOUND', 'Story not found', 404);
    }
    if (story.user_id !== ctx.userId) {
      return error('FORBIDDEN', 'Only the story owner can see viewers', 403);
    }

    const rows = await env.DB.prepare(
      `SELECT sv.user_id, sv.viewed_at, u.metadata, u.is_instructor
       FROM story_views sv
       JOIN users u ON u.id = sv.user_id
       WHERE sv.story_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM user_relationships r
           WHERE r.type = 'block'
             AND ((r.user_id = ? AND r.target_user_id = sv.user_id)
               OR (r.user_id = sv.user_id AND r.target_user_id = ?))
         )
       ORDER BY sv.viewed_at DESC
       LIMIT 500`
    )
      .bind(storyId, ctx.userId, ctx.userId)
      .all<{ user_id: string; viewed_at: string; metadata: string; is_instructor: number }>();

    const viewers = (rows.results || []).map((row) => {
      let meta: Record<string, unknown> = {};
      try {
        meta = JSON.parse(row.metadata || '{}') as Record<string, unknown>;
      } catch {
        meta = {};
      }
      return {
        id: row.user_id,
        username: (typeof meta.username === 'string' && meta.username) || 'User',
        avatar: (typeof meta.avatar === 'string' && meta.avatar) || null,
        is_instructor: !!row.is_instructor,
        viewed_at: row.viewed_at,
      };
    });

    return json({ viewers, count: viewers.length });
  } catch (err) {
    console.error('[getStoryViewers] Error:', err);
    return error('DATABASE_ERROR', 'Failed to fetch story viewers', 500);
  }
}

/**
 * Cron: hard-delete stories older than STORY_PURGE_AFTER_DAYS plus their view rows.
 * Media objects in R2 are intentionally left alone. Returns stories removed.
 */
export async function purgeExpiredStories(env: Env): Promise<number> {
  const cutoff = `-${STORY_PURGE_AFTER_DAYS} days`;
  await env.DB.prepare(
    `DELETE FROM story_views
     WHERE story_id IN (SELECT id FROM stories WHERE created_at < datetime('now', ?))`
  )
    .bind(cutoff)
    .run();
  const res = await env.DB.prepare(`DELETE FROM stories WHERE created_at < datetime('now', ?)`)
    .bind(cutoff)
    .run();
  return Number(res.meta?.changes) || 0;
}
