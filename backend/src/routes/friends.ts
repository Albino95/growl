import { Env } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { generateId } from '../utils/id';

/** Normalize onboarding paths like art:violin → cohort keys include leaf + parent (art). */
export function expandCohortKeys(paths: string[]): Set<string> {
  const s = new Set<string>();
  for (const p of paths) {
    const x = p.trim().toLowerCase();
    if (!x) continue;
    s.add(x);
    const i = x.indexOf(':');
    if (i > 0) s.add(x.slice(0, i));
  }
  return s;
}

/** Returns true when two category lists share any cohort key or parent key. */
export function cohortsOverlap(a: string[], b: string[]): boolean {
  if (!a?.length || !b?.length) return false;
  const A = expandCohortKeys(a);
  const B = expandCohortKeys(b);
  for (const x of A) {
    if (B.has(x)) return true;
  }
  return false;
}

/** Safely extracts normalized category strings from user metadata JSON. */
function parseCategoriesFromMetadata(raw: string | undefined): string[] {
  try {
    const m = JSON.parse(raw || '{}');
    return Array.isArray(m.categories) ? m.categories.map((x: unknown) => String(x)) : [];
  } catch {
    return [];
  }
}

/** Checks if either user has an active block against the other user. */
async function isBlocked(env: Env, u: string, v: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 AS ok FROM user_relationships WHERE type = 'block'
     AND ((user_id = ? AND target_user_id = ?) OR (user_id = ? AND target_user_id = ?)) LIMIT 1`
  )
    .bind(u, v, v, u)
    .first<{ ok: number }>();
  return !!row;
}

/** Creates a relationship row only if it does not already exist. */
async function upsertRelationship(env: Env, userId: string, targetUserId: string, type: 'block' | 'mute') {
  await env.DB.prepare(
    `INSERT INTO user_relationships (id, user_id, target_user_id, type, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, target_user_id, type) DO NOTHING`
  )
    .bind(generateId('rel'), userId, targetUserId, type)
    .run();
}

/** Removes a single relationship edge for the caller and target user. */
async function removeRelationship(env: Env, userId: string, targetUserId: string, type: 'block' | 'mute') {
  await env.DB.prepare(
    `DELETE FROM user_relationships WHERE user_id = ? AND target_user_id = ? AND type = ?`
  )
    .bind(userId, targetUserId, type)
    .run();
}

/** Parses and validates targetUserId from JSON request body. */
async function parseTargetUserId(request: Request): Promise<string | null> {
  try {
    const body = (await request.json()) as { targetUserId?: string };
    const targetUserId = typeof body?.targetUserId === 'string' ? body.targetUserId : '';
    return targetUserId.trim() || null;
  } catch {
    return null;
  }
}

/** Checks whether a directional friend edge exists from A to B. */
async function hasFriendEdge(env: Env, from: string, to: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 FROM user_relationships WHERE user_id = ? AND target_user_id = ? AND type = 'friend' LIMIT 1`
  )
    .bind(from, to)
    .first();
  return !!row;
}

