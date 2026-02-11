import { Env, Product, Order } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { generateId } from '../utils/id';

/**
 * GET /api/v1/business/dashboard
 * Get business dashboard KPIs
 */
export async function getDashboard(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  if (!ctx.user?.is_business) {
    return error('FORBIDDEN', 'Only businesses can access this endpoint', 403);
  }

  try {
    // Get total products
    const productsResult = await env.DB.prepare(
      'SELECT COUNT(*) as count, SUM(stock) as total_stock FROM products WHERE user_id = ?'
    )
      .bind(ctx.userId)
      .first<{ count: number; total_stock: number }>();

    // Get total orders
    const ordersResult = await env.DB.prepare(
      `SELECT 
        COUNT(*) as total_orders,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
        SUM(total) as total_revenue
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      WHERE p.user_id = ?`
    )
      .bind(ctx.userId)
      .first<{
        total_orders: number;
        pending_orders: number;
        completed_orders: number;
        total_revenue: number;
      }>();

    // Get recent orders
    const recentOrders = await env.DB.prepare(
      `SELECT o.*
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       JOIN products p ON oi.product_id = p.id
       WHERE p.user_id = ?
       ORDER BY o.created_at DESC
       LIMIT 10`
    )
      .bind(ctx.userId)
      .all<Order>();

    return json({
      kpis: {
        total_products: productsResult?.count || 0,
        total_stock: productsResult?.total_stock || 0,
        total_orders: ordersResult?.total_orders || 0,
        pending_orders: ordersResult?.pending_orders || 0,
        completed_orders: ordersResult?.completed_orders || 0,
        total_revenue: ordersResult?.total_revenue || 0,
      },
      recent_orders: recentOrders.results.map((order) => ({
        ...order,
        shipping_address: JSON.parse(order.shipping_address || '{}'),
        metadata: JSON.parse(order.metadata || '{}'),
      })),
    });
  } catch (err) {
    console.error('[getDashboard] Error:', err);
    return error('DATABASE_ERROR', 'Failed to fetch dashboard data', 500);
  }
}

/**
 * GET /api/v1/business/products
 * Get business products (inventory)
 */
export async function getBusinessProducts(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  if (!ctx.user?.is_business) {
    return error('FORBIDDEN', 'Only businesses can access this endpoint', 403);
  }

  try {
    const products = await env.DB.prepare(
      'SELECT * FROM products WHERE user_id = ? ORDER BY created_at DESC'
    )
      .bind(ctx.userId)
      .all<Product>();

    const formattedProducts = products.results.map((product) => ({
      ...product,
      images: JSON.parse(product.images || '[]'),
      metadata: JSON.parse(product.metadata || '{}'),
    }));

    return json(formattedProducts);
  } catch (err) {
    console.error('[getBusinessProducts] Error:', err);
    return error('DATABASE_ERROR', 'Failed to fetch products', 500);
  }
}

/**
 * GET /api/v1/business/orders
 * Get business orders
 */
export async function getBusinessOrders(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  if (!ctx.user?.is_business) {
    return error('FORBIDDEN', 'Only businesses can access this endpoint', 403);
  }

  try {
    const orders = await env.DB.prepare(
      `SELECT DISTINCT o.*
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       JOIN products p ON oi.product_id = p.id
       WHERE p.user_id = ?
       ORDER BY o.created_at DESC
       LIMIT 100`
    )
      .bind(ctx.userId)
      .all<Order>();

    const formattedOrders = orders.results.map((order) => ({
      ...order,
      shipping_address: JSON.parse(order.shipping_address || '{}'),
      metadata: JSON.parse(order.metadata || '{}'),
    }));

    return json(formattedOrders);
  } catch (err) {
    console.error('[getBusinessOrders] Error:', err);
    return error('DATABASE_ERROR', 'Failed to fetch orders', 500);
  }
}

/**
 * GET /api/v1/business/partnerships
 * Get business partnerships with instructors
 */
export async function getPartnerships(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  if (!ctx.user?.is_business) {
    return error('FORBIDDEN', 'Only businesses can access this endpoint', 403);
  }

  // Note: This would require a partnerships table if not already in schema
  // For now, return empty array
  return json({ partnerships: [] });
}
