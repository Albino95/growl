import { Env, Product, Order } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { generateId } from '../utils/id';
import {
  validateRequest,
  createPartnershipRequestSchema,
  updatePartnershipRequestSchema,
  updateBusinessSettingsSchema,
  updatePartnershipSchema,
  createCampaignSchema,
  updateCampaignSchema,
  updateOrderFulfillmentSchema,
  createPromoCodeSchema,
  updatePromoCodeSchema,
  refundRequestSchema,
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

function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvResponse(body: string, filename: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

async function businessOwnsOrder(
  env: Env,
  businessId: string,
  orderId: string
): Promise<(Order & { metadata: string }) | null> {
  return env.DB.prepare(
    `SELECT DISTINCT o.*
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id
     WHERE o.id = ? AND p.user_id = ?
     LIMIT 1`
  )
    .bind(orderId, businessId)
    .first<Order>();
}

export async function createBusinessNotification(
  env: Env,
  businessId: string,
  type: string,
  title: string,
  body?: string | null,
  ref?: { ref_type?: string; ref_id?: string }
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO business_notifications
      (id, business_id, type, title, body, ref_type, ref_id, read_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, datetime('now'))`
    )
      .bind(
        generateId('bnotif'),
        businessId,
        type,
        title,
        body ?? null,
        ref?.ref_type ?? null,
        ref?.ref_id ?? null
      )
      .run();
  } catch (err) {
    console.error('[createBusinessNotification] Error:', err);
  }
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
    const settingsRow = await env.DB.prepare(
      'SELECT analytics_prefs FROM business_settings WHERE business_id = ?'
    )
      .bind(auth.userId)
      .first<{ analytics_prefs: string | null }>();
    const analyticsPrefs = safeParse<Record<string, unknown>>(settingsRow?.analytics_prefs, {});
    const lowStockThreshold = Math.max(
      1,
      Number(analyticsPrefs.low_stock_threshold ?? 10) || 10
    );

    const [productsResult, stockCounts, unitsSoldRow, nowOverview, prevOverview, recentOrders, partnerStats] =
      await Promise.all([
        env.DB.prepare(
          `SELECT
            COUNT(*) AS count,
            COALESCE(SUM(stock), 0) AS total_stock,
            COALESCE(SUM(stock * price), 0) AS inventory_value
          FROM products WHERE user_id = ?`
        )
          .bind(auth.userId)
          .first<{ count: number; total_stock: number; inventory_value: number }>(),
        env.DB.prepare(
          `SELECT
            COALESCE(SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END), 0) AS out_of_stock_count,
            COALESCE(SUM(CASE WHEN stock > 0 AND stock < ? THEN 1 ELSE 0 END), 0) AS low_stock_count
          FROM products WHERE user_id = ?`
        )
          .bind(lowStockThreshold, auth.userId)
          .first<{ out_of_stock_count: number; low_stock_count: number }>(),
        env.DB.prepare(
          `SELECT COALESCE(SUM(oi.quantity), 0) AS units_sold
           FROM order_items oi
           JOIN products p ON p.id = oi.product_id
           JOIN orders o ON o.id = oi.order_id
           WHERE p.user_id = ? AND o.created_at >= ? AND o.created_at < ?
             AND o.status IN ('completed', 'delivered', 'shipped', 'processing')`
        )
          .bind(auth.userId, bounds.start, bounds.end)
          .first<{ units_sold: number }>(),
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
    const completedOrders = Number(nowOverview?.completed_orders || 0);
    const pendingOrders = Number(nowOverview?.pending_orders || 0);
    const lowStockCount = Number(stockCounts?.low_stock_count || 0);
    const outOfStockCount = Number(stockCounts?.out_of_stock_count || 0);
    const pendingPartnerRequests = Number(partnerStats?.pending_requests || 0);
    const aov = completedOrders > 0 ? Number((netRevenue / completedOrders).toFixed(2)) : 0;
    const refundRate =
      grossRevenue > 0 ? Number(((refunds / grossRevenue) * 100).toFixed(2)) : 0;
    const actionItemsCount = pendingOrders + lowStockCount + pendingPartnerRequests;

    return json({
      kpis: {
        period,
        total_products: Number(productsResult?.count || 0),
        total_stock: Number(productsResult?.total_stock || 0),
        inventory_value: Number(productsResult?.inventory_value || 0),
        total_orders: totalOrders,
        pending_orders: pendingOrders,
        completed_orders: completedOrders,
        total_revenue: grossRevenue,
        gross_revenue: grossRevenue,
        refunds,
        net_revenue: netRevenue,
        aov,
        units_sold: Number(unitsSoldRow?.units_sold || 0),
        refund_rate: refundRate,
        low_stock_count: lowStockCount,
        out_of_stock_count: outOfStockCount,
        low_stock_threshold: lowStockThreshold,
        action_items_count: actionItemsCount,
        active_partners: Number(partnerStats?.active_partners || 0),
        pending_partner_requests: pendingPartnerRequests,
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
 * GET /api/v1/business/analytics/funnel
 */
export async function getAnalyticsFunnel(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const period = (url.searchParams.get('period') as Period) || 'week';
  const bounds = getPeriodBounds(period);
  try {
    const row = await env.DB.prepare(
      `WITH business_orders AS (
        SELECT DISTINCT o.id, o.status
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN products p ON p.id = oi.product_id
        WHERE p.user_id = ? AND o.created_at >= ? AND o.created_at < ?
      )
      SELECT
        COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END), 0) AS processing,
        COALESCE(SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END), 0) AS shipped,
        COALESCE(SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END), 0) AS delivered,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completed,
        COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled
      FROM business_orders`
    )
      .bind(auth.userId, bounds.start, bounds.end)
      .first<{
        pending: number;
        processing: number;
        shipped: number;
        delivered: number;
        completed: number;
        cancelled: number;
      }>();

    return json({
      period,
      funnel: {
        pending: Number(row?.pending || 0),
        processing: Number(row?.processing || 0),
        shipped: Number(row?.shipped || 0),
        delivered: Number(row?.delivered || 0),
        completed: Number(row?.completed || 0),
        cancelled: Number(row?.cancelled || 0),
      },
    });
  } catch (err) {
    console.error('[getAnalyticsFunnel] Error:', err);
    return error('DATABASE_ERROR', 'Failed to load order funnel', 500);
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
  const url = new URL(request.url);
  const period = (url.searchParams.get('period') as Period) || 'month';
  const bounds = getPeriodBounds(period);
  try {
    const products = await env.DB.prepare(
      `SELECT p.*,
        COALESCE((
          SELECT SUM(oi.quantity)
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE oi.product_id = p.id
            AND o.created_at >= ? AND o.created_at < ?
            AND o.status IN ('completed', 'delivered', 'shipped', 'processing')
        ), 0) AS units_sold
       FROM products p
       WHERE p.user_id = ?
       ORDER BY p.created_at DESC`
    )
      .bind(bounds.start, bounds.end, auth.userId)
      .all<Product & { units_sold: number }>();

    const formattedProducts = (products.results || []).map((product) => ({
      ...product,
      units_sold: Number(product.units_sold || 0),
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
    const existing = await env.DB.prepare(
      `SELECT analytics_prefs, notifications_prefs, business_name, logo_url FROM business_settings WHERE business_id = ?`
    )
      .bind(auth.userId)
      .first<{
        analytics_prefs: string;
        notifications_prefs: string;
        business_name: string | null;
        logo_url: string | null;
      }>();
    const mergedAnalytics = {
      ...safeParse(existing?.analytics_prefs, {}),
      ...(body.analytics_prefs || {}),
    };
    const mergedNotifications = {
      ...safeParse(existing?.notifications_prefs, {}),
      ...(body.notifications_prefs || {}),
    };
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
        body.business_name ?? existing?.business_name ?? null,
        body.logo_url !== undefined
          ? body.logo_url || null
          : existing?.logo_url ?? null,
        JSON.stringify(mergedAnalytics),
        JSON.stringify(mergedNotifications)
      )
      .run();
    return json({ ok: true });
  } catch (err) {
    console.error('[updateBusinessSettings] Error:', err);
    return error('DATABASE_ERROR', 'Failed to update settings', 500);
  }
}

/**
 * PATCH /api/v1/business/partnerships/:id
 * Pause / end / reactivate an active partnership.
 */
export async function updatePartnership(
  request: Request,
  env: Env,
  partnershipId: string
): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  const validation = await validateRequest(request, updatePartnershipSchema);
  if (!validation.success) return validation.response;
  const { status } = validation.data;
  try {
    const existing = await env.DB.prepare(
      `SELECT id FROM partnerships WHERE id = ? AND business_id = ?`
    )
      .bind(partnershipId, auth.userId)
      .first<{ id: string }>();
    if (!existing) return error('NOT_FOUND', 'Partnership not found', 404);
    await env.DB.prepare(
      `UPDATE partnerships SET status = ?, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(status, partnershipId)
      .run();
    return json({ ok: true });
  } catch (err) {
    console.error('[updatePartnership] Error:', err);
    return error('DATABASE_ERROR', 'Failed to update partnership', 500);
  }
}

