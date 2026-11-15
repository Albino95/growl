import { z } from 'zod';
import type { Env, Product } from '../../types';
import { json, error } from '../../utils/response';
import { getRequestContext } from '../../utils/auth';
import { generateId } from '../../utils/id';
import { validateRequest } from '../../utils/validation';
import { dmPolicyAllows } from '../../utils/dmPolicy';
import { areFriends, isBlocked } from '../friends';
import { canMessagePeer } from '../messages';
import { notArchivedSql } from '../business';

/**
 * Wave 4 business module (bizx). Paths (all business-only):
 *
 *   GET   {api}/business/onboarding                 → setup checklist progress
 *   POST  {api}/business/products/:id/duplicate     → copy a product (stock 0)
 *   PATCH {api}/business/products/bulk              → bulk price / stock edit (≤ 50)
 *   GET   {api}/business/orders/:id/contact         → can the seller DM this order's buyer?
 */
export async function handle(
  request: Request,
  env: Env,
  path: string,
  apiPrefix: string,
): Promise<Response | null> {
  if (!path.startsWith(`${apiPrefix}/business/`)) return null;
  const rest = path.slice(`${apiPrefix}/business`.length);

  if (request.method === 'GET' && rest === '/onboarding') return getOnboarding(request, env);
  if (request.method === 'PATCH' && rest === '/products/bulk') return bulkUpdateProducts(request, env);

  const dup = rest.match(/^\/products\/([^/]+)\/duplicate$/);
  if (dup && request.method === 'POST') return duplicateProduct(request, env, decodeURIComponent(dup[1]));

  const contact = rest.match(/^\/orders\/([^/]+)\/contact$/);
  if (contact && request.method === 'GET') return getOrderContact(request, env, decodeURIComponent(contact[1]));

  return null;
}

type BizCtx = { userId: string; user: { is_business?: boolean | number } | null | undefined };

async function requireBusiness(request: Request, env: Env): Promise<BizCtx | Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }
  if (!ctx.user?.is_business) {
    return error('FORBIDDEN', 'Only businesses can access this endpoint', 403);
  }
  return { userId: ctx.userId, user: ctx.user };
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Onboarding checklist

export const ONBOARDING_STEPS = [
  'profile',
  'logo',
  'first_product',
  'product_photos',
  'shipping_note',
  'first_post',
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export function buildOnboarding(facts: {
  businessName: string | null;
  logoUrl: string | null;
  productCount: number;
  productsWithoutImage: number;
  shippingNote: string;
  postCount: number;
}) {
  const done: Record<OnboardingStep, boolean> = {
    profile: Boolean(facts.businessName?.trim()),
    logo: Boolean(facts.logoUrl?.trim()),
    first_product: facts.productCount > 0,
    product_photos: facts.productCount > 0 && facts.productsWithoutImage === 0,
    shipping_note: Boolean(facts.shippingNote.trim()),
    first_post: facts.postCount > 0,
  };
  const steps = ONBOARDING_STEPS.map((key) => ({ key, done: done[key] }));
  const doneCount = steps.filter((s) => s.done).length;
  return { steps, done: doneCount, total: steps.length, complete: doneCount === steps.length };
}

async function getOnboarding(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  try {
    const [settings, products, posts] = await Promise.all([
      env.DB.prepare(
        'SELECT business_name, logo_url, analytics_prefs FROM business_settings WHERE business_id = ?'
      )
        .bind(auth.userId)
        .first<{ business_name: string | null; logo_url: string | null; analytics_prefs: string | null }>(),
      env.DB.prepare(
        `SELECT COUNT(*) AS n,
           COALESCE(SUM(CASE WHEN image_url IS NULL OR TRIM(image_url) = '' THEN 1 ELSE 0 END), 0) AS no_image
         FROM products WHERE user_id = ? AND ${notArchivedSql()}`
      )
        .bind(auth.userId)
        .first<{ n: number; no_image: number }>(),
      env.DB.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?')
        .bind(auth.userId)
        .first<{ n: number }>(),
    ]);
    const prefs = parseJson<Record<string, unknown>>(settings?.analytics_prefs, {});
    return json(
      buildOnboarding({
        businessName: settings?.business_name ?? null,
        logoUrl: settings?.logo_url ?? null,
        productCount: Number(products?.n || 0),
        productsWithoutImage: Number(products?.no_image || 0),
        shippingNote: String(prefs.default_shipping_note ?? ''),
        postCount: Number(posts?.n || 0),
      })
    );
  } catch (err) {
    console.error('[bizx.getOnboarding] Error:', err);
    return error('DATABASE_ERROR', 'Failed to load setup progress', 500);
  }
}

// ---------------------------------------------------------------------------
// Duplicate product

/** "Mat" → "Mat (copy)", "Mat (copy)" → "Mat (copy 2)", "Mat (copy 2)" → "Mat (copy 3)". */
export function copyName(name: string): string {
  const trimmed = name.trim();
  const m = trimmed.match(/^(.*) \(copy(?: (\d+))?\)$/);
  if (!m) return `${trimmed} (copy)`.slice(0, 200);
  const n = m[2] ? Number(m[2]) + 1 : 2;
  return `${m[1]} (copy ${n})`.slice(0, 200);
}

async function duplicateProduct(request: Request, env: Env, productId: string): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  try {
    const src = await env.DB.prepare(
      `SELECT * FROM products WHERE id = ? AND user_id = ? AND ${notArchivedSql()}`
    )
      .bind(productId, auth.userId)
      .first<Product>();
    if (!src) return error('PRODUCT_NOT_FOUND', 'Product not found', 404);

    const id = generateId('product');
    const name = copyName(src.name);
    // Stock starts at 0 so a copy never oversells; the seller sets it before it can be bought.
    await env.DB.prepare(
      `INSERT INTO products (id, user_id, name, description, category, subcategory, price, stock,
         image_url, images, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, datetime('now'), datetime('now'))`
    )
      .bind(
        id,
        auth.userId,
        name,
        src.description ?? null,
        src.category,
        src.subcategory ?? null,
        src.price,
        src.image_url ?? null,
        src.images || '[]',
        src.metadata || '{}'
      )
      .run();
    const created = await env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first<Product>();
    if (!created) return error('DATABASE_ERROR', 'Failed to duplicate product', 500);
    return json(
      {
        ...created,
        units_sold: 0,
        images: parseJson(created.images, []),
        metadata: parseJson(created.metadata, {}),
      },
      201
    );
  } catch (err) {
    console.error('[bizx.duplicateProduct] Error:', err);
    return error('DATABASE_ERROR', 'Failed to duplicate product', 500);
  }
}

