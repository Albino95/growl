import { z } from 'zod';
import { Env } from '../../types';
import { json, error } from '../../utils/response';
import { validateRequest, adminLoginSchema } from '../../utils/validation';
import { verifyPassword, hashPassword } from '../../utils/password';
import { signAdminToken, verifyAdminToken } from '../../utils/adminJwt';
import {
  createAdminSession,
  revokeAdminSession,
  permissionsForRole,
  requireAdminSession,
  writeAdminAudit,
  requestIp,
  SYSTEM_ADMIN_ID,
  type AdminContext,
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

/** A restricted enrollment session is short: just long enough to scan a QR and type a code. */
const MFA_ENROLL_TTL_SECONDS = 30 * 60;

/** Re-enrolling when MFA is already on needs proof of the current factor (or the password). */
const mfaSetupSchema = z
  .object({
    current_totp: z.string().min(6).max(8).optional(),
    password: z.string().min(1).max(200).optional(),
  })
  .strict();

const mfaEnableSchema = z.object({
  secret: z.string().min(16).max(128),
  totp: z.string().min(6).max(8),
  current_totp: z.string().min(6).max(8).optional(),
  password: z.string().min(1).max(200).optional(),
});

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

async function auditSafe(env: Env, entry: Parameters<typeof writeAdminAudit>[1]): Promise<void> {
  try {
    await writeAdminAudit(env, entry);
  } catch (err) {
    console.error('[admin.audit]', entry.action, err);
  }
}

/**
 * Failed logins are always recorded. Unknown emails have no admin row, so they are
 * attributed to the system actor with the attempted email in metadata.
 */
async function auditLoginFailure(
  env: Env,
  email: string,
  reason: string,
  request: Request,
  adminId?: string
): Promise<void> {
  await auditSafe(env, {
    adminId: adminId || SYSTEM_ADMIN_ID,
    action: 'admin.login.failed',
    targetType: adminId ? 'admin_user' : 'admin_login',
    targetId: adminId,
    reasonCode: reason,
    metadata: { email, user_agent: request.headers.get('User-Agent') || null },
    ipAddress: requestIp(request),
  });
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

  if (!admin || admin.id === SYSTEM_ADMIN_ID) {
    await auditLoginFailure(env, normalizedEmail, 'unknown_email', request);
    return error('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }
  if (admin.status !== 'active') {
    await auditLoginFailure(env, normalizedEmail, 'account_suspended', request, admin.id);
    return error('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }
  if (!(await verifyPassword(password, admin.password_hash))) {
    await auditLoginFailure(env, normalizedEmail, 'bad_password', request, admin.id);
    return error('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }

  if (adminMfaRequired(env) && !admin.mfa_enabled) {
    // Restricted session: the server only accepts it on /admin/auth/me and /admin/auth/mfa/*.
    const token = await signAdminToken(admin.id, env, MFA_ENROLL_TTL_SECONDS, 'mfa_enroll');
    await createAdminSession(env, admin.id, token, request, MFA_ENROLL_TTL_SECONDS);
    await auditSafe(env, {
      adminId: admin.id,
      action: 'admin.login.mfa_enroll_required',
      targetType: 'admin_user',
      targetId: admin.id,
      ipAddress: requestIp(request),
    });
    return json({
      token,
      admin: { id: admin.id, email: admin.email, role: admin.role, mfa_enabled: false },
      permissions: [],
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
        const used = await env.DB.prepare(
          `UPDATE admin_mfa_recovery_codes SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL`
        )
          .bind(row.id)
          .run();
        mfaOk = Number(used?.meta?.changes ?? 1) > 0;
        if (mfaOk) {
          await auditSafe(env, {
            adminId: admin.id,
            action: 'admin.mfa.recovery_used',
            targetType: 'admin_user',
            targetId: admin.id,
            ipAddress: requestIp(request),
          });
        }
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
  await auditSafe(env, {
    adminId: admin.id,
    action: 'admin.login.success',
    targetType: 'admin_user',
    targetId: admin.id,
    metadata: { mfa: !!admin.mfa_enabled, user_agent: request.headers.get('User-Agent') || null },
    ipAddress: requestIp(request),
  });

  return json({
    token,
    admin: { id: admin.id, email: admin.email, role: admin.role, mfa_enabled: !!admin.mfa_enabled },
    permissions: permissionsForRole(admin.role),
  });
}

export async function adminLogout(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const verified = await verifyAdminToken(token, env);
    await revokeAdminSession(env, token);
    if (verified) {
      await auditSafe(env, {
        adminId: verified.adminId,
        action: 'admin.logout',
        targetType: 'admin_user',
        targetId: verified.adminId,
        ipAddress: requestIp(request),
      });
    }
  }
  return json({ ok: true });
}

function sessionPayload(ctx: AdminContext, env: Env) {
  return {
    admin: { id: ctx.adminId, email: ctx.email, role: ctx.role, mfa_enabled: ctx.mfaEnabled },
    // A restricted session has no permissions until MFA is set up.
    permissions: ctx.mfaEnrollRequired ? [] : ctx.permissions,
    mfa_enabled: ctx.mfaEnabled,
    mfa_required: adminMfaRequired(env),
    must_enroll_mfa: ctx.mfaEnrollRequired,
  };
}

export async function adminMe(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAdminSession(request, env);
  if (ctx instanceof Response) return ctx;
  return json(sessionPayload(ctx, env));
}

export async function adminBootstrap(request: Request, env: Env): Promise<Response> {
  if (env.ENVIRONMENT === 'production') {
    return error('FORBIDDEN', 'Bootstrap disabled in production', 403);
  }
  const validation = await validateRequest(request, adminLoginSchema.pick({ email: true, password: true }));
  if (!validation.success) return validation.response;
  const { email, password } = validation.data;
  const normalizedEmail = email.trim().toLowerCase();

  // The system audit actor (migration 0051) is not a real admin.
  const existing = await env.DB.prepare(`SELECT id FROM admin_users WHERE id != ? LIMIT 1`)
    .bind(SYSTEM_ADMIN_ID)
    .first();
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

/**
 * When MFA is already on, changing it needs the current TOTP code or the account password,
 * so a stolen session alone cannot swap the second factor.
 */
async function verifyCurrentFactor(
  env: Env,
  adminId: string,
  input: { current_totp?: string; password?: string }
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT password_hash, mfa_enabled, mfa_secret FROM admin_users WHERE id = ?`
  )
    .bind(adminId)
    .first<{ password_hash: string; mfa_enabled: number; mfa_secret: string | null }>();
  if (!row) return false;
  if (!row.mfa_enabled) return true;
  if (input.current_totp && row.mfa_secret) {
    try {
      const secret = await decryptMfaSecret(env, row.mfa_secret);
      if (await verifyTotp(secret, input.current_totp)) return true;
    } catch {
      // fall through to password
    }
  }
  if (input.password) {
    try {
      if (await verifyPassword(input.password, row.password_hash)) return true;
    } catch {
      return false;
    }
  }
  return false;
}

async function readOptionalJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function adminSetupMfaSecret(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAdminSession(request, env);
  if (ctx instanceof Response) return ctx;
  const parsed = mfaSetupSchema.safeParse(await readOptionalJson(request));
  if (!parsed.success) return error('VALIDATION_ERROR', 'Invalid request body', 400);

  if (ctx.mfaEnabled) {
    const limited = await checkRateLimit(env, `admin-mfa-reauth:${ctx.adminId}`, 10, 900);
    if (!limited.allowed) return error('RATE_LIMITED', 'Too many attempts. Try again later.', 429);
    if (!(await verifyCurrentFactor(env, ctx.adminId, parsed.data))) {
      return error(
        'CURRENT_FACTOR_REQUIRED',
        'Enter your current authenticator code (or password) to set up a new one',
        403
      );
    }
  }

  const secret = generateTotpSecret();
  return json({
    secret,
    otpauth_url: totpAuthUrl(ctx.email, secret, 'Grow! Admin'),
    reenroll: ctx.mfaEnabled,
  });
}

export async function adminEnableMfa(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAdminSession(request, env);
  if (ctx instanceof Response) return ctx;
  const validation = await validateRequest(request, mfaEnableSchema);
  if (!validation.success) return validation.response;
  const { secret, totp } = validation.data;

  const limited = await checkRateLimit(env, `admin-mfa-enable:${ctx.adminId}`, 10, 900);
  if (!limited.allowed) return error('RATE_LIMITED', 'Too many attempts. Try again later.', 429);

  if (ctx.mfaEnabled && !(await verifyCurrentFactor(env, ctx.adminId, validation.data))) {
    return error(
      'CURRENT_FACTOR_REQUIRED',
      'Enter your current authenticator code (or password) to replace it',
      403
    );
  }
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
    action: ctx.mfaEnabled ? 'admin.mfa.reenrolled' : 'admin.mfa.enabled',
    targetType: 'admin_user',
    targetId: ctx.adminId,
    ipAddress: requestIp(request),
  });

  // Swap the (possibly restricted) session for a full one: the admin has just proven
  // password + a working second factor.
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    await revokeAdminSession(env, authHeader.substring(7));
  }
  const token = await signAdminToken(ctx.adminId, env);
  await createAdminSession(env, ctx.adminId, token, request);

  return json({
    ok: true,
    mfa_enabled: true,
    recovery_codes: recoveryCodes,
    token,
    admin: { id: ctx.adminId, email: ctx.email, role: ctx.role, mfa_enabled: true },
    permissions: permissionsForRole(ctx.role),
  });
}
