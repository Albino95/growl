import { Env, RequestContext, Post } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { validateRequest, createPostSchema, isPublishableMediaUrl } from '../utils/validation';
import { generateId } from '../utils/id';
import { alignPostTaxonomy, categoryRelevanceScore } from '../utils/categories';
import { getFriendUserIds } from './friends';
import { POINTS, awardPoints } from '../utils/points';

type FeedLiker = {
  id: string;
  username: string;
  avatar: string | null;
  isFriend: boolean;
};

/**
 * GET /api/v1/feed/feed
 * Get personalized feed for user
 */
export async function getFeed(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const feedMode = url.searchParams.get('mode') || 'home';
  const isExploreMode = feedMode === 'explore';
  const isForYouMode = feedMode === 'foryou' || feedMode === 'home';
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
  const blockedUsersFromMeta = Array.isArray(metadata.blockedUsers) ? metadata.blockedUsers : [];
  const mutedUsersFromMeta = Array.isArray(metadata.mutedUsers) ? metadata.mutedUsers : [];
  const moderationRows = await env.DB.prepare(
    `SELECT target_user_id, type
     FROM user_relationships
     WHERE user_id = ? AND type IN ('block', 'mute')`
  )
    .bind(ctx.userId)
    .all<{ target_user_id: string; type: string }>();
  const blockedUsers = new Set<string>(blockedUsersFromMeta);
  const mutedUsers = new Set<string>(mutedUsersFromMeta);
  for (const row of moderationRows.results || []) {
    if (row.type === 'block') blockedUsers.add(row.target_user_id);
    if (row.type === 'mute') mutedUsers.add(row.target_user_id);
  }

  // Pull a recent post window and hydrate engagement counters in one query.
  // Explore needs a wider window so discovery isn't empty after a quiet week.
  // Home uses 21 days so seeded / quieter accounts still see a populated feed.
  const recencyWindow = isExploreMode ? '-45 days' : '-21 days';
  const feedLimit = isExploreMode ? 80 : 50;
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
        WHERE pef.post_id = p.id AND pef.type = 'like') as friend_likes_count,
      (SELECT GROUP_CONCAT(DISTINCT COALESCE(json_extract(ul.metadata, '$.username'), substr(ul.id, 1, 8)))
        FROM post_engagement pef
        INNER JOIN user_relationships rf ON rf.user_id = ? AND rf.target_user_id = pef.user_id AND rf.type = 'friend'
        INNER JOIN users ul ON ul.id = pef.user_id
        WHERE pef.post_id = p.id AND pef.type = 'like') as friend_likers_csv
    FROM posts p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN post_engagement pe1 ON p.id = pe1.post_id AND pe1.type = 'like'
    LEFT JOIN post_engagement pe2 ON p.id = pe2.post_id AND pe2.type = 'comment'
    WHERE p.created_at > datetime('now', '${recencyWindow}')
      AND COALESCE(p.is_hidden, 0) = 0
      AND p.image_url IS NOT NULL
      AND trim(p.image_url) != ''
      AND p.image_url LIKE 'https://%'
  `;

  const bindings: any[] = [];

  // Exclusion list merges metadata-based moderation with relationship-table moderation.
  if (blockedUsers.size > 0 || mutedUsers.size > 0) {
    const excludedUsers = [...new Set([...blockedUsers, ...mutedUsers])];
    query += ` AND p.user_id NOT IN (${excludedUsers.map(() => '?').join(',')})`;
    bindings.push(...excludedUsers);
  }

  query += `
    GROUP BY p.id
    ORDER BY p.engagement_score DESC, p.created_at DESC
    LIMIT ${feedLimit}
  `;

  const posts = await env.DB.prepare(query)
    .bind(ctx.userId, ctx.userId, ctx.userId, ...bindings)
    .all<
      Post & {
        user_metadata: string;
        is_instructor: boolean;
        likes_count: number;
        comments_count: number;
        viewer_has_liked: number;
        friend_likes_count: number;
        friend_likers_csv?: string | null;
      }
    >();

  const friendIds = await getFriendUserIds(env, ctx.userId);

  const scoredPosts = (posts.results || [])
    .filter((post) => {
      const url = typeof post.image_url === 'string' ? post.image_url.trim() : '';
      return /^https:\/\//i.test(url);
    })
    .map((post) => {
      const userMeta = JSON.parse(post.user_metadata || '{}');
      let postMeta: Record<string, unknown> = {};
      try {
        postMeta =
          typeof post.metadata === 'string'
            ? JSON.parse(post.metadata || '{}')
            : (post.metadata as Record<string, unknown>) || {};
      } catch {
        postMeta = {};
      }
      const ownerPaths = Array.isArray(userMeta.categories)
        ? userMeta.categories.map((x: unknown) => String(x))
        : [];
      const aligned = alignPostTaxonomy(ownerPaths, post.category, post.subcategory);
      const catScore = categoryRelevanceScore(categories, aligned.category, aligned.subcategory);
      const daysSincePost =
        (Date.now() - new Date(post.created_at).getTime()) / (1000 * 60 * 60 * 24);
      const isOwn = post.user_id === ctx.userId;
      const isFriend = friendIds.has(post.user_id);
      const likes = Number(post.likes_count) || 0;
      const comments = Number(post.comments_count) || 0;
      const engagementBoost = Math.min(28, likes * 1.4 + comments * 2.2);
      const instructorBoost = post.is_instructor ? 8 : 0;
      // Explore favors category match + engagement; home favors friends + recency.
      let relevanceScore = isExploreMode
        ? catScore * 1.35 + Math.max(0, 18 - daysSincePost * 0.55) + engagementBoost + instructorBoost
        : catScore + Math.max(0, 10 - daysSincePost) + engagementBoost * 0.45;
      if (isFriend) relevanceScore += isExploreMode ? 6 : 25;
      if (isOwn) relevanceScore += 100;

      return {
        ...post,
        category: aligned.category,
        subcategory: aligned.subcategory,
        metadata: {
          ...postMeta,
          likes: post.likes_count || 0,
          comments: post.comments_count || 0,
          has_liked: Number(post.viewer_has_liked) > 0,
          friend_likes_count: Number(post.friend_likes_count) || 0,
          friend_likers:
            typeof post.friend_likers_csv === 'string' && post.friend_likers_csv.length > 0
              ? post.friend_likers_csv.split(',').map((x) => x.trim()).filter(Boolean)
              : [],
          is_friend: isFriend,
          isInstructor: post.is_instructor,
          username: userMeta.username,
          avatar: userMeta.avatar,
        },
        relevanceScore,
        isOwn,
        isFriend,
      };
    });

  const scopedPosts = scoredPosts.filter((post) => {
      // Home: own + friends (any path) + non-friends whose post matches the viewer's paths.
      // Category chips on the client narrow further; see docs/FEATURES.md "Cross-path posts".
      if (!isExploreMode) {
        if (post.isOwn || post.isFriend) return true;
        if (!categories.length) return false;
        return categoryRelevanceScore(categories, post.category, post.subcategory) > 0;
      }

      // Explore: discovery of non-friends only (friends belong on Home).
      if (post.isOwn) return false;
      return !post.isFriend;
    });

  // If strict home-feed rules produce no cards, fall back to best available non-muted posts.
  // This prevents a successful-but-empty feed for new users without connections yet.
  let personalizedPosts = scopedPosts;
  if (!isExploreMode && personalizedPosts.length === 0) {
    personalizedPosts = scoredPosts.filter((post) => !post.isOwn);
  }

  personalizedPosts.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

  const formatPost = (post: (typeof scoredPosts)[number]) => {
    const { relevanceScore, isOwn, isFriend, ...rest } = post;
    return {
      ...rest,
      relevance_score: relevanceScore ?? 0,
      feed_section: isOwn || isFriend ? 'following' : 'suggested',
    };
  };

  if (isForYouMode && !isExploreMode) {
    let following = personalizedPosts.filter((p) => p.isOwn || p.isFriend);
    let suggested = scoredPosts
      .filter((p) => !p.isOwn && !p.isFriend)
      .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

    const MIN_SUGGESTED = 5;
    if (categories.length > 0 && suggested.length < MIN_SUGGESTED) {
      const seen = new Set(suggested.map((p) => p.id));
      for (const post of scoredPosts.filter((p) => !p.isOwn && !p.isFriend)) {
        if (seen.has(post.id)) continue;
        suggested.push(post);
        seen.add(post.id);
        if (suggested.length >= MIN_SUGGESTED) break;
      }
    }

    if (following.length === 0 && suggested.length === 0 && personalizedPosts.length > 0) {
      suggested = personalizedPosts.filter((p) => !p.isOwn);
    }

    following = following.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    suggested = suggested.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

    return json(
      {
        following: following.map(formatPost),
        suggested: suggested.map(formatPost),
      },
      200
    );
  }

  return json(personalizedPosts.map(formatPost), 200);
}

/**
 * POST /api/v1/feed/posts
 * Create a new post
 */
/** Creates a feed post after schema validation and inserts base engagement fields. */
export async function createPost(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    console.error('[createPost] ❌ Unauthenticated request');
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  const validation = await validateRequest(request, createPostSchema);
  if (!validation.success) {
    console.error('[createPost] ❌ Validation failed:', validation.response);
    return validation.response;
  }

  const { image_url, caption, category, subcategory, metadata } = validation.data;

  // Fail closed: never insert a wall post without hosted media (no stock substitution).
  if (!isPublishableMediaUrl(image_url)) {
    return error(
      'MEDIA_REQUIRED',
      'Your photo was not saved. The post was not published — your draft is still on your device. Upload again and retry.',
      400
    );
  }

  const postId = generateId('post');

  const userRow = await env.DB.prepare('SELECT metadata, is_instructor FROM users WHERE id = ?')
    .bind(ctx.userId)
    .first<{ metadata: string; is_instructor: number }>();
  let userMeta: Record<string, unknown> = {};
  try {
    userMeta = JSON.parse(userRow?.metadata || '{}');
  } catch {
    userMeta = {};
  }
  const username =
    typeof userMeta.username === 'string' && userMeta.username.trim()
      ? userMeta.username.trim()
      : undefined;
  const avatar =
    typeof userMeta.avatar === 'string' && userMeta.avatar.trim()
      ? userMeta.avatar.trim()
      : undefined;

  try {
    const postMetadata = {
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
      ...(username ? { username } : {}),
      ...(avatar ? { avatar } : {}),
      isInstructor: !!userRow?.is_instructor,
    };

    await env.DB.prepare(
      `INSERT INTO posts (id, user_id, image_url, caption, category, subcategory, engagement_score, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, datetime('now'), datetime('now'))`
    )
      .bind(
        postId,
        ctx.userId,
        image_url.trim(),
        caption || null,
        category,
        subcategory || null,
        JSON.stringify(postMetadata)
      )
      .run();

    const pointsTotal = await awardPoints(env, ctx.userId, POINTS.CREATE_POST);

    return json(
      {
        id: postId,
        user_id: ctx.userId,
        image_url,
        caption,
        category,
        subcategory,
        engagement_score: 0,
        points_awarded: POINTS.CREATE_POST,
        points_total: pointsTotal ?? undefined,
        created_at: new Date().toISOString(),
        metadata: {
          ...postMetadata,
          likes: 0,
          comments: 0,
          has_liked: false,
          username,
          avatar,
          isInstructor: !!userRow?.is_instructor,
        },
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
  // Supports authenticated and anonymous viewers by using a sentinel viewer id.
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
      AND COALESCE(p.is_hidden, 0) = 0
      AND p.image_url IS NOT NULL
      AND trim(p.image_url) != ''
      AND p.image_url LIKE 'https://%'
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
  let postMeta: Record<string, unknown> = {};
  try {
    postMeta =
      typeof post.metadata === 'string'
        ? JSON.parse(post.metadata || '{}')
        : (post.metadata as Record<string, unknown>) || {};
  } catch {
    postMeta = {};
  }
  const ownerPaths = Array.isArray(userMeta.categories)
    ? userMeta.categories.map((x: unknown) => String(x))
    : [];
  const aligned = alignPostTaxonomy(ownerPaths, post.category, post.subcategory);

  return json({
    ...post,
    category: aligned.category,
    subcategory: aligned.subcategory,
    metadata: {
      ...postMeta,
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
  // Toggle endpoint keeps client API simple: one action for like/unlike.
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
 * GET /api/v1/feed/posts/:id/likes
 * Get users who liked a post (including friend subset)
 */
export async function getPostLikes(
  request: Request,
  env: Env,
  postId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  const friendIds = await getFriendUserIds(env, ctx.userId);
  const rows = await env.DB.prepare(
    `SELECT pe.user_id, u.metadata
     FROM post_engagement pe
     JOIN users u ON u.id = pe.user_id
     WHERE pe.post_id = ? AND pe.type = 'like'
     ORDER BY pe.created_at DESC`
  )
    .bind(postId)
    .all<{ user_id: string; metadata: string }>();

  const likers: FeedLiker[] = (rows.results || []).map((row) => {
    const meta = JSON.parse(row.metadata || '{}');
    return {
      id: row.user_id,
      username: meta.username || row.user_id.slice(0, 8),
      avatar: meta.avatar || null,
      isFriend: friendIds.has(row.user_id),
    };
  });
  const friendLikers = likers.filter((x) => x.isFriend);
  return json({
    likes: likers.length,
    likers,
    friendLikesCount: friendLikers.length,
    friendLikers,
  });
}

/**
 * GET /api/v1/feed/posts/user/:userId
 * Get posts by a specific user
 */
/** Returns profile-grid posts for a given user with viewer-aware metadata. */
export async function getUserPosts(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

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
        AND COALESCE(p.is_hidden, 0) = 0
        AND p.image_url IS NOT NULL
        AND trim(p.image_url) != ''
        AND p.image_url LIKE 'https://%'
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

    let pinnedIds: string[] = [];
    try {
      const ownerRow = await env.DB.prepare('SELECT metadata FROM users WHERE id = ?')
        .bind(userId)
        .first<{ metadata: string }>();
      const om = JSON.parse(ownerRow?.metadata || '{}');
      pinnedIds = Array.isArray(om.pinned_post_ids)
        ? om.pinned_post_ids.filter((x: unknown) => typeof x === 'string').slice(0, 3)
        : [];
    } catch {
      pinnedIds = [];
    }
    const pinRank = new Map(pinnedIds.map((id, i) => [id, i]));

    const userPosts = posts.results.map((post) => {
      const userMeta = JSON.parse(post.user_metadata || '{}');
      let postMeta: Record<string, unknown> = {};
      try {
        postMeta =
          typeof post.metadata === 'string'
            ? JSON.parse(post.metadata || '{}')
            : (post.metadata as Record<string, unknown>) || {};
      } catch {
        postMeta = {};
      }
      const ownerPaths = Array.isArray(userMeta.categories)
        ? userMeta.categories.map((x: unknown) => String(x))
        : [];
      const aligned = alignPostTaxonomy(ownerPaths, post.category, post.subcategory);
      const isPinned = pinRank.has(post.id);
      return {
        ...post,
        category: aligned.category,
        subcategory: aligned.subcategory,
        metadata: {
          ...postMeta,
          likes: post.likes_count || 0,
          comments: post.comments_count || 0,
          has_liked: Number(post.viewer_has_liked) > 0,
          friend_likes_count: Number(post.friend_likes_count) || 0,
          isInstructor: post.is_instructor,
          username: userMeta.username,
          avatar: userMeta.avatar,
          is_pinned: isPinned,
        },
      };
    });

    userPosts.sort((a, b) => {
      const ap = pinRank.has(a.id) ? pinRank.get(a.id)! : 999;
      const bp = pinRank.has(b.id) ? pinRank.get(b.id)! : 999;
      if (ap !== bp) return ap - bp;
      return String(b.created_at).localeCompare(String(a.created_at));
    });

    return json(userPosts);
  } catch (err) {
    console.error('[getUserPosts] Error:', err);
    return error('DATABASE_ERROR', 'Failed to fetch user posts', 500);
  }
}

/**
 * Update engagement score for a post
 */
/** Recalculates weighted engagement score after any like/comment mutation. */
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


