import { Env, RequestContext, Post } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { validateRequest, createPostSchema, isPublishableMediaUrl, sanitizeCoverUrl } from '../utils/validation';
import { generateId } from '../utils/id';
import { alignPostTaxonomy, categoryRelevanceScore } from '../utils/categories';
import { getFriendUserIds } from './friends';
import { POINTS, awardPoints } from '../utils/points';
import { createUserNotification, resolveUsername } from '../utils/notifications';
import { recordActivity } from '../utils/activity';
import { awardBadgeSafe } from '../utils/badges';
import { recordPostMentions } from '../utils/mentions';

type FeedLiker = {
  id: string;
  username: string;
  avatar: string | null;
  isFriend: boolean;
};

/** Page size when the client asks for paging (cursor and/or limit). */
export const FEED_PAGE_DEFAULT = 20;
export const FEED_PAGE_MAX = 50;
/** Legacy single-shot sizes (no cursor, no limit) — what old app builds have always received. */
const LEGACY_HOME_LIMIT = 50;
const LEGACY_EXPLORE_LIMIT = 80;
/**
 * Candidate window ranked per request. The ranking is score-based (paths, friends,
 * recency, engagement), so it is computed in JS over this window and then sliced
 * with a keyset over (section, score, id).
 */
const HOME_CANDIDATE_CAP = 400;
const EXPLORE_CANDIDATE_CAP = 500;

type FeedModeKey = 'foryou' | 'explore' | 'home';

/**
 * Opaque cursor. `t` freezes the snapshot time so recency scores and the candidate
 * window (no posts newer than `t`) are identical on every page; `r/s/i` is the
 * keyset position of the last item sent (section rank asc, score desc, id asc).
 */
type FeedCursor = { v: 1; m: FeedModeKey; t: number; r: number; s: number; i: string };

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeFeedCursor(c: FeedCursor): string {
  return toBase64Url(JSON.stringify(c));
}

export function decodeFeedCursor(raw: string): FeedCursor | null {
  if (!raw || raw.length > 512) return null;
  try {
    const c = JSON.parse(fromBase64Url(raw)) as Partial<FeedCursor>;
    if (
      c &&
      c.v === 1 &&
      (c.m === 'foryou' || c.m === 'explore' || c.m === 'home') &&
      typeof c.t === 'number' &&
      Number.isFinite(c.t) &&
      typeof c.r === 'number' &&
      typeof c.s === 'number' &&
      Number.isFinite(c.s) &&
      typeof c.i === 'string' &&
      c.i.length > 0 &&
      c.i.length <= 128
    ) {
      return c as FeedCursor;
    }
  } catch {
    // fall through
  }
  return null;
}

/** SQLite datetime text for a JS epoch ms (UTC, second precision). */
function sqliteDateTime(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
}

type RankedCandidate = {
  id: string;
  user_id: string;
  category: string;
  subcategory: string | null;
  relevanceScore: number;
  isOwn: boolean;
  isFriend: boolean;
  /** 0 = following section (own + friends), 1 = suggested. Always 0 outside foryou. */
  sectionRank: number;
};

