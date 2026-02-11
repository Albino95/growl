import { Env } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { validateRequest } from '../utils/validation';
import { generateId } from '../utils/id';
import { z } from 'zod';

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
  try {
    const comments = await env.DB.prepare(
      `SELECT 
        pe.*,
        u.metadata as user_metadata,
        u.is_instructor
      FROM post_engagement pe
      JOIN users u ON pe.user_id = u.id
      WHERE pe.post_id = ? AND pe.type = 'comment'
      ORDER BY pe.created_at ASC`
    )
      .bind(postId)
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

    const formattedComments = comments.results.map((comment) => {
      const userMeta = JSON.parse(comment.user_metadata || '{}');
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

  // Verify post exists
  const post = await env.DB.prepare('SELECT id FROM posts WHERE id = ?')
    .bind(postId)
    .first();

  if (!post) {
    return error('POST_NOT_FOUND', 'Post not found', 404);
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

    const userMeta = JSON.parse(user?.metadata || '{}');

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

  // Check if comment exists and belongs to user
  const comment = await env.DB.prepare(
    'SELECT user_id FROM post_engagement WHERE id = ? AND post_id = ? AND type = ?'
  )
    .bind(commentId, postId, 'comment')
    .first<{ user_id: string }>();

  if (!comment) {
    return error('COMMENT_NOT_FOUND', 'Comment not found', 404);
  }

  if (comment.user_id !== ctx.userId) {
    return error('FORBIDDEN', 'You can only delete your own comments', 403);
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
