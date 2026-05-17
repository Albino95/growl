import { Env, RequestContext, Post } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { validateRequest, createPostSchema } from '../utils/validation';
import { generateId } from '../utils/id';

/**
 * GET /api/v1/feed/feed
 * Get personalized feed for user
 */
export async function getFeed(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  // Get user metadata
  const user = await env.DB.prepare(
    'SELECT metadata FROM users WHERE id = ?'
  )
    .bind(ctx.userId)
    .first<{ metadata: string }>();

  if (!user) {
    return error('USER_NOT_FOUND', 'User not found', 404);
  }

  const metadata = JSON.parse(user.metadata || '{}');
  const categories = metadata.categories || [];
  const blockedUsers = metadata.blockedUsers || [];
  const mutedUsers = metadata.mutedUsers || [];

  // Build query to get posts
  // Get posts from last 7 days, excluding blocked/muted users
  let query = `
    SELECT 
      p.*,
      u.metadata as user_metadata,
      u.is_instructor,
      COUNT(DISTINCT pe1.id) as likes_count,
      COUNT(DISTINCT pe2.id) as comments_count,
      (SELECT COUNT(*) FROM post_engagement pev WHERE pev.post_id = p.id AND pev.user_id = ? AND pev.type = 'like') as viewer_has_liked,
      (SELECT COUNT(DISTINCT pef.user_id) FROM post_engagement pef
        INNER JOIN user_relationships rf ON rf.user_id = ? AND rf.target_user_id = pef.user_id AND rf.type = 'friend'
        WHERE pef.post_id = p.id AND pef.type = 'like') as friend_likes_count
    FROM posts p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN post_engagement pe1 ON p.id = pe1.post_id AND pe1.type = 'like'
    LEFT JOIN post_engagement pe2 ON p.id = pe2.post_id AND pe2.type = 'comment'
    WHERE p.created_at > datetime('now', '-7 days')
  `;

  const bindings: any[] = [];

  // Filter out blocked/muted users
  if (blockedUsers.length > 0 || mutedUsers.length > 0) {
    const excludedUsers = [...new Set([...blockedUsers, ...mutedUsers])];
    query += ` AND p.user_id NOT IN (${excludedUsers.map(() => '?').join(',')})`;
    bindings.push(...excludedUsers);
  }

  query += `
    GROUP BY p.id
    ORDER BY p.engagement_score DESC, p.created_at DESC
    LIMIT 100
  `;

  const posts = await env.DB.prepare(query)
    .bind(...bindings, ctx.userId, ctx.userId)
    .all<
      Post & {
        user_metadata: string;
        is_instructor: boolean;
        likes_count: number;
        comments_count: number;
        viewer_has_liked: number;
        friend_likes_count: number;
      }
    >();

  // Apply personalization (simplified - full algorithm would be more complex)
  const personalizedPosts = posts.results.map((post) => {
    const userMeta = JSON.parse(post.user_metadata || '{}');
    const relevanceScore = calculateRelevanceScore(post, metadata, categories);

    return {
      ...post,
      metadata: {
        likes: post.likes_count || 0,
        comments: post.comments_count || 0,
        has_liked: Number(post.viewer_has_liked) > 0,
        friend_likes_count: Number(post.friend_likes_count) || 0,
        isInstructor: post.is_instructor,
        username: userMeta.username,
        avatar: userMeta.avatar,
      },
      relevanceScore,
    };
  });

  // Sort by relevance score
  personalizedPosts.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

  return json(personalizedPosts, 200);
}

/**
 * Calculate relevance score for a post
 */
function calculateRelevanceScore(
  post: Post,
  userMetadata: any,
  userCategories: string[]
): number {
  let score = 0;

  // Category match (40%)
  if (userCategories.includes(post.category)) {
    score += 40;
  }

  // Subcategory match (20%)
  if (post.subcategory && userCategories.includes(`${post.category}:${post.subcategory}`)) {
    score += 20;
  }

  // Engagement score (30%)
  score += Math.min(post.engagement_score / 10, 30);

  // Recency (10%)
  const daysSincePost = (Date.now() - new Date(post.created_at).getTime()) / (1000 * 60 * 60 * 24);
  score += Math.max(0, 10 - daysSincePost);

  return score;
}

/**
 * POST /api/v1/feed/posts
 * Create a new post
 */
