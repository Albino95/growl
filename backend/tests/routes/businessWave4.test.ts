/**
 * Wave 4 business: onboarding checklist, duplicate / bulk-edit products, buyer contact
 * eligibility (dm_policy), archive-instead-of-delete for ordered products, restock on
 * cancel, live "to fulfill" count, honest deltas, low-stock alerts and the in-app alerts
 * switch. Real in-memory SQLite built from every migration.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../../src/index';
import type { Env } from '../../src/types';
import { createSqliteD1, loadMigrationsSql, trackParams } from '../utils/sqliteD1';
import { signAccessToken } from '../../src/utils/jwt';
import { buildOnboarding, copyName, BULK_MAX } from '../../src/routes/wave3/bizx';
import {
  inAppAlertsEnabled,
  lowStockThresholdFrom,
  notifyLowStockCrossings,
} from '../../src/routes/business';
import { shouldRestockOnCancel } from '../../src/routes/marketplace';

const SCHEMA = loadMigrationsSql();

let db: ReturnType<typeof createSqliteD1>['raw'];
let env: Env;
let stats: { maxParams: number; maxSql: string };

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

function addUser(id: string, opts: { business?: boolean; dmPolicy?: string } = {}) {
  db.prepare(
    `INSERT INTO users (id, email, password_hash, metadata, email_verified, timezone, is_business, created_at, updated_at)
     VALUES (?, ?, 'x', ?, 1, 'UTC', ?, datetime('now'), datetime('now'))`
  ).run(id, `${id}@example.com`, JSON.stringify({ username: id }), opts.business ? 1 : 0);
  if (opts.dmPolicy) db.prepare('UPDATE users SET dm_policy = ? WHERE id = ?').run(opts.dmPolicy, id);
}

function addProduct(id: string, owner: string, opts: { stock?: number; price?: number; image?: string | null; name?: string } = {}) {
  db.prepare(
    `INSERT INTO products (id, user_id, name, category, price, stock, image_url, created_at, updated_at)
     VALUES (?, ?, ?, 'fitness', ?, ?, ?, datetime('now'), datetime('now'))`
  ).run(id, owner, opts.name ?? `Product ${id}`, opts.price ?? 10, opts.stock ?? 5, opts.image ?? null);
}

function addOrder(
  id: string,
  buyer: string,
  seller: string,
  productId: string,
  qty: number,
  opts: { status?: string; payment?: string; createdAt?: string } = {}
) {
  const at = opts.createdAt ?? '2026-11-14 10:00:00';
  db.prepare(
    `INSERT INTO orders (id, user_id, business_id, status, total, shipping_address, metadata, payment_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '{}', '{}', ?, ?, ?)`
  ).run(id, buyer, seller, opts.status ?? 'pending', qty * 10, opts.payment ?? 'paid', at, at);
  db.prepare(
    `INSERT INTO order_items (id, order_id, product_id, quantity, price, created_at)
     VALUES (?, ?, ?, ?, 10, ?)`
  ).run(`oi_${id}`, id, productId, qty, at);
}

async function call(userId: string | null, method: string, path: string, body?: unknown) {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (userId) h.Authorization = `Bearer ${await signAccessToken(userId, env)}`;
  const res = await worker.fetch(
    new Request(`https://api.test/api/v1${path}`, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
    ctx
  );
  const json = (await res.json()) as any;
  return { status: res.status, body: json, data: json.data };
}

function one<T = any>(sql: string, ...args: unknown[]): T {
  return db.prepare(sql).get(...args) as T;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
  const sqlite = createSqliteD1(SCHEMA);
  db = sqlite.raw;
  const tracked = trackParams(sqlite.d1);
  stats = tracked.stats;
  const kv = new Map<string, string>();
  env = {
    DB: tracked.d1 as any,
    KV: {
      get: async (k: string) => kv.get(k) ?? null,
      put: async (k: string, v: string) => void kv.set(k, v),
      delete: async (k: string) => void kv.delete(k),
    } as any,
    ENVIRONMENT: 'test',
    JWT_SECRET: 'wave4-biz-secret',
    API_VERSION: 'v1',
  } as Env;
  addUser('shop', { business: true });
  addUser('buyer');
});

afterEach(() => {
  expect(stats.maxParams, stats.maxSql).toBeLessThanOrEqual(100);
  vi.useRealTimers();
});

describe('pure helpers', () => {
  it('copyName numbers repeated copies', () => {
    expect(copyName('Mat')).toBe('Mat (copy)');
    expect(copyName('Mat (copy)')).toBe('Mat (copy 2)');
    expect(copyName('Mat (copy 2)')).toBe('Mat (copy 3)');
  });

  it('buildOnboarding needs a product before photos count as done', () => {
    const empty = buildOnboarding({
      businessName: null,
      logoUrl: null,
      productCount: 0,
      productsWithoutImage: 0,
      shippingNote: '',
      postCount: 0,
    });
    expect(empty.done).toBe(0);
    expect(empty.steps.find((s) => s.key === 'product_photos')?.done).toBe(false);
  });

  it('in-app alerts default on; explicit false turns them off', () => {
    expect(inAppAlertsEnabled(null)).toBe(true);
    expect(inAppAlertsEnabled('{"inAppAlerts":false}')).toBe(false);
    expect(inAppAlertsEnabled('not json')).toBe(true);
    expect(lowStockThresholdFrom('{"low_stock_threshold":0}')).toBe(10);
    expect(lowStockThresholdFrom('{"low_stock_threshold":3}')).toBe(3);
  });

  it('only paid orders restock on cancel', () => {
    expect(shouldRestockOnCancel('paid')).toBe(true);
    expect(shouldRestockOnCancel('unpaid')).toBe(false);
    expect(shouldRestockOnCancel(null)).toBe(false);
  });
});

describe('GET /business/onboarding', () => {
  it('is business-only', async () => {
    expect((await call('buyer', 'GET', '/business/onboarding')).status).toBe(403);
    expect((await call(null, 'GET', '/business/onboarding')).status).toBe(401);
  });

  it('tracks progress from real data', async () => {
    let res = await call('shop', 'GET', '/business/onboarding');
    expect(res.status).toBe(200);
    expect(res.data.done).toBe(0);
    expect(res.data.total).toBe(6);

    await call('shop', 'PUT', '/business/settings', {
      business_name: 'Shop',
      analytics_prefs: { default_shipping_note: 'Ships in 2 days' },
    });
    addProduct('p1', 'shop', { image: 'https://cdn.test/a.jpg' });
    res = await call('shop', 'GET', '/business/onboarding');
    const done = Object.fromEntries(res.data.steps.map((s: any) => [s.key, s.done]));
    expect(done).toMatchObject({
      profile: true,
      logo: false,
      first_product: true,
      product_photos: true,
      shipping_note: true,
      first_post: false,
    });
    addProduct('p2', 'shop', { image: null });
    res = await call('shop', 'GET', '/business/onboarding');
    expect(res.data.steps.find((s: any) => s.key === 'product_photos').done).toBe(false);
  });
});

describe('POST /business/products/:id/duplicate', () => {
  it('copies with stock 0 and a (copy) name, owner only', async () => {
    addProduct('p1', 'shop', { stock: 9, price: 12.5, name: 'Yoga mat' });
    const res = await call('shop', 'POST', '/business/products/p1/duplicate');
    expect(res.status).toBe(201);
    expect(res.data.name).toBe('Yoga mat (copy)');
    expect(res.data.stock).toBe(0);
    expect(res.data.price).toBe(12.5);
    expect(res.data.id).not.toBe('p1');

    addUser('other', { business: true });
    expect((await call('other', 'POST', '/business/products/p1/duplicate')).status).toBe(404);
  });
});

describe('PATCH /business/products/bulk', () => {
  it('updates price and stock for owned products', async () => {
    addProduct('p1', 'shop', { stock: 1, price: 10 });
    addProduct('p2', 'shop', { stock: 2, price: 20 });
    const res = await call('shop', 'PATCH', '/business/products/bulk', {
      items: [
        { id: 'p1', stock: 40 },
        { id: 'p2', price: 19.999 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.data.updated).toBe(2);
    expect(one('SELECT stock, price FROM products WHERE id = ?', 'p1')).toMatchObject({ stock: 40, price: 10 });
    expect(one('SELECT stock, price FROM products WHERE id = ?', 'p2')).toMatchObject({ stock: 2, price: 20 });
  });

  it('rejects foreign products atomically and validates input', async () => {
    addUser('other', { business: true });
    addProduct('p1', 'shop', { stock: 1 });
    addProduct('x1', 'other', { stock: 1 });
    const res = await call('shop', 'PATCH', '/business/products/bulk', {
      items: [
        { id: 'p1', stock: 5 },
        { id: 'x1', stock: 5 },
      ],
    });
    expect(res.status).toBe(404);
    expect(one<any>('SELECT stock FROM products WHERE id = ?', 'p1').stock).toBe(1);
    expect((await call('shop', 'PATCH', '/business/products/bulk', { items: [{ id: 'p1', stock: -1 }] })).status).toBe(400);
    expect((await call('shop', 'PATCH', '/business/products/bulk', { items: [{ id: 'p1' }] })).status).toBe(400);
    const tooMany = Array.from({ length: BULK_MAX + 1 }, (_, i) => ({ id: `p${i}`, stock: 1 }));
    expect((await call('shop', 'PATCH', '/business/products/bulk', { items: tooMany })).status).toBe(400);
  });

  it('stays under the D1 bound-parameter cap at the max batch size', async () => {
    const items = Array.from({ length: BULK_MAX }, (_, i) => {
      addProduct(`b${i}`, 'shop');
      return { id: `b${i}`, stock: i, price: 5 };
    });
    const res = await call('shop', 'PATCH', '/business/products/bulk', { items });
    expect(res.status).toBe(200);
    expect(res.data.products).toHaveLength(BULK_MAX);
  });
});

describe('GET /business/orders/:id/contact', () => {
  it('is ok for a buyer who ordered, and respects dm_policy and blocks', async () => {
    addProduct('p1', 'shop');
    addOrder('o1', 'buyer', 'shop', 'p1', 1);
    let res = await call('shop', 'GET', '/business/orders/o1/contact');
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ can_message: true, reason: 'ok', customer: { id: 'buyer' } });

    db.prepare("UPDATE users SET dm_policy = 'nobody' WHERE id = 'buyer'").run();
    res = await call('shop', 'GET', '/business/orders/o1/contact');
    expect(res.data).toMatchObject({ can_message: false, reason: 'not_accepting' });

    db.prepare(
      `INSERT INTO user_relationships (id, user_id, target_user_id, type, created_at, source)
       VALUES ('blk', 'buyer', 'shop', 'block', datetime('now'), 'manual')`
    ).run();
    res = await call('shop', 'GET', '/business/orders/o1/contact');
    expect(res.data).toMatchObject({ can_message: false, reason: 'blocked' });
  });

  it('404s for orders of another seller', async () => {
    addUser('other', { business: true });
    addProduct('x1', 'other');
    addOrder('o2', 'buyer', 'other', 'x1', 1);
    expect((await call('shop', 'GET', '/business/orders/o2/contact')).status).toBe(404);
  });
});

describe('product delete keeps order history', () => {
  it('archives an ordered product instead of cascading into order_items', async () => {
    addProduct('p1', 'shop');
    addOrder('o1', 'buyer', 'shop', 'p1', 1, { status: 'completed' });
    const res = await call('shop', 'DELETE', '/marketplace/products/p1');
    expect(res.status).toBe(200);
    expect(res.data.archived).toBe(true);
    expect(one<any>('SELECT COUNT(*) AS n FROM order_items WHERE order_id = ?', 'o1').n).toBe(1);
    expect(one<any>('SELECT is_hidden, hidden_reason FROM products WHERE id = ?', 'p1')).toMatchObject({
      is_hidden: 1,
      hidden_reason: 'seller_archived',
    });
    // Gone from the seller's catalog and from buyers' browse.
    const mine = await call('shop', 'GET', '/business/products');
    expect(mine.data.products.map((p: any) => p.id)).not.toContain('p1');
    expect((await call('buyer', 'GET', '/marketplace/products/p1')).status).toBe(404);
  });

  it('hard-deletes a product that was never ordered', async () => {
    addProduct('p1', 'shop');
    const res = await call('shop', 'DELETE', '/marketplace/products/p1');
    expect(res.data.archived).toBe(false);
    expect(one('SELECT id FROM products WHERE id = ?', 'p1')).toBeUndefined();
  });
});

describe('cancel restocks paid orders', () => {
  it('returns stock when a paid order is cancelled', async () => {
    addProduct('p1', 'shop', { stock: 3 });
    addOrder('o1', 'buyer', 'shop', 'p1', 2, { status: 'processing', payment: 'paid' });
    const res = await call('shop', 'PATCH', '/marketplace/orders/o1/status', { status: 'cancelled' });
    expect(res.status).toBe(200);
    expect(one<any>('SELECT stock FROM products WHERE id = ?', 'p1').stock).toBe(5);
    // Repeating the cancel is a no-op (no double restock).
    await call('shop', 'PATCH', '/marketplace/orders/o1/status', { status: 'cancelled' });
    expect(one<any>('SELECT stock FROM products WHERE id = ?', 'p1').stock).toBe(5);
  });

  it('does not restock unpaid checkout orders', async () => {
    addProduct('p1', 'shop', { stock: 3 });
    addOrder('o1', 'buyer', 'shop', 'p1', 2, { status: 'pending', payment: 'unpaid' });
    await call('shop', 'PATCH', '/marketplace/orders/o1/status', { status: 'cancelled' });
    expect(one<any>('SELECT stock FROM products WHERE id = ?', 'p1').stock).toBe(3);
  });
});

describe('dashboard honesty', () => {
  it('counts open paid orders regardless of period and exposes previous-period values', async () => {
    addProduct('p1', 'shop');
    addOrder('old', 'buyer', 'shop', 'p1', 1, { status: 'pending', createdAt: '2026-09-01 10:00:00' });
    addOrder('new', 'buyer', 'shop', 'p1', 1, { status: 'processing', createdAt: '2026-11-15 09:00:00' });
    addOrder('unpaid', 'buyer', 'shop', 'p1', 1, { status: 'pending', payment: 'unpaid' });
    const res = await call('shop', 'GET', '/business/dashboard?period=week');
    expect(res.status).toBe(200);
    expect(res.data.kpis.pending_orders).toBe(2);
    expect(res.data.kpis.deltas.previous_orders).toBe(0);
    expect(res.data.kpis.deltas.previous_net_revenue).toBe(0);
  });
});

describe('low-stock alerts and the in-app alerts switch', () => {
  // Orders can't be placed while payments are off, so drive the helper the order paths use.
  function take(productId: string, qty: number) {
    db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(qty, productId);
    return notifyLowStockCrossings(env, [{ product_id: productId, quantity: qty }]);
  }
  const types = () =>
    (db.prepare("SELECT type FROM business_notifications WHERE business_id = 'shop'").all() as any[]).map(
      (r) => r.type
    );

  it('notifies once when stock crosses below the threshold, and when it sells out', async () => {
    addProduct('p1', 'shop', { stock: 11 });
    db.prepare(
      `INSERT INTO business_settings (business_id, analytics_prefs, notifications_prefs, created_at, updated_at)
       VALUES ('shop', '{"low_stock_threshold":10}', '{}', datetime('now'), datetime('now'))`
    ).run();
    await take('p1', 2); // 11 → 9: crosses
    await take('p1', 1); // 9 → 8: already low, no repeat
    expect(types()).toEqual(['low_stock']);
    await take('p1', 8); // → 0
    expect(types()).toEqual(['low_stock', 'out_of_stock']);
  });

  it('records nothing when in-app alerts are off', async () => {
    addProduct('p1', 'shop', { stock: 5 });
    await call('shop', 'PUT', '/business/settings', { notifications_prefs: { inAppAlerts: false } });
    await take('p1', 5);
    expect(types()).toEqual([]);
  });
});
