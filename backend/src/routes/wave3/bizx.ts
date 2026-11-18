import { z } from 'zod';
import type { Env, Product } from '../../types';
import { json, error } from '../../utils/response';
import { getRequestContext } from '../../utils/auth';
import { generateId } from '../../utils/id';
import { validateRequest } from '../../utils/validation';
import { messagingAccess } from '../messages';
import { notArchivedSql } from '../business';
import { withIdempotency } from '../../utils/idempotency';
import { GROWTH_PATHS } from '../../utils/categories';

/**
 * Wave 4 business module (bizx). Paths (all business-only):
 *
 *   GET   {api}/business/onboarding                 → setup checklist progress
 *   POST  {api}/business/products/:id/duplicate     → copy a product (stock 0)
 *   PATCH {api}/business/products/bulk              → bulk price / stock / category / status edit (≤ 50, all-or-nothing)
 *   POST  {api}/business/products/import            → CSV rows import, dry run then commit (≤ 500, all-or-nothing)
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
  if (request.method === 'POST' && rest === '/products/import') {
    return withIdempotency(request, env, () => importProducts(request, env));
  }

  const dup = rest.match(/^\/products\/([^/]+)\/duplicate$/);
  if (dup && request.method === 'POST') {
    return withIdempotency(request, env, () => duplicateProduct(request, env, decodeURIComponent(dup[1])));
  }

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
// Product status (seller visibility)
//
// Products have no status column. A seller "hides" a product with the existing soft-hide
// columns (is_hidden = 1, hidden_reason = 'seller_hidden'), which every buyer listing already
// filters out. Any other hidden_reason is a moderation hide the seller cannot undo here.

export const SELLER_HIDDEN_REASON = 'seller_hidden';
export type ProductStatus = 'active' | 'hidden';

type StatusRow = { id: string; is_hidden: number | null; hidden_reason: string | null };

/** 'moderated' = hidden by Grow! ops; the seller can't change its visibility. */
export function productStatusOf(row: { is_hidden?: number | null; hidden_reason?: string | null }):
  | ProductStatus
  | 'moderated' {
  if (!Number(row.is_hidden || 0)) return 'active';
  return row.hidden_reason === SELLER_HIDDEN_REASON ? 'hidden' : 'moderated';
}

function statusSetSql(status: ProductStatus): string {
  return status === 'hidden'
    ? `is_hidden = 1, hidden_at = COALESCE(hidden_at, datetime('now')), hidden_reason = '${SELLER_HIDDEN_REASON}'`
    : 'is_hidden = 0, hidden_at = NULL, hidden_reason = NULL';
}

/** Guard so a status write never touches a moderation hide (even if it raced the pre-check). */
const STATUS_GUARD_SQL = `(COALESCE(is_hidden, 0) = 0 OR hidden_reason = '${SELLER_HIDDEN_REASON}')`;

type Stmt = ReturnType<Env['DB']['prepare']>;

/** All-or-nothing: D1 batch runs the statements in one transaction. */
async function runAtomic(env: Env, stmts: Stmt[]): Promise<void> {
  if (stmts.length === 0) return;
  const db = env.DB as unknown as { batch?: (s: Stmt[]) => Promise<unknown> };
  if (typeof db.batch === 'function') {
    await db.batch(stmts);
    return;
  }
  for (const s of stmts) await s.run();
}

const categorySchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => (GROWTH_PATHS as readonly string[]).includes(v), { message: 'Unknown category' });

const subcategorySchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(60)
  .regex(/^[a-z0-9-]+$/, 'Subcategory must be a simple key like "yoga-mats"');

// ---------------------------------------------------------------------------
// Bulk price / stock / category / status

export const BULK_MAX = 50;

const bulkSchema = z.object({
  items: z
    .array(
      z
        .object({
          id: z.string().min(1).max(100),
          price: z.number().positive('Price must be above 0').max(1_000_000).optional(),
          stock: z.number().int().min(0, 'Stock cannot be negative').max(1_000_000).optional(),
          category: categorySchema.optional(),
          subcategory: subcategorySchema.nullable().optional(),
          status: z.enum(['active', 'hidden']).optional(),
        })
        .refine(
          (v) =>
            v.price !== undefined ||
            v.stock !== undefined ||
            v.category !== undefined ||
            v.subcategory !== undefined ||
            v.status !== undefined,
          { message: 'Each item needs a price, stock, category or status value' }
        )
    )
    .min(1)
    .max(BULK_MAX, `At most ${BULK_MAX} products at once`),
});

type BulkUpdate = {
  price?: number;
  stock?: number;
  category?: string;
  subcategory?: string | null;
  status?: ProductStatus;
};

