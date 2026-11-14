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
  writeAdminAudit,
  requestIp,
  type AdminRole,
} from '../../utils/adminAuth';
import { generateTotpSecret, totpAuthUrl, verifyTotp } from '../../utils/totp';
import { generateId } from '../../utils/id';
import { checkRateLimit, clientIp } from '../../utils/rateLimit';
import {
  encryptMfaSecret,
  decryptMfaSecret,
  adminMfaRequired,
  generateRecoveryCodes,
  hashRecoveryCode,
} from '../../utils/adminMfaCrypto';

async function rateLimitAdminLogin(
  request: Request,
  env: Env,
  email: string
): Promise<Response | null> {
  const ip = clientIp(request);
  const byIp = await checkRateLimit(env, `admin-login:ip:${ip}`, 20, 900);
  if (!byIp.allowed) {
    return error('RATE_LIMITED', 'Too many login attempts. Try again later.', 429);
  }
  const byEmail = await checkRateLimit(env, `admin-login:email:${email}`, 10, 900);
  if (!byEmail.allowed) {
    return error('RATE_LIMITED', 'Too many login attempts for this account. Try again later.', 429);
  }
  return null;
}

async function auditLoginFailure(
  env: Env,
  email: string,
  reason: string,
  request: Request,
  adminId?: string
): Promise<void> {
  if (!adminId) return;
  try {
    await writeAdminAudit(env, {
      adminId,
      action: 'admin.login.failed',
      targetType: 'admin_user',
      targetId: adminId,
      reasonText: `${reason} email=${email}`,
      ipAddress: requestIp(request),
    });
  } catch {
    // best-effort
  }
}

export async function adminLogin(request: Request, env: Env): Promise<Response> {
  const validation = await validateRequest(request, adminLoginSchema);
  if (!validation.success) return validation.response;
  const { email, password, totp, recoveryCode } = validation.data;
  const normalizedEmail = email.trim().toLowerCase();

  const limited = await rateLimitAdminLogin(request, env, normalizedEmail);
  if (limited) return limited;

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
    await auditLoginFailure(env, normalizedEmail, 'invalid_credentials', request);
    return error('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }
  if (!(await verifyPassword(password, admin.password_hash))) {
    await auditLoginFailure(env, normalizedEmail, 'bad_password', request, admin.id);
    return error('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }

  if (adminMfaRequired(env) && !admin.mfa_enabled) {
    // Allow session so they can reach /settings/mfa; frontend must force enrollment.
    const token = await signAdminToken(admin.id, env);
    await createAdminSession(env, admin.id, token, request);
    await env.DB.prepare(
      `UPDATE admin_users SET last_login_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
    )
      .bind(admin.id)
      .run();
    return json({
      token,
      admin: { id: admin.id, email: admin.email, role: admin.role, mfa_enabled: false },
      permissions: permissionsForRole(admin.role),
      must_enroll_mfa: true,
    });
  }

  if (admin.mfa_enabled) {
    let mfaOk = false;
    if (totp && admin.mfa_secret) {
      try {
        const secret = await decryptMfaSecret(env, admin.mfa_secret);
        mfaOk = await verifyTotp(secret, totp);
      } catch {
        mfaOk = false;
      }
    }
    if (!mfaOk && recoveryCode) {
      const codeHash = await hashRecoveryCode(recoveryCode);
      const row = await env.DB.prepare(
        `SELECT id FROM admin_mfa_recovery_codes
         WHERE admin_id = ? AND code_hash = ? AND used_at IS NULL LIMIT 1`
      )
        .bind(admin.id, codeHash)
        .first<{ id: string }>();
      if (row) {
        await env.DB.prepare(
          `UPDATE admin_mfa_recovery_codes SET used_at = datetime('now') WHERE id = ?`
        )
          .bind(row.id)
          .run();
        mfaOk = true;
        await writeAdminAudit(env, {
          adminId: admin.id,
          action: 'admin.mfa.recovery_used',
          targetType: 'admin_user',
          targetId: admin.id,
          ipAddress: requestIp(request),
        });
      }
    }
    if (!mfaOk) {
      await auditLoginFailure(env, normalizedEmail, 'mfa_failed', request, admin.id);
      return error('MFA_REQUIRED', 'Valid MFA code or recovery code required', 401);
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
    mfa_required: adminMfaRequired(env),
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
  return json({
    secret,
    otpauth_url: totpAuthUrl(ctx.email, secret, 'Grow! Admin'),
  });
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

  const encrypted = await encryptMfaSecret(env, secret);
  await env.DB.prepare(
    `UPDATE admin_users SET mfa_enabled = 1, mfa_secret = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(encrypted, ctx.adminId)
    .run();

  await env.DB.prepare(`DELETE FROM admin_mfa_recovery_codes WHERE admin_id = ?`)
    .bind(ctx.adminId)
    .run();

  const recoveryCodes = generateRecoveryCodes(10);
  for (const code of recoveryCodes) {
    const id = generateId('mfarc');
    const codeHash = await hashRecoveryCode(code);
    await env.DB.prepare(
      `INSERT INTO admin_mfa_recovery_codes (id, admin_id, code_hash, created_at)
       VALUES (?, ?, ?, datetime('now'))`
    )
      .bind(id, ctx.adminId, codeHash)
      .run();
  }

  await writeAdminAudit(env, {
    adminId: ctx.adminId,
    action: 'admin.mfa.enabled',
    targetType: 'admin_user',
    targetId: ctx.adminId,
    ipAddress: requestIp(request),
  });

  return json({
    ok: true,
    mfa_enabled: true,
    recovery_codes: recoveryCodes,
  });
}