// ---------------------------------------------------------------------------
// Bulk price / stock

export const BULK_MAX = 50;

const bulkSchema = z.object({
  items: z
    .array(
      z
        .object({
          id: z.string().min(1).max(100),
          price: z.number().positive('Price must be above 0').max(1_000_000).optional(),
          stock: z.number().int().min(0, 'Stock cannot be negative').max(1_000_000).optional(),
        })
        .refine((v) => v.price !== undefined || v.stock !== undefined, {
          message: 'Each item needs a price or a stock value',
        })
    )
    .min(1)
    .max(BULK_MAX, `At most ${BULK_MAX} products at once`),
});

async function bulkUpdateProducts(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  const validation = await validateRequest(request, bulkSchema);
  if (!validation.success) return validation.response;

  // Last write wins for a repeated id.
  const byId = new Map<string, { price?: number; stock?: number }>();
  for (const it of validation.data.items) {
    const prev = byId.get(it.id);
    byId.set(it.id, { price: it.price ?? prev?.price, stock: it.stock ?? prev?.stock });
  }
  const ids = [...byId.keys()];

  try {
    const owned = await env.DB.prepare(
      `SELECT id FROM products
       WHERE user_id = ? AND ${notArchivedSql()} AND id IN (${ids.map(() => '?').join(',')})`
    )
      .bind(auth.userId, ...ids)
      .all<{ id: string }>();
    const ownedIds = new Set((owned.results || []).map((r) => r.id));
    const missing = ids.filter((id) => !ownedIds.has(id));
    if (missing.length > 0) {
      return error('PRODUCT_NOT_FOUND', 'Some products were not found in your catalog', 404, {
        missing,
      });
    }

    for (const id of ids) {
      const u = byId.get(id)!;
      const sets: string[] = [];
      const vals: unknown[] = [];
      if (u.price !== undefined) {
        sets.push('price = ?');
        vals.push(Math.round(u.price * 100) / 100);
      }
      if (u.stock !== undefined) {
        sets.push('stock = ?');
        vals.push(u.stock);
      }
      await env.DB.prepare(
        `UPDATE products SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
      )
        .bind(...vals, id, auth.userId)
        .run();
    }

    const rows = await env.DB.prepare(
      `SELECT id, price, stock FROM products WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`
    )
      .bind(auth.userId, ...ids)
      .all<{ id: string; price: number; stock: number }>();
    return json({ updated: ids.length, products: rows.results || [] });
  } catch (err) {
    console.error('[bizx.bulkUpdateProducts] Error:', err);
    return error('DATABASE_ERROR', 'Failed to update products', 500);
  }
}

// ---------------------------------------------------------------------------
// Customer contact eligibility

export type ContactReason = 'ok' | 'blocked' | 'not_accepting' | 'unavailable';

async function getOrderContact(request: Request, env: Env, orderId: string): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  try {
    const order = await env.DB.prepare(
      `SELECT o.id, o.user_id, u.metadata AS buyer_metadata
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       LEFT JOIN users u ON u.id = o.user_id
       WHERE o.id = ? AND p.user_id = ?
       LIMIT 1`
    )
      .bind(orderId, auth.userId)
      .first<{ id: string; user_id: string; buyer_metadata: string | null }>();
    if (!order) return error('NOT_FOUND', 'Order not found', 404);

    const buyerId = order.user_id;
    const meta = parseJson<{ username?: string; avatar?: string }>(order.buyer_metadata, {});
    const customer = { id: buyerId, username: meta.username || null };

    let reason: ContactReason = 'ok';
    if (!order.buyer_metadata || buyerId === auth.userId) {
      reason = 'unavailable';
    } else if (await isBlocked(env, auth.userId, buyerId)) {
      reason = 'blocked';
    } else if (!(await canMessagePeer(env, auth.userId, buyerId, auth.user))) {
      reason = 'unavailable';
    } else if (!(await dmPolicyAllows(env, buyerId, () => areFriends(env, auth.userId, buyerId)))) {
      reason = 'not_accepting';
    }
    return json({ can_message: reason === 'ok', reason, customer });
  } catch (err) {
    console.error('[bizx.getOrderContact] Error:', err);
    return error('DATABASE_ERROR', 'Failed to check messaging', 500);
  }
}