async function bulkUpdateProducts(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  const validation = await validateRequest(request, bulkSchema);
  if (!validation.success) return validation.response;

  // Last write wins for a repeated id (per field).
  const byId = new Map<string, BulkUpdate>();
  for (const it of validation.data.items) {
    const prev = byId.get(it.id) || {};
    byId.set(it.id, {
      price: it.price ?? prev.price,
      stock: it.stock ?? prev.stock,
      category: it.category ?? prev.category,
      subcategory: it.subcategory !== undefined ? it.subcategory : prev.subcategory,
      status: it.status ?? prev.status,
    });
  }
  const ids = [...byId.keys()];

  try {
    const owned = await env.DB.prepare(
      `SELECT id, is_hidden, hidden_reason FROM products
       WHERE user_id = ? AND ${notArchivedSql()} AND id IN (${ids.map(() => '?').join(',')})`
    )
      .bind(auth.userId, ...ids)
      .all<StatusRow>();
    const ownedRows = new Map((owned.results || []).map((r) => [r.id, r]));
    const missing = ids.filter((id) => !ownedRows.has(id));
    if (missing.length > 0) {
      return error('PRODUCT_NOT_FOUND', 'Some products were not found in your catalog', 404, {
        missing,
      });
    }
    const underReview = ids.filter(
      (id) => byId.get(id)!.status !== undefined && productStatusOf(ownedRows.get(id)!) === 'moderated'
    );
    if (underReview.length > 0) {
      return error(
        'PRODUCT_UNDER_REVIEW',
        'Some products were hidden by Grow! review, so their visibility can’t be changed here',
        409,
        { ids: underReview }
      );
    }

    const stmts: Stmt[] = [];
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
      if (u.category !== undefined) {
        sets.push('category = ?');
        vals.push(u.category);
        // A new path makes the old subcategory meaningless unless one was sent.
        if (u.subcategory === undefined) sets.push('subcategory = NULL');
      }
      if (u.subcategory !== undefined) {
        sets.push('subcategory = ?');
        vals.push(u.subcategory);
      }
      if (u.status !== undefined) sets.push(statusSetSql(u.status));
      stmts.push(
        env.DB.prepare(
          `UPDATE products SET ${sets.join(', ')}, updated_at = datetime('now')
           WHERE id = ? AND user_id = ?${u.status !== undefined ? ` AND ${STATUS_GUARD_SQL}` : ''}`
        ).bind(...vals, id, auth.userId)
      );
    }
    await runAtomic(env, stmts);

    const rows = await env.DB.prepare(
      `SELECT id, price, stock, category, subcategory, is_hidden, hidden_reason
       FROM products WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`
    )
      .bind(auth.userId, ...ids)
      .all<{
        id: string;
        price: number;
        stock: number;
        category: string;
        subcategory: string | null;
        is_hidden: number | null;
        hidden_reason: string | null;
      }>();
    return json({
      updated: ids.length,
      products: (rows.results || []).map((r) => ({
        id: r.id,
        price: r.price,
        stock: r.stock,
        category: r.category,
        subcategory: r.subcategory,
        status: productStatusOf(r),
      })),
    });
  } catch (err) {
    console.error('[bizx.bulkUpdateProducts] Error:', err);
    return error('DATABASE_ERROR', 'Failed to update products', 500);
  }
}

// ---------------------------------------------------------------------------
// CSV import (rows parsed client-side). Dry run first, then commit.
//
// Match order per row: product_id (own, not archived) → sku (metadata.sku, or the app's
// derived "PRD-xxxxxx" label) → otherwise create. A commit with any row error writes nothing.

export const IMPORT_MAX = 500;

/** Blank cells (CSV) mean "not provided". */
const blank = (v: unknown) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '') ? undefined : v;

const optText = (max: number) =>
  z.preprocess((v) => {
    const b = blank(v);
    return b === undefined ? undefined : String(b).trim();
  }, z.string().max(max, `Must be at most ${max} characters`).optional());

/** Accepts 12.5, "12.50", "12,50", "€12.50". */
const optNumber = (inner: z.ZodNumber) =>
  z.preprocess((v) => {
    const b = blank(v);
    if (b === undefined) return undefined;
    if (typeof b === 'number') return b;
    const n = Number(String(b).replace(/[€\s]/g, '').replace(',', '.'));
    return n;
  }, inner.optional());

