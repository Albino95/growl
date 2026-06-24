import { Env } from '../../types';
import { json, error } from '../../utils/response';
import { validateRequest, adminLoginSchema, adminMfaEnableSchema } from '../../utils/validation';
import { verifyPassword, hashPassword } from '../../utils/password';
import { signAdminToken } from '../../utils/adminJwt';
import {
  createAdminSession,
  revokeAdminSession,
  permissionsForRole,
  requireAdmin,
  type AdminRole,
} from '../../utils/adminAuth';
import { generateTotpSecret, totpAuthUrl, verifyTotp } from '../../utils/totp';
import { generateId } from '../../utils/id';

export async function adminLogin(request: Request, env: Env): Promise<Response> {
  const validation = await validateRequest(request, adminLoginSchema);
  if (!validation.success) return validation.response;
  const { email, password, totp } = validation.data;
  const normalizedEmail = email.trim().toLowerCase();

  const admin = await env.DB.prepare(
    `SELECT id, email, password_hash, role, status, mfa_enabled, mfa_secret FROM admin_users WHERE email = ?`
  )
    .bind(normalizedEmail)
    .first<{
      id: string;
      email: string;
      password_hash: string;
      role: AdminRole;
      status: string;
      mfa_enabled: number;
      mfa_secret: string | null;
    }>();

  if (!admin || admin.status !== 'active') {
    return error('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }
  if (!(await verifyPassword(password, admin.password_hash))) {
    return error('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }
  if (admin.mfa_enabled) {
    if (!totp || !admin.mfa_secret || !(await verifyTotp(admin.mfa_secret, totp))) {
      return error('MFA_REQUIRED', 'Valid MFA code required', 401);
    }
  }

  const token = await signAdminToken(admin.id, env);
  await createAdminSession(env, admin.id, token, request);
  await env.DB.prepare(`UPDATE admin_users SET last_login_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
    .bind(admin.id)
    .run();

  return json({
    token,
    admin: { id: admin.id, email: admin.email, role: admin.role, mfa_enabled: !!admin.mfa_enabled },
    permissions: permissionsForRole(admin.role),
  });
}

export async function adminLogout(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    await revokeAdminSession(env, authHeader.substring(7));
  }
  return json({ ok: true });
}

export async function adminMe(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAdmin(request, env);
  if (ctx instanceof Response) return ctx;
  return json({
    admin: { id: ctx.adminId, email: ctx.email, role: ctx.role },
    permissions: ctx.permissions,
  });
}

export async function adminBootstrap(request: Request, env: Env): Promise<Response> {
  if (env.ENVIRONMENT === 'production') {
    return error('FORBIDDEN', 'Bootstrap disabled in production', 403);
  }
  const validation = await validateRequest(request, adminLoginSchema.pick({ email: true, password: true }));
  if (!validation.success) return validation.response;
  const { email, password } = validation.data;
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await env.DB.prepare(`SELECT id FROM admin_users LIMIT 1`).first();
  if (existing) {
    return error('FORBIDDEN', 'Admin users already exist', 403);
  }

  const adminId = generateId('admin');
  const passwordHash = await hashPassword(password);
  await env.DB.prepare(
    `INSERT INTO admin_users (id, email, password_hash, role, status, mfa_enabled, created_at, updated_at)
     VALUES (?, ?, ?, 'super_admin', 'active', 0, datetime('now'), datetime('now'))`
  )
    .bind(adminId, normalizedEmail, passwordHash)
    .run();

  return json({ ok: true, adminId, email: normalizedEmail }, 201);
}

export async function adminSetupMfaSecret(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAdmin(request, env);
  if (ctx instanceof Response) return ctx;
  const secret = generateTotpSecret();
  return json({ secret, otpauth_url: totpAuthUrl(ctx.email, secret) });
}

export async function adminEnableMfa(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAdmin(request, env);
  if (ctx instanceof Response) return ctx;
  const validation = await validateRequest(request, adminMfaEnableSchema);
  if (!validation.success) return validation.response;
  const { secret, totp } = validation.data;
  if (!(await verifyTotp(secret, totp))) {
    return error('INVALID_CODE', 'Invalid MFA code', 400);
  }
  await env.DB.prepare(
    `UPDATE admin_users SET mfa_enabled = 1, mfa_secret = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(secret, ctx.adminId)
    .run();
  return json({ ok: true, mfa_enabled: true });
}