/**
 * GET /api/v1/business/campaigns
 */
export async function listCampaigns(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  try {
    const rows = await env.DB.prepare(
      `SELECT * FROM marketing_campaigns WHERE business_id = ? ORDER BY created_at DESC`
    )
      .bind(auth.userId)
      .all<{
        id: string;
        business_id: string;
        name: string;
        type: string;
        budget: number;
        spent: number;
        status: string;
        start_date: string | null;
        end_date: string | null;
        product_ids: string;
        metadata: string;
        created_at: string;
        updated_at: string;
      }>();

    return json({
      campaigns: (rows.results || []).map((c) => ({
        ...c,
        product_ids: safeParse(c.product_ids, []),
        metadata: safeParse(c.metadata, {}),
      })),
    });
  } catch (err) {
    console.error('[listCampaigns] Error:', err);
    return error('DATABASE_ERROR', 'Failed to list campaigns', 500);
  }
}

/**
 * POST /api/v1/business/campaigns
 */
export async function createCampaign(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  const validation = await validateRequest(request, createCampaignSchema);
  if (!validation.success) return validation.response;
  const body = validation.data;
  const id = generateId('campaign');
  try {
    await env.DB.prepare(
      `INSERT INTO marketing_campaigns
      (id, business_id, name, type, budget, spent, status, start_date, end_date, product_ids, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, 'active', ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
      .bind(
        id,
        auth.userId,
        body.name,
        body.type,
        body.budget,
        body.start_date || null,
        body.end_date || null,
        JSON.stringify(body.product_ids || []),
        JSON.stringify(body.metadata || {})
      )
      .run();
    const row = await env.DB.prepare(`SELECT * FROM marketing_campaigns WHERE id = ?`)
      .bind(id)
      .first();
    return json(
      {
        ...row,
        product_ids: safeParse((row as { product_ids?: string })?.product_ids, []),
        metadata: safeParse((row as { metadata?: string })?.metadata, {}),
      },
      201
    );
  } catch (err) {
    console.error('[createCampaign] Error:', err);
    return error('DATABASE_ERROR', 'Failed to create campaign', 500);
  }
}

/**
 * PATCH /api/v1/business/campaigns/:id
 */
export async function updateCampaign(
  request: Request,
  env: Env,
  campaignId: string
): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  const validation = await validateRequest(request, updateCampaignSchema);
  if (!validation.success) return validation.response;
  const body = validation.data;
  try {
    const existing = await env.DB.prepare(
      `SELECT * FROM marketing_campaigns WHERE id = ? AND business_id = ?`
    )
      .bind(campaignId, auth.userId)
      .first<{
        id: string;
        name: string;
        type: string;
        budget: number;
        status: string;
        start_date: string | null;
        end_date: string | null;
        product_ids: string;
        metadata: string;
      }>();
    if (!existing) return error('NOT_FOUND', 'Campaign not found', 404);

    await env.DB.prepare(
      `UPDATE marketing_campaigns SET
        name = ?, type = ?, budget = ?, status = ?,
        start_date = ?, end_date = ?, product_ids = ?, metadata = ?,
        updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(
        body.name ?? existing.name,
        body.type ?? existing.type,
        body.budget ?? existing.budget,
        body.status ?? existing.status,
        body.start_date !== undefined ? body.start_date : existing.start_date,
        body.end_date !== undefined ? body.end_date : existing.end_date,
        JSON.stringify(body.product_ids ?? safeParse(existing.product_ids, [])),
        JSON.stringify(body.metadata ?? safeParse(existing.metadata, {})),
        campaignId
      )
      .run();

    const row = await env.DB.prepare(`SELECT * FROM marketing_campaigns WHERE id = ?`)
      .bind(campaignId)
      .first();
    return json({
      ...row,
      product_ids: safeParse((row as { product_ids?: string })?.product_ids, []),
      metadata: safeParse((row as { metadata?: string })?.metadata, {}),
    });
  } catch (err) {
    console.error('[updateCampaign] Error:', err);
    return error('DATABASE_ERROR', 'Failed to update campaign', 500);
  }
}

/**
 * GET /api/v1/business/customers
 */
export async function getCustomers(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;

  try {
    const rows = await env.DB.prepare(
      `SELECT
        o.user_id,
        u.email,
        u.metadata,
        COUNT(DISTINCT o.id) AS order_count,
        COALESCE(SUM(oi.quantity * oi.price), 0) AS total_spent,
        MAX(o.created_at) AS last_order_at
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON p.id = oi.product_id
      JOIN users u ON u.id = o.user_id
      WHERE p.user_id = ?
      GROUP BY o.user_id, u.email, u.metadata
      ORDER BY last_order_at DESC`
    )
      .bind(auth.userId)
      .all<{
        user_id: string;
        email: string;
        metadata: string;
        order_count: number;
        total_spent: number;
        last_order_at: string;
      }>();

    return json({
      customers: (rows.results || []).map((row) => {
        const meta = safeParse<{ username?: string; avatar?: string }>(row.metadata, {});
        return {
          user_id: row.user_id,
          email: row.email,
          username: meta.username || row.email.split('@')[0] || 'Customer',
          avatar: meta.avatar || null,
          order_count: Number(row.order_count || 0),
          total_spent: Number(row.total_spent || 0),
          last_order_at: row.last_order_at,
        };
      }),
    });
  } catch (err) {
    console.error('[getCustomers] Error:', err);
    return error('DATABASE_ERROR', 'Failed to fetch customers', 500);
  }
}

/**
 * PATCH /api/v1/business/orders/:id/fulfillment
 */
export async function updateOrderFulfillment(
  request: Request,
  env: Env,
  orderId: string
): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;

  const validation = await validateRequest(request, updateOrderFulfillmentSchema);
  if (!validation.success) return validation.response;

  try {
    const order = await businessOwnsOrder(env, auth.userId, orderId);
    if (!order) return error('NOT_FOUND', 'Order not found', 404);

    const metadata = {
      ...safeParse<Record<string, unknown>>(order.metadata, {}),
      ...(validation.data.tracking_number !== undefined
        ? { tracking_number: validation.data.tracking_number }
        : {}),
      ...(validation.data.carrier !== undefined ? { carrier: validation.data.carrier } : {}),
      ...(validation.data.label_url !== undefined ? { label_url: validation.data.label_url } : {}),
    };

    await env.DB.prepare(
      `UPDATE orders SET metadata = ?, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(JSON.stringify(metadata), orderId)
      .run();

    return json({ ok: true, metadata });
  } catch (err) {
    console.error('[updateOrderFulfillment] Error:', err);
    return error('DATABASE_ERROR', 'Failed to update fulfillment', 500);
  }
}

/**
 * GET /api/v1/business/export/orders?period=
 */
export async function exportOrdersCsv(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const period = (url.searchParams.get('period') as Period) || 'month';
  const bounds = getPeriodBounds(period);

  try {
    const rows = await env.DB.prepare(
      `SELECT DISTINCT
        o.id,
        o.user_id,
        o.status,
        o.total,
        o.payment_status,
        o.source,
        o.created_at,
        u.email,
        u.metadata AS buyer_metadata
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON p.id = oi.product_id
      JOIN users u ON u.id = o.user_id
      WHERE p.user_id = ? AND o.created_at >= ? AND o.created_at < ?
      ORDER BY o.created_at DESC`
    )
      .bind(auth.userId, bounds.start, bounds.end)
      .all<{
        id: string;
        user_id: string;
        status: string;
        total: number;
        payment_status: string;
        source: string;
        created_at: string;
        email: string;
        buyer_metadata: string;
      }>();

    const header = [
      'order_id',
      'buyer_id',
      'buyer_email',
      'buyer_name',
      'status',
      'total',
      'payment_status',
      'source',
      'created_at',
    ].join(',');

    const lines = (rows.results || []).map((row) => {
      const meta = safeParse<{ username?: string }>(row.buyer_metadata, {});
      return [
        csvEscape(row.id),
        csvEscape(row.user_id),
        csvEscape(row.email),
        csvEscape(meta.username || ''),
        csvEscape(row.status),
        csvEscape(row.total),
        csvEscape(row.payment_status),
        csvEscape(row.source),
        csvEscape(row.created_at),
      ].join(',');
    });

    return csvResponse([header, ...lines].join('\n'), `orders-${period}.csv`);
  } catch (err) {
    console.error('[exportOrdersCsv] Error:', err);
    return error('DATABASE_ERROR', 'Failed to export orders', 500);
  }
}

/**
 * GET /api/v1/business/export/products
 */
export async function exportProductsCsv(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;

  try {
    const rows = await env.DB.prepare(
      `SELECT id, name, category, subcategory, price, stock, created_at, updated_at
       FROM products
       WHERE user_id = ?
       ORDER BY created_at DESC`
    )
      .bind(auth.userId)
      .all<{
        id: string;
        name: string;
        category: string;
        subcategory: string | null;
        price: number;
        stock: number;
        created_at: string;
        updated_at: string;
      }>();

    const header = [
      'product_id',
      'name',
      'category',
      'subcategory',
      'price',
      'stock',
      'created_at',
      'updated_at',
    ].join(',');

    const lines = (rows.results || []).map((row) =>
      [
        csvEscape(row.id),
        csvEscape(row.name),
        csvEscape(row.category),
        csvEscape(row.subcategory),
        csvEscape(row.price),
        csvEscape(row.stock),
        csvEscape(row.created_at),
        csvEscape(row.updated_at),
      ].join(',')
    );

    return csvResponse([header, ...lines].join('\n'), 'products.csv');
  } catch (err) {
    console.error('[exportProductsCsv] Error:', err);
    return error('DATABASE_ERROR', 'Failed to export products', 500);
  }
}

/**
 * GET /api/v1/business/export/sales?from=YYYY-MM-DD&to=YYYY-MM-DD&category=
 */
export async function exportSalesCsv(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const from = (url.searchParams.get('from') || '').trim();
  const to = (url.searchParams.get('to') || '').trim();
  const category = (url.searchParams.get('category') || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return error('VALIDATION_ERROR', 'from and to must be YYYY-MM-DD', 400);
  }

  const start = `${from} 00:00:00`;
  const endExclusive = `${to} 23:59:59`;

  try {
    const bindings: unknown[] = [auth.userId, start, endExclusive];
    let categoryClause = '';
    if (category) {
      categoryClause = ' AND p.category = ?';
      bindings.push(category);
    }

    const rows = await env.DB.prepare(
      `SELECT
        date(o.created_at) AS sale_date,
        o.id AS order_id,
        p.id AS product_id,
        p.name AS product_name,
        p.category,
        oi.quantity,
        oi.price,
        (oi.quantity * oi.price) AS line_revenue,
        COALESCE(o.refund_amount, 0) AS order_refunds,
        o.status
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      WHERE p.user_id = ?
        AND o.created_at >= ?
        AND o.created_at <= ?
        ${categoryClause}
      ORDER BY o.created_at DESC, o.id, p.name`
    )
      .bind(...bindings)
      .all<{
        sale_date: string;
        order_id: string;
        product_id: string;
        product_name: string;
        category: string;
        quantity: number;
        price: number;
        line_revenue: number;
        order_refunds: number;
        status: string;
      }>();

    const header = [
      'date',
      'order_id',
      'product_id',
      'product_name',
      'category',
      'qty',
      'unit_price',
      'revenue',
      'order_refunds',
      'status',
    ].join(',');

    const lines = (rows.results || []).map((row) =>
      [
        csvEscape(row.sale_date),
        csvEscape(row.order_id),
        csvEscape(row.product_id),
        csvEscape(row.product_name),
        csvEscape(row.category),
        csvEscape(row.quantity),
        csvEscape(row.price),
        csvEscape(row.line_revenue),
        csvEscape(row.order_refunds),
        csvEscape(row.status),
      ].join(',')
    );

    return csvResponse([header, ...lines].join('\n'), `sales-${from}-${to}.csv`);
  } catch (err) {
    console.error('[exportSalesCsv] Error:', err);
    return error('DATABASE_ERROR', 'Failed to export sales', 500);
  }
}

/**
 * GET /api/v1/business/notifications
 */
export async function listNotifications(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;

  const limit = Math.min(parseInt(new URL(request.url).searchParams.get('limit') || '50', 10), 200);

  try {
    const rows = await env.DB.prepare(
      `SELECT * FROM business_notifications
       WHERE business_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
      .bind(auth.userId, limit)
      .all<{
        id: string;
        business_id: string;
        type: string;
        title: string;
        body: string | null;
        ref_type: string | null;
        ref_id: string | null;
        read_at: string | null;
        created_at: string;
      }>();

    return json({
      notifications: (rows.results || []).map((n) => ({
        ...n,
        read: !!n.read_at,
      })),
    });
  } catch (err) {
    console.error('[listNotifications] Error:', err);
    return error('DATABASE_ERROR', 'Failed to list notifications', 500);
  }
}

/**
 * PATCH /api/v1/business/notifications/:id/read
 */
export async function markNotificationRead(
  request: Request,
  env: Env,
  notificationId: string
): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;

  try {
    const existing = await env.DB.prepare(
      `SELECT id FROM business_notifications WHERE id = ? AND business_id = ?`
    )
      .bind(notificationId, auth.userId)
      .first<{ id: string }>();
    if (!existing) return error('NOT_FOUND', 'Notification not found', 404);

    const readAt = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE business_notifications SET read_at = ? WHERE id = ?`
    )
      .bind(readAt, notificationId)
      .run();

    return json({ ok: true, read_at: readAt });
  } catch (err) {
    console.error('[markNotificationRead] Error:', err);
    return error('DATABASE_ERROR', 'Failed to mark notification read', 500);
  }
}

/**
 * GET /api/v1/business/promo-codes
 */
export async function listPromoCodes(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;

  try {
    const rows = await env.DB.prepare(
      `SELECT * FROM promo_codes WHERE business_id = ? ORDER BY created_at DESC`
    )
      .bind(auth.userId)
      .all<{
        id: string;
        business_id: string;
        code: string;
        type: 'percent' | 'fixed';
        value: number;
        max_uses: number | null;
        uses: number;
        active: number;
        starts_at: string | null;
        ends_at: string | null;
        metadata: string;
        created_at: string;
        updated_at: string;
      }>();

    return json({
      promo_codes: (rows.results || []).map((row) => ({
        ...row,
        active: !!row.active,
        metadata: safeParse(row.metadata, {}),
      })),
    });
  } catch (err) {
    console.error('[listPromoCodes] Error:', err);
    return error('DATABASE_ERROR', 'Failed to list promo codes', 500);
  }
}

/**
 * POST /api/v1/business/promo-codes
 */
export async function createPromoCode(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;

  const validation = await validateRequest(request, createPromoCodeSchema);
  if (!validation.success) return validation.response;

  const body = validation.data;
  const code = body.code.trim().toUpperCase();
  const id = generateId('promo');

  try {
    await env.DB.prepare(
      `INSERT INTO promo_codes
      (id, business_id, code, type, value, max_uses, uses, active, starts_at, ends_at, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, datetime('now'), datetime('now'))`
    )
      .bind(
        id,
        auth.userId,
        code,
        body.type,
        body.value,
        body.max_uses ?? null,
        body.starts_at ?? null,
        body.ends_at ?? null,
        JSON.stringify(body.metadata || {})
      )
      .run();

    const row = await env.DB.prepare(`SELECT * FROM promo_codes WHERE id = ?`)
      .bind(id)
      .first<{
        id: string;
        business_id: string;
        code: string;
        type: 'percent' | 'fixed';
        value: number;
        max_uses: number | null;
        uses: number;
        active: number;
        starts_at: string | null;
        ends_at: string | null;
        metadata: string;
        created_at: string;
        updated_at: string;
      }>();

    return json(
      {
        ...row,
        active: !!row?.active,
        metadata: safeParse(row?.metadata, {}),
      },
      201
    );
  } catch (err) {
    console.error('[createPromoCode] Error:', err);
    return error('DATABASE_ERROR', 'Failed to create promo code', 500);
  }
}

/**
 * PATCH /api/v1/business/promo-codes/:id
 */
export async function updatePromoCode(
  request: Request,
  env: Env,
  promoId: string
): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;

  const validation = await validateRequest(request, updatePromoCodeSchema);
  if (!validation.success) return validation.response;

  const body = validation.data;

  try {
    const existing = await env.DB.prepare(
      `SELECT * FROM promo_codes WHERE id = ? AND business_id = ?`
    )
      .bind(promoId, auth.userId)
      .first<{
        id: string;
        max_uses: number | null;
        starts_at: string | null;
        ends_at: string | null;
        active: number;
        metadata: string;
      }>();
    if (!existing) return error('NOT_FOUND', 'Promo code not found', 404);

    await env.DB.prepare(
      `UPDATE promo_codes SET
        active = ?,
        max_uses = ?,
        starts_at = ?,
        ends_at = ?,
        metadata = ?,
        updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(
        body.active !== undefined ? (body.active ? 1 : 0) : existing.active,
        body.max_uses !== undefined ? body.max_uses : existing.max_uses,
        body.starts_at !== undefined ? body.starts_at : existing.starts_at,
        body.ends_at !== undefined ? body.ends_at : existing.ends_at,
        JSON.stringify(body.metadata ?? safeParse(existing.metadata, {})),
        promoId
      )
      .run();

    const row = await env.DB.prepare(`SELECT * FROM promo_codes WHERE id = ?`)
      .bind(promoId)
      .first<{
        id: string;
        business_id: string;
        code: string;
        type: 'percent' | 'fixed';
        value: number;
        max_uses: number | null;
        uses: number;
        active: number;
        starts_at: string | null;
        ends_at: string | null;
        metadata: string;
        created_at: string;
        updated_at: string;
      }>();

    return json({
      ...row,
      active: !!row?.active,
      metadata: safeParse(row?.metadata, {}),
    });
  } catch (err) {
    console.error('[updatePromoCode] Error:', err);
    return error('DATABASE_ERROR', 'Failed to update promo code', 500);
  }
}

/**
 * POST /api/v1/business/orders/:id/refund-request
 */
export async function requestOrderRefund(
  request: Request,
  env: Env,
  orderId: string
): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;

  const validation = await validateRequest(request, refundRequestSchema);
  if (!validation.success) return validation.response;

  const { reason, amount } = validation.data;

  try {
    const order = await businessOwnsOrder(env, auth.userId, orderId);
    if (!order) return error('NOT_FOUND', 'Order not found', 404);

    const now = new Date().toISOString();
    const metadata = {
      ...safeParse<Record<string, unknown>>(order.metadata, {}),
      refund_requested_at: now,
      refund_request_reason: reason,
      refund_request_amount: amount ?? order.total,
    };

    await env.DB.prepare(
      `UPDATE orders SET metadata = ?, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(JSON.stringify(metadata), orderId)
      .run();

    return json({ ok: true, metadata });
  } catch (err) {
    console.error('[requestOrderRefund] Error:', err);
    return error('DATABASE_ERROR', 'Failed to submit refund request', 500);
  }
}