/** Keyset order: section asc, score desc, id asc (fully deterministic). */
function compareRanked(a: RankedCandidate, b: RankedCandidate): number {
  if (a.sectionRank !== b.sectionRank) return a.sectionRank - b.sectionRank;
  if (a.relevanceScore !== b.relevanceScore) return b.relevanceScore - a.relevanceScore;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function isAfterCursor(p: RankedCandidate, c: FeedCursor): boolean {
  if (p.sectionRank !== c.r) return p.sectionRank > c.r;
  if (p.relevanceScore !== c.s) return p.relevanceScore < c.s;
  return p.id > c.i;
}

/**
 * GET /api/v1/feed/feed?mode=foryou|home|explore&cursor=&limit=
 *
 * Without `cursor` and `limit` it returns the legacy first page (50 home / 80
 * explore). With either, pages are `limit` (default 20, max 50). The next page
 * token is in `meta.next_cursor` for every mode and also `data.next_cursor` in
 * foryou mode (object payload); null when there is nothing more.
 */
export async function getFeed(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const feedMode = url.searchParams.get('mode') || 'home';
  const isExploreMode = feedMode === 'explore';
  const isForYouMode = feedMode === 'foryou' || feedMode === 'home';
  const modeKey: FeedModeKey = isExploreMode ? 'explore' : isForYouMode ? 'foryou' : 'home';
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  // Viewer metadata comes from the users row getRequestContext already loaded.
  const user = ctx.user;
  if (!user) {
    return error('USER_NOT_FOUND', 'User not found', 404);
  }

  const cursorParam = url.searchParams.get('cursor');
  const limitParam = url.searchParams.get('limit');
  let cursor: FeedCursor | null = null;
  if (cursorParam) {
    cursor = decodeFeedCursor(cursorParam);
    if (!cursor || cursor.m !== modeKey) {
      return error('INVALID_CURSOR', 'This feed page has expired. Pull to refresh.', 400);
    }
  }
  const paged = cursorParam !== null || limitParam !== null;
  let pageSize: number;
  if (paged) {
    const n = limitParam === null ? FEED_PAGE_DEFAULT : Number.parseInt(limitParam, 10);
    pageSize = Number.isFinite(n) ? Math.min(FEED_PAGE_MAX, Math.max(1, n)) : FEED_PAGE_DEFAULT;
  } else {
    pageSize = isExploreMode ? LEGACY_EXPLORE_LIMIT : LEGACY_HOME_LIMIT;
  }
  // Snapshot time: frozen by the cursor so scores and the window match page 1.
  const nowMs = Date.now();
  const asOfMs = cursor ? Math.min(cursor.t, nowMs) : nowMs;
  const asOf = sqliteDateTime(asOfMs);

  let metadata: Record<string, any> = {};
  try {
    metadata = JSON.parse(user.metadata || '{}');
  } catch {
    metadata = {};
  }
  const categories = metadata.categories || [];
  // Legacy moderation lists stored on the user row. Relationship-table blocks/mutes
  // are excluded with a subquery (any count); the legacy list is inlined but capped
  // so the query stays well under D1's 100 bound-parameter limit.
  const legacyExcludedAll = new Set<string>(
    [
      ...(Array.isArray(metadata.blockedUsers) ? metadata.blockedUsers : []),
      ...(Array.isArray(metadata.mutedUsers) ? metadata.mutedUsers : []),
    ].filter((x: unknown): x is string => typeof x === 'string' && x.length > 0)
  );
  // First 80 inline in SQL; any remainder is filtered after the fetch.
  const legacyExcluded = [...legacyExcludedAll].slice(0, 80);

  // Phase 1: light candidate rows (enough to score). Explore needs a wider window
  // so discovery isn't empty after a quiet week; home uses 21 days so seeded /
  // quieter accounts still see a populated feed.
  const recencyWindow = isExploreMode ? '-45 days' : '-21 days';
  const candidateCap = isExploreMode ? EXPLORE_CANDIDATE_CAP : HOME_CANDIDATE_CAP;
  let candidateSql = `
    SELECT
      p.id, p.user_id, p.category, p.subcategory, p.created_at, p.image_url,
      u.is_instructor,
      json_extract(u.metadata, '$.categories') as owner_categories,
      (SELECT COUNT(*) FROM post_engagement pl WHERE pl.post_id = p.id AND pl.type = 'like') as likes_count,
      (SELECT COUNT(*) FROM post_engagement pc WHERE pc.post_id = p.id AND pc.type = 'comment') as comments_count
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.created_at > datetime(?, '${recencyWindow}')
      AND datetime(p.created_at) <= datetime(?)
      AND COALESCE(p.is_hidden, 0) = 0
      AND p.image_url IS NOT NULL
      AND trim(p.image_url) != ''
      AND p.image_url LIKE 'https://%'
      AND p.user_id NOT IN (
        SELECT target_user_id FROM user_relationships WHERE user_id = ? AND type IN ('mute', 'block')
      )`;
  const candidateBindings: unknown[] = [asOf, asOf, ctx.userId];
  if (legacyExcluded.length > 0) {
    candidateSql += ` AND p.user_id NOT IN (${legacyExcluded.map(() => '?').join(',')})`;
    candidateBindings.push(...legacyExcluded);
  }
  candidateSql += `
    ORDER BY p.engagement_score DESC, p.created_at DESC, p.id ASC
    LIMIT ${candidateCap}`;

  const [candidateRes, friendIds] = await Promise.all([
    env.DB.prepare(candidateSql)
      .bind(...candidateBindings)
      .all<{
        id: string;
        user_id: string;
        category: string;
        subcategory: string | null;
        created_at: string;
        image_url: string | null;
        is_instructor: number | boolean | null;
        owner_categories: string | null;
        likes_count: number;
        comments_count: number;
      }>(),
    getFriendUserIds(env, ctx.userId),
  ]);

  const scored: RankedCandidate[] = (candidateRes.results || [])
    .filter((post) => {
      if (legacyExcludedAll.has(post.user_id)) return false;
      const u = typeof post.image_url === 'string' ? post.image_url.trim() : '';
      return /^https:\/\//i.test(u);
    })
    .map((post) => {
      let ownerPaths: string[] = [];
      try {
        const parsed = post.owner_categories ? JSON.parse(post.owner_categories) : [];
        ownerPaths = Array.isArray(parsed) ? parsed.map((x: unknown) => String(x)) : [];
      } catch {
        ownerPaths = [];
      }
      const aligned = alignPostTaxonomy(ownerPaths, post.category, post.subcategory);
      const catScore = categoryRelevanceScore(categories, aligned.category, aligned.subcategory);
      const daysSincePost = (asOfMs - new Date(post.created_at).getTime()) / (1000 * 60 * 60 * 24);
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
      if (!Number.isFinite(relevanceScore)) relevanceScore = 0;
      return {
        id: post.id,
        user_id: post.user_id,
        category: aligned.category,
        subcategory: aligned.subcategory,
        relevanceScore,
        isOwn,
        isFriend,
        sectionRank: isForYouMode && !isExploreMode && !(isOwn || isFriend) ? 1 : 0,
      };
    });

  let ranked: RankedCandidate[];
  if (isExploreMode) {
    // Explore: discovery of non-friends only (friends belong on Home).
    ranked = scored.filter((p) => !p.isOwn && !p.isFriend);
  } else if (isForYouMode) {
    // For You: following (own + friends) section first, then everyone else.
    ranked = scored;
  } else {
    // Home (array): own + friends + non-friends whose post matches the viewer's paths.
    // Category chips on the client narrow further; see docs/FEATURES.md "Cross-path posts".
    ranked = scored.filter((post) => {
      if (post.isOwn || post.isFriend) return true;
      if (!categories.length) return false;
      return categoryRelevanceScore(categories, post.category, post.subcategory) > 0;
    });
    // Strict rules produced nothing: fall back to best available non-own posts so
    // new users without connections don't get a successful-but-empty feed.
    if (ranked.length === 0) ranked = scored.filter((p) => !p.isOwn);
  }
  ranked.sort(compareRanked);

  const remaining = cursor ? ranked.filter((p) => isAfterCursor(p, cursor!)) : ranked;
  const page = remaining.slice(0, pageSize);
  const last = page[page.length - 1];
  const nextCursor =
    remaining.length > pageSize && last
      ? encodeFeedCursor({
          v: 1,
          m: modeKey,
          t: asOfMs,
          r: last.sectionRank,
          s: last.relevanceScore,
          i: last.id,
        })
      : null;

  // Phase 2: hydrate only this page (≤ 80 ids + 3 viewer binds, under D1's 100).
  type HydratedRow = Post & {
    user_metadata: string;
    is_instructor: boolean;
    likes_count: number;
    comments_count: number;
    viewer_has_liked: number;
    friend_likes_count: number;
    friend_likers_csv?: string | null;
  };
  const hydrated = new Map<string, HydratedRow>();
  for (let i = 0; i < page.length; i += 80) {
    const ids = page.slice(i, i + 80).map((p) => p.id);
    const rows = await env.DB.prepare(
      `SELECT
        p.*,
        u.metadata as user_metadata,
        u.is_instructor,
        (SELECT COUNT(*) FROM post_engagement pl WHERE pl.post_id = p.id AND pl.type = 'like') as likes_count,
        (SELECT COUNT(*) FROM post_engagement pc WHERE pc.post_id = p.id AND pc.type = 'comment') as comments_count,
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
      WHERE p.id IN (${ids.map(() => '?').join(',')})`
    )
      .bind(ctx.userId, ctx.userId, ctx.userId, ...ids)
      .all<HydratedRow>();
    for (const row of rows.results || []) hydrated.set(row.id, row);
  }

  const formatPost = (rankedPost: RankedCandidate) => {
    const post = hydrated.get(rankedPost.id);
    if (!post) return null;
    let userMeta: Record<string, any> = {};
    try {
      userMeta = JSON.parse(post.user_metadata || '{}');
    } catch {
      userMeta = {};
    }
    let postMeta: Record<string, unknown> = {};
    try {
      postMeta =
        typeof post.metadata === 'string'
          ? JSON.parse(post.metadata || '{}')
          : (post.metadata as Record<string, unknown>) || {};
    } catch {
      postMeta = {};
    }
    const { user_metadata, likes_count, comments_count, viewer_has_liked, friend_likes_count, friend_likers_csv, ...rest } =
      post;
    void user_metadata;
    return {
      ...rest,
      category: rankedPost.category,
      subcategory: rankedPost.subcategory,
      metadata: {
        ...postMeta,
        likes: likes_count || 0,
        comments: comments_count || 0,
        has_liked: Number(viewer_has_liked) > 0,
        friend_likes_count: Number(friend_likes_count) || 0,
        friend_likers:
          typeof friend_likers_csv === 'string' && friend_likers_csv.length > 0
            ? friend_likers_csv.split(',').map((x) => x.trim()).filter(Boolean)
            : [],
        is_friend: rankedPost.isFriend,
        isInstructor: post.is_instructor,
        username: userMeta.username,
        avatar: userMeta.avatar,
      },
      // Legacy fields kept for old builds.
      likes_count,
      comments_count,
      viewer_has_liked,
      friend_likes_count,
      friend_likers_csv,
      relevance_score: rankedPost.relevanceScore ?? 0,
      feed_section: rankedPost.isOwn || rankedPost.isFriend ? 'following' : 'suggested',
    };
  };
  const formatted = page
    .map((p) => ({ p, out: formatPost(p) }))
    .filter((x): x is { p: RankedCandidate; out: NonNullable<ReturnType<typeof formatPost>> } => !!x.out);
  const meta = { next_cursor: nextCursor };

  if (isForYouMode && !isExploreMode) {
    return json(
      {
        following: formatted.filter((x) => x.p.sectionRank === 0).map((x) => x.out),
        suggested: formatted.filter((x) => x.p.sectionRank === 1).map((x) => x.out),
        next_cursor: nextCursor,
      },
      200,
      meta
    );
  }

  return json(
    formatted.map((x) => x.out),
    200,
    meta
  );
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
    const clientMeta: Record<string, unknown> =
      metadata && typeof metadata === 'object' ? { ...metadata } : {};
    // Reel poster: keep only our hosted media URLs (profile grid / feed poster).
    if ('cover_url' in clientMeta) {
      const cover = sanitizeCoverUrl(clientMeta.cover_url);
      if (cover) clientMeta.cover_url = cover;
      else delete clientMeta.cover_url;
    }
    const postMetadata = {
      ...clientMeta,
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

    await recordPostMentions(env, postId, ctx.userId, caption);
    const pointsTotal = await awardPoints(env, ctx.userId, POINTS.CREATE_POST);
    // Growth streak + badges (never fails the post).
    const growth = await recordActivity(env, ctx.userId, 'post', { path: category });

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
        new_badges: growth.newBadges,
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
      (SELECT COUNT(*) FROM post_engagement pl WHERE pl.post_id = p.id AND pl.type = 'like') as likes_count,
      (SELECT COUNT(*) FROM post_engagement pc WHERE pc.post_id = p.id AND pc.type = 'comment') as comments_count,
      (SELECT COUNT(*) FROM post_engagement pev WHERE pev.post_id = p.id AND pev.user_id = ? AND pev.type = 'like') as viewer_has_liked,
      (SELECT COUNT(DISTINCT pef.user_id) FROM post_engagement pef
        INNER JOIN user_relationships rf ON rf.user_id = ? AND rf.target_user_id = pef.user_id AND rf.type = 'friend'
        WHERE pef.post_id = p.id AND pef.type = 'like') as friend_likes_count
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.id = ?
      AND COALESCE(p.is_hidden, 0) = 0
      AND p.image_url IS NOT NULL
      AND trim(p.image_url) != ''
      AND p.image_url LIKE 'https://%'`
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

  // Race-safe toggle: insert the like only if absent. The unique partial index
  // uq_post_engagement_like (post_id, user_id WHERE type='like') turns a concurrent
  // duplicate insert into a no-op. Nothing inserted → the like already existed → unlike.
  const engagementId = generateId('engagement');
  const inserted = await env.DB.prepare(
    `INSERT INTO post_engagement (id, post_id, user_id, type, created_at)
     SELECT ?, ?, ?, 'like', datetime('now')
     WHERE NOT EXISTS (
       SELECT 1 FROM post_engagement WHERE post_id = ? AND user_id = ? AND type = 'like'
     )
     ON CONFLICT DO NOTHING`
  )
    .bind(engagementId, postId, ctx.userId, postId, ctx.userId)
    .run();
  const insertedRows = Number((inserted as { meta?: { changes?: number } } | null)?.meta?.changes ?? 0);

  if (insertedRows === 0) {
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
    // Update engagement score
    await updateEngagementScore(env, postId);

    const post = await env.DB.prepare('SELECT user_id FROM posts WHERE id = ?')
      .bind(postId)
      .first<{ user_id: string }>();
    if (post?.user_id && post.user_id !== ctx.userId) {
      const likerName = await resolveUsername(env, ctx.userId);
      await createUserNotification(env, {
        userId: post.user_id,
        actorId: ctx.userId,
        type: 'post_like',
        title: `${likerName} liked your post`,
        body: null,
        refType: 'post',
        refId: postId,
        oncePerActorAndRef: true,
      });
      await awardBadgeSafe(env, post.user_id, 'first_encourage_received');
    }

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
        (SELECT COUNT(*) FROM post_engagement pl WHERE pl.post_id = p.id AND pl.type = 'like') as likes_count,
        (SELECT COUNT(*) FROM post_engagement pc WHERE pc.post_id = p.id AND pc.type = 'comment') as comments_count,
        (SELECT COUNT(*) FROM post_engagement pev WHERE pev.post_id = p.id AND pev.user_id = ? AND pev.type = 'like') as viewer_has_liked,
        (SELECT COUNT(DISTINCT pef.user_id) FROM post_engagement pef
          INNER JOIN user_relationships rf ON rf.user_id = ? AND rf.target_user_id = pef.user_id AND rf.type = 'friend'
          WHERE pef.post_id = p.id AND pef.type = 'like') as friend_likes_count
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.user_id = ?
        AND COALESCE(p.is_hidden, 0) = 0
        AND p.image_url IS NOT NULL
        AND trim(p.image_url) != ''
        AND p.image_url LIKE 'https://%'
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


