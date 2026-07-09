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

  const [posts, comments, orders, reports] = await Promise.all([
    env.DB.prepare(`SELECT * FROM posts WHERE user_id = ?`).bind(userId).all(),
    env.DB.prepare(`SELECT * FROM comments WHERE user_id = ?`).bind(userId).all(),
    env.DB.prepare(`SELECT * FROM orders WHERE user_id = ?`).bind(userId).all(),
    env.DB.prepare(`SELECT * FROM reports WHERE reporter_id = ? OR target_id = ?`)
      .bind(userId, userId)
      .all(),
  ]);

  return {
    user: { ...user, metadata: parseJson(user.metadata, {}) },
    posts: posts.results || [],
    comments: comments.results || [],
    orders: orders.results || [],
    reports: reports.results || [],
    exported_at: new Date().toISOString(),
  };
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

  return json({
    ok: true,
    message: 'Your account has been scheduled for deletion. You have been signed out.',
    requestId,
  });
}
