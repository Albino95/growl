import { Env } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { validateRequest } from '../utils/validation';
import { generateId } from '../utils/id';
import { z } from 'zod';
import { isBlocked } from './friends';
import { createUserNotification, resolveUsername } from '../utils/notifications';

/** Page size for GET comments; a full page means older comments may exist (`before` cursor). */
export const COMMENT_PAGE_SIZE = 50;

/** Repeat comments from the same person on the same post within this window collapse into one notification. */
const COMMENT_NOTIFY_COALESCE_MINUTES = 10;

const createCommentSchema = z.object({
  content: z.string().min(1, 'Comment content is required').max(1000, 'Comment too long'),
});

/**
 * GET /api/v1/feed/posts/:postId/comments
 * Get comments for a post
 */
export async function getComments(
  request: Request,
  env: Env,
  postId: string
): Promise<Response> {
  // Optional auth: signed-in viewers get block filtering; guests see the public thread.
  const ctx = await getRequestContext(request, env);
  const viewerId = ctx.isAuthenticated && ctx.userId ? ctx.userId : '';

  const params = new URL(request.url).searchParams;
  const rawLimit = parseInt(params.get('limit') || String(COMMENT_PAGE_SIZE), 10);
  const limit = Math.max(1, Math.min(Number.isFinite(rawLimit) ? rawLimit : COMMENT_PAGE_SIZE, 100));
  const before = (params.get('before') || '').trim() || null;
  const beforeId = (params.get('before_id') || '').trim() || null;

  try {
    const cursorSql = before
      ? beforeId
        ? 'AND (pe.created_at < ? OR (pe.created_at = ? AND pe.id < ?))'
        : 'AND pe.created_at < ?'
      : '';
    const cursorArgs = before ? (beforeId ? [before, before, beforeId] : [before]) : [];
    const blockSql = viewerId
      ? `AND NOT EXISTS (
           SELECT 1 FROM user_relationships r
           WHERE r.type = 'block'
             AND ((r.user_id = ? AND r.target_user_id = pe.user_id)
               OR (r.user_id = pe.user_id AND r.target_user_id = ?))
         )`
      : '';
    const blockArgs = viewerId ? [viewerId, viewerId] : [];

    // Newest page (DESC) flipped to chronological order; `before` pages back in time.
    const comments = await env.DB.prepare(
      `SELECT 
        pe.*,
        u.metadata as user_metadata,
        u.is_instructor
      FROM post_engagement pe
      JOIN users u ON pe.user_id = u.id
      JOIN posts p ON p.id = pe.post_id
      WHERE pe.post_id = ? AND pe.type = 'comment'
        AND COALESCE(p.is_hidden, 0) = 0
        ${blockSql}
        ${cursorSql}
      ORDER BY pe.created_at DESC, pe.id DESC
      LIMIT ?`
    )
      .bind(postId, ...blockArgs, ...cursorArgs, limit)
      .all<{
        id: string;
        post_id: string;
        user_id: string;
        type: string;
        content: string;
        created_at: string;
        user_metadata: string;
        is_instructor: boolean;
      }>();
    const rows = (comments.results || []).slice().reverse();

    const formattedComments = rows.map((comment) => {
      let userMeta: { username?: string; avatar?: string } = {};
      try {
        userMeta = JSON.parse(comment.user_metadata || '{}');
      } catch {
        userMeta = {};
      }
      return {
        id: comment.id,
        post_id: comment.post_id,
        user_id: comment.user_id,
        content: comment.content,
        created_at: comment.created_at,
        user: {
          id: comment.user_id,
          username: userMeta.username,
          avatar: userMeta.avatar,
          is_instructor: comment.is_instructor,
        },
      };
    });

    return json(formattedComments);
  } catch (err) {
    console.error('[getComments] Error:', err);
    return error('DATABASE_ERROR', 'Failed to fetch comments', 500);
  }
}

/**
 * POST /api/v1/feed/posts/:postId/comments
 * Create a comment on a post
 */
