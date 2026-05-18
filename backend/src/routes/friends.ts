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

export function cohortsOverlap(a: string[], b: string[]): boolean {
  if (!a?.length || !b?.length) return false;
  const A = expandCohortKeys(a);
  const B = expandCohortKeys(b);
  for (const x of A) {
    if (B.has(x)) return true;
  }
  return false;
}

function parseCategoriesFromMetadata(raw: string | undefined): string[] {
  try {
    const m = JSON.parse(raw || '{}');
    return Array.isArray(m.categories) ? m.categories.map((x: unknown) => String(x)) : [];
  } catch {
    return [];
  }
}

async function isBlocked(env: Env, u: string, v: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 AS ok FROM user_relationships WHERE type = 'block'
     AND ((user_id = ? AND target_user_id = ?) OR (user_id = ? AND target_user_id = ?)) LIMIT 1`
  )
    .bind(u, v, v, u)
    .first<{ ok: number }>();
  return !!row;
}

async function hasFriendEdge(env: Env, from: string, to: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 FROM user_relationships WHERE user_id = ? AND target_user_id = ? AND type = 'friend' LIMIT 1`
  )
    .bind(from, to)
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

export async function syncCohortFriendsRoute(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }
  try {
    const linked = await syncCategoryCohortFriends(env, ctx.userId);
    const friends = await listFriendsPayload(env, ctx.userId);
    return json({ linked, friends });
  } catch (err) {
    console.error('[syncCohortFriends]', err);
    return error('DATABASE_ERROR', 'Could not sync cohort friends', 500);
  }
}

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

  return (rows.results || []).map((row) => {
    const meta = JSON.parse(row.metadata || '{}');
    return {
      id: row.id,
      username: meta.username || row.id.slice(0, 8),
      avatar: meta.avatar,
    };
  });
}

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
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  if (ctx.userId === targetUserId) {
    return json({ connected: false, isSelf: true });
  }

  try {
    const connected = await areFriends(env, ctx.userId, targetUserId);
    return json({ connected, isSelf: false });
  } catch (err) {
    console.error('[getFriendshipStatus]', err);
    return error('DATABASE_ERROR', 'Failed to load friendship status', 500);
  }
}

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
    await ensureBidirectionalFriend(env, ctx.userId, targetUserId);
    return json({ ok: true, message: 'You are now friends' }, 201);
  } catch (err) {
    console.error('[addFriend]', err);
    return error('DATABASE_ERROR', 'Could not add friend', 500);
  }
}

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
    return json({ ok: true });
  } catch (err) {
    console.error('[removeFriend]', err);
    return error('DATABASE_ERROR', 'Could not remove friend', 500);
  }
}
