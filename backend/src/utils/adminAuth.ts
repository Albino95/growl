import { Env } from '../types';
import { error } from './response';
import { verifyAdminToken, hashToken } from './adminJwt';
import { generateId } from './id';

export type AdminRole =
  | 'super_admin'
  | 'trust_safety_admin'
  | 'support_admin'
  | 'business_ops_admin'
  | 'finance_admin'
  | 'analyst_readonly';

export type AdminContext = {
  adminId: string;
  email: string;
  role: AdminRole;
  permissions: string[];
};

const ROLE_PERMISSIONS: Record<AdminRole, string[]> = {
  super_admin: ['*'],
  trust_safety_admin: [
    'dashboard.read',
    'moderation.read',
    'moderation.write',
    'users.read',
    'users.enforce',
    'users.restore',
    'appeals.read',
    'appeals.write',
    'audit.read',
    'analytics.read',
  ],
  support_admin: [
    'dashboard.read',
    'users.read',
    'users.restore',
    'privacy.read',
    'privacy.write',
    'audit.read',
  ],
  business_ops_admin: [
    'dashboard.read',
    'business.read',
    'business.write',
    'analytics.read',
    'audit.read',
  ],
  finance_admin: ['dashboard.read', 'business.read', 'business.refund', 'audit.read'],
  analyst_readonly: ['dashboard.read', 'analytics.read', 'audit.read', 'moderation.read', 'users.read'],
};

export function permissionsForRole(role: AdminRole): string[] {
  return ROLE_PERMISSIONS[role] || [];
}

export function hasPermission(permissions: string[], required: string): boolean {
  if (permissions.includes('*')) return true;
  return permissions.includes(required);
}

export function requestIp(request: Request): string | undefined {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || undefined;
}

export async function writeAdminAudit(
  env: Env,
  entry: {
    adminId: string;
    action: string;
    targetType: string;
    targetId?: string;
    reasonCode?: string;
    reasonText?: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
  }
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, reason_code, reason_text, metadata, ip_address, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  )
    .bind(
      generateId('audit'),
      entry.adminId,
      entry.action,
      entry.targetType,
      entry.targetId || null,
      entry.reasonCode || null,
      entry.reasonText || null,
      JSON.stringify(entry.metadata || {}),
      entry.ipAddress || null
    )
    .run();
}

async function resolveAdminContext(request: Request, env: Env): Promise<AdminContext | Response> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return error('UNAUTHORIZED', 'Admin authentication required', 401);
  }
  const token = authHeader.substring(7);
  const verified = await verifyAdminToken(token, env);
  if (!verified) return error('UNAUTHORIZED', 'Invalid or expired admin token', 401);

  const tokenHash = await hashToken(token);
  const session = await env.DB.prepare(
    `SELECT s.id, s.revoked_at, s.expires_at, a.id as admin_id, a.email, a.role, a.status
     FROM admin_sessions s
     JOIN admin_users a ON a.id = s.admin_id
     WHERE s.token_hash = ? AND s.admin_id = ?`
  )
    .bind(tokenHash, verified.adminId)
    .first<{
      id: string;
      revoked_at: string | null;
      expires_at: string;
      admin_id: string;
      email: string;
      role: AdminRole;
      status: string;
    }>();

  if (!session || session.revoked_at) {
    return error('UNAUTHORIZED', 'Admin session revoked', 401);
  }
  if (new Date(session.expires_at).getTime() < Date.now()) {
    return error('UNAUTHORIZED', 'Admin session expired', 401);
  }
  if (session.status !== 'active') {
    return error('FORBIDDEN', 'Admin account suspended', 403);
  }

  const role = session.role;
  return {
    adminId: session.admin_id,
    email: session.email,
    role,
    permissions: permissionsForRole(role),
  };
}

export async function requireAdmin(
  request: Request,
  env: Env,
  permission?: string
): Promise<AdminContext | Response> {
  const ctx = await resolveAdminContext(request, env);
  if (ctx instanceof Response) return ctx;
  if (permission && !hasPermission(ctx.permissions, permission)) {
    return error('FORBIDDEN', 'Insufficient permissions', 403);
  }
  return ctx;
}

export async function requireRoles(
  request: Request,
  env: Env,
  roles: AdminRole[],
  permission?: string
): Promise<AdminContext | Response> {
  const ctx = await resolveAdminContext(request, env);
  if (ctx instanceof Response) return ctx;
  if (!roles.includes(ctx.role) && ctx.role !== 'super_admin') {
    return error('FORBIDDEN', 'Role not authorized for this action', 403);
  }
  if (permission && !hasPermission(ctx.permissions, permission)) {
    return error('FORBIDDEN', 'Insufficient permissions', 403);
  }
  return ctx;
}

export async function createAdminSession(
  env: Env,
  adminId: string,
  token: string,
  request: Request
): Promise<void> {
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare(
    `INSERT INTO admin_sessions (id, admin_id, token_hash, ip_address, user_agent, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  )
    .bind(
      generateId('adminsess'),
      adminId,
      tokenHash,
      requestIp(request) || null,
      request.headers.get('User-Agent') || null,
      expiresAt
    )
    .run();
}

export async function revokeAdminSession(env: Env, token: string): Promise<void> {
  const tokenHash = await hashToken(token);
  await env.DB.prepare(
    `UPDATE admin_sessions SET revoked_at = datetime('now') WHERE token_hash = ? AND revoked_at IS NULL`
  )
    .bind(tokenHash)
    .run();
}
