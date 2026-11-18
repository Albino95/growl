/**
 * Wave 6 seller web tools (bizx): bulk edit of category / status (all-or-nothing) and
 * CSV product import (dry run → commit, sku matching, per-row errors). Real in-memory
 * SQLite built from every migration; D1 batch is emulated as one transaction.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../../src/index';
import type { Env } from '../../src/types';
import { createSqliteD1, loadMigrationsSql, trackParams } from '../utils/sqliteD1';
import { signAccessToken } from '../../src/utils/jwt';
import { IMPORT_MAX, planImport, derivedSku, productStatusOf } from '../../src/routes/wave3/bizx';

const SCHEMA = loadMigrationsSql();

let db: ReturnType<typeof createSqliteD1>['raw'];
let env: Env;
let stats: { maxParams: number; maxSql: string };
let failBatchAt: number | null = null;

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

function addUser(id: string, opts: { business?: boolean } = {}) {
  db.prepare(
    `INSERT INTO users (id, email, password_hash, metadata, email_verified, timezone, is_business, created_at, updated_at)
     VALUES (?, ?, 'x', ?, 1, 'UTC', ?, datetime('now'), datetime('now'))`
  ).run(id, `${id}@example.com`, JSON.stringify({ username: id }), opts.business ? 1 : 0);
}

function addProduct(
  id: string,
  owner: string,
  opts: { stock?: number; price?: number; sku?: string; hidden?: string | null; category?: string } = {}
) {
  db.prepare(
    `INSERT INTO products (id, user_id, name, category, subcategory, price, stock, metadata, is_hidden, hidden_reason, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'cardio', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).run(
    id,
    owner,
    `Product ${id}`,
    opts.category ?? 'fitness',
    opts.price ?? 10,
    opts.stock ?? 5,
    JSON.stringify(opts.sku ? { sku: opts.sku } : {}),
    opts.hidden ? 1 : 0,
    opts.hidden ?? null
  );
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

function count(sql: string, ...args: unknown[]): number {
  return Number((db.prepare(sql).get(...args) as { n: number }).n);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
  const sqlite = createSqliteD1(SCHEMA);
  db = sqlite.raw;
  const tracked = trackParams(sqlite.d1);
  stats = tracked.stats;
  failBatchAt = null;
  const batch = async (stmts: Array<{ run: () => Promise<unknown> }>) => {
    db.exec('BEGIN');
    try {
      for (let i = 0; i < stmts.length; i++) {
        if (failBatchAt === i) throw new Error('simulated D1 failure');
        await stmts[i].run();
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return [];
  };
  const kv = new Map<string, string>();
  env = {
    DB: { ...tracked.d1, batch } as any,
    KV: {
      get: async (k: string) => kv.get(k) ?? null,
      put: async (k: string, v: string) => void kv.set(k, v),
      delete: async (k: string) => void kv.delete(k),
    } as any,
    ENVIRONMENT: 'test',
    JWT_SECRET: 'wave6-biz-secret',
    API_VERSION: 'v1',
  } as Env;
  addUser('shop', { business: true });
  addUser('buyer');
});

afterEach(() => {
  expect(stats.maxParams, stats.maxSql).toBeLessThanOrEqual(100);
  vi.useRealTimers();
});

describe('PATCH /business/products/bulk (category / status)', () => {
  it('moves category (clearing subcategory) and hides / shows products', async () => {
    addProduct('p1', 'shop');
    addProduct('p2', 'shop', { hidden: 'seller_hidden' });
    const res = await call('shop', 'PATCH', '/business/products/bulk', {
      items: [
        { id: 'p1', category: 'Wellness', status: 'hidden' },
        { id: 'p2', status: 'active' },
      ],
    });
    expect(res.status).toBe(200);
    expect(one('SELECT category, subcategory, is_hidden, hidden_reason FROM products WHERE id = ?', 'p1')).toMatchObject({
      category: 'wellness',
      subcategory: null,
      is_hidden: 1,
      hidden_reason: 'seller_hidden',
    });
    expect(one('SELECT is_hidden, hidden_reason FROM products WHERE id = ?', 'p2')).toMatchObject({
      is_hidden: 0,
      hidden_reason: null,
    });
    const p1 = res.data.products.find((p: any) => p.id === 'p1');
    expect(p1.status).toBe('hidden');

    // Hidden products drop out of the public shop.
    const shop = await call('buyer', 'GET', '/marketplace/products');
    const ids = (shop.data.products || shop.data || []).map((p: any) => p.id);
    expect(ids).not.toContain('p1');
  });

  it('rejects unknown categories and moderation-hidden products without writing anything', async () => {
    addProduct('p1', 'shop', { stock: 1 });
    addProduct('m1', 'shop', { hidden: 'policy_violation' });
    expect(
      (await call('shop', 'PATCH', '/business/products/bulk', { items: [{ id: 'p1', category: 'cooking' }] })).status
    ).toBe(400);
    expect(
      (await call('shop', 'PATCH', '/business/products/bulk', { items: [{ id: 'p1', status: 'archived' }] })).status
    ).toBe(400);
    const res = await call('shop', 'PATCH', '/business/products/bulk', {
      items: [
        { id: 'p1', stock: 9 },
        { id: 'm1', status: 'active' },
      ],
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRODUCT_UNDER_REVIEW');
    expect(one<any>('SELECT stock FROM products WHERE id = ?', 'p1').stock).toBe(1);
    expect(one<any>('SELECT is_hidden FROM products WHERE id = ?', 'm1').is_hidden).toBe(1);
    // Price / stock edits on a moderated product are still fine.
    expect((await call('shop', 'PATCH', '/business/products/bulk', { items: [{ id: 'm1', stock: 3 }] })).status).toBe(200);
  });

  it('is all-or-nothing when a write fails mid-batch', async () => {
    addProduct('p1', 'shop', { stock: 1 });
    addProduct('p2', 'shop', { stock: 2 });
    failBatchAt = 1;
    const res = await call('shop', 'PATCH', '/business/products/bulk', {
      items: [
        { id: 'p1', stock: 50 },
        { id: 'p2', stock: 60 },
      ],
    });
    expect(res.status).toBe(500);
    expect(one<any>('SELECT stock FROM products WHERE id = ?', 'p1').stock).toBe(1);
  });
});

describe('planImport (pure)', () => {
  it('matches product_id, explicit sku and the derived PRD- label', () => {
    const existing = [
      { id: 'product_aaaaaa111111', sku: 'MAT-01', status: 'active' as const },
      { id: 'product_bbbbbb222222', sku: null, status: 'active' as const },
    ];
    const { planned, errors } = planImport(
      [
        { sku: 'mat-01', stock: '4' },
        { sku: derivedSku('product_bbbbbb222222'), price: '12,50' },
        { name: 'New', category: 'fitness', price: 3 },
        { product_id: 'product_aaaaaa111111' },
      ],
      existing
    );
    expect(planned.map((p) => p.action)).toEqual(['update', 'update', 'create', 'error']);
    expect(planned[1].data?.price).toBe(12.5);
    // Row 4 targets the same product as row 1.
    expect(errors).toEqual([{ row: 4, field: 'product_id', message: 'Same product as row 1' }]);
  });

  it('reports per-row validation errors', () => {
    const { errors } = planImport(
      [
        { name: 'No price', category: 'fitness' },
        { name: 'Bad', category: 'cooking', price: 'abc', stock: '-1', image_url: 'http://x' },
        { sku: 'NEW-1', name: 'x', category: 'art', price: 1 },
        { sku: 'new-1', name: 'y', category: 'art', price: 1 },
      ],
      []
    );
    const fields = (row: number) => errors.filter((e) => e.row === row).map((e) => e.field).sort();
    expect(fields(1)).toEqual(['price']);
    expect(fields(2)).toEqual(['category', 'image_url', 'price', 'stock']);
    expect(fields(3)).toEqual([]);
    expect(fields(4)).toEqual(['sku']);
  });

  it('productStatusOf distinguishes seller hides from moderation', () => {
    expect(productStatusOf({ is_hidden: 0 })).toBe('active');
    expect(productStatusOf({ is_hidden: 1, hidden_reason: 'seller_hidden' })).toBe('hidden');
    expect(productStatusOf({ is_hidden: 1, hidden_reason: 'spam' })).toBe('moderated');
  });
});

describe('POST /business/products/import', () => {
  const rows = [
    { sku: 'MAT-01', stock: '7', price: '29.90' },
    { sku: 'BLOCK-2', name: 'Cork block', category: 'fitness', subcategory: 'flexibility', price: '9.5', stock: '3', status: 'hidden' },
    { name: 'Water bottle', category: 'wellness', price: 15, image_url: 'https://cdn.test/b.jpg' },
  ];

  it('dry run reports the plan and writes nothing; commit applies it', async () => {
    addProduct('p1', 'shop', { sku: 'MAT-01', stock: 1, price: 20 });
    const before = count('SELECT COUNT(*) AS n FROM products');

    const dry = await call('shop', 'POST', '/business/products/import', { rows, dry_run: true });
    expect(dry.status).toBe(200);
    expect(dry.data).toMatchObject({ dry_run: true, total: 3, created: 2, updated: 1, errors: [] });
    expect(dry.data.rows[0]).toMatchObject({ row: 1, action: 'update', product_id: 'p1' });
    expect(count('SELECT COUNT(*) AS n FROM products')).toBe(before);

    const res = await call('shop', 'POST', '/business/products/import', { rows, dry_run: false });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ dry_run: false, created: 2, updated: 1 });
    expect(one('SELECT stock, price FROM products WHERE id = ?', 'p1')).toMatchObject({ stock: 7, price: 29.9 });
    const block = one<any>("SELECT * FROM products WHERE json_extract(metadata, '$.sku') = 'BLOCK-2'");
    expect(block).toMatchObject({ user_id: 'shop', price: 9.5, stock: 3, is_hidden: 1, hidden_reason: 'seller_hidden' });
    const bottle = one<any>("SELECT * FROM products WHERE name = 'Water bottle'");
    expect(bottle).toMatchObject({ stock: 0, image_url: 'https://cdn.test/b.jpg', is_hidden: 0 });
    expect(JSON.parse(bottle.images)).toEqual(['https://cdn.test/b.jpg']);

    // Re-importing the same file updates by sku instead of duplicating.
    const again = await call('shop', 'POST', '/business/products/import', { rows: rows.slice(0, 2), dry_run: false });
    expect(again.data).toMatchObject({ created: 0, updated: 2 });
  });

  it('commit with any row error saves nothing', async () => {
    addProduct('p1', 'shop', { sku: 'MAT-01', stock: 1 });
    const bad = [...rows, { name: 'Broken', category: 'fitness' }];
    const dry = await call('shop', 'POST', '/business/products/import', { rows: bad, dry_run: true });
    expect(dry.data.errors).toEqual([{ row: 4, field: 'price', message: 'Price is required for a new product' }]);
    const before = count('SELECT COUNT(*) AS n FROM products');
    const res = await call('shop', 'POST', '/business/products/import', { rows: bad, dry_run: false });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('IMPORT_HAS_ERRORS');
    expect(count('SELECT COUNT(*) AS n FROM products')).toBe(before);
    expect(one<any>('SELECT stock FROM products WHERE id = ?', 'p1').stock).toBe(1);
  });

  it('never matches another seller’s products and enforces limits and auth', async () => {
    addUser('other', { business: true });
    addProduct('x1', 'other', { sku: 'MAT-01', stock: 1 });
    const res = await call('shop', 'POST', '/business/products/import', {
      rows: [{ product_id: 'x1', stock: 5 }, { sku: 'MAT-01', name: 'Mine', category: 'fitness', price: 2 }],
      dry_run: true,
    });
    expect(res.data.errors).toEqual([{ row: 1, field: 'product_id', message: 'Product not found in your catalog' }]);
    expect(res.data.rows[1].action).toBe('create');

    const tooMany = Array.from({ length: IMPORT_MAX + 1 }, () => ({ name: 'x', category: 'art', price: 1 }));
    expect((await call('shop', 'POST', '/business/products/import', { rows: tooMany })).status).toBe(400);
    expect((await call('buyer', 'POST', '/business/products/import', { rows: [{ name: 'x' }] })).status).toBe(403);
    expect((await call(null, 'POST', '/business/products/import', { rows: [{ name: 'x' }] })).status).toBe(401);
  });

  it('imports the maximum file size under the bound-parameter cap', async () => {
    const many = Array.from({ length: IMPORT_MAX }, (_, i) => ({
      sku: `SKU-${i}`,
      name: `Item ${i}`,
      category: 'art',
      price: 1 + i,
    }));
    const res = await call('shop', 'POST', '/business/products/import', { rows: many, dry_run: false });
    expect(res.status).toBe(200);
    expect(res.data.created).toBe(IMPORT_MAX);
    expect(count("SELECT COUNT(*) AS n FROM products WHERE user_id = 'shop'")).toBe(IMPORT_MAX);
  });
});
