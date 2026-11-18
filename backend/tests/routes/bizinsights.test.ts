/**
 * Wave 6 business insights (migration 0049) against in-memory SQLite built from every
 * migration: view dedupe, daily aggregates, privacy threshold, ownership, partner-link
 * attribution window, retention cron and the ≤ 100 bound-params rule.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../../src/index';
import type { Env } from '../../src/types';
import { createSqliteD1, loadMigrationsSql, trackParams } from '../utils/sqliteD1';
import { signAccessToken } from '../../src/utils/jwt';
import { periodDays, topPaths, runCron, normalizeSource } from '../../src/routes/wave3/bizinsights';

const SCHEMA = loadMigrationsSql();
const D1_MAX_PARAMS = 100;

let db: ReturnType<typeof createSqliteD1>['raw'];
let env: Env;
let stats: { maxParams: number; maxSql: string };

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

function setNow(iso: string) {
  vi.setSystemTime(new Date(iso));
}

function addUser(id: string, opts: { business?: boolean; instructor?: boolean; categories?: string[] } = {}) {
  db.prepare(
    `INSERT INTO users (id, email, password_hash, metadata, email_verified, timezone, is_business, is_instructor, created_at, updated_at)
     VALUES (?, ?, 'x', ?, 1, 'UTC', ?, ?, datetime('now'), datetime('now'))`
  ).run(
    id,
    `${id}@example.com`,
    JSON.stringify({ username: id, categories: opts.categories ?? [] }),
    opts.business ? 1 : 0,
    opts.instructor ? 1 : 0
  );
}

function addProduct(id: string, owner: string, hidden = 0) {
  db.prepare(
    `INSERT INTO products (id, user_id, name, category, price, stock, image_url, created_at, updated_at, is_hidden)
     VALUES (?, ?, ?, 'fitness', 10, 5, 'https://img/x.jpg', datetime('now'), datetime('now'), ?)`
  ).run(id, owner, `Product ${id}`, hidden);
}

function addPartnership(id: string, business: string, instructor: string, status = 'active') {
  db.prepare(
    `INSERT INTO partnerships (id, business_id, instructor_id, partnership_type, status, created_at, updated_at)
     VALUES (?, ?, ?, 'commission', ?, datetime('now'), datetime('now'))`
  ).run(id, business, instructor, status);
}

async function call(
  userId: string | null,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
) {
  const h: Record<string, string> = { 'Content-Type': 'application/json', ...headers };
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

function one(sql: string, ...args: unknown[]): any {
  return db.prepare(sql).get(...args);
}

const view = (product_id: string, source = 'feed') => ({ type: 'product_view', product_id, source });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  setNow('2026-11-18T12:00:00Z');
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
    JWT_SECRET: 'bizinsights-test-secret',
    API_VERSION: 'v1',
  } as Env;
  addUser('biz', { business: true });
  addUser('biz2', { business: true });
  addUser('buyer', { categories: ['fitness', 'mindset:focus'] });
  addUser('coach', { instructor: true });
  addProduct('p1', 'biz');
  addProduct('p2', 'biz');
  addProduct('hidden', 'biz', 1);
  addProduct('other', 'biz2');
});

afterEach(() => {
  expect(stats.maxParams, stats.maxSql).toBeLessThanOrEqual(D1_MAX_PARAMS);
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
describe('POST /events', () => {
  it('dedupes views per viewer + item for 30 minutes and updates daily aggregates', async () => {
    const first = await call('buyer', 'POST', '/events', {
      events: [view('p1'), view('p1'), view('p2', 'search'), { type: 'storefront_view', business_id: 'biz', source: 'explore' }],
    });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.data.accepted).toBe(4);
    expect(first.data.counted).toBe(3);

    // Same viewer within 30 minutes → nothing new.
    setNow('2026-11-18T12:20:00Z');
    const again = await call('buyer', 'POST', '/events', { events: [view('p1')] });
    expect(again.data.counted).toBe(0);

    // After 30 minutes → counted again.
    setNow('2026-11-18T12:31:00Z');
    const later = await call('buyer', 'POST', '/events', { events: [view('p1')] });
    expect(later.data.counted).toBe(1);

    const p1 = one(`SELECT views FROM product_daily_stats WHERE product_id = 'p1' AND day = '2026-11-18'`);
    expect(p1.views).toBe(2);
    const sf = one(`SELECT * FROM storefront_daily_stats WHERE business_id = 'biz' AND day = '2026-11-18'`);
    expect(sf.product_views).toBe(3);
    expect(sf.storefront_views).toBe(1);
    const src = db.prepare(`SELECT source, views FROM biz_source_daily_stats WHERE business_id = 'biz' ORDER BY source`).all();
    expect(src).toEqual([
      { source: 'explore', views: 1 },
      { source: 'feed', views: 2 },
      { source: 'search', views: 1 },
    ]);
  });

  it('ignores own views, hidden products, unknown businesses, and client save/click events', async () => {
    const own = await call('biz', 'POST', '/events', { events: [view('p1')] });
    expect(own.data.counted).toBe(0);
    const res = await call('buyer', 'POST', '/events', {
      events: [
        view('hidden'),
        { type: 'storefront_view', business_id: 'buyer' },
        { type: 'product_save', product_id: 'p1' },
        { type: 'partner_click', partner_code: 'ABCDEFGH' },
        { type: 'bogus' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.data.accepted).toBe(4);
    expect(res.data.counted).toBe(0);
    expect(one(`SELECT COUNT(*) n FROM biz_events`).n).toBe(0);
  });

  it('accepts anonymous views (deduped by a hashed viewer key) and rejects > 50 events', async () => {
    const h = { 'CF-Connecting-IP': '1.2.3.4' };
    expect((await call(null, 'POST', '/events', { events: [view('p1')] }, h)).data.counted).toBe(1);
    expect((await call(null, 'POST', '/events', { events: [view('p1')] }, h)).data.counted).toBe(0);
    expect((await call(null, 'POST', '/events', { events: [view('p1')] }, { 'CF-Connecting-IP': '5.6.7.8' })).data.counted).toBe(1);
    expect(one(`SELECT viewer_id FROM biz_events LIMIT 1`).viewer_id).toBeNull();

    const tooMany = await call('buyer', 'POST', '/events', { events: Array.from({ length: 51 }, () => view('p1')) });
    expect(tooMany.status).toBe(400);
  });

  it('keeps every statement ≤ 100 params with a full batch of distinct products', async () => {
    for (let i = 0; i < 50; i++) addProduct(`bulk${i}`, i % 2 ? 'biz' : 'biz2');
    const res = await call('buyer', 'POST', '/events', {
      events: Array.from({ length: 50 }, (_, i) => view(`bulk${i}`, i % 3 ? 'feed' : 'shop')),
    });
    expect(res.data.counted).toBe(50);
    expect(one(`SELECT COUNT(*) n FROM product_daily_stats`).n).toBe(50);
  });

  it('rate limits per user', async () => {
    let last = 200;
    for (let i = 0; i < 31; i++) last = (await call('buyer', 'POST', '/events', { events: [view('p1')] })).status;
    expect(last).toBe(429);
  });
});

// ---------------------------------------------------------------------------
describe('saves', () => {
  it('save / unsave is idempotent, counts once, and lists saved products', async () => {
    const a = await call('buyer', 'POST', '/products/p1/save');
    expect(a.data).toEqual({ saved: true, saves: 1 });
    const b = await call('buyer', 'POST', '/products/p1/save');
    expect(b.data).toEqual({ saved: true, saves: 1 });
    expect(one(`SELECT saves FROM storefront_daily_stats WHERE business_id = 'biz'`).saves).toBe(1);
    expect(one(`SELECT saves FROM product_daily_stats WHERE product_id = 'p1'`).saves).toBe(1);

    const list = await call('buyer', 'GET', '/me/saved-products');
    expect(list.data.products.map((p: any) => p.id)).toEqual(['p1']);
    expect(list.data.products[0].business.id).toBe('biz');

    const un = await call('buyer', 'DELETE', '/products/p1/save');
    expect(un.data).toEqual({ saved: false, saves: 0 });
    expect((await call('buyer', 'GET', '/me/saved-products')).data.products).toEqual([]);
  });

  it('requires auth and a visible product', async () => {
    expect((await call(null, 'POST', '/products/p1/save')).status).toBe(401);
    expect((await call('buyer', 'POST', '/products/hidden/save')).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
describe('GET /business/insights', () => {
  it('returns totals, previous period, zero-filled daily, top products and sources', async () => {
    // Previous period (7d): 2026-11-05 .. 2026-11-11.
    db.prepare(
      `INSERT INTO storefront_daily_stats (business_id, day, storefront_views, product_views, saves, link_taps, partner_clicks)
       VALUES ('biz', '2026-11-10', 4, 6, 1, 0, 2)`
    ).run();
    await call('buyer', 'POST', '/events', { events: [view('p1'), view('p2', 'search')] });
    await call('buyer', 'POST', '/products/p1/save');

    const res = await call('biz', 'GET', '/business/insights?period=7d');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const d = res.data;
    expect(d.period).toBe('7d');
    expect(d.totals).toEqual({ storefront_views: 0, product_views: 2, saves: 1, link_taps: 0, partner_clicks: 0 });
    expect(d.previous).toEqual({ storefront_views: 4, product_views: 6, saves: 1, link_taps: 0, partner_clicks: 2 });
    expect(d.daily).toHaveLength(7);
    expect(d.daily[0].day).toBe('2026-11-12');
    expect(d.daily[6]).toEqual({ day: '2026-11-18', storefront_views: 0, product_views: 2, saves: 1 });
    expect(d.top_products[0]).toMatchObject({ id: 'p1', views: 1, saves: 1 });
    expect(d.sources.map((s: any) => s.source).sort()).toEqual(['feed', 'search']);
    expect(d.audience).toBeNull();
  });

  it('only shows audience paths with ≥ 20 distinct signed-in viewers', async () => {
    for (let i = 0; i < 19; i++) {
      addUser(`v${i}`, { categories: i % 2 ? ['fitness'] : ['mindset:calm', 'fitness:yoga'] });
      await call(`v${i}`, 'POST', '/events', { events: [view('p1')] });
    }
    // Anonymous viewers never count toward the threshold.
    await call(null, 'POST', '/events', { events: [view('p1')] }, { 'CF-Connecting-IP': '9.9.9.9' });
    expect((await call('biz', 'GET', '/business/insights')).data.audience).toBeNull();

    await call('buyer', 'POST', '/events', { events: [view('p2')] });
    const res = await call('biz', 'GET', '/business/insights?period=30d');
    expect(res.data.period).toBe('30d');
    expect(res.data.daily).toHaveLength(30);
    expect(res.data.audience.top_paths[0]).toEqual({ path: 'fitness', share: 1 });
    expect(res.data.audience.top_paths.find((p: any) => p.path === 'mindset').share).toBeCloseTo(0.55, 2);
  });

  it('is business-only and scoped to the caller', async () => {
    expect((await call('buyer', 'GET', '/business/insights')).status).toBe(403);
    await call('buyer', 'POST', '/events', { events: [view('other')] });
    const mine = await call('biz', 'GET', '/business/insights');
    expect(mine.data.totals.product_views).toBe(0);
    const theirs = await call('biz2', 'GET', '/business/insights');
    expect(theirs.data.totals.product_views).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe('partner links', () => {
  beforeEach(() => addPartnership('ps1', 'biz', 'coach'));

  it('creates one link per partner (+ product), lists it for both sides, and only owners can delete', async () => {
    const created = await call('biz', 'POST', '/business/partner-links', { partnership_id: 'ps1' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const link = created.data.link;
    expect(link.url).toBe(`https://letsgrow.lu/p/${link.code}`);
    expect(link.instructor).toEqual({ id: 'coach', name: 'coach' });

    const dup = await call('biz', 'POST', '/business/partner-links', { instructor_id: 'coach' });
    expect(dup.status).toBe(200);
    expect(dup.data.link.id).toBe(link.id);

    const withProduct = await call('biz', 'POST', '/business/partner-links', { partnership_id: 'ps1', product_id: 'p1' });
    expect(withProduct.status).toBe(201);
    expect(withProduct.data.links).toHaveLength(2);

    // Not a partner / not own product.
    expect((await call('biz2', 'POST', '/business/partner-links', { partnership_id: 'ps1' })).status).toBe(404);
    expect((await call('biz', 'POST', '/business/partner-links', { partnership_id: 'ps1', product_id: 'other' })).status).toBe(404);
    expect((await call('buyer', 'GET', '/business/partner-links')).status).toBe(403);

    const coachSide = await call('coach', 'GET', '/instructor/partner-links');
    expect(coachSide.data.links).toHaveLength(2);
    expect(coachSide.data.links[0].business.id).toBe('biz');

    expect((await call('biz2', 'DELETE', `/business/partner-links/${link.id}`)).status).toBe(404);
    expect((await call('biz', 'DELETE', `/business/partner-links/${link.id}`)).status).toBe(200);
    expect((await call(null, 'GET', `/partner-links/${link.code}`)).status).toBe(404);
    expect((await call('biz', 'GET', '/business/partner-links')).data.links).toHaveLength(1);
  });

  it('counts deduped clicks and attributes saves only within 7 days of a click', async () => {
    const { data } = await call('biz', 'POST', '/business/partner-links', { partnership_id: 'ps1' });
    const code = data.link.code;

    const r = await call('buyer', 'GET', `/partner-links/${code.toLowerCase()}`);
    expect(r.status).toBe(200);
    expect(r.data).toEqual({ business_id: 'biz', product_id: null, instructor_id: 'coach' });
    await call('buyer', 'GET', `/p/${code}`); // deduped (30 min)
    await call('coach', 'GET', `/p/${code}`); // the partner's own click is not counted
    expect(one(`SELECT clicks FROM partner_links WHERE code = ?`, code).clicks).toBe(1);
    expect(one(`SELECT partner_clicks FROM storefront_daily_stats WHERE business_id = 'biz'`).partner_clicks).toBe(1);

    // Save within 7 days → attributed once (save/unsave/save does not double count).
    setNow('2026-11-24T12:00:00Z');
    await call('buyer', 'POST', '/products/p1/save');
    await call('buyer', 'DELETE', '/products/p1/save');
    await call('buyer', 'POST', '/products/p1/save');
    expect(one(`SELECT saves_attributed FROM partner_links WHERE code = ?`, code).saves_attributed).toBe(1);

    // A save of another business's product is never attributed.
    await call('buyer', 'POST', '/products/other/save');
    // Past the window → not attributed.
    setNow('2026-11-26T12:00:01Z');
    await call('buyer', 'POST', '/products/p2/save');
    expect(one(`SELECT saves_attributed FROM partner_links WHERE code = ?`, code).saves_attributed).toBe(1);

    const list = await call('biz', 'GET', '/business/partner-links');
    expect(list.data.links[0]).toMatchObject({ clicks: 1, saves_attributed: 1 });
  });
});

// ---------------------------------------------------------------------------
describe('cron + pure helpers', () => {
  it('prunes raw events older than 90 days and keeps aggregates', async () => {
    db.prepare(
      `INSERT INTO biz_events (type, business_id, product_id, viewer_id, source, day, created_at)
       VALUES ('product_view', 'biz', 'p1', 'buyer', 'feed', '2026-08-01', '2026-08-01 10:00:00')`
    ).run();
    db.prepare(
      `INSERT INTO product_daily_stats (product_id, day, business_id, views, saves) VALUES ('p1', '2026-08-01', 'biz', 1, 0)`
    ).run();
    await call('buyer', 'POST', '/events', { events: [view('p1')] });
    await runCron(env, new Date());
    expect(one(`SELECT COUNT(*) n FROM biz_events`).n).toBe(1);
    expect(one(`SELECT COUNT(*) n FROM product_daily_stats`).n).toBe(2);
  });

  it('periodDays, topPaths, normalizeSource', () => {
    const p = periodDays('7d', new Date('2026-11-18T12:00:00Z'));
    expect([p.start, p.end, p.prevStart, p.prevEnd]).toEqual(['2026-11-12', '2026-11-18', '2026-11-05', '2026-11-11']);
    expect(topPaths([['fitness:yoga', 'fitness'], ['unknown'], ['art']])).toEqual([
      { path: 'art', share: 0.5 },
      { path: 'fitness', share: 0.5 },
    ]);
    expect(normalizeSource('SEARCH')).toBe('search');
    expect(normalizeSource('evil')).toBe('other');
  });
});