export async function createPost(request: Request, env: Env): Promise<Response> {
  console.log('[createPost] ===== POST CREATION STARTED =====');
  const ctx = await getRequestContext(request, env);
  console.log('[createPost] Context:', {
    isAuthenticated: ctx.isAuthenticated,
    userId: ctx.userId,
    hasUser: !!ctx.user,
  });
  
  if (!ctx.isAuthenticated || !ctx.userId) {
    console.error('[createPost] ❌ Unauthenticated request');
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  console.log('[createPost] Creating post for user:', ctx.userId);

  const validation = await validateRequest(request, createPostSchema);
  if (!validation.success) {
    console.error('[createPost] ❌ Validation failed:', validation.response);
    return validation.response;
  }

  const { image_url, caption, category, subcategory, metadata } = validation.data;
  console.log('[createPost] Validated data:', { category, subcategory, hasImage: !!image_url, hasCaption: !!caption });

  const postId = generateId('post');
  console.log('[createPost] Generated post ID:', postId);

  try {
    await env.DB.prepare(
      `INSERT INTO posts (id, user_id, image_url, caption, category, subcategory, engagement_score, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, datetime('now'), datetime('now'))`
    )
      .bind(
        postId,
        ctx.userId,
        image_url || null,
        caption || null,
        category,
        subcategory || null,
        JSON.stringify(metadata || {})
      )
      .run();

    console.log('[createPost] Post created successfully:', postId, 'for user:', ctx.userId);

    return json(
      {
        id: postId,
        user_id: ctx.userId,
        image_url,
        caption,
        category,
        subcategory,
        engagement_score: 0,
        created_at: new Date().toISOString(),
      },
      201
    );
  } catch (err: any) {
    console.error('[createPost] ❌ Error creating post:', err);
    console.error('[createPost] Error message:', err?.message);
    console.error('[createPost] Error stack:', err?.stack);
    console.error('[createPost] User ID:', ctx.userId);
    console.error('[createPost] Post data:', { postId, category, subcategory, image_url, caption });
    
    const errorMessage = err?.message || 'Failed to create post';
    
    // Provide more helpful error messages
    if (errorMessage.includes('no such table')) {
      return error('DATABASE_ERROR', 'Posts table does not exist. Please run migrations.', 500);
    }
    if (errorMessage.includes('NOT NULL constraint')) {
      return error('VALIDATION_ERROR', 'Required fields are missing', 400, err?.message);
    }
    if (errorMessage.includes('UNIQUE constraint')) {
      return error('VALIDATION_ERROR', 'Post with this ID already exists', 409);
    }
    
    return error(
      'DATABASE_ERROR',
      'Failed to create post',
      500,
      env.ENVIRONMENT === 'development' ? errorMessage : undefined
    );
  }
}

/**
 * GET /api/v1/feed/posts/:id
 * Get a specific post
 */
export async function getPost(
  request: Request,
  env: Env,
  postId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  const viewerId = ctx.isAuthenticated && ctx.userId ? ctx.userId : '__no_viewer__';

  const post = await env.DB.prepare(
    `SELECT 
      p.*,
      u.metadata as user_metadata,
      u.is_instructor,
      COUNT(DISTINCT pe1.id) as likes_count,
      COUNT(DISTINCT pe2.id) as comments_count,
      (SELECT COUNT(*) FROM post_engagement pev WHERE pev.post_id = p.id AND pev.user_id = ? AND pev.type = 'like') as viewer_has_liked,
      (SELECT COUNT(DISTINCT pef.user_id) FROM post_engagement pef
        INNER JOIN user_relationships rf ON rf.user_id = ? AND rf.target_user_id = pef.user_id AND rf.type = 'friend'
        WHERE pef.post_id = p.id AND pef.type = 'like') as friend_likes_count
    FROM posts p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN post_engagement pe1 ON p.id = pe1.post_id AND pe1.type = 'like'
    LEFT JOIN post_engagement pe2 ON p.id = pe2.post_id AND pe2.type = 'comment'
    WHERE p.id = ?
    GROUP BY p.id`
  )
    .bind(viewerId, viewerId, postId)
    .first<
      Post & {
        user_metadata: string;
        is_instructor: boolean;
        likes_count: number;
        comments_count: number;
        viewer_has_liked: number;
        friend_likes_count: number;
      }
    >();

  if (!post) {
    return error('POST_NOT_FOUND', 'Post not found', 404);
  }

  const userMeta = JSON.parse(post.user_metadata || '{}');

  return json({
    ...post,
    metadata: {
      likes: post.likes_count || 0,
      comments: post.comments_count || 0,
      has_liked: ctx.isAuthenticated && ctx.userId ? Number(post.viewer_has_liked) > 0 : false,
      friend_likes_count: ctx.isAuthenticated && ctx.userId ? Number(post.friend_likes_count) || 0 : 0,
      isInstructor: post.is_instructor,
      username: userMeta.username,
      avatar: userMeta.avatar,
    },
  });
}

/**
 * POST /api/v1/feed/posts/:id/like
 * Like or unlike a post
 */
export async function toggleLike(
  request: Request,
  env: Env,
  postId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  // Check if already liked
  const existing = await env.DB.prepare(
    'SELECT id FROM post_engagement WHERE post_id = ? AND user_id = ? AND type = ?'
  )
    .bind(postId, ctx.userId, 'like')
    .first();

  if (existing) {
    // Unlike
    await env.DB.prepare(
      'DELETE FROM post_engagement WHERE post_id = ? AND user_id = ? AND type = ?'
    )
      .bind(postId, ctx.userId, 'like')
      .run();

    // Update engagement score
    await updateEngagementScore(env, postId);

    return json({ liked: false });
  } else {
    // Like
    const engagementId = generateId('engagement');
    await env.DB.prepare(
      'INSERT INTO post_engagement (id, post_id, user_id, type, created_at) VALUES (?, ?, ?, ?, datetime("now"))'
    )
      .bind(engagementId, postId, ctx.userId, 'like')
      .run();

    // Update engagement score
    await updateEngagementScore(env, postId);

    return json({ liked: true });
  }
}

/**
 * GET /api/v1/feed/posts/user/:userId
 * Get posts by a specific user
 */
export async function getUserPosts(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  console.log('[getUserPosts] Request for userId:', userId, 'authenticated:', ctx.isAuthenticated, 'requestingUserId:', ctx.userId);
  
  try {
    const posts = await env.DB.prepare(
      `SELECT 
        p.*,
        u.metadata as user_metadata,
        u.is_instructor,
        COUNT(DISTINCT pe1.id) as likes_count,
        COUNT(DISTINCT pe2.id) as comments_count,
        (SELECT COUNT(*) FROM post_engagement pev WHERE pev.post_id = p.id AND pev.user_id = ? AND pev.type = 'like') as viewer_has_liked,
        (SELECT COUNT(DISTINCT pef.user_id) FROM post_engagement pef
          INNER JOIN user_relationships rf ON rf.user_id = ? AND rf.target_user_id = pef.user_id AND rf.type = 'friend'
          WHERE pef.post_id = p.id AND pef.type = 'like') as friend_likes_count
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN post_engagement pe1 ON p.id = pe1.post_id AND pe1.type = 'like'
      LEFT JOIN post_engagement pe2 ON p.id = pe2.post_id AND pe2.type = 'comment'
      WHERE p.user_id = ?
      GROUP BY p.id
      ORDER BY p.created_at DESC
      LIMIT 100`
    )
      .bind(ctx.userId, ctx.userId, userId)
      .all<
        Post & {
          user_metadata: string;
          is_instructor: boolean;
          likes_count: number;
          comments_count: number;
          viewer_has_liked: number;
          friend_likes_count: number;
        }
      >();

    console.log('[getUserPosts] Found posts:', posts.results?.length || 0);

    const userPosts = posts.results.map((post) => {
      const userMeta = JSON.parse(post.user_metadata || '{}');
      return {
        ...post,
        metadata: {
          likes: post.likes_count || 0,
          comments: post.comments_count || 0,
          has_liked: Number(post.viewer_has_liked) > 0,
          friend_likes_count: Number(post.friend_likes_count) || 0,
          isInstructor: post.is_instructor,
          username: userMeta.username,
          avatar: userMeta.avatar,
        },
      };
    });

    console.log('[getUserPosts] Returning', userPosts.length, 'posts');
    return json(userPosts);
  } catch (err) {
    console.error('[getUserPosts] Error:', err);
    return error('DATABASE_ERROR', 'Failed to fetch user posts', 500);
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

  await env.DB.prepare(
    'UPDATE posts SET engagement_score = ? WHERE id = ?'
  )
    .bind(score, postId)
    .run();
}


