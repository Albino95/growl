import { Env } from '../../types';
import { json, error } from '../../utils/response';
import { requireAdmin, requireRoles, writeAdminAudit, requestIp, type AdminRole } from '../../utils/adminAuth';
import { validateRequest, userEnforcementSchema, userRoleUpdateSchema } from '../../utils/validation';
import { assertNotProtectedUser } from '../../utils/contentModeration';
import { revokeAllUserRefreshTokens } from '../../utils/sessions';
import { parsePaging, likePattern } from '../../utils/adminLists';

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Profile fields an admin may see. Everything else in users.metadata stays server-side. */
const SAFE_METADATA_FIELDS = [
  'username',
  'display_name',
  'name',
  'avatar',
  'avatar_url',
  'bio',
  'categories',
  'teaching_headline',
  'deleted',
  'deletedAt',
] as const;

export function safeUserMetadata(raw: string | null | undefined): Record<string, unknown> {
  const meta = parseJson<Record<string, unknown>>(raw, {});
  const out: Record<string, unknown> = {};
  if (!meta || typeof meta !== 'object') return out;
  for (const key of SAFE_METADATA_FIELDS) {
    if (meta[key] !== undefined) out[key] = meta[key];
  }
  return out;
}

/** Explicit columns only: never password_hash, token hashes, reset codes or invite codes. */
const USER_LIST_COLUMNS = `u.id, u.email, u.points, u.is_instructor, u.is_business, u.metadata, u.created_at,
      s.status as account_status, s.strike_count, s.suspended_until`;

const USER_DETAIL_COLUMNS = `u.id, u.email, u.points, u.is_instructor, u.is_business, u.metadata,
       u.created_at, u.updated_at, u.email_verified, u.timezone, u.dm_policy, u.life_mode,
       s.status as account_status, s.strike_count, s.suspended_until, s.ban_reason`;

export async function listUsers(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAdmin(request, env, 'users.read');
  if (ctx instanceof Response) return ctx;
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 200);
  const { limit, offset } = parsePaging(url);
  try {
    const filterBindings: unknown[] = [];
    let filterSql = '';
    if (q) {
      // Search email, username and id only; never free-text over private metadata.
      filterSql = ` AND (u.email LIKE ? ESCAPE '\\' OR (CASE WHEN json_valid(u.metadata) THEN json_extract(u.metadata, '$.username') END) LIKE ? ESCAPE '\\' OR u.id = ?)`;
      const like = likePattern(q);
      filterBindings.push(like, like, q);
    }

    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM users u WHERE 1=1${filterSql}`
    )
      .bind(...filterBindings)
      .first<{ total: number }>();

    const rows = await env.DB.prepare(
      `SELECT ${USER_LIST_COLUMNS}
       FROM users u
       LEFT JOIN user_account_states s ON s.user_id = u.id
       WHERE 1=1${filterSql}
       ORDER BY u.created_at DESC LIMIT ? OFFSET ?`
    )
      .bind(...filterBindings, limit, offset)
      .all();
    return json({
      users: (rows.results || []).map((u: any) => ({
        ...u,
        metadata: safeUserMetadata(u.metadata),
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
      `SELECT ${USER_DETAIL_COLUMNS}
       FROM users u LEFT JOIN user_account_states s ON s.user_id = u.id WHERE u.id = ?`
    )
      .bind(userId)
      .first<any>();
    if (!user) return error('NOT_FOUND', 'User not found', 404);

    const profile = await env.DB.prepare(
      `SELECT user_id, display_name, contact_email, contact_phone, field_of_operation, vat_number,
              country_code, verification_status, created_at, updated_at
       FROM business_profiles WHERE user_id = ?`
    )
      .bind(userId)
      .first<any>();

    // Reports against this user omit who filed them; reports this user filed are listed as theirs.
    const reports = await env.DB.prepare(
      `SELECT id, target_id, target_type, reason, status, workflow_status, priority, created_at,
              CASE WHEN reporter_id = ? THEN 'filed_by_user' ELSE 'against_user' END AS relation
       FROM reports WHERE target_id = ? OR reporter_id = ? ORDER BY created_at DESC LIMIT 20`
    )
      .bind(userId, userId, userId)
      .all();

    const audits = await env.DB.prepare(
      `SELECT l.id, l.action, l.target_type, l.target_id, l.reason_code, l.reason_text, l.created_at,
              a.email AS admin_email
       FROM admin_audit_logs l LEFT JOIN admin_users a ON a.id = l.admin_id
       WHERE l.target_id = ? ORDER BY l.created_at DESC LIMIT 20`
    )
      .bind(userId)
      .all();

    // Viewing a member's profile is a PII read: record who looked and when.
    await writeAdminAudit(env, {
      adminId: ctx.adminId,
      action: 'user.view',
      targetType: 'user',
      targetId: userId,
      ipAddress: requestIp(request),
    });

    return json({
      user: { ...user, metadata: safeUserMetadata(user.metadata), business_profile: profile || null },
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
    const guard = await assertNotProtectedUser(env, userId);
    if (guard.blocked) {
      return error(
        'PROTECTED_ACCOUNT',
        `Cannot enforce against protected review/demo account (${guard.email})`,
        403
      );
    }

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

    // Sign the user out everywhere; their access token is rejected by
    // getRequestContext on the next request.
    if (status === 'suspended' || status === 'banned') {
      await revokeAllUserRefreshTokens(env, userId);
    }

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
