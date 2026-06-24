import { Env, Product, Order } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { generateId } from '../utils/id';
import {
  validateRequest,
  createPartnershipRequestSchema,
  updatePartnershipRequestSchema,
  updateBusinessSettingsSchema,
} from '../utils/validation';

type BusinessContext = { userId: string };
type Period = 'today' | 'week' | 'month';

function safeParse<T>(raw: string | null | undefined, fallback: T): T {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function requireBusiness(request: Request, env: Env): Promise<BusinessContext | Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }
  if (!ctx.user?.is_business) {
    return error('FORBIDDEN', 'Only businesses can access this endpoint', 403);
  }
  return { userId: ctx.userId };
}

function getPeriodBounds(period: Period) {
  const now = new Date();
  const end = now.toISOString();
  const startDate = new Date(now);
  const prevStartDate = new Date(now);
  const prevEndDate = new Date(now);
  if (period === 'today') {
    startDate.setHours(0, 0, 0, 0);
    prevStartDate.setDate(startDate.getDate() - 1);
    prevStartDate.setHours(0, 0, 0, 0);
    prevEndDate.setDate(startDate.getDate());
    prevEndDate.setHours(0, 0, 0, 0);
  } else if (period === 'week') {
    startDate.setDate(startDate.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);
    prevStartDate.setDate(startDate.getDate() - 7);
    prevStartDate.setHours(0, 0, 0, 0);
    prevEndDate.setDate(startDate.getDate());
    prevEndDate.setHours(0, 0, 0, 0);
  } else {
    startDate.setDate(startDate.getDate() - 29);
    startDate.setHours(0, 0, 0, 0);
    prevStartDate.setDate(startDate.getDate() - 30);
    prevStartDate.setHours(0, 0, 0, 0);
    prevEndDate.setDate(startDate.getDate());
    prevEndDate.setHours(0, 0, 0, 0);
  }
  return {
    start: startDate.toISOString(),
    end,
    prevStart: prevStartDate.toISOString(),
    prevEnd: prevEndDate.toISOString(),
  };
}

