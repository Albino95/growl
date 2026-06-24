import { Env } from '../../types';
import { json, error } from '../../utils/response';
import { requireAdmin, writeAdminAudit, requestIp } from '../../utils/adminAuth';
import { validateRequest, privacyRequestCreateSchema, privacyRequestUpdateSchema } from '../../utils/validation';
import { generateId } from '../../utils/id';

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function listPrivacyRequests(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAdmin(request, env, 'privacy.read');
  if (ctx instanceof Response) return ctx;
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || '';
  let query = `SELECT pr.*, u.email FROM privacy_requests pr JOIN users u ON u.id = pr.user_id WHERE 1=1`;
  const bindings: unknown[] = [];
  if (status) {
    query += ` AND pr.status = ?`;
    bindings.push(status);
  }
  query += ` ORDER BY pr.created_at DESC LIMIT 200`;
  const rows = await env.DB.prepare(query).bind(...bindings).all();
  return json({ requests: rows.results || [] });
}

export async function createPrivacyRequest(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAdmin(request, env, 'privacy.write');
  if (ctx instanceof Response) return ctx;
  const validation = await validateRequest(request, privacyRequestCreateSchema);
  if (!validation.success) return validation.response;
  const { userId, requestType, details } = validation.data;

  const user = await env.DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(userId).first();
  if (!user) return error('NOT_FOUND', 'User not found', 404);

  const id = generateId('privacy');
  await env.DB.prepare(
    `INSERT INTO privacy_requests (id, user_id, request_type, status, details, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', ?, datetime('now'), datetime('now'))`
  )
    .bind(id, userId, requestType, JSON.stringify(details || {}))
    .run();

  await writeAdminAudit(env, {
    adminId: ctx.adminId,
    action: 'privacy.request_create',
    targetType: 'user',
    targetId: userId,
    metadata: { requestType, requestId: id },
    ipAddress: requestIp(request),
  });

  return json({ id }, 201);
}

export async function updatePrivacyRequest(
  request: Request,
  env: Env,
  requestId: string
): Promise<Response> {
  const ctx = await requireAdmin(request, env, 'privacy.write');
  if (ctx instanceof Response) return ctx;
  const validation = await validateRequest(request, privacyRequestUpdateSchema);
  if (!validation.success) return validation.response;
  const { status, assigned_admin_id } = validation.data;

  const req = await env.DB.prepare(`SELECT * FROM privacy_requests WHERE id = ?`)
    .bind(requestId)
    .first<any>();
  if (!req) return error('NOT_FOUND', 'Privacy request not found', 404);

  await env.DB.prepare(
    `UPDATE privacy_requests SET status = ?, assigned_admin_id = COALESCE(?, assigned_admin_id), updated_at = datetime('now') WHERE id = ?`
  )
    .bind(status, assigned_admin_id || ctx.adminId, requestId)
    .run();

  if (status === 'completed' && req.request_type === 'delete') {
    await env.DB.prepare(
      `INSERT INTO user_account_states (user_id, status, updated_by_admin_id, updated_at)
       VALUES (?, 'deleted_pending', ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET status = 'deleted_pending', updated_at = datetime('now')`
    )
      .bind(req.user_id, ctx.adminId)
      .run();
  }

  await writeAdminAudit(env, {
    adminId: ctx.adminId,
    action: `privacy.request_${status}`,
    targetType: 'privacy_request',
    targetId: requestId,
    ipAddress: requestIp(request),
  });

  return json({ ok: true, status });
}

export async function exportUserData(request: Request, env: Env, userId: string): Promise<Response> {
  const ctx = await requireAdmin(request, env, 'privacy.read');
  if (ctx instanceof Response) return ctx;

  const user = await env.DB.prepare(`SELECT id, email, points, is_instructor, is_business, metadata, created_at FROM users WHERE id = ?`)
    .bind(userId)
    .first<any>();
  if (!user) return error('NOT_FOUND', 'User not found', 404);

  const [posts, comments, orders, reports] = await Promise.all([
    env.DB.prepare(`SELECT * FROM posts WHERE user_id = ?`).bind(userId).all(),
    env.DB.prepare(`SELECT * FROM comments WHERE user_id = ?`).bind(userId).all(),
    env.DB.prepare(`SELECT * FROM orders WHERE user_id = ?`).bind(userId).all(),
    env.DB.prepare(`SELECT * FROM reports WHERE reporter_id = ? OR target_id = ?`).bind(userId, userId).all(),
  ]);

  return json({
    user: { ...user, metadata: parseJson(user.metadata, {}) },
    posts: posts.results || [],
    comments: comments.results || [],
    orders: orders.results || [],
    reports: reports.results || [],
    exported_at: new Date().toISOString(),
  });
}
