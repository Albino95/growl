import { Env } from '../../types';
import { json, error } from '../../utils/response';
import { requireAdmin, requireRoles, writeAdminAudit, requestIp, type AdminRole } from '../../utils/adminAuth';
import { validateRequest, userEnforcementSchema, userRoleUpdateSchema } from '../../utils/validation';

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function listUsers(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAdmin(request, env, 'users.read');
  if (ctx instanceof Response) return ctx;
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  try {
    const whereClause = 'WHERE 1=1';
    const filterBindings: unknown[] = [];
    let filterSql = '';
    if (q) {
      filterSql = ` AND (u.email LIKE ? OR u.metadata LIKE ? OR u.id = ?)`;
      const like = `%${q}%`;
      filterBindings.push(like, like, q);
    }

    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM users u ${whereClause}${filterSql}`
    )
      .bind(...filterBindings)
      .first<{ total: number }>();

    let query = `SELECT u.id, u.email, u.points, u.is_instructor, u.is_business, u.metadata, u.created_at,
      s.status as account_status, s.strike_count, s.suspended_until
      FROM users u
      LEFT JOIN user_account_states s ON s.user_id = u.id
      ${whereClause}${filterSql}`;
    const bindings = [...filterBindings, limit, offset];
    query += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
    const rows = await env.DB.prepare(query).bind(...bindings).all();
    return json({
      users: (rows.results || []).map((u: any) => ({
        ...u,
        metadata: parseJson(u.metadata, {}),
      })),
      total: countRow?.total ?? 0,
      limit,
      offset,
    });
  } catch (err) {
    console.error('[listUsers]', err);
    return error('DATABASE_ERROR', 'Failed to list users', 500);
  }
}

export async function getUser(request: Request, env: Env, userId: string): Promise<Response> {
  const ctx = await requireAdmin(request, env, 'users.read');
  if (ctx instanceof Response) return ctx;
  try {
    const user = await env.DB.prepare(
      `SELECT u.*, s.status as account_status, s.strike_count, s.suspended_until, s.ban_reason
       FROM users u LEFT JOIN user_account_states s ON s.user_id = u.id WHERE u.id = ?`
    )
      .bind(userId)
      .first<any>();
    if (!user) return error('NOT_FOUND', 'User not found', 404);

    const profile = await env.DB.prepare(`SELECT * FROM business_profiles WHERE user_id = ?`)
      .bind(userId)
      .first<any>();

    const reports = await env.DB.prepare(
      `SELECT * FROM reports WHERE target_id = ? OR reporter_id = ? ORDER BY created_at DESC LIMIT 20`
    )
      .bind(userId, userId)
      .all();

    const audits = await env.DB.prepare(
      `SELECT * FROM admin_audit_logs WHERE target_id = ? ORDER BY created_at DESC LIMIT 20`
    )
      .bind(userId)
      .all();

    return json({
      user: { ...user, metadata: parseJson(user.metadata, {}), business_profile: profile || null },
      reports: reports.results || [],
      audit_history: audits.results || [],
    });
  } catch (err) {
    console.error('[getUser]', err);
    return error('DATABASE_ERROR', 'Failed to load user', 500);
  }
}

export async function enforceUser(request: Request, env: Env, userId: string): Promise<Response> {
  const validation = await validateRequest(request, userEnforcementSchema);
  if (!validation.success) return validation.response;
  const { action, reasonCode, reasonText, suspendDays } = validation.data;

  const permission = action === 'restore' ? 'users.restore' : 'users.enforce';
  const roles: AdminRole[] =
    action === 'restore'
      ? ['super_admin', 'trust_safety_admin', 'support_admin']
      : ['super_admin', 'trust_safety_admin'];
  const ctx = await requireRoles(request, env, roles, permission);
  if (ctx instanceof Response) return ctx;

  try {
    const user = await env.DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(userId).first();
    if (!user) return error('NOT_FOUND', 'User not found', 404);

    let status = 'active';
    let suspendedUntil: string | null = null;
    let strikeDelta = 0;
    if (action === 'warn') {
      status = 'warned';
      strikeDelta = 1;
    }
    if (action === 'suspend') {
      status = 'suspended';
      strikeDelta = 1;
      suspendedUntil = new Date(Date.now() + (suspendDays || 7) * 86400000).toISOString();
    }
    if (action === 'ban') {
      status = 'banned';
      strikeDelta = 1;
    }
    if (action === 'restore') status = 'active';

    await env.DB.prepare(
      `INSERT INTO user_account_states (user_id, status, strike_count, suspended_until, ban_reason, updated_by_admin_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         status = excluded.status,
         strike_count = CASE WHEN ? > 0 THEN COALESCE(user_account_states.strike_count, 0) + ? ELSE user_account_states.strike_count END,
         suspended_until = excluded.suspended_until,
         ban_reason = excluded.ban_reason,
         updated_by_admin_id = excluded.updated_by_admin_id,
         updated_at = datetime('now')`
    )
      .bind(
        userId,
        status,
        strikeDelta,
        suspendedUntil,
        action === 'ban' ? reasonText : null,
        ctx.adminId,
        strikeDelta,
        strikeDelta
      )
      .run();

    await writeAdminAudit(env, {
      adminId: ctx.adminId,
      action: `user.${action}`,
      targetType: 'user',
      targetId: userId,
      reasonCode,
      reasonText,
      ipAddress: requestIp(request),
    });
    return json({ ok: true, status });
  } catch (err) {
    console.error('[enforceUser]', err);
    return error('DATABASE_ERROR', 'Failed to enforce user action', 500);
  }
}

export async function updateUserRoles(request: Request, env: Env, userId: string): Promise<Response> {
  const ctx = await requireRoles(request, env, ['super_admin'] as AdminRole[]);
  if (ctx instanceof Response) return ctx;
  const validation = await validateRequest(request, userRoleUpdateSchema);
  if (!validation.success) return validation.response;
  const { is_instructor, is_business } = validation.data;

  if (is_business !== undefined) {
    return error(
      'FORBIDDEN',
      'Business role is managed via Business Accounts. Use /admin/business/accounts instead.',
      403
    );
  }

  try {
    const fields: string[] = ["updated_at = datetime('now')"];
    const values: unknown[] = [];
    if (is_instructor !== undefined) {
      fields.push('is_instructor = ?');
      values.push(is_instructor ? 1 : 0);
    }
    values.push(userId);
    await env.DB.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
    await writeAdminAudit(env, {
      adminId: ctx.adminId,
      action: 'user.roles_update',
      targetType: 'user',
      targetId: userId,
      metadata: validation.data,
      ipAddress: requestIp(request),
    });
    return json({ ok: true });
  } catch (err) {
    console.error('[updateUserRoles]', err);
    return error('DATABASE_ERROR', 'Failed to update roles', 500);
  }
}
