import { Env } from '../../types';
import { json, error } from '../../utils/response';
import {
  requireAdmin,
  requireRoles,
  writeAdminAudit,
  requestIp,
  type AdminRole,
} from '../../utils/adminAuth';
import {
  validateRequest,
  adminRefundSchema,
  createBusinessAccountSchema,
  updateBusinessAccountSchema,
} from '../../utils/validation';
import { hashPassword } from '../../utils/password';
import { generateId } from '../../utils/id';

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const BUSINESS_FIELDS = [
  'fitness',
  'nutrition',
  'apparel',
  'wellness',
  'education',
  'other',
] as const;

// --- Business account provisioning (admin-only) ---

export async function createBusinessAccount(request: Request, env: Env): Promise<Response> {
  const ctx = await requireRoles(
    request,
    env,
    ['super_admin', 'business_ops_admin'] as AdminRole[],
    'business.write'
  );
  if (ctx instanceof Response) return ctx;

  const validation = await validateRequest(request, createBusinessAccountSchema);
  if (!validation.success) return validation.response;

  const {
    email,
    temporaryPassword,
    displayName,
    contactEmail,
    contactPhone,
    fieldOfOperation,
    vatNumber,
    countryCode,
    addressLine,
    notes,
  } = validation.data;

  const normalizedEmail = email.trim().toLowerCase();

  const existing = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`)
    .bind(normalizedEmail)
    .first();
  if (existing) return error('USER_EXISTS', 'A user with this email already exists', 409);

  try {
    const userId = generateId('user');
    const passwordHash = await hashPassword(temporaryPassword);
    const metadata = {
      username: displayName,
      categories: [],
    };

    await env.DB.prepare(
      `INSERT INTO users (
        id, email, password_hash, points, is_instructor, is_business, metadata,
        email_verified, created_at, updated_at
      ) VALUES (?, ?, ?, 0, 0, 1, ?, 1, datetime('now'), datetime('now'))`
    )
      .bind(userId, normalizedEmail, passwordHash, JSON.stringify(metadata))
      .run();

    await env.DB.prepare(
      `INSERT INTO business_profiles (
        user_id, display_name, contact_email, contact_phone, field_of_operation,
        vat_number, country_code, address_line, verification_status, notes,
        created_by_admin_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, datetime('now'), datetime('now'))`
    )
      .bind(
        userId,
        displayName,
        contactEmail,
        contactPhone || null,
        fieldOfOperation,
        vatNumber || null,
        countryCode || null,
        addressLine || null,
        notes || null,
        ctx.adminId
      )
      .run();

    await env.DB.prepare(
      `INSERT INTO business_settings (business_id, business_name, analytics_prefs, notifications_prefs, created_at, updated_at)
       VALUES (?, ?, '{}', '{}', datetime('now'), datetime('now'))`
    )
      .bind(userId, displayName)
      .run();

    await writeAdminAudit(env, {
      adminId: ctx.adminId,
      action: 'business.account_create',
      targetType: 'user',
      targetId: userId,
      metadata: { email: normalizedEmail, displayName },
      ipAddress: requestIp(request),
    });

    return json({ userId, email: normalizedEmail, temporaryPassword }, 201);
  } catch (err) {
    console.error('[createBusinessAccount]', err);
    return error('DATABASE_ERROR', 'Failed to create business account', 500);
  }
}

export async function listBusinessAccounts(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAdmin(request, env, 'business.read');
  if (ctx instanceof Response) return ctx;

  const rows = await env.DB.prepare(
    `SELECT u.id, u.email, u.is_business, u.created_at,
            bp.display_name, bp.contact_email, bp.field_of_operation,
            bp.verification_status, bp.created_at as profile_created_at
     FROM users u
     JOIN business_profiles bp ON bp.user_id = u.id
     WHERE u.is_business = 1
     ORDER BY bp.created_at DESC LIMIT 200`
  ).all();

  return json({ accounts: rows.results || [], fields: BUSINESS_FIELDS });
}

export async function getBusinessAccount(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  const ctx = await requireAdmin(request, env, 'business.read');
  if (ctx instanceof Response) return ctx;

  const user = await env.DB.prepare(
    `SELECT u.id, u.email, u.is_business, u.created_at, u.metadata
     FROM users u WHERE u.id = ? AND u.is_business = 1`
  )
    .bind(userId)
    .first<any>();
  if (!user) return error('NOT_FOUND', 'Business account not found', 404);

  const profile = await env.DB.prepare(`SELECT * FROM business_profiles WHERE user_id = ?`)
    .bind(userId)
    .first<any>();

  return json({
    user: { ...user, metadata: parseJson(user.metadata, {}) },
    profile,
  });
}

export async function updateBusinessAccount(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  const ctx = await requireRoles(
    request,
    env,
    ['super_admin', 'business_ops_admin'] as AdminRole[],
    'business.write'
  );
  if (ctx instanceof Response) return ctx;

  const validation = await validateRequest(request, updateBusinessAccountSchema);
  if (!validation.success) return validation.response;

  const user = await env.DB.prepare(`SELECT id FROM users WHERE id = ? AND is_business = 1`)
    .bind(userId)
    .first();
  if (!user) return error('NOT_FOUND', 'Business account not found', 404);

  const data = validation.data;
  const profileFields: string[] = ["updated_at = datetime('now')"];
  const profileValues: unknown[] = [];

  if (data.displayName !== undefined) {
    profileFields.push('display_name = ?');
    profileValues.push(data.displayName);
  }
  if (data.contactEmail !== undefined) {
    profileFields.push('contact_email = ?');
    profileValues.push(data.contactEmail);
  }
  if (data.contactPhone !== undefined) {
    profileFields.push('contact_phone = ?');
    profileValues.push(data.contactPhone);
  }
  if (data.fieldOfOperation !== undefined) {
    profileFields.push('field_of_operation = ?');
    profileValues.push(data.fieldOfOperation);
  }
  if (data.vatNumber !== undefined) {
    profileFields.push('vat_number = ?');
    profileValues.push(data.vatNumber);
  }
  if (data.countryCode !== undefined) {
    profileFields.push('country_code = ?');
    profileValues.push(data.countryCode);
  }
  if (data.addressLine !== undefined) {
    profileFields.push('address_line = ?');
    profileValues.push(data.addressLine);
  }
  if (data.verificationStatus !== undefined) {
    profileFields.push('verification_status = ?');
    profileValues.push(data.verificationStatus);
  }
  if (data.notes !== undefined) {
    profileFields.push('notes = ?');
    profileValues.push(data.notes);
  }

  if (profileFields.length > 1) {
    profileValues.push(userId);
    await env.DB.prepare(
      `UPDATE business_profiles SET ${profileFields.join(', ')} WHERE user_id = ?`
    )
      .bind(...profileValues)
      .run();
  }

  if (data.deactivate === true) {
    await env.DB.prepare(`UPDATE users SET is_business = 0, updated_at = datetime('now') WHERE id = ?`)
      .bind(userId)
      .run();
  } else if (data.deactivate === false) {
    await env.DB.prepare(`UPDATE users SET is_business = 1, updated_at = datetime('now') WHERE id = ?`)
      .bind(userId)
      .run();
  }

  if (data.displayName) {
    await env.DB.prepare(
      `UPDATE business_settings SET business_name = ?, updated_at = datetime('now') WHERE business_id = ?`
    )
      .bind(data.displayName, userId)
      .run();
  }

  await writeAdminAudit(env, {
    adminId: ctx.adminId,
    action: data.deactivate ? 'business.account_deactivate' : 'business.account_update',
    targetType: 'user',
    targetId: userId,
    metadata: data,
    ipAddress: requestIp(request),
  });

  return json({ ok: true });
}

// --- Business orders ops ---

export async function listOrders(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAdmin(request, env, 'business.read');
  if (ctx instanceof Response) return ctx;
  try {
    const rows = await env.DB.prepare(
      `SELECT o.*, u.email as customer_email
       FROM orders o JOIN users u ON u.id = o.user_id
       ORDER BY o.created_at DESC LIMIT 200`
    ).all();
    return json({
      orders: (rows.results || []).map((o: any) => ({
        ...o,
        shipping_address: parseJson(o.shipping_address, {}),
        metadata: parseJson(o.metadata, {}),
      })),
    });
  } catch (err) {
    console.error('[admin.listOrders]', err);
    return error('DATABASE_ERROR', 'Failed to load orders', 500);
  }
}

export async function getOrder(request: Request, env: Env, orderId: string): Promise<Response> {
  const ctx = await requireAdmin(request, env, 'business.read');
  if (ctx instanceof Response) return ctx;
  try {
    const order = await env.DB.prepare(
      `SELECT o.*, u.email as customer_email
       FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = ?`
    )
      .bind(orderId)
      .first<any>();
    if (!order) return error('NOT_FOUND', 'Order not found', 404);
    const items = await env.DB.prepare(
      `SELECT oi.*, p.name as product_name FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`
    )
      .bind(orderId)
      .all();
    return json({
      ...order,
      shipping_address: parseJson(order.shipping_address, {}),
      metadata: parseJson(order.metadata, {}),
      items: items.results || [],
    });
  } catch (err) {
    console.error('[admin.getOrder]', err);
    return error('DATABASE_ERROR', 'Failed to load order', 500);
  }
}

export async function refundOrder(request: Request, env: Env, orderId: string): Promise<Response> {
  const ctx = await requireRoles(
    request,
    env,
    ['super_admin', 'finance_admin', 'business_ops_admin'] as AdminRole[],
    'business.refund'
  );
  if (ctx instanceof Response) return ctx;
  const validation = await validateRequest(request, adminRefundSchema);
  if (!validation.success) return validation.response;
  const { amount, reasonText } = validation.data;
  try {
    const order = await env.DB.prepare(`SELECT id, total, refund_amount FROM orders WHERE id = ?`)
      .bind(orderId)
      .first<any>();
    if (!order) return error('NOT_FOUND', 'Order not found', 404);
    const refundAmount = Math.min(Number(amount), Number(order.total));
    await env.DB.prepare(
      `UPDATE orders SET refund_amount = COALESCE(refund_amount,0) + ?, payment_status = 'refunded', updated_at = datetime('now') WHERE id = ?`
    )
      .bind(refundAmount, orderId)
      .run();
    await writeAdminAudit(env, {
      adminId: ctx.adminId,
      action: 'business.refund',
      targetType: 'order',
      targetId: orderId,
      reasonText,
      metadata: { amount: refundAmount },
      ipAddress: requestIp(request),
    });
    return json({ ok: true, refund_amount: refundAmount });
  } catch (err) {
    console.error('[refundOrder]', err);
    return error('DATABASE_ERROR', 'Failed to process refund', 500);
  }
}

export async function listPartnershipFlags(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAdmin(request, env, 'business.read');
  if (ctx instanceof Response) return ctx;
  try {
    const rows = await env.DB.prepare(
      `SELECT pr.*, u.metadata as instructor_metadata
       FROM partnership_requests pr
       JOIN users u ON u.id = pr.instructor_id
       WHERE pr.status = 'pending'
       ORDER BY pr.created_at DESC LIMIT 100`
    ).all();
    return json({ flags: rows.results || [] });
  } catch (err) {
    console.error('[listPartnershipFlags]', err);
    return error('DATABASE_ERROR', 'Failed to load partnership flags', 500);
  }
}

export async function getRiskSignals(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAdmin(request, env, 'business.read');
  if (ctx instanceof Response) return ctx;
  try {
    const [refunds, reportBurst, repeatOffenders] = await Promise.all([
      env.DB.prepare(
        `SELECT COUNT(*) as count, COALESCE(SUM(refund_amount),0) as total
         FROM orders WHERE refund_amount > 0 AND created_at >= datetime('now', '-7 days')`
      ).first<{ count: number; total: number }>(),
      env.DB.prepare(
        `SELECT COUNT(*) as count FROM reports WHERE created_at >= datetime('now', '-24 hours')`
      ).first<{ count: number }>(),
      env.DB.prepare(
        `SELECT user_id, strike_count, status FROM user_account_states WHERE strike_count >= 2 ORDER BY strike_count DESC LIMIT 20`
      ).all(),
    ]);
    return json({
      refunds_7d: refunds,
      reports_24h: reportBurst?.count || 0,
      repeat_offenders: repeatOffenders.results || [],
    });
  } catch (err) {
    console.error('[getRiskSignals]', err);
    return error('DATABASE_ERROR', 'Failed to load risk signals', 500);
  }
}
