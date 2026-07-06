import { Env, RequestContext, Post } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { validateRequest, createPostSchema } from '../utils/validation';
import { generateId } from '../utils/id';
import { categoryRelevanceScore } from '../utils/categories';
import { getFriendUserIds } from './friends';

const MOCK_USER_COUNT = 60;
const MOCK_POSTS_PER_USER = 10;
const MOCK_CATEGORIES = [
  ['fitness', 'building-muscle'],
  ['fitness', 'cardio'],
  ['nutrition', 'meal-planning'],
  ['mindset', 'meditation'],
  ['skills', 'learning-systems'],
  ['productivity', 'deep-work'],
] as const;

type FeedLiker = {
  id: string;
  username: string;
  avatar: string | null;
  isFriend: boolean;
};

function parseMockPostId(postId: string): { userIdx: number; postIdx: number } | null {
  const modern = postId.match(/^mock-explore-post-(\d+)-(\d+)$/);
  if (modern) {
    return { userIdx: Number(modern[1]), postIdx: Number(modern[2]) };
  }
  const legacy = postId.match(/^mock-explore-post-(\d+)$/);
  if (legacy) {
    return { userIdx: Number(legacy[1]), postIdx: 1 };
  }
  return null;
}

function makeMockUser(userIdx: number) {
  return {
    id: `mock-user-${String(userIdx).padStart(2, '0')}`,
    username: `Creator ${String(userIdx).padStart(2, '0')}`,
    avatar: `https://i.pravatar.cc/200?img=${(userIdx % 70) + 1}`,
  };
}

function computeMockEngagement(userIdx: number, postIdx: number) {
  return {
    likes: 70 + ((userIdx * 11 + postIdx * 17) % 180),
    comments: 8 + ((userIdx * 7 + postIdx * 5) % 40),
  };
}

function buildMockLikers(userIdx: number, postIdx: number, count: number): FeedLiker[] {
  const likers: FeedLiker[] = [];
  for (let i = 0; i < count; i += 1) {
    const base = (userIdx * 13 + postIdx * 19 + i) % 500;
    const likerIdx = base + 1;
    likers.push({
      id: `mock-liker-${String(likerIdx).padStart(3, '0')}`,
      username: `User ${String(likerIdx).padStart(3, '0')}`,
      avatar: `https://i.pravatar.cc/200?img=${(likerIdx % 70) + 1}`,
      isFriend: i % 4 === 0,
    });
  }
  return likers;
}

/** Development-only fallback payload used for explore mode demos. */
function buildMockExplorePosts() {
  const now = Date.now();
  const items: Array<Record<string, unknown>> = [];
  for (let userIdx = 1; userIdx <= MOCK_USER_COUNT; userIdx += 1) {
    const user = makeMockUser(userIdx);
    for (let postIdx = 1; postIdx <= MOCK_POSTS_PER_USER; postIdx += 1) {
      const [category, subcategory] = MOCK_CATEGORIES[(userIdx + postIdx) % MOCK_CATEGORIES.length];
      const { likes, comments } = computeMockEngagement(userIdx, postIdx);
      const likers = buildMockLikers(userIdx, postIdx, likes);
      const friendLikers = likers.filter((x) => x.isFriend).slice(0, 8).map((x) => x.username);
      const createdAt = new Date(now - (userIdx * 6 + postIdx * 37) * 60000).toISOString();
      items.push({
        id: `mock-explore-post-${userIdx}-${postIdx}`,
        user_id: user.id,
        image_url: `https://picsum.photos/seed/mock-post-${userIdx}-${postIdx}/1200/1200`,
        caption: `${user.username}: progress update #${postIdx} in ${category}.`,
        category,
        subcategory,
        engagement_score: 60 + ((userIdx * 5 + postIdx * 3) % 40),
        created_at: createdAt,
        updated_at: createdAt,
        metadata: {
          likes,
          comments,
          has_liked: false,
          friend_likes_count: friendLikers.length,
          friend_likers: friendLikers,
          is_friend: false,
          isInstructor: userIdx % 5 === 0,
          username: user.username,
          avatar: user.avatar,
        },
      });
    }
  }
  return items;
}

/**
 * GET /api/v1/feed/feed
 * Get personalized feed for user
 */
export async function getFeed(request: Request, env: Env): Promise<Response> {
  // Query flags are used to switch between home feed and explore behavior.
  const url = new URL(request.url);
  const isExploreMode = url.searchParams.get('mode') === 'explore';
  const allowDevMock = env.ENVIRONMENT === 'development' && url.searchParams.get('mock') === '1';
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
    WHERE p.created_at > datetime('now', '-7 days')
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
    LIMIT 100
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

  const scoredPosts = (posts.results || []).map((post) => {
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
      const catScore = categoryRelevanceScore(categories, post.category, post.subcategory);
      const daysSincePost =
        (Date.now() - new Date(post.created_at).getTime()) / (1000 * 60 * 60 * 24);
      const isOwn = post.user_id === ctx.userId;
      const isFriend = friendIds.has(post.user_id);
      let relevanceScore = catScore + Math.max(0, 10 - daysSincePost);
      if (isFriend) relevanceScore += 25;
      if (isOwn) relevanceScore += 100;

      return {
        ...post,
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
      // Feed mode stays narrow: own posts + friend posts only.
      if (!isExploreMode) {
        if (post.isOwn) return true;
        if (!categories.length) return false;
        return post.isFriend;
      }

      // Explore mode stays discovery-focused: non-friends only.
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

  if (isExploreMode && allowDevMock && personalizedPosts.length === 0) {
    return json(buildMockExplorePosts(), 200);
  }

  return json(
    personalizedPosts.map(({ relevanceScore, isOwn, isFriend, ...rest }) => rest),
    200
  );
}

/**
 * POST /api/v1/feed/posts
 * Create a new post
 */
/** Creates a feed post after schema validation and inserts base engagement fields. */
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

  const mockParsed = parseMockPostId(postId);
  if (mockParsed) {
    const { userIdx, postIdx } = mockParsed;
    const legacyLikeMap: Record<string, number> = {
      'mock-explore-post-1': 187,
      'mock-explore-post-2': 133,
      'mock-explore-post-3': 101,
    };
    const { likes: computedLikes } = computeMockEngagement(userIdx, postIdx);
    const likes = legacyLikeMap[postId] ?? computedLikes;
    const likers = buildMockLikers(userIdx, postIdx, likes);
    const friendLikers = likers.filter((x) => x.isFriend);
    return json({
      likes: likers.length,
      likers,
      friendLikesCount: friendLikers.length,
      friendLikers,
    });
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