/** Checks whether a directional relationship edge exists for a specific type. */
async function hasRelationshipEdge(
  env: Env,
  from: string,
  to: string,
  type: 'friend' | 'friend_request'
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 FROM user_relationships WHERE user_id = ? AND target_user_id = ? AND type = ? LIMIT 1`
  )
    .bind(from, to, type)
    .first();
  return !!row;
}

/** Inserts missing friend edges so the pair is bidirectional. Returns true if any row was written. */
export async function ensureBidirectionalFriend(env: Env, a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  if (await isBlocked(env, a, b)) return false;

  const ab = await hasFriendEdge(env, a, b);
  const ba = await hasFriendEdge(env, b, a);
  if (ab && ba) return false;

  const now = new Date().toISOString();
  let wrote = false;
  if (!ab) {
    await env.DB.prepare(
      `INSERT INTO user_relationships (id, user_id, target_user_id, type, created_at) VALUES (?, ?, ?, 'friend', ?)`
    )
      .bind(generateId('rel'), a, b, now)
      .run();
    wrote = true;
  }
  if (!ba) {
    await env.DB.prepare(
      `INSERT INTO user_relationships (id, user_id, target_user_id, type, created_at) VALUES (?, ?, ?, 'friend', ?)`
    )
      .bind(generateId('rel'), b, a, now)
      .run();
    wrote = true;
  }
  return wrote;
}

/**
 * Connect the user with every other account that shares at least one cohort key
 * (same category path or shared parent category, e.g. art:violin ↔ art:piano via art).
 */
export async function syncCategoryCohortFriends(env: Env, userId: string): Promise<number> {
  const me = await env.DB.prepare('SELECT metadata FROM users WHERE id = ?').bind(userId).first<{ metadata: string }>();
  if (!me) return 0;
  const myPaths = parseCategoriesFromMetadata(me.metadata);
  if (!myPaths.length) return 0;

  const others = await env.DB.prepare('SELECT id, metadata FROM users WHERE id != ?')
    .bind(userId)
    .all<{ id: string; metadata: string }>();

  let pairsCreated = 0;
  for (const row of others.results || []) {
    const theirPaths = parseCategoriesFromMetadata(row.metadata);
    if (!cohortsOverlap(myPaths, theirPaths)) continue;
    if (await ensureBidirectionalFriend(env, userId, row.id)) pairsCreated += 1;
  }
  return pairsCreated;
}

/** All friend user ids (either direction of the friend edge). */
export async function getFriendUserIds(env: Env, userId: string): Promise<Set<string>> {
  const rows = await env.DB.prepare(
    `SELECT target_user_id AS fid FROM user_relationships WHERE user_id = ? AND type = 'friend'
     UNION
     SELECT user_id AS fid FROM user_relationships WHERE target_user_id = ? AND type = 'friend'`
  )
    .bind(userId, userId)
    .all<{ fid: string }>();
  return new Set((rows.results || []).map((r) => r.fid));
}

/** Resolves friendship by checking either direction of the friend relationship. */
export async function areFriends(env: Env, a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const row = await env.DB.prepare(
    `SELECT 1 AS ok FROM user_relationships WHERE type = 'friend'
     AND ((user_id = ? AND target_user_id = ?) OR (user_id = ? AND target_user_id = ?))
     LIMIT 1`
  )
    .bind(a, b, b, a)
    .first<{ ok: number }>();
  return !!row;
}

/** Authenticated route wrapper for cohort-based friend synchronization. */
export async function syncCohortFriendsRoute(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }
  try {
    const linked = await syncCategoryCohortFriends(env, ctx.userId);
    const connections = await listConnectionsPayload(env, ctx.userId);
    return json({ linked, ...connections });
  } catch (err) {
    console.error('[syncCohortFriends]', err);
    return error('DATABASE_ERROR', 'Could not sync cohort friends', 500);
  }
}

/** Maps database user rows into the compact social user payload shape. */
function mapUserRow(row: { id: string; metadata: string }) {
  const meta = JSON.parse(row.metadata || '{}');
  return {
    id: row.id,
    username: meta.username || row.id.slice(0, 8),
    avatar: meta.avatar,
  };
}

/** Returns users the current user follows via friend edges. */
async function listFollowingPayload(env: Env, userId: string) {
  const rows = await env.DB.prepare(
    `SELECT u.id, u.metadata FROM users u
     INNER JOIN user_relationships r ON r.target_user_id = u.id AND r.user_id = ? AND r.type = 'friend'
     ORDER BY r.created_at DESC`
  )
    .bind(userId)
    .all<{ id: string; metadata: string }>();
  return (rows.results || []).map(mapUserRow);
}

/** Returns users who follow the current user via friend edges. */
async function listFollowersPayload(env: Env, userId: string) {
  const rows = await env.DB.prepare(
    `SELECT u.id, u.metadata FROM users u
     INNER JOIN user_relationships r ON r.user_id = u.id AND r.target_user_id = ? AND r.type = 'friend'
     ORDER BY r.created_at DESC`
  )
    .bind(userId)
    .all<{ id: string; metadata: string }>();
  return (rows.results || []).map(mapUserRow);
}

/** Aggregates following + followers and their counts for profile surfaces. */
async function listConnectionsPayload(env: Env, userId: string) {
  const following = await listFollowingPayload(env, userId);
  const followers = await listFollowersPayload(env, userId);
  return {
    following,
    followers,
    followingCount: following.length,
    followersCount: followers.length,
  };
}

/** Returns deduplicated friends considering both edge directions. */
async function listFriendsPayload(env: Env, userId: string) {
  const rows = await env.DB.prepare(
    `SELECT DISTINCT u.id, u.metadata
     FROM users u
     INNER JOIN (
       SELECT target_user_id AS fid FROM user_relationships WHERE user_id = ? AND type = 'friend'
       UNION
       SELECT user_id AS fid FROM user_relationships WHERE target_user_id = ? AND type = 'friend'
     ) AS edges ON edges.fid = u.id
     ORDER BY u.id`
  )
    .bind(userId, userId)
    .all<{ id: string; metadata: string }>();

  return (rows.results || []).map(mapUserRow);
}

/** GET social connections (following/followers) for authenticated user. */
export async function listConnections(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }
  try {
    return json(await listConnectionsPayload(env, ctx.userId));
  } catch (err) {
    console.error('[listConnections]', err);
    return error('DATABASE_ERROR', 'Failed to load connections', 500);
  }
}

/** GET flat friend list for discovery and ranking filters. */
export async function listFriends(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  try {
    const friends = await listFriendsPayload(env, ctx.userId);
    return json({ friends });
  } catch (err) {
    console.error('[listFriends]', err);
    return error('DATABASE_ERROR', 'Failed to load friends', 500);
  }
}

export async function getFriendshipStatus(
  request: Request,
  env: Env,
  targetUserId: string
): Promise<Response> {
  // This status powers public-profile CTAs and moderation menu state.
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  if (ctx.userId === targetUserId) {
    return json({ connected: false, isSelf: true });
  }

  try {
    const connected = await areFriends(env, ctx.userId, targetUserId);
    const [blockedRow, mutedRow, requestSentRow, requestReceivedRow] = await Promise.all([
      env.DB.prepare(
        `SELECT 1 FROM user_relationships
         WHERE user_id = ? AND target_user_id = ? AND type = 'block' LIMIT 1`
      )
        .bind(ctx.userId, targetUserId)
        .first(),
      env.DB.prepare(
        `SELECT 1 FROM user_relationships
         WHERE user_id = ? AND target_user_id = ? AND type = 'mute' LIMIT 1`
      )
        .bind(ctx.userId, targetUserId)
        .first(),
      env.DB.prepare(
        `SELECT 1 FROM user_relationships
         WHERE user_id = ? AND target_user_id = ? AND type = 'friend_request' LIMIT 1`
      )
        .bind(ctx.userId, targetUserId)
        .first(),
      env.DB.prepare(
        `SELECT 1 FROM user_relationships
         WHERE user_id = ? AND target_user_id = ? AND type = 'friend_request' LIMIT 1`
      )
        .bind(targetUserId, ctx.userId)
        .first(),
    ]);
    return json({
      connected,
      isSelf: false,
      blocked: !!blockedRow,
      muted: !!mutedRow,
      requestSent: !!requestSentRow,
      requestReceived: !!requestReceivedRow,
    });
  } catch (err) {
    console.error('[getFriendshipStatus]', err);
    return error('DATABASE_ERROR', 'Failed to load friendship status', 500);
  }
}

/** Creates a mutual friend connection after validating target user existence. */
export async function addFriend(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  let body: { targetUserId?: string };
  try {
    body = await request.json();
  } catch {
    return error('VALIDATION_ERROR', 'Invalid JSON body', 400);
  }

  const targetUserId = body.targetUserId;
  if (!targetUserId || typeof targetUserId !== 'string') {
    return error('VALIDATION_ERROR', 'targetUserId is required', 400);
  }
  if (targetUserId === ctx.userId) {
    return error('VALIDATION_ERROR', 'Cannot add yourself', 400);
  }

  const exists = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(targetUserId).first();
  if (!exists) {
    return error('NOT_FOUND', 'User not found', 404);
  }

  try {
    const [alreadyConnected, outgoingRequest, incomingRequest] = await Promise.all([
      areFriends(env, ctx.userId, targetUserId),
      hasRelationshipEdge(env, ctx.userId, targetUserId, 'friend_request'),
      hasRelationshipEdge(env, targetUserId, ctx.userId, 'friend_request'),
    ]);

    if (alreadyConnected) {
      return json({ ok: true, connected: true, requestSent: false, message: 'Already connected' }, 200);
    }

    if (incomingRequest) {
      await env.DB.prepare(
        `DELETE FROM user_relationships
         WHERE user_id = ? AND target_user_id = ? AND type = 'friend_request'`
      )
        .bind(targetUserId, ctx.userId)
        .run();
      await ensureBidirectionalFriend(env, ctx.userId, targetUserId);
      return json({ ok: true, connected: true, requestSent: false, message: 'Friend request accepted' }, 201);
    }

    if (outgoingRequest) {
      return json({ ok: true, connected: false, requestSent: true, message: 'Friend request already sent' }, 200);
    }

    await env.DB.prepare(
      `INSERT INTO user_relationships (id, user_id, target_user_id, type, created_at)
       VALUES (?, ?, ?, 'friend_request', datetime('now'))`
    )
      .bind(generateId('rel'), ctx.userId, targetUserId)
      .run();

    return json({ ok: true, connected: false, requestSent: true, message: 'Friend request sent' }, 201);
  } catch (err) {
    console.error('[addFriend]', err);
    return error('DATABASE_ERROR', 'Could not add friend', 500);
  }
}

/** Removes both friend directions between requester and target user. */
export async function removeFriend(request: Request, env: Env, targetUserId: string): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  try {
    await env.DB.prepare(
      `DELETE FROM user_relationships WHERE type = 'friend'
       AND ((user_id = ? AND target_user_id = ?) OR (user_id = ? AND target_user_id = ?))`
    )
      .bind(ctx.userId, targetUserId, targetUserId, ctx.userId)
      .run();
    await env.DB.prepare(
      `DELETE FROM user_relationships WHERE type = 'friend_request'
       AND ((user_id = ? AND target_user_id = ?) OR (user_id = ? AND target_user_id = ?))`
    )
      .bind(ctx.userId, targetUserId, targetUserId, ctx.userId)
      .run();
    return json({ ok: true });
  } catch (err) {
    console.error('[removeFriend]', err);
    return error('DATABASE_ERROR', 'Could not remove friend', 500);
  }
}

/** Blocks a target user and drops existing friend edges between the pair. */
export async function blockUser(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }
  const targetUserId = await parseTargetUserId(request);
  if (!targetUserId) {
    return error('VALIDATION_ERROR', 'targetUserId is required', 400);
  }
  if (targetUserId === ctx.userId) {
    return error('VALIDATION_ERROR', 'Cannot block yourself', 400);
  }

  const target = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(targetUserId).first();
  if (!target) {
    return error('NOT_FOUND', 'User not found', 404);
  }

  try {
    await upsertRelationship(env, ctx.userId, targetUserId, 'block');
    await env.DB.prepare(
      `DELETE FROM user_relationships WHERE type = 'friend'
       AND ((user_id = ? AND target_user_id = ?) OR (user_id = ? AND target_user_id = ?))`
    )
      .bind(ctx.userId, targetUserId, targetUserId, ctx.userId)
      .run();
    return json({ ok: true, blocked: true });
  } catch (err) {
    console.error('[blockUser]', err);
    return error('DATABASE_ERROR', 'Could not block user', 500);
  }
}

export async function unblockUser(
  request: Request,
  env: Env,
  targetUserId: string
): Promise<Response> {
  // Unblock only removes the block edge; it does not restore friendship automatically.
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }
  try {
    await removeRelationship(env, ctx.userId, targetUserId, 'block');
    return json({ ok: true, blocked: false });
  } catch (err) {
    console.error('[unblockUser]', err);
    return error('DATABASE_ERROR', 'Could not unblock user', 500);
  }
}

/** Mutes a target user so their content is filtered from feed/story surfaces. */
export async function muteUser(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }
  const targetUserId = await parseTargetUserId(request);
  if (!targetUserId) {
    return error('VALIDATION_ERROR', 'targetUserId is required', 400);
  }
  if (targetUserId === ctx.userId) {
    return error('VALIDATION_ERROR', 'Cannot mute yourself', 400);
  }

  const target = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(targetUserId).first();
  if (!target) {
    return error('NOT_FOUND', 'User not found', 404);
  }

  try {
    await upsertRelationship(env, ctx.userId, targetUserId, 'mute');
    return json({ ok: true, muted: true });
  } catch (err) {
    console.error('[muteUser]', err);
    return error('DATABASE_ERROR', 'Could not mute user', 500);
  }
}

export async function unmuteUser(
  request: Request,
  env: Env,
  targetUserId: string
): Promise<Response> {
  // Unmute is a lightweight toggle and does not change friend relationships.
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }
  try {
    await removeRelationship(env, ctx.userId, targetUserId, 'mute');
    return json({ ok: true, muted: false });
  } catch (err) {
    console.error('[unmuteUser]', err);
    return error('DATABASE_ERROR', 'Could not unmute user', 500);
  }
}

/** Submits a content or user report for moderation review with a required reason. */
export async function reportContent(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }
  let body: { targetId?: string; targetType?: string; targetUserId?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return error('VALIDATION_ERROR', 'Invalid JSON body', 400);
  }

  const targetType = (body.targetType || 'user').trim();
  const targetId =
    (typeof body.targetId === 'string' ? body.targetId.trim() : '') ||
    (typeof body.targetUserId === 'string' ? body.targetUserId.trim() : '');
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

  if (!targetId || !reason) {
    return error('VALIDATION_ERROR', 'targetId and reason are required', 400);
  }
  if (!['user', 'post', 'journal'].includes(targetType)) {
    return error('VALIDATION_ERROR', 'targetType must be user, post, or journal', 400);
  }

  if (targetType === 'user') {
    if (targetId === ctx.userId) {
      return error('VALIDATION_ERROR', 'Cannot report yourself', 400);
    }
    const target = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(targetId).first();
    if (!target) {
      return error('NOT_FOUND', 'User not found', 404);
    }
  } else {
    const post = await env.DB.prepare('SELECT id, user_id FROM posts WHERE id = ?').bind(targetId).first<{
      id: string;
      user_id: string;
    }>();
    if (!post) {
      return error('NOT_FOUND', 'Post not found', 404);
    }
    if (post.user_id === ctx.userId) {
      return error('VALIDATION_ERROR', 'Cannot report your own post', 400);
    }
  }

  try {
    await env.DB.prepare(
      `INSERT INTO reports (id, reporter_id, target_id, target_type, reason, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))`
    )
      .bind(generateId('report'), ctx.userId, targetId, targetType, reason)
      .run();
    return json({ ok: true });
  } catch (err) {
    console.error('[reportContent]', err);
    return error('DATABASE_ERROR', 'Could not submit report', 500);
  }
}

/** @deprecated Use reportContent — kept for backward compatibility */
export async function reportUser(request: Request, env: Env): Promise<Response> {
  return reportContent(request, env);
}
