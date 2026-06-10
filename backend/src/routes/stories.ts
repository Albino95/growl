import { Env } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { generateId } from '../utils/id';
import { validateRequest } from '../utils/validation';
import { z } from 'zod';

/** Development-only grouped stories fallback used in explore mode. */
function buildMockExploreStories() {
  const now = Date.now();
  const groups: Array<{
    userId: string;
    username: string;
    avatar: string;
    stories: Array<{
      id: string;
      userId: string;
      username: string;
      avatar: string;
      image: string;
      caption: string;
      views: number;
      hasViewed: boolean;
      createdAt: string;
    }>;
  }> = [];

  for (let userIdx = 1; userIdx <= 60; userIdx += 1) {
    const userId = `mock-user-${String(userIdx).padStart(2, '0')}`;
    const username = `Creator ${String(userIdx).padStart(2, '0')}`;
    const avatar = `https://i.pravatar.cc/200?img=${(userIdx % 70) + 1}`;
    const stories = Array.from({ length: 10 }).map((_, storyIdx) => {
      const createdAt = new Date(now - (userIdx * 5 + storyIdx * 15) * 60000).toISOString();
      return {
        id: `mock-story-${userIdx}-${storyIdx + 1}`,
        userId,
        username,
        avatar,
        image: `https://picsum.photos/seed/mock-story-${userIdx}-${storyIdx + 1}/900/1400`,
        caption: `Story ${storyIdx + 1} from ${username}`,
        views: 120 + ((userIdx * 9 + storyIdx * 13) % 400),
        hasViewed: false,
        createdAt,
      };
    });
    groups.push({ userId, username, avatar, stories });
  }

  return groups;
}

const createStorySchema = z.object({
  image_url: z.string().url('Invalid image URL'),
  caption: z.string().max(500, 'Caption too long').optional(),
});

/**
 * GET /api/v1/stories
 * Get all active stories (stories from last 24 hours)
 */
export async function getStories(request: Request, env: Env): Promise<Response> {
  // Explore mode and mock toggles are opt-in to avoid accidental production fallback.
  const url = new URL(request.url);
  const isExploreMode = url.searchParams.get('mode') === 'explore';
  const allowDevMock = env.ENVIRONMENT === 'development' && url.searchParams.get('mock') === '1';
  const ctx = await getRequestContext(request, env);
  const viewerId = ctx.userId || '';
  
  try {
    // Fetch only active stories and annotate each with viewer view state.
    const storiesQuery = `
      SELECT 
        s.*,
        u.metadata as user_metadata,
        COUNT(DISTINCT sv.user_id) as view_count,
        CASE WHEN sv_viewer.user_id IS NOT NULL THEN 1 ELSE 0 END as has_viewed
      FROM stories s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN story_views sv ON s.id = sv.story_id
      LEFT JOIN story_views sv_viewer ON s.id = sv_viewer.story_id AND sv_viewer.user_id = ?
      WHERE s.created_at > datetime('now', '-24 hours')
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
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `;
    const stories = await env.DB.prepare(storiesQuery)
      .bind(...(viewerId ? [viewerId, viewerId, viewerId] : [viewerId]))
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
      
      const userMeta = JSON.parse(story.user_metadata || '{}');
      groupedStories[userId].push({
        id: story.id,
        userId: story.user_id,
        username: userMeta.username || 'User',
        avatar: userMeta.avatar || null,
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

    if (isExploreMode && allowDevMock && grouped.length === 0) {
      const mockGrouped = buildMockExploreStories();
      return json({
        stories: mockGrouped.flatMap((group) => group.stories),
        grouped: mockGrouped,
      });
    }

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

    const timeClause = viewingSelf
      ? `s.user_id = ? AND s.created_at > datetime('now', '-90 days')`
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

    const userMeta = JSON.parse(user?.metadata || '{}');

    return json({
      stories: (stories.results || []).map((story) => ({
        id: story.id,
        userId: story.user_id,
        username: userMeta.username || 'User',
        avatar: userMeta.avatar || null,
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

    return json(
      {
        id: storyId,
        userId: ctx.userId,
        image: image_url,
        caption,
        views: 0,
        createdAt: new Date().toISOString(),
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
    // Check if story exists
    const story = await env.DB.prepare('SELECT id, user_id FROM stories WHERE id = ?')
      .bind(storyId)
      .first();

    if (!story) {
      return error('STORY_NOT_FOUND', 'Story not found', 404);
    }

    // Don't count own views
    if (story.user_id === ctx.userId) {
      return json({ viewed: true });
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