function deltaPct(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

async function fetchOrderOverview(
  env: Env,
  userId: string,
  start: string,
  end: string
) {
  return env.DB.prepare(
    `WITH business_orders AS (
      SELECT DISTINCT o.id, o.status, o.total, o.created_at, COALESCE(o.refund_amount, 0) AS refund_amount
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON p.id = oi.product_id
      WHERE p.user_id = ? AND o.created_at >= ? AND o.created_at < ?
    )
    SELECT
      COUNT(*) AS total_orders,
      SUM(CASE WHEN status IN ('pending', 'processing') THEN 1 ELSE 0 END) AS pending_orders,
      SUM(CASE WHEN status IN ('completed', 'delivered') THEN 1 ELSE 0 END) AS completed_orders,
      SUM(CASE WHEN status IN ('completed', 'delivered') THEN total ELSE 0 END) AS gross_revenue,
      SUM(CASE WHEN status IN ('completed', 'delivered') THEN refund_amount ELSE 0 END) AS refunds
    FROM business_orders`
  )
    .bind(userId, start, end)
    .first<{
      total_orders: number;
      pending_orders: number;
      completed_orders: number;
      gross_revenue: number;
      refunds: number;
    }>();
}

/**
 * GET /api/v1/business/dashboard
 */
export async function getDashboard(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const period = (url.searchParams.get('period') as Period) || 'week';
  const bounds = getPeriodBounds(period);

  try {
    const [productsResult, nowOverview, prevOverview, recentOrders, partnerStats] = await Promise.all([
      env.DB.prepare(
        `SELECT
          COUNT(*) AS count,
          COALESCE(SUM(stock), 0) AS total_stock,
          COALESCE(SUM(stock * price), 0) AS inventory_value
        FROM products WHERE user_id = ?`
      )
        .bind(auth.userId)
        .first<{ count: number; total_stock: number; inventory_value: number }>(),
      fetchOrderOverview(env, auth.userId, bounds.start, bounds.end),
      fetchOrderOverview(env, auth.userId, bounds.prevStart, bounds.prevEnd),
      env.DB.prepare(
        `SELECT DISTINCT o.*,
          (SELECT json_group_array(json_object(
            'id', oi.id,
            'product_id', oi.product_id,
            'quantity', oi.quantity,
            'price', oi.price,
            'product_name', p.name,
            'product_image', p.image_url
          ))
          FROM order_items oi
          JOIN products p ON p.id = oi.product_id
          WHERE oi.order_id = o.id AND p.user_id = ?) AS items
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN products p ON p.id = oi.product_id
        WHERE p.user_id = ? AND o.created_at >= ? AND o.created_at < ?
        ORDER BY o.created_at DESC
        LIMIT 20`
      )
        .bind(auth.userId, auth.userId, bounds.start, bounds.end)
        .all<Order & { items: string }>(),
      env.DB.prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active_partners,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending_requests
        FROM (
          SELECT status FROM partnerships WHERE business_id = ?
          UNION ALL
          SELECT status FROM partnership_requests WHERE business_id = ?
        )`
      )
        .bind(auth.userId, auth.userId)
        .first<{ active_partners: number; pending_requests: number }>(),
    ]);

    const grossRevenue = Number(nowOverview?.gross_revenue || 0);
    const refunds = Number(nowOverview?.refunds || 0);
    const netRevenue = Math.max(0, grossRevenue - refunds);
    const prevNetRevenue = Math.max(
      0,
      Number(prevOverview?.gross_revenue || 0) - Number(prevOverview?.refunds || 0)
    );
    const totalOrders = Number(nowOverview?.total_orders || 0);
    const prevOrders = Number(prevOverview?.total_orders || 0);

    return json({
      kpis: {
        period,
        total_products: Number(productsResult?.count || 0),
        total_stock: Number(productsResult?.total_stock || 0),
        inventory_value: Number(productsResult?.inventory_value || 0),
        total_orders: totalOrders,
        pending_orders: Number(nowOverview?.pending_orders || 0),
        completed_orders: Number(nowOverview?.completed_orders || 0),
        total_revenue: grossRevenue,
        gross_revenue: grossRevenue,
        refunds,
        net_revenue: netRevenue,
        active_partners: Number(partnerStats?.active_partners || 0),
        pending_partner_requests: Number(partnerStats?.pending_requests || 0),
        deltas: {
          orders_pct: deltaPct(totalOrders, prevOrders),
          net_revenue_pct: deltaPct(netRevenue, prevNetRevenue),
        },
        recent_orders: (recentOrders.results || []).map((order) => ({
          ...order,
          shipping_address: safeParse(order.shipping_address, {}),
          metadata: safeParse(order.metadata, {}),
          items: safeParse(order.items, []),
        })),
      },
    });
  } catch (err) {
    console.error('[getDashboard] Error:', err);
    return error('DATABASE_ERROR', 'Failed to fetch dashboard data', 500);
  }
}

/**
 * GET /api/v1/business/analytics/timeseries
 */
export async function getAnalyticsTimeseries(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const period = (url.searchParams.get('period') as Period) || 'week';
  const bounds = getPeriodBounds(period);
  try {
    const rows = await env.DB.prepare(
      `WITH business_orders AS (
        SELECT DISTINCT o.id, o.status, o.total, o.created_at
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN products p ON p.id = oi.product_id
        WHERE p.user_id = ? AND o.created_at >= ? AND o.created_at < ?
      )
      SELECT
        date(created_at) AS day,
        COUNT(*) AS orders,
        COALESCE(SUM(CASE WHEN status IN ('completed', 'delivered') THEN total ELSE 0 END), 0) AS revenue
      FROM business_orders
      GROUP BY date(created_at)
      ORDER BY day ASC`
    )
      .bind(auth.userId, bounds.start, bounds.end)
      .all<{ day: string; orders: number; revenue: number }>();

    return json({ period, series: rows.results || [] });
  } catch (err) {
    console.error('[getAnalyticsTimeseries] Error:', err);
    return error('DATABASE_ERROR', 'Failed to load timeseries', 500);
  }
}

/**
 * GET /api/v1/business/analytics/top-products
 */
export async function getTopProducts(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  const url = new URL(request.url);
  const period = (url.searchParams.get('period') as Period) || 'month';
  const bounds = getPeriodBounds(period);
  try {
    const rows = await env.DB.prepare(
      `SELECT
        p.id,
        p.name,
        p.image_url,
        SUM(oi.quantity) AS units_sold,
        SUM(oi.quantity * oi.price) AS revenue
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      JOIN orders o ON o.id = oi.order_id
      WHERE p.user_id = ? AND o.created_at >= ? AND o.created_at < ?
        AND o.status IN ('completed', 'delivered')
      GROUP BY p.id, p.name, p.image_url
      ORDER BY revenue DESC
      LIMIT 10`
    )
      .bind(auth.userId, bounds.start, bounds.end)
      .all<{ id: string; name: string; image_url: string | null; units_sold: number; revenue: number }>();
    return json({ period, products: rows.results || [] });
  } catch (err) {
    console.error('[getTopProducts] Error:', err);
    return error('DATABASE_ERROR', 'Failed to load top products', 500);
  }
}

/**
 * GET /api/v1/business/analytics/partnerships
 */
export async function getPartnershipPerformance(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  try {
    const rows = await env.DB.prepare(
      `SELECT
        p.id,
        p.instructor_id,
        p.partnership_type,
        p.commission_rate,
        p.fixed_fee,
        p.status,
        u.metadata AS instructor_metadata,
        COALESCE((
          SELECT SUM(o.total)
          FROM orders o
          WHERE o.business_id = p.business_id
            AND o.source = 'partnership'
            AND json_extract(o.metadata, '$.referral_instructor_id') = p.instructor_id
            AND o.status IN ('completed', 'delivered')
        ), 0) AS attributed_revenue
      FROM partnerships p
      JOIN users u ON u.id = p.instructor_id
      WHERE p.business_id = ?
      ORDER BY attributed_revenue DESC, p.created_at DESC`
    )
      .bind(auth.userId)
      .all<{
        id: string;
        instructor_id: string;
        partnership_type: string;
        commission_rate: number | null;
        fixed_fee: number | null;
        status: string;
        instructor_metadata: string;
        attributed_revenue: number;
      }>();
    return json({
      partnerships: (rows.results || []).map((row) => {
        const meta = safeParse<{ username?: string; avatar?: string; categories?: string[] }>(
          row.instructor_metadata,
          {}
        );
        return {
          id: row.id,
          instructor_id: row.instructor_id,
          instructor_name: meta.username || 'Instructor',
          instructor_avatar: meta.avatar || null,
          categories: meta.categories || [],
          partnership_type: row.partnership_type,
          commission_rate: row.commission_rate,
          fixed_fee: row.fixed_fee,
          status: row.status,
          attributed_revenue: Number(row.attributed_revenue || 0),
        };
      }),
    });
  } catch (err) {
    console.error('[getPartnershipPerformance] Error:', err);
    return error('DATABASE_ERROR', 'Failed to load partnership analytics', 500);
  }
}

/**
 * GET /api/v1/business/products
 */
export async function getBusinessProducts(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  try {
    const products = await env.DB.prepare(
      'SELECT * FROM products WHERE user_id = ? ORDER BY created_at DESC'
    )
      .bind(auth.userId)
      .all<Product>();

    const formattedProducts = (products.results || []).map((product) => ({
      ...product,
      images: safeParse(product.images || '[]', []),
      metadata: safeParse(product.metadata, {}),
    }));

    return json({
      products: formattedProducts,
      total: formattedProducts.length,
      limit: formattedProducts.length,
      offset: 0,
    });
  } catch (err) {
    console.error('[getBusinessProducts] Error:', err);
    return error('DATABASE_ERROR', 'Failed to fetch products', 500);
  }
}

/**
 * GET /api/v1/business/orders
 */
export async function getBusinessOrders(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  try {
    const orders = await env.DB.prepare(
      `SELECT DISTINCT o.*,
        (SELECT json_group_array(json_object(
          'id', oi.id,
          'product_id', oi.product_id,
          'quantity', oi.quantity,
          'price', oi.price,
          'product_name', p.name,
          'product_image', p.image_url
        ))
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = o.id AND p.user_id = ?) as items
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      WHERE p.user_id = ?
      ORDER BY o.created_at DESC
      LIMIT 200`
    )
      .bind(auth.userId, auth.userId)
      .all<Order & { items: string }>();

    return json(
      (orders.results || []).map((order) => ({
        ...order,
        shipping_address: safeParse(order.shipping_address, {}),
        metadata: safeParse(order.metadata, {}),
        items: safeParse(order.items, []),
      }))
    );
  } catch (err) {
    console.error('[getBusinessOrders] Error:', err);
    return error('DATABASE_ERROR', 'Failed to fetch orders', 500);
  }
}

/**
 * GET /api/v1/business/orders/:id
 */
export async function getBusinessOrderDetail(request: Request, env: Env, orderId: string): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  try {
    const order = await env.DB.prepare(
      `SELECT DISTINCT o.*,
        (SELECT json_group_array(json_object(
          'id', oi.id,
          'product_id', oi.product_id,
          'quantity', oi.quantity,
          'price', oi.price,
          'product_name', p.name,
          'product_image', p.image_url
        ))
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = o.id AND p.user_id = ?) as items
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON p.id = oi.product_id
      WHERE o.id = ? AND p.user_id = ?
      LIMIT 1`
    )
      .bind(auth.userId, orderId, auth.userId)
      .first<Order & { items: string }>();
    if (!order) return error('NOT_FOUND', 'Order not found', 404);
    return json({
      ...order,
      shipping_address: safeParse(order.shipping_address, {}),
      metadata: safeParse(order.metadata, {}),
      items: safeParse(order.items, []),
    });
  } catch (err) {
    console.error('[getBusinessOrderDetail] Error:', err);
    return error('DATABASE_ERROR', 'Failed to fetch order detail', 500);
  }
}

/**
 * GET /api/v1/business/partnerships
 */
export async function getPartnerships(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  try {
    const [partners, requests] = await Promise.all([
      env.DB.prepare(
        `SELECT p.*, u.metadata AS instructor_metadata
        FROM partnerships p
        JOIN users u ON u.id = p.instructor_id
        WHERE p.business_id = ?
        ORDER BY p.created_at DESC`
      )
        .bind(auth.userId)
        .all<{
          id: string;
          instructor_id: string;
          partnership_type: string;
          commission_rate: number | null;
          fixed_fee: number | null;
          status: string;
          created_at: string;
          instructor_metadata: string;
        }>(),
      env.DB.prepare(
        `SELECT r.*, u.metadata AS instructor_metadata
        FROM partnership_requests r
        JOIN users u ON u.id = r.instructor_id
        WHERE r.business_id = ?
        ORDER BY r.created_at DESC`
      )
        .bind(auth.userId)
        .all<{
          id: string;
          instructor_id: string;
          status: string;
          partnership_type: string;
          commission_rate: number | null;
          fixed_fee: number | null;
          message: string | null;
          created_at: string;
          instructor_metadata: string;
        }>(),
    ]);
    return json({
      partnerships: (partners.results || []).map((p) => {
        const meta = safeParse<{ username?: string; avatar?: string; categories?: string[] }>(
          p.instructor_metadata,
          {}
        );
        return {
          ...p,
          instructor_name: meta.username || 'Instructor',
          instructor_avatar: meta.avatar || null,
          categories: meta.categories || [],
        };
      }),
      requests: (requests.results || []).map((r) => {
        const meta = safeParse<{ username?: string; avatar?: string; categories?: string[] }>(
          r.instructor_metadata,
          {}
        );
        return {
          ...r,
          instructor_name: meta.username || 'Instructor',
          instructor_avatar: meta.avatar || null,
          categories: meta.categories || [],
        };
      }),
    });
  } catch (err) {
    console.error('[getPartnerships] Error:', err);
    return error('DATABASE_ERROR', 'Failed to load partnerships', 500);
  }
}

/**
 * GET /api/v1/business/partnerships/discover
 */
export async function getPartnershipDiscover(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  try {
    const rows = await env.DB.prepare(
      `SELECT
        u.id,
        u.points,
        u.metadata,
        COUNT(DISTINCT iv.id) AS vote_count
      FROM users u
      LEFT JOIN instructor_votes iv ON iv.candidate_id = u.id
      WHERE u.is_instructor = 1
        AND u.id NOT IN (
          SELECT instructor_id FROM partnerships WHERE business_id = ?
          UNION
          SELECT instructor_id FROM partnership_requests WHERE business_id = ? AND status = 'pending'
        )
      GROUP BY u.id
      ORDER BY vote_count DESC, u.points DESC
      LIMIT 100`
    )
      .bind(auth.userId, auth.userId)
      .all<{ id: string; points: number; metadata: string; vote_count: number }>();
    return json({
      instructors: (rows.results || []).map((r) => {
        const meta = safeParse<{ username?: string; avatar?: string; categories?: string[] }>(
          r.metadata,
          {}
        );
        return {
          id: r.id,
          username: meta.username || 'Instructor',
          avatar: meta.avatar || null,
          categories: meta.categories || [],
          points: r.points,
          vote_count: Number(r.vote_count || 0),
        };
      }),
    });
  } catch (err) {
    console.error('[getPartnershipDiscover] Error:', err);
    return error('DATABASE_ERROR', 'Failed to load instructor discovery', 500);
  }
}

/**
 * POST /api/v1/business/partnerships/requests
 */
export async function createPartnershipRequest(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  const validation = await validateRequest(request, createPartnershipRequestSchema);
  if (!validation.success) return validation.response;
  const body = validation.data;
  const instructorId = String(body.instructorId || '').trim();
  const partnershipType = body.partnershipType || 'commission';
  if (!instructorId) return error('VALIDATION_ERROR', 'instructorId is required', 400);

  try {
    const instructor = await env.DB.prepare('SELECT id, is_instructor FROM users WHERE id = ?')
      .bind(instructorId)
      .first<{ id: string; is_instructor: number }>();
    if (!instructor || !instructor.is_instructor) {
      return error('NOT_FOUND', 'Instructor not found', 404);
    }
    const id = generateId('preq');
    await env.DB.prepare(
      `INSERT INTO partnership_requests
      (id, business_id, instructor_id, status, partnership_type, commission_rate, fixed_fee, message, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(business_id, instructor_id)
      DO UPDATE SET status = 'pending', partnership_type = excluded.partnership_type,
        commission_rate = excluded.commission_rate, fixed_fee = excluded.fixed_fee,
        message = excluded.message, updated_at = datetime('now')`
    )
      .bind(
        id,
        auth.userId,
        instructorId,
        partnershipType,
        body.commissionRate ?? null,
        body.fixedFee ?? null,
        body.message ?? null
      )
      .run();
    return json({ ok: true }, 201);
  } catch (err) {
    console.error('[createPartnershipRequest] Error:', err);
    return error('DATABASE_ERROR', 'Failed to create request', 500);
  }
}

/**
 * PATCH /api/v1/business/partnerships/requests/:id
 */
export async function updatePartnershipRequest(
  request: Request,
  env: Env,
  requestId: string
): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  const validation = await validateRequest(request, updatePartnershipRequestSchema);
  if (!validation.success) return validation.response;
  const { status } = validation.data;
  try {
    const req = await env.DB.prepare(
      `SELECT * FROM partnership_requests WHERE id = ? AND business_id = ? LIMIT 1`
    )
      .bind(requestId, auth.userId)
      .first<{
        id: string;
        business_id: string;
        instructor_id: string;
        partnership_type: 'commission' | 'fixed' | 'hybrid';
        commission_rate: number | null;
        fixed_fee: number | null;
      }>();
    if (!req) return error('NOT_FOUND', 'Partnership request not found', 404);
    await env.DB.prepare(
      `UPDATE partnership_requests SET status = ?, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(status, requestId)
      .run();
    if (status === 'approved') {
      await env.DB.prepare(
        `INSERT INTO partnerships
        (id, business_id, instructor_id, partnership_type, commission_rate, fixed_fee, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
        ON CONFLICT(business_id, instructor_id)
        DO UPDATE SET partnership_type = excluded.partnership_type,
          commission_rate = excluded.commission_rate, fixed_fee = excluded.fixed_fee,
          status = 'active', updated_at = datetime('now')`
      )
        .bind(
          generateId('partner'),
          req.business_id,
          req.instructor_id,
          req.partnership_type,
          req.commission_rate,
          req.fixed_fee
        )
        .run();
    }
    return json({ ok: true });
  } catch (err) {
    console.error('[updatePartnershipRequest] Error:', err);
    return error('DATABASE_ERROR', 'Failed to update request', 500);
  }
}

/**
 * GET /api/v1/business/settings
 */
export async function getBusinessSettings(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  try {
    const [settings, user] = await Promise.all([
      env.DB.prepare(`SELECT * FROM business_settings WHERE business_id = ?`)
        .bind(auth.userId)
        .first<{
          business_name: string | null;
          logo_url: string | null;
          analytics_prefs: string;
          notifications_prefs: string;
        }>(),
      env.DB.prepare(`SELECT metadata, email FROM users WHERE id = ?`).bind(auth.userId).first<{
        metadata: string;
        email: string;
      }>(),
    ]);
    const meta = safeParse<{ username?: string }>(user?.metadata || '{}', {});
    return json({
      business_name: settings?.business_name || meta.username || user?.email?.split('@')[0] || 'Business',
      logo_url: settings?.logo_url || null,
      analytics_prefs: safeParse(settings?.analytics_prefs || '{}', {}),
      notifications_prefs: safeParse(settings?.notifications_prefs || '{}', {}),
    });
  } catch (err) {
    console.error('[getBusinessSettings] Error:', err);
    return error('DATABASE_ERROR', 'Failed to load settings', 500);
  }
}

/**
 * PUT /api/v1/business/settings
 */
export async function updateBusinessSettings(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  const validation = await validateRequest(request, updateBusinessSettingsSchema);
  if (!validation.success) return validation.response;
  const body = validation.data;
  try {
    await env.DB.prepare(
      `INSERT INTO business_settings
      (business_id, business_name, logo_url, analytics_prefs, notifications_prefs, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(business_id)
      DO UPDATE SET business_name = excluded.business_name,
        logo_url = excluded.logo_url,
        analytics_prefs = excluded.analytics_prefs,
        notifications_prefs = excluded.notifications_prefs,
        updated_at = datetime('now')`
    )
      .bind(
        auth.userId,
        body.business_name || null,
        body.logo_url || null,
        JSON.stringify(body.analytics_prefs || {}),
        JSON.stringify(body.notifications_prefs || {})
      )
      .run();
    return json({ ok: true });
  } catch (err) {
    console.error('[updateBusinessSettings] Error:', err);
    return error('DATABASE_ERROR', 'Failed to update settings', 500);
  }
}
