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
  createBusinessAccountSchema,
  updateBusinessAccountSchema,
} from '../../utils/validation';
import { hashPassword } from '../../utils/password';
import { generateId } from '../../utils/id';
import { z } from 'zod';
import { parsePaging, likePattern, searchQuery, paged } from '../../utils/adminLists';
import { SELLER_ARCHIVED_REASON } from '../business';

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
  const url = new URL(request.url);
  const q = searchQuery(url);
  const status = url.searchParams.get('status') || '';
  const verification = url.searchParams.get('verification') || '';
  const { limit, offset } = parsePaging(url, 50, 200);

  // Every provisioned business (has a profile), including deactivated ones so they can be reactivated.
  let where = `WHERE 1=1`;
  const bindings: unknown[] = [];
  if (status === 'active') where += ` AND u.is_business = 1`;
  if (status === 'deactivated') where += ` AND u.is_business = 0`;
  if (verification) {
    where += ` AND bp.verification_status = ?`;
    bindings.push(verification);
  }
  if (q) {
    const like = likePattern(q);
    where += ` AND (u.email LIKE ? ESCAPE '\\' OR bp.display_name LIKE ? ESCAPE '\\' OR bp.contact_email LIKE ? ESCAPE '\\' OR u.id = ?)`;
    bindings.push(like, like, like, q);
  }
  const from = `FROM users u JOIN business_profiles bp ON bp.user_id = u.id ${where}`;
  const [countRow, rows] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS total ${from}`).bind(...bindings).first<{ total: number }>(),
    env.DB.prepare(
      `SELECT u.id, u.email, u.is_business, u.created_at,
              bp.display_name, bp.contact_email, bp.field_of_operation,
              bp.verification_status, bp.created_at as profile_created_at
       ${from}
       ORDER BY bp.created_at DESC LIMIT ? OFFSET ?`
    )
      .bind(...bindings, limit, offset)
      .all(),
  ]);
  const accounts = rows.results || [];
  return json({
    accounts,
    fields: BUSINESS_FIELDS,
    ...paged(accounts, countRow?.total ?? 0, limit, offset),
  });
}

export async function getBusinessAccount(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  const ctx = await requireAdmin(request, env, 'business.read');
  if (ctx instanceof Response) return ctx;

  // Deactivated businesses (is_business = 0) stay viewable so they can be reactivated.
  const user = await env.DB.prepare(
    `SELECT u.id, u.email, u.is_business, u.created_at, u.metadata
     FROM users u JOIN business_profiles bp ON bp.user_id = u.id WHERE u.id = ?`
  )
    .bind(userId)
    .first<any>();
  if (!user) return error('NOT_FOUND', 'Business account not found', 404);

  const profile = await env.DB.prepare(`SELECT * FROM business_profiles WHERE user_id = ?`)
    .bind(userId)
    .first<any>();

  const meta = parseJson<Record<string, unknown>>(user.metadata, {});
  return json({
    user: {
      ...user,
      metadata: { username: meta.username, avatar: meta.avatar, bio: meta.bio },
    },
    profile,
  });
}

/**
 * GET /api/v1/admin/business/accounts/:id/overview
 */
export async function getBusinessAccountOverview(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  const ctx = await requireAdmin(request, env, 'business.read');
  if (ctx instanceof Response) return ctx;

  const user = await env.DB.prepare(
    `SELECT u.id, u.email, u.is_business, u.created_at
     FROM users u JOIN business_profiles bp ON bp.user_id = u.id WHERE u.id = ?`
  )
    .bind(userId)
    .first<{ id: string; email: string; is_business: number; created_at: string }>();
  if (!user) return error('NOT_FOUND', 'Business account not found', 404);

  const profile = await env.DB.prepare(`SELECT * FROM business_profiles WHERE user_id = ?`)
    .bind(userId)
    .first<Record<string, unknown>>();

  const settings = await env.DB.prepare(
    `SELECT analytics_prefs FROM business_settings WHERE business_id = ?`
  )
    .bind(userId)
    .first<{ analytics_prefs: string | null }>();
  const prefs = parseJson<Record<string, unknown>>(settings?.analytics_prefs, {});
  const lowStockThreshold = Math.max(1, Number(prefs.low_stock_threshold ?? 10) || 10);

  const [products, gmv, orders30d, lowStock] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) as c FROM products WHERE user_id = ?`)
      .bind(userId)
      .first<{ c: number }>(),
    env.DB.prepare(
      `SELECT COALESCE(SUM(total), 0) as t FROM (
         SELECT DISTINCT o.id, o.total
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         JOIN products p ON p.id = oi.product_id
         WHERE p.user_id = ? AND o.created_at >= datetime('now', '-30 days')
           AND o.status IN ('completed', 'delivered', 'shipped', 'processing')
       )`
    )
      .bind(userId)
      .first<{ t: number }>(),
    env.DB.prepare(
      `SELECT COUNT(DISTINCT o.id) as c
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       WHERE p.user_id = ? AND o.created_at >= datetime('now', '-30 days')`
    )
      .bind(userId)
      .first<{ c: number }>(),
    env.DB.prepare(
      `SELECT COALESCE(SUM(CASE WHEN stock > 0 AND stock < ? THEN 1 ELSE 0 END), 0) as low,
              COALESCE(SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END), 0) as out
       FROM products WHERE user_id = ?`
    )
      .bind(lowStockThreshold, userId)
      .first<{ low: number; out: number }>(),
  ]);

  return json({
    user,
    profile,
    overview: {
      product_count: products?.c || 0,
      gmv_30d: gmv?.t || 0,
      orders_30d: orders30d?.c || 0,
      low_stock_count: lowStock?.low || 0,
      out_of_stock_count: lowStock?.out || 0,
      low_stock_threshold: lowStockThreshold,
      verification_status: (profile?.verification_status as string) || 'pending',
    },
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

  // Look up by business profile, not is_business: reactivating must find deactivated accounts.
  const user = await env.DB.prepare(
    `SELECT u.id, u.is_business FROM users u JOIN business_profiles bp ON bp.user_id = u.id WHERE u.id = ?`
  )
    .bind(userId)
    .first<{ id: string; is_business: number }>();
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
    action:
      data.deactivate === true
        ? 'business.account_deactivate'
        : data.deactivate === false && !user.is_business
          ? 'business.account_reactivate'
          : 'business.account_update',
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
  const url = new URL(request.url);
  const q = searchQuery(url);
  const status = url.searchParams.get('status') || '';
  const paymentStatus = url.searchParams.get('payment_status') || '';
  const { limit, offset } = parsePaging(url, 50, 200);
  try {
    let where = `WHERE 1=1`;
    const bindings: unknown[] = [];
    if (status) {
      where += ` AND o.status = ?`;
      bindings.push(status);
    }
    if (paymentStatus) {
      where += ` AND o.payment_status = ?`;
      bindings.push(paymentStatus);
    }
    if (q) {
      where += ` AND (o.id = ? OR u.email LIKE ? ESCAPE '\\' OR o.business_id = ?)`;
      bindings.push(q, likePattern(q), q);
    }
    const from = `FROM orders o JOIN users u ON u.id = o.user_id ${where}`;
    // List view carries no shipping address or order metadata: those are on the detail view only.
    const [countRow, rows] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS total ${from}`).bind(...bindings).first<{ total: number }>(),
      env.DB.prepare(
        `SELECT o.id, o.user_id, o.business_id, o.status, o.payment_status, o.total, o.refund_amount,
                o.source, o.created_at, o.updated_at, u.email AS customer_email
         ${from}
         ORDER BY o.created_at DESC LIMIT ? OFFSET ?`
      )
        .bind(...bindings, limit, offset)
        .all(),
    ]);
    const orders = rows.results || [];
    return json({ orders, ...paged(orders, countRow?.total ?? 0, limit, offset) });
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
    const [items, refunds] = await Promise.all([
      env.DB.prepare(
        `SELECT oi.*, p.name as product_name, p.user_id as seller_id
         FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`
      )
        .bind(orderId)
        .all(),
      env.DB.prepare(
        `SELECT r.id, r.amount, r.reason_text, r.created_at, a.email AS admin_email
         FROM admin_order_refunds r LEFT JOIN admin_users a ON a.id = r.admin_id
         WHERE r.order_id = ? ORDER BY r.created_at ASC`
      )
        .bind(orderId)
        .all(),
    ]);
    // The detail view shows the shipping address: record the PII read.
    await writeAdminAudit(env, {
      adminId: ctx.adminId,
      action: 'order.view',
      targetType: 'order',
      targetId: orderId,
      ipAddress: requestIp(request),
    });
    return json({
      ...order,
      shipping_address: parseJson(order.shipping_address, {}),
      metadata: parseJson(order.metadata, {}),
      items: items.results || [],
      refunds: refunds.results || [],
      payments_enabled: isPaymentsEnabled(env),
    });
  } catch (err) {
    console.error('[admin.getOrder]', err);
    return error('DATABASE_ERROR', 'Failed to load order', 500);
  }
}

/** Same rule as checkout: payments exist only when Stripe is configured (off in production today). */
function isPaymentsEnabled(env: Env): boolean {
  return Boolean(env.STRIPE_SECRET_KEY?.trim());
}

const refundSchema = z.object({
  /** Omit for a full refund of what is left. */
  amount: z.number().positive().max(1_000_000).optional(),
  reasonText: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
});

const cents = (n: number) => Math.round(n * 100) / 100;
const EPS = 0.005;

/**
 * POST /admin/business/orders/:id/refund — records a (partial) refund.
 * Refuses while payments are off; idempotent per Idempotency-Key; never refunds more
 * than total minus earlier refunds; a full refund of an unshipped order cancels it and
 * puts the stock back. Money still has to be returned in Stripe (no API refund here).
 */
export async function refundOrder(request: Request, env: Env, orderId: string): Promise<Response> {
  const ctx = await requireRoles(
    request,
    env,
    ['super_admin', 'finance_admin'] as AdminRole[],
    'business.refund'
  );
  if (ctx instanceof Response) return ctx;
  const validation = await validateRequest(request, refundSchema);
  if (!validation.success) return validation.response;
  const { amount, reasonText } = validation.data;
  const idempotencyKey = (
    request.headers.get('Idempotency-Key') ||
    validation.data.idempotencyKey ||
    ''
  ).trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 100) {
    return error('IDEMPOTENCY_KEY_REQUIRED', 'Send an Idempotency-Key header with each refund', 400);
  }

  if (!isPaymentsEnabled(env)) {
    return error('PAYMENTS_DISABLED', 'Payments are turned off, so there is nothing to refund', 409);
  }

  try {
    const prior = await env.DB.prepare(
      `SELECT result FROM admin_order_refunds WHERE order_id = ? AND idempotency_key = ?`
    )
      .bind(orderId, idempotencyKey)
      .first<{ result: string }>();
    if (prior) return json({ ...parseJson(prior.result, {}), replayed: true });

    const order = await env.DB.prepare(
      `SELECT id, total, refund_amount, status, payment_status FROM orders WHERE id = ?`
    )
      .bind(orderId)
      .first<{ id: string; total: number; refund_amount: number | null; status: string; payment_status: string | null }>();
    if (!order) return error('NOT_FOUND', 'Order not found', 404);

    const total = cents(Number(order.total) || 0);
    const already = cents(Number(order.refund_amount) || 0);
    const remaining = cents(total - already);
    if (order.payment_status === 'refunded' || remaining <= EPS) {
      return error('ALREADY_REFUNDED', 'This order has already been fully refunded', 409);
    }
    if (order.payment_status !== 'paid') {
      return error('NOT_PAID', 'Only paid orders can be refunded', 409);
    }
    const refund = cents(amount ?? remaining);
    if (refund <= 0) return error('VALIDATION_ERROR', 'Refund amount must be positive', 400);
    if (refund > remaining + EPS) {
      return error(
        'REFUND_EXCEEDS_REMAINING',
        `At most ${remaining.toFixed(2)} can still be refunded on this order`,
        409
      );
    }
    const newRefunded = cents(already + refund);
    const full = newRefunded >= total - EPS;
    const cancel = full && (order.status === 'pending' || order.status === 'processing');

    // Claim the idempotency key first so a concurrent retry cannot refund twice.
    const refundId = generateId('refund');
    const claimed = await env.DB.prepare(
      `INSERT INTO admin_order_refunds (id, order_id, admin_id, amount, reason_text, idempotency_key, result, created_at)
       VALUES (?, ?, ?, ?, ?, ?, '{}', datetime('now'))
       ON CONFLICT(order_id, idempotency_key) DO NOTHING`
    )
      .bind(refundId, orderId, ctx.adminId, refund, reasonText, idempotencyKey)
      .run();
    if (Number(claimed?.meta?.changes ?? 1) === 0) {
      return error('REFUND_IN_PROGRESS', 'This refund is already being processed', 409);
    }

    // Guard on the amount we read so two different refunds cannot both pass the cap.
    const updated = await env.DB.prepare(
      `UPDATE orders
       SET refund_amount = ?,
           payment_status = ?,
           status = ?,
           updated_at = datetime('now')
       WHERE id = ? AND COALESCE(refund_amount, 0) = ? AND payment_status = 'paid' AND status = ?`
    )
      .bind(
        newRefunded,
        full ? 'refunded' : 'paid',
        cancel ? 'cancelled' : order.status,
        orderId,
        order.refund_amount ?? 0,
        order.status
      )
      .run();
    if (Number(updated?.meta?.changes ?? 1) === 0) {
      await env.DB.prepare(`DELETE FROM admin_order_refunds WHERE id = ?`).bind(refundId).run();
      return error('CONFLICT', 'The order changed while refunding. Reload and try again.', 409);
    }

    // A fully refunded order that never shipped is cancelled: its paid stock goes back.
    if (cancel) {
      await env.DB.prepare(
        `UPDATE products
         SET stock = stock + COALESCE((
           SELECT SUM(oi.quantity) FROM order_items oi
           WHERE oi.order_id = ? AND oi.product_id = products.id
         ), 0), updated_at = datetime('now')
         WHERE id IN (SELECT product_id FROM order_items WHERE order_id = ?)
           AND COALESCE(hidden_reason, '') != ?`
      )
        .bind(orderId, orderId, SELLER_ARCHIVED_REASON)
        .run();
    }

    const result = {
      ok: true,
      refund_id: refundId,
      refund_amount: refund,
      total_refunded: newRefunded,
      remaining: cents(total - newRefunded),
      payment_status: full ? 'refunded' : 'paid',
      status: cancel ? 'cancelled' : order.status,
      restocked: cancel,
    };
    await env.DB.prepare(`UPDATE admin_order_refunds SET result = ? WHERE id = ?`)
      .bind(JSON.stringify(result), refundId)
      .run();

    await writeAdminAudit(env, {
      adminId: ctx.adminId,
      action: full ? 'business.refund' : 'business.refund_partial',
      targetType: 'order',
      targetId: orderId,
      reasonText,
      metadata: { amount: refund, total_refunded: newRefunded, cancelled: cancel },
      ipAddress: requestIp(request),
    });
    return json(result);
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
