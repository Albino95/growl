/**
 * Wave 6 storefront (migration 0048) against a real in-memory SQLite built from every
 * migration: storefront validation + ownership, the public storefront (hidden and
 * archived products excluded, blocks, verified badge), verification requests and the
 * admin review endpoints (permission guard + audit log).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../../src/index';
import type { Env } from '../../src/types';
import { createSqliteD1, loadMigrationsSql, trackParams } from '../utils/sqliteD1';
import { signAccessToken } from '../../src/utils/jwt';
import { signAdminToken, hashToken } from '../../src/utils/adminJwt';
import {
  isHttpsUrl,
  isVerified,
  verificationStatusOf,
  mergeStorefront,
  emptyStorefront,
} from '../../src/routes/wave3/storefront';

const SCHEMA = loadMigrationsSql();
const D1_MAX_PARAMS = 100;

let db: ReturnType<typeof createSqliteD1>['raw'];
let env: Env;
let stats: { maxParams: number; maxSql: string };

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

function addUser(id: string, opts: { business?: boolean } = {}) {
  db.prepare(
    `INSERT INTO users (id, email, password_hash, metadata, email_verified, timezone, is_business, created_at, updated_at)
     VALUES (?, ?, 'x', ?, 1, 'UTC', ?, datetime('now'), datetime('now'))`
  ).run(id, `${id}@example.com`, JSON.stringify({ username: id }), opts.business ? 1 : 0);
}

function addProduct(id: string, owner: string, opts: { hidden?: boolean; archived?: boolean; stock?: number } = {}) {
  db.prepare(
    `INSERT INTO products (id, user_id, name, category, price, stock, image_url, is_hidden, hidden_reason, created_at, updated_at)
     VALUES (?, ?, ?, 'fitness', 12, ?, NULL, ?, ?, datetime('now'), datetime('now'))`
  ).run(
    id,
    owner,
    `Product ${id}`,
    opts.stock ?? 5,
    opts.hidden || opts.archived ? 1 : 0,
    opts.archived ? 'seller_archived' : opts.hidden ? 'moderation' : null
  );
}

function addPost(id: string, owner: string) {
  db.prepare(
    `INSERT INTO posts (id, user_id, image_url, caption, category, created_at, updated_at)
     VALUES (?, ?, 'https://cdn.test/p.jpg', 'Hello', 'fitness', datetime('now'), datetime('now'))`
  ).run(id, owner);
}

async function addAdmin(id: string, role: string): Promise<string> {
  db.prepare(
    `INSERT INTO admin_users (id, email, password_hash, role, status, mfa_enabled, created_at, updated_at)
     VALUES (?, ?, 'x', ?, 'active', 1, datetime('now'), datetime('now'))`
  ).run(id, `${id}@admin.test`, role);
  const token = await signAdminToken(id, env);
  db.prepare(
    `INSERT INTO admin_sessions (id, admin_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  ).run(`sess_${id}`, id, await hashToken(token), new Date(Date.now() + 3600_000).toISOString());
  return token;
}

async function call(
  user: string | null,
  method: string,
  path: string,
  body?: unknown,
  opts: { adminToken?: string } = {}
) {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.adminToken) h.Authorization = `Bearer ${opts.adminToken}`;
  else if (user) h.Authorization = `Bearer ${await signAccessToken(user, env)}`;
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

function count(sql: string, ...args: unknown[]): number {
  return Number((db.prepare(sql).get(...args) as any).n);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-18T12:00:00Z'));
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
    JWT_SECRET: 'storefront-test-secret',
    API_VERSION: 'v1',
  } as Env;
  addUser('shop', { business: true });
  addUser('other', { business: true });
  addUser('buyer');
});

afterEach(() => {
  expect(stats.maxParams, stats.maxSql).toBeLessThanOrEqual(D1_MAX_PARAMS);
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
describe('pure helpers', () => {
  it('accepts only https links with a host', () => {
    expect(isHttpsUrl('https://example.com/a')).toBe(true);
    expect(isHttpsUrl('http://example.com')).toBe(false);
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpsUrl('https://user:pw@example.com')).toBe(false);
    expect(isHttpsUrl('not a url')).toBe(false);
  });

  it('profile status wins over the request when an admin profile exists', () => {
    expect(isVerified({ profileStatus: null, requestStatus: 'verified' })).toBe(true);
    expect(isVerified({ profileStatus: 'pending', requestStatus: 'verified' })).toBe(false);
    expect(isVerified({ profileStatus: 'verified', requestStatus: null })).toBe(true);
    expect(verificationStatusOf({ profileStatus: null, requestStatus: null })).toBe('none');
    expect(verificationStatusOf({ profileStatus: 'pending', requestStatus: null })).toBe('none');
    expect(verificationStatusOf({ profileStatus: 'pending', requestStatus: 'pending' })).toBe('pending');
    expect(verificationStatusOf({ profileStatus: null, requestStatus: 'rejected' })).toBe('rejected');
  });

  it('merges a partial patch and keeps untouched policies', () => {
    const base = { ...emptyStorefront('b'), policies: { shipping: 'Ships fast', returns: null, pickup: null } };
    const next = mergeStorefront(base, { tagline: 'Hi', policies: { returns: '30 days' } as any });
    expect(next.tagline).toBe('Hi');
    expect(next.policies).toEqual({ shipping: 'Ships fast', returns: '30 days', pickup: null });
  });
});

// ---------------------------------------------------------------------------
describe('owner storefront', () => {
  it('returns an empty storefront before the first save', async () => {
    const res = await call('shop', 'GET', '/business/storefront');
    expect(res.status).toBe(200);
    expect(res.data.storefront).toMatchObject({ business_id: 'shop', tagline: null, links: [], hours: [] });
  });

  it('is business-only', async () => {
    expect((await call(null, 'GET', '/business/storefront')).status).toBe(401);
    expect((await call('buyer', 'GET', '/business/storefront')).status).toBe(403);
    expect((await call('buyer', 'PUT', '/business/storefront', { tagline: 'x' })).status).toBe(403);
  });

  it('saves every field and a later partial PUT keeps the rest', async () => {
    addProduct('p1', 'shop');
    addProduct('p2', 'shop');
    addPost('post1', 'shop');
    const res = await call('shop', 'PUT', '/business/storefront', {
      cover_url: 'https://cdn.test/media/product/shop/cover.jpg',
      tagline: '  Fresh mats, honest prices  ',
      about: 'We make yoga mats in Luxembourg.',
      links: [{ label: 'Website', url: 'https://mats.example' }],
      path_tags: ['fitness', 'wellness'],
      featured_product_ids: ['p2', 'p1', 'p2'],
      pinned_post_id: 'post1',
      location_label: 'Luxembourg City',
      pickup_note: 'Ring the bell',
      hours: [
        { day: 5, open: '10:00', close: '18:00' },
        { day: 1, open: '09:00', close: '17:00' },
      ],
      policies: { shipping: 'Ships in 2 days', returns: '30 days' },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const sf = res.data.storefront;
    expect(sf.tagline).toBe('Fresh mats, honest prices');
    expect(sf.featured_product_ids).toEqual(['p2', 'p1']);
    expect(sf.hours.map((h: any) => h.day)).toEqual([1, 5]);
    expect(sf.policies).toEqual({ shipping: 'Ships in 2 days', returns: '30 days', pickup: null });

    const again = await call('shop', 'PUT', '/business/storefront', { tagline: '', policies: { pickup: 'Door 2' } });
    expect(again.status).toBe(200);
    expect(again.data.storefront.tagline).toBeNull();
    expect(again.data.storefront.about).toBe('We make yoga mats in Luxembourg.');
    expect(again.data.storefront.policies).toEqual({ shipping: 'Ships in 2 days', returns: '30 days', pickup: 'Door 2' });
  });

  it.each([
    ['non-https link', { links: [{ label: 'Site', url: 'http://mats.example' }] }],
    ['javascript link', { links: [{ label: 'Site', url: 'javascript:alert(1)' }] }],
    ['too many links', { links: Array.from({ length: 5 }, (_, i) => ({ label: `L${i}`, url: `https://x${i}.example` })) }],
    ['long tagline', { tagline: 'x'.repeat(81) }],
    ['long about', { about: 'x'.repeat(1201) }],
    ['too many path tags', { path_tags: ['fitness', 'art', 'nutrition', 'mindset'] }],
    ['unknown path tag', { path_tags: ['casino'] }],
    ['bad hours', { hours: [{ day: 7, open: '09:00', close: '17:00' }] }],
    ['close before open', { hours: [{ day: 1, open: '18:00', close: '09:00' }] }],
    ['bad time', { hours: [{ day: 1, open: '9am', close: '17:00' }] }],
    ['long shipping policy', { policies: { shipping: 'x'.repeat(601) } }],
    ['long pickup policy', { policies: { pickup: 'x'.repeat(401) } }],
    ['too many featured', { featured_product_ids: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }],
  ])('rejects %s', async (_label, body) => {
    const res = await call('shop', 'PUT', '/business/storefront', body);
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(count('SELECT COUNT(*) AS n FROM business_storefronts')).toBe(0);
  });

  it('only features own, active products', async () => {
    addProduct('mine', 'shop');
    addProduct('theirs', 'other');
    addProduct('hidden', 'shop', { hidden: true });
    addProduct('archived', 'shop', { archived: true });
    for (const id of ['theirs', 'hidden', 'archived', 'missing']) {
      const res = await call('shop', 'PUT', '/business/storefront', { featured_product_ids: ['mine', id] });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_FEATURED_PRODUCT');
    }
    expect((await call('shop', 'PUT', '/business/storefront', { featured_product_ids: ['mine'] })).status).toBe(200);
  });

  it('only pins own posts', async () => {
    addPost('theirs', 'other');
    const res = await call('shop', 'PUT', '/business/storefront', { pinned_post_id: 'theirs' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PINNED_POST');
  });
});

// ---------------------------------------------------------------------------
describe('public storefront', () => {
  beforeEach(async () => {
    addProduct('a', 'shop');
    addProduct('b', 'shop', { stock: 0 });
    addProduct('hidden', 'shop', { hidden: true });
    addProduct('archived', 'shop', { archived: true });
    const res = await call('shop', 'PUT', '/business/storefront', {
      tagline: 'Hello',
      featured_product_ids: ['b', 'a'],
    });
    expect(res.status).toBe(200);
  });

  it('works without auth and excludes hidden / archived products', async () => {
    const res = await call(null, 'GET', '/storefronts/shop');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.data.business).toMatchObject({ id: 'shop', name: 'shop', verified: false, followers_count: 0 });
    expect(res.data.storefront.tagline).toBe('Hello');
    expect(res.data.featured_products.map((p: any) => p.id)).toEqual(['b', 'a']);
    expect(res.data.featured_products[0].sold_out).toBe(true);
    expect(res.data.products_count).toBe(2);
    expect(res.data.viewer).toEqual({ is_owner: false, can_message: false });

    const list = await call(null, 'GET', '/storefronts/shop/products?limit=10');
    expect(list.status).toBe(200);
    expect(list.data.products.map((p: any) => p.id).sort()).toEqual(['a', 'b']);
    expect(list.data.total).toBe(2);
    expect(list.data.has_more).toBe(false);
  });

  it('drops a featured product once it is hidden later', async () => {
    db.prepare(`UPDATE products SET is_hidden = 1, hidden_reason = 'moderation' WHERE id = 'a'`).run();
    const res = await call('buyer', 'GET', '/storefronts/shop');
    expect(res.data.featured_products.map((p: any) => p.id)).toEqual(['b']);
    expect(res.data.storefront.featured_product_ids).toEqual(['b']);
    expect(res.data.products_count).toBe(1);
  });

  it('404s for non-business users, unknown ids, banned shops and blocked viewers', async () => {
    expect((await call(null, 'GET', '/storefronts/buyer')).status).toBe(404);
    expect((await call(null, 'GET', '/storefronts/nobody')).status).toBe(404);
    db.prepare(
      `INSERT INTO user_relationships (id, user_id, target_user_id, type, created_at, source)
       VALUES ('blk', 'shop', 'buyer', 'block', datetime('now'), 'manual')`
    ).run();
    expect((await call('buyer', 'GET', '/storefronts/shop')).status).toBe(404);
    expect((await call('buyer', 'GET', '/storefronts/shop/products')).status).toBe(404);
    db.prepare(
      `INSERT INTO user_account_states (user_id, status, updated_at) VALUES ('shop', 'banned', datetime('now'))`
    ).run();
    expect((await call(null, 'GET', '/storefronts/shop')).status).toBe(404);
  });

  it('marks the owner', async () => {
    const res = await call('shop', 'GET', '/storefronts/shop');
    expect(res.data.viewer.is_owner).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('verification', () => {
  it('request → pending → admin approves → verified badge everywhere', async () => {
    expect((await call('shop', 'GET', '/business/verification')).data.status).toBe('none');

    const bad = await call('shop', 'POST', '/business/verification', { website: 'http://shop.example' });
    expect(bad.status).toBe(400);
    const empty = await call('shop', 'POST', '/business/verification', { note: 'hi' });
    expect(empty.status).toBe(400);

    const req = await call('shop', 'POST', '/business/verification', {
      website: 'https://shop.example',
      registration_number: 'B123456',
    });
    expect(req.status, JSON.stringify(req.body)).toBe(200);
    expect(req.data).toEqual({ status: 'pending' });
    expect((await call('shop', 'GET', '/business/verification')).data.status).toBe('pending');
    expect((await call('buyer', 'POST', '/business/verification', { website: 'https://x.example' })).status).toBe(403);

    const token = await addAdmin('ops', 'business_ops_admin');
    const queue = await call(null, 'GET', '/admin/business/verifications', undefined, { adminToken: token });
    expect(queue.status, JSON.stringify(queue.body)).toBe(200);
    expect(queue.data.verifications).toHaveLength(1);
    expect(queue.data.verifications[0]).toMatchObject({ business_id: 'shop', status: 'pending', registration_number: 'B123456' });

    const ok = await call(null, 'POST', '/admin/business/verifications/shop', { approve: true }, { adminToken: token });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.data.status).toBe('verified');
    expect(
      count(
        `SELECT COUNT(*) AS n FROM admin_audit_logs
         WHERE admin_id = 'ops' AND action = 'business.verification.approve' AND target_id = 'shop'`
      )
    ).toBe(1);
    expect(count(`SELECT COUNT(*) AS n FROM business_notifications WHERE business_id = 'shop' AND type = 'verification'`)).toBe(1);

    expect((await call('shop', 'GET', '/business/verification')).data.status).toBe('verified');
    expect((await call(null, 'GET', '/storefronts/shop')).data.business.verified).toBe(true);
    const batch = await call(null, 'GET', '/storefronts/verified?ids=shop,other,buyer');
    expect(batch.data.verified).toEqual(['shop']);
    // Already verified: a second request is refused.
    expect((await call('shop', 'POST', '/business/verification', { website: 'https://shop.example' })).status).toBe(409);
  });

  it('reject needs a reason, shows it to the business, and a resubmit goes back to pending', async () => {
    await call('shop', 'POST', '/business/verification', { registration_number: 'B1' });
    const token = await addAdmin('ops', 'business_ops_admin');
    const noReason = await call(null, 'POST', '/admin/business/verifications/shop', { approve: false }, { adminToken: token });
    expect(noReason.status).toBe(400);
    const rej = await call(
      null,
      'POST',
      '/admin/business/verifications/shop',
      { approve: false, reason: 'Registration number not found' },
      { adminToken: token }
    );
    expect(rej.status).toBe(200);
    const mine = await call('shop', 'GET', '/business/verification');
    expect(mine.data).toMatchObject({ status: 'rejected', reason: 'Registration number not found' });
    expect(
      count(`SELECT COUNT(*) AS n FROM admin_audit_logs WHERE action = 'business.verification.reject'`)
    ).toBe(1);

    await call('shop', 'POST', '/business/verification', { registration_number: 'B2' });
    expect((await call('shop', 'GET', '/business/verification')).data).toMatchObject({ status: 'pending', reason: null });
  });

  it('keeps an admin-provisioned profile in sync', async () => {
    db.prepare(
      `INSERT INTO business_profiles (user_id, display_name, contact_email, field_of_operation)
       VALUES ('shop', 'Shop & Co', 'c@shop.test', 'fitness')`
    ).run();
    expect((await call(null, 'GET', '/storefronts/shop')).data.business).toMatchObject({ name: 'Shop & Co', verified: false });
    const token = await addAdmin('ops', 'business_ops_admin');
    await call(null, 'POST', '/admin/business/verifications/shop', { approve: true }, { adminToken: token });
    expect(
      (db.prepare(`SELECT verification_status AS s FROM business_profiles WHERE user_id = 'shop'`).get() as any).s
    ).toBe('verified');
    expect((await call(null, 'GET', '/storefronts/shop')).data.business.verified).toBe(true);
  });

  it('admin endpoints need business.write', async () => {
    await call('shop', 'POST', '/business/verification', { registration_number: 'B1' });
    const finance = await addAdmin('fin', 'finance_admin');
    const analyst = await addAdmin('ana', 'analyst_readonly');
    for (const t of [finance, analyst]) {
      expect((await call(null, 'GET', '/admin/business/verifications', undefined, { adminToken: t })).status).toBe(403);
      expect(
        (await call(null, 'POST', '/admin/business/verifications/shop', { approve: true }, { adminToken: t })).status
      ).toBe(403);
    }
    // A normal user token is not an admin token.
    expect((await call('shop', 'GET', '/admin/business/verifications')).status).toBe(401);
    expect((await call(null, 'GET', '/admin/business/verifications')).status).toBe(401);
    expect(count(`SELECT COUNT(*) AS n FROM admin_audit_logs`)).toBe(0);
    expect((await call('shop', 'GET', '/business/verification')).data.status).toBe('pending');

    const sup = await addAdmin('root', 'super_admin');
    expect(
      (await call(null, 'POST', '/admin/business/verifications/buyer', { approve: true }, { adminToken: sup })).status
    ).toBe(404);
  });
});
