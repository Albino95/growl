import { Env } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { generateId } from '../utils/id';

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function exportUserDataPayload(env: Env, userId: string) {
  const user = await env.DB.prepare(
    `SELECT id, email, points, is_instructor, is_business, metadata, created_at FROM users WHERE id = ?`
  )
    .bind(userId)
    .first<any>();
  if (!user) return null;

  const [posts, comments, orders, reports, growth] = await Promise.all([
    env.DB.prepare(`SELECT * FROM posts WHERE user_id = ?`).bind(userId).all(),
    env.DB.prepare(
      `SELECT id, post_id, content, created_at FROM post_engagement WHERE user_id = ? AND type = 'comment'`
    ).bind(userId).all(),
    env.DB.prepare(`SELECT * FROM orders WHERE user_id = ?`).bind(userId).all(),
    // Only reports this user filed — never expose who reported them.
    env.DB.prepare(
      `SELECT id, target_id, target_type, reason, status, created_at FROM reports WHERE reporter_id = ?`
    )
      .bind(userId)
      .all(),
    exportGrowthData(env, userId),
  ]);

  return {
    user: { ...user, metadata: parseJson(user.metadata, {}) },
    posts: posts.results || [],
    comments: comments.results || [],
    orders: orders.results || [],
    reports: reports.results || [],
    growth,
    exported_at: new Date().toISOString(),
  };
}

/** Growth system data: check-ins, badges, activity days, streak, challenges, invites. */
async function exportGrowthData(env: Env, userId: string) {
  try {
    const [checkins, badges, days, streak, challenges, invites] = await Promise.all([
      env.DB.prepare(
        `SELECT day, tz, mood, path, intention, rest, followup, created_at, updated_at
         FROM daily_checkins WHERE user_id = ? ORDER BY day`
      )
        .bind(userId)
        .all(),
      env.DB.prepare(`SELECT badge_id, earned_at, seen_at FROM user_badges WHERE user_id = ? ORDER BY earned_at`)
        .bind(userId)
        .all(),
      env.DB.prepare(
        `SELECT day, kinds, paths, is_rest FROM user_activity_days WHERE user_id = ? ORDER BY day`
      )
        .bind(userId)
        .all(),
      env.DB.prepare(
        `SELECT current, longest, total_days, rest_tokens, last_active_day FROM user_streaks WHERE user_id = ?`
      )
        .bind(userId)
        .first(),
      env.DB.prepare(
        `SELECT challenge_id, joined_at, ends_at, completed_at FROM challenge_participants WHERE user_id = ?`
      )
        .bind(userId)
        .all(),
      // Only whether/when this user joined via an invite and how many joined via theirs.
      env.DB.prepare(
        `SELECT 'joined_via_invite' AS kind, created_at, status FROM invite_redemptions WHERE invitee_id = ?
         UNION ALL
         SELECT 'invited_someone', created_at, status FROM invite_redemptions WHERE inviter_id = ?`
      )
        .bind(userId, userId)
        .all(),
    ]);
    return {
      checkins: checkins.results || [],
      badges: badges.results || [],
      activity_days: days.results || [],
      streak: streak || null,
      challenges: challenges.results || [],
      invites: invites.results || [],
    };
  } catch (err) {
    console.error('[privacy] growth export failed', err);
    return null;
  }
}

/** GET /api/v1/privacy/export — download a copy of the authenticated user's data */
export async function exportAccountData(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  const payload = await exportUserDataPayload(env, ctx.userId);
  if (!payload) {
    return error('NOT_FOUND', 'User not found', 404);
  }

  const requestId = generateId('privacy');
  await env.DB.prepare(
    `INSERT INTO privacy_requests (id, user_id, request_type, status, details, created_at, updated_at)
     VALUES (?, ?, 'export', 'completed', ?, datetime('now'), datetime('now'))`
  )
    .bind(requestId, ctx.userId, JSON.stringify({ selfService: true }))
    .run();

  return json(payload);
}

/** POST /api/v1/privacy/delete-account — request account deletion (soft-delete workflow) */
export async function deleteAccount(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return error('METHOD_NOT_ALLOWED', 'Use POST', 405);
  }

  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  let body: { confirm?: string } = {};
  try {
    body = await request.json();
  } catch {
    // confirmation is optional but recommended
  }
  if (body.confirm && body.confirm !== 'DELETE') {
    return error('VALIDATION_ERROR', 'Type DELETE to confirm account deletion', 400);
  }

  const requestId = generateId('privacy');
  await env.DB.prepare(
    `INSERT INTO privacy_requests (id, user_id, request_type, status, details, created_at, updated_at)
     VALUES (?, ?, 'delete', 'pending', ?, datetime('now'), datetime('now'))`
  )
    .bind(requestId, ctx.userId, JSON.stringify({ selfService: true }))
    .run();

  await env.DB.prepare(
    `INSERT INTO user_account_states (user_id, status, updated_at)
     VALUES (?, 'deleted_pending', datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET status = 'deleted_pending', updated_at = datetime('now')`
  )
    .bind(ctx.userId)
    .run();

  // Anonymize PII immediately; admin can finalize hard delete later.
  const anonymizedEmail = `deleted+${ctx.userId}@growl.invalid`;
  await env.DB.prepare(
    `UPDATE users SET email = ?, metadata = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(anonymizedEmail, JSON.stringify({ deleted: true, deletedAt: new Date().toISOString() }), ctx.userId)
    .run();

  // Growth data: free-text check-ins go now and the invite link stops working.
  // Everything else is removed by ON DELETE CASCADE when the row is hard-deleted.
  try {
    await env.DB.prepare(`UPDATE users SET invite_code = NULL WHERE id = ?`).bind(ctx.userId).run();
    await env.DB.prepare(`DELETE FROM daily_checkins WHERE user_id = ?`).bind(ctx.userId).run();
  } catch (err) {
    console.error('[deleteAccount] growth cleanup failed', err);
  }

  return json({
    ok: true,
    message: 'Your account has been scheduled for deletion. You have been signed out.',
    requestId,
  });
}