export async function createComment(
  request: Request,
  env: Env,
  postId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  // Verify post exists and is not soft-hidden
  const post = await env.DB.prepare(
    'SELECT id, user_id FROM posts WHERE id = ? AND COALESCE(is_hidden, 0) = 0'
  )
    .bind(postId)
    .first<{ id: string; user_id: string }>();

  if (!post) {
    return error('POST_NOT_FOUND', 'Post not found', 404);
  }

  if (post.user_id !== ctx.userId && (await isBlocked(env, ctx.userId, post.user_id))) {
    return error('FORBIDDEN', 'You cannot comment on this post', 403);
  }

  const validation = await validateRequest(request, createCommentSchema);
  if (!validation.success) return validation.response;

  const { content } = validation.data;

  try {
    const commentId = generateId('comment');
    await env.DB.prepare(
      `INSERT INTO post_engagement (id, post_id, user_id, type, content, created_at)
       VALUES (?, ?, ?, 'comment', ?, datetime('now'))`
    )
      .bind(commentId, postId, ctx.userId, content)
      .run();

    // Update engagement score
    await updateEngagementScore(env, postId);

    // Get user metadata for response
    const user = await env.DB.prepare('SELECT metadata, is_instructor FROM users WHERE id = ?')
      .bind(ctx.userId)
      .first<{ metadata: string; is_instructor: boolean }>();

    let userMeta: { username?: string; avatar?: string } = {};
    try {
      userMeta = JSON.parse(user?.metadata || '{}');
    } catch {
      userMeta = {};
    }

    if (post.user_id !== ctx.userId) {
      const commenterName = userMeta.username?.trim() || (await resolveUsername(env, ctx.userId));
      await createUserNotification(env, {
        userId: post.user_id,
        actorId: ctx.userId,
        type: 'post_comment',
        title: `${commenterName} commented on your post`,
        body: content.length > 140 ? `${content.slice(0, 137)}...` : content,
        refType: 'post',
        refId: postId,
        coalesceWithinMinutes: COMMENT_NOTIFY_COALESCE_MINUTES,
      });
    }

    return json(
      {
        id: commentId,
        post_id: postId,
        user_id: ctx.userId,
        content,
        created_at: new Date().toISOString(),
        user: {
          id: ctx.userId,
          username: userMeta.username,
          avatar: userMeta.avatar,
          is_instructor: user?.is_instructor || false,
        },
      },
      201
    );
  } catch (err) {
    console.error('[createComment] Error:', err);
    return error('DATABASE_ERROR', 'Failed to create comment', 500);
  }
}

/**
 * DELETE /api/v1/feed/posts/:postId/comments/:commentId
 * Delete a comment
 */
export async function deleteComment(
  request: Request,
  env: Env,
  postId: string,
  commentId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  // Comment author or the author of the post it sits on may delete it.
  const comment = await env.DB.prepare(
    `SELECT pe.user_id, p.user_id AS post_user_id
     FROM post_engagement pe
     LEFT JOIN posts p ON p.id = pe.post_id
     WHERE pe.id = ? AND pe.post_id = ? AND pe.type = ?`
  )
    .bind(commentId, postId, 'comment')
    .first<{ user_id: string; post_user_id: string | null }>();

  if (!comment) {
    return error('COMMENT_NOT_FOUND', 'Comment not found', 404);
  }

  if (comment.user_id !== ctx.userId && comment.post_user_id !== ctx.userId) {
    return error('FORBIDDEN', 'You can only delete your own comments or comments on your post', 403);
  }

  try {
    await env.DB.prepare(
      'DELETE FROM post_engagement WHERE id = ? AND post_id = ? AND type = ?'
    )
      .bind(commentId, postId, 'comment')
      .run();

    // Update engagement score
    await updateEngagementScore(env, postId);

    return json({ message: 'Comment deleted successfully' });
  } catch (err) {
    console.error('[deleteComment] Error:', err);
    return error('DATABASE_ERROR', 'Failed to delete comment', 500);
  }
}

/**
 * Update engagement score for a post
 */
async function updateEngagementScore(env: Env, postId: string): Promise<void> {
  const engagement = await env.DB.prepare(
    `SELECT 
      COUNT(CASE WHEN type = 'like' THEN 1 END) as likes,
      COUNT(CASE WHEN type = 'comment' THEN 1 END) as comments
    FROM post_engagement
    WHERE post_id = ?`
  )
    .bind(postId)
    .first<{ likes: number; comments: number }>();

  const score = (engagement?.likes || 0) * 2 + (engagement?.comments || 0) * 3;

  await env.DB.prepare('UPDATE posts SET engagement_score = ? WHERE id = ?')
    .bind(score, postId)
    .run();
}