const importRowSchema = z.object({
  product_id: optText(100),
  sku: optText(64).refine((v) => v === undefined || /^[A-Za-z0-9._-]+$/.test(v), {
    message: 'SKU can only use letters, numbers, dots, dashes and underscores',
  }),
  name: optText(200),
  description: optText(2000),
  category: z.preprocess(blank, categorySchema.optional()),
  subcategory: z.preprocess(blank, subcategorySchema.optional()),
  price: optNumber(
    z.number({ invalid_type_error: 'Price must be a number' }).positive('Price must be above 0').max(1_000_000)
  ),
  stock: optNumber(
    z
      .number({ invalid_type_error: 'Stock must be a whole number' })
      .int('Stock must be a whole number')
      .min(0, 'Stock cannot be negative')
      .max(1_000_000)
  ),
  status: z.preprocess(
    (v) => {
      const b = blank(v);
      return b === undefined ? undefined : String(b).trim().toLowerCase();
    },
    z.enum(['active', 'hidden'], { errorMap: () => ({ message: 'Status must be active or hidden' }) }).optional()
  ),
  image_url: optText(2000).refine((v) => v === undefined || /^https:\/\/\S+$/i.test(v), {
    message: 'Image URL must start with https://',
  }),
});

type ImportRow = z.infer<typeof importRowSchema>;

const importSchema = z.object({
  rows: z
    .array(z.record(z.unknown()))
    .min(1, 'The file has no rows')
    .max(IMPORT_MAX, `At most ${IMPORT_MAX} rows per import`),
  dry_run: z.boolean().default(true),
});

export type ImportError = { row: number; field?: string; message: string };
export type ImportAction = 'create' | 'update' | 'unchanged' | 'error';

/** App's display SKU for products without one (InventoryScreen). */
export function derivedSku(productId: string): string {
  return `PRD-${productId.slice(-6).toUpperCase()}`;
}

type ExistingProduct = { id: string; sku: string | null; status: ProductStatus | 'moderated' };

type PlannedRow = {
  row: number;
  action: ImportAction;
  product_id?: string;
  name?: string;
  sku?: string;
  data?: ImportRow;
};

/** Pure planning step (exported for tests): validates rows and decides create / update. */
export function planImport(
  rawRows: Array<Record<string, unknown>>,
  existing: ExistingProduct[]
): { planned: PlannedRow[]; errors: ImportError[] } {
  const byId = new Map(existing.map((p) => [p.id, p]));
  const bySku = new Map<string, ExistingProduct>();
  for (const p of existing) {
    bySku.set(derivedSku(p.id).toLowerCase(), p);
  }
  // Explicit SKUs win over derived labels.
  for (const p of existing) if (p.sku) bySku.set(p.sku.toLowerCase(), p);

  const errors: ImportError[] = [];
  const planned: PlannedRow[] = [];
  const seenTargets = new Map<string, number>();

  rawRows.forEach((raw, i) => {
    const rowNo = i + 1;
    const parsed = importRowSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({ row: rowNo, field: String(issue.path[0] ?? ''), message: issue.message });
      }
      planned.push({ row: rowNo, action: 'error', name: typeof raw.name === 'string' ? raw.name : undefined });
      return;
    }
    const data = parsed.data;
    const rowErrors: ImportError[] = [];
    let target: ExistingProduct | undefined;
    if (data.product_id) {
      target = byId.get(data.product_id);
      if (!target) rowErrors.push({ row: rowNo, field: 'product_id', message: 'Product not found in your catalog' });
    } else if (data.sku) {
      target = bySku.get(data.sku.toLowerCase());
    }

    const targetKey = target ? `id:${target.id}` : data.sku ? `sku:${data.sku.toLowerCase()}` : null;
    if (targetKey) {
      const first = seenTargets.get(targetKey);
      if (first !== undefined) {
        rowErrors.push({ row: rowNo, field: data.sku ? 'sku' : 'product_id', message: `Same product as row ${first}` });
      } else {
        seenTargets.set(targetKey, rowNo);
      }
    }

    let action: ImportAction;
    if (target) {
      if (data.status !== undefined && target.status === 'moderated') {
        rowErrors.push({
          row: rowNo,
          field: 'status',
          message: 'Hidden by Grow! review — visibility can’t be changed here',
        });
      }
      const changes =
        data.name !== undefined ||
        data.description !== undefined ||
        data.category !== undefined ||
        data.subcategory !== undefined ||
        data.price !== undefined ||
        data.stock !== undefined ||
        data.status !== undefined ||
        data.image_url !== undefined ||
        (data.sku !== undefined && data.product_id !== undefined);
      action = changes ? 'update' : 'unchanged';
    } else if (data.product_id) {
      action = 'error'; // unknown product_id, already reported
    } else {
      if (!data.name) rowErrors.push({ row: rowNo, field: 'name', message: 'Name is required for a new product' });
      if (!data.category)
        rowErrors.push({ row: rowNo, field: 'category', message: 'Category is required for a new product' });
      if (data.price === undefined)
        rowErrors.push({ row: rowNo, field: 'price', message: 'Price is required for a new product' });
      action = 'create';
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      planned.push({ row: rowNo, action: 'error', name: data.name, sku: data.sku, product_id: target?.id });
      return;
    }
    planned.push({ row: rowNo, action, product_id: target?.id, name: data.name, sku: data.sku, data });
  });

  return { planned, errors };
}

async function importProducts(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  const validation = await validateRequest(request, importSchema);
  if (!validation.success) return validation.response;
  const { rows, dry_run } = validation.data;

  try {
    const existingRows = await env.DB.prepare(
      `SELECT id, json_extract(metadata, '$.sku') AS sku, is_hidden, hidden_reason
       FROM products WHERE user_id = ? AND ${notArchivedSql()}`
    )
      .bind(auth.userId)
      .all<{ id: string; sku: unknown; is_hidden: number | null; hidden_reason: string | null }>();
    const existing: ExistingProduct[] = (existingRows.results || []).map((r) => ({
      id: r.id,
      sku: typeof r.sku === 'string' && r.sku.trim() ? r.sku.trim() : null,
      status: productStatusOf(r),
    }));

    const { planned, errors } = planImport(rows, existing);
    const counts = {
      created: planned.filter((p) => p.action === 'create').length,
      updated: planned.filter((p) => p.action === 'update').length,
      unchanged: planned.filter((p) => p.action === 'unchanged').length,
    };

    const preview = planned.map(({ data: _data, ...p }) => p);
    if (dry_run) {
      return json({ dry_run: true, total: rows.length, ...counts, errors, rows: preview });
    }
    if (errors.length > 0) {
      return error('IMPORT_HAS_ERRORS', 'Fix the rows with errors before importing — nothing was saved', 422, {
        total: rows.length,
        ...counts,
        errors,
      });
    }

    const stmts: Stmt[] = [];
    for (const p of planned) {
      const d = p.data!;
      if (p.action === 'create') {
        const id = generateId('product');
        p.product_id = id;
        const meta = d.sku ? { sku: d.sku } : {};
        stmts.push(
          env.DB.prepare(
            `INSERT INTO products (id, user_id, name, description, category, subcategory, price, stock,
               image_url, images, metadata, is_hidden, hidden_at, hidden_reason, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
          ).bind(
            id,
            auth.userId,
            d.name!,
            d.description ?? null,
            d.category!,
            d.subcategory ?? null,
            Math.round(d.price! * 100) / 100,
            d.stock ?? 0,
            d.image_url ?? null,
            JSON.stringify(d.image_url ? [d.image_url] : []),
            JSON.stringify(meta),
            d.status === 'hidden' ? 1 : 0,
            d.status === 'hidden' ? new Date().toISOString().replace('T', ' ').slice(0, 19) : null,
            d.status === 'hidden' ? SELLER_HIDDEN_REASON : null
          )
        );
      } else if (p.action === 'update') {
        const sets: string[] = [];
        const vals: unknown[] = [];
        const add = (col: string, v: unknown) => {
          sets.push(`${col} = ?`);
          vals.push(v);
        };
        if (d.name !== undefined) add('name', d.name);
        if (d.description !== undefined) add('description', d.description);
        if (d.category !== undefined) add('category', d.category);
        if (d.subcategory !== undefined) add('subcategory', d.subcategory);
        if (d.price !== undefined) add('price', Math.round(d.price * 100) / 100);
        if (d.stock !== undefined) add('stock', d.stock);
        if (d.image_url !== undefined) add('image_url', d.image_url);
        if (d.sku !== undefined) {
          sets.push(`metadata = json_set(COALESCE(NULLIF(metadata, ''), '{}'), '$.sku', ?)`);
          vals.push(d.sku);
        }
        if (d.status !== undefined) sets.push(statusSetSql(d.status));
        stmts.push(
          env.DB.prepare(
            `UPDATE products SET ${sets.join(', ')}, updated_at = datetime('now')
             WHERE id = ? AND user_id = ?${d.status !== undefined ? ` AND ${STATUS_GUARD_SQL}` : ''}`
          ).bind(...vals, p.product_id!, auth.userId)
        );
      }
    }
    await runAtomic(env, stmts);

    return json({
      dry_run: false,
      total: rows.length,
      ...counts,
      errors: [],
      rows: planned.map(({ data: _data, ...p }) => p),
    });
  } catch (err) {
    console.error('[bizx.importProducts] Error:', err);
    return error('DATABASE_ERROR', 'Failed to import products', 500);
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

    const reason: ContactReason =
      !order.buyer_metadata || buyerId === auth.userId
        ? 'unavailable'
        : await messagingAccess(env, auth.userId, buyerId, auth.user);
    return json({ can_message: reason === 'ok', reason, customer });
  } catch (err) {
    console.error('[bizx.getOrderContact] Error:', err);
    return error('DATABASE_ERROR', 'Failed to check messaging', 500);
  }
}
