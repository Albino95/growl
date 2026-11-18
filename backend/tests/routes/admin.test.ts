/**
 * Admin hardening (wave 6, migration 0051) against a real in-memory SQLite built from
 * every migration: MFA enrollment scope, user list columns, refunds, mixed-order cancel,
 * GDPR purge job and export completeness, login audit, business reactivation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../../src/index';
import type { Env } from '../../src/types';
import { createSqliteD1, loadMigrationsSql, trackParams } from '../utils/sqliteD1';
import { hashPassword } from '../../src/utils/password';
import { signAdminToken } from '../../src/utils/adminJwt';
import { createAdminSession } from '../../src/utils/adminAuth';
import { signAccessToken } from '../../src/utils/jwt';
import { runPrivacyPurge } from '../../src/routes/admin/privacy';

const SCHEMA = loadMigrationsSql();
const D1_MAX_PARAMS = 100;
const PASSWORD = 'correct horse battery';

let db: ReturnType<typeof createSqliteD1>['raw'];
let env: Env;
let stats: { maxParams: number; maxSql: string };
let r2Deleted: string[];
let r2Objects: string[];

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

// --- RFC 6238 TOTP (same parameters as src/utils/totp.ts) -------------------------
function base32Decode(input: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of input.replace(/[\s=]/g, '').toUpperCase()) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}
async function totpNow(secret: string): Promise<string> {
  let counter = Math.floor(Date.now() / 1000 / 30);
  const msg = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) {
    msg[i] = counter & 0xff;
    counter = Math.floor(counter / 256);
  }
  const key = await crypto.subtle.importKey('raw', base32Decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, [
    'sign',
  ]);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const o = sig[sig.length - 1] & 0x0f;
  const code =
    ((sig[o] & 0x7f) << 24) | ((sig[o + 1] & 0xff) << 16) | ((sig[o + 2] & 0xff) << 8) | (sig[o + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

// --- fixtures ----------------------------------------------------------------------
async function addAdmin(id: string, role: string, opts: { mfa?: boolean } = {}) {
  db.prepare(
    `INSERT INTO admin_users (id, email, password_hash, role, status, mfa_enabled, mfa_secret, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, NULL, datetime('now'), datetime('now'))`
  ).run(id, `${id}@admin.test`, await hashPassword(PASSWORD), role, opts.mfa ? 1 : 0);
}

/** A full-scope session token, as issued before MFA enforcement (or for an MFA-enabled admin). */
async function adminToken(adminId: string): Promise<string> {
  const token = await signAdminToken(adminId, env);
  await createAdminSession(env, adminId, token, new Request('https://api.test/'));
  return token;
}

function addUser(id: string, meta: Record<string, unknown> = {}, extra: { business?: boolean } = {}) {
  db.prepare(
    `INSERT INTO users (id, email, password_hash, metadata, email_verified, is_business, timezone, created_at, updated_at)
     VALUES (?, ?, 'secret-hash', ?, 1, ?, 'UTC', datetime('now'), datetime('now'))`
  ).run(id, `${id}@example.com`, JSON.stringify({ username: id, ...meta }), extra.business ? 1 : 0);
}

function addProduct(id: string, sellerId: string, stock: number) {
  db.prepare(
    `INSERT INTO products (id, user_id, name, category, price, stock, created_at, updated_at)
     VALUES (?, ?, ?, 'fitness', 10, ?, datetime('now'), datetime('now'))`
  ).run(id, sellerId, `Product ${id}`, stock);
}

function addOrder(
  id: string,
  buyer: string,
  items: { product: string; qty: number }[],
  opts: { status?: string; total?: number; payment?: string } = {}
) {
  db.prepare(
    `INSERT INTO orders (id, user_id, status, total, shipping_address, metadata, payment_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '{}', ?, datetime('now'), datetime('now'))`
  ).run(
    id,
    buyer,
    opts.status || 'processing',
    opts.total ?? 100,
    JSON.stringify({ line1: '1 Secret Street', city: 'Luxembourg' }),
    opts.payment || 'paid'
  );
  for (const [i, it] of items.entries()) {
    db.prepare(
      `INSERT INTO order_items (id, order_id, product_id, quantity, price, created_at)
       VALUES (?, ?, ?, ?, 10, datetime('now'))`
    ).run(`${id}_i${i}`, id, it.product, it.qty);
  }
}

async function call(token: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const h: Record<string, string> = { 'Content-Type': 'application/json', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
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

const userCall = async (userId: string, method: string, path: string, body?: unknown) =>
  call(await signAccessToken(userId, env), method, path, body);

function one(sql: string, ...args: unknown[]): any {
  return db.prepare(sql).get(...args);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-18T12:00:00Z'));
  const sqlite = createSqliteD1(SCHEMA);
  db = sqlite.raw;
  const tracked = trackParams(sqlite.d1);
  stats = tracked.stats;
  const kv = new Map<string, string>();
  r2Deleted = [];
  r2Objects = [];
  env = {
    DB: tracked.d1 as any,
    KV: {
      get: async (k: string) => kv.get(k) ?? null,
      put: async (k: string, v: string) => void kv.set(k, v),
      delete: async (k: string) => void kv.delete(k),
    } as any,
    R2: {
      list: async ({ prefix }: { prefix: string }) => ({
        objects: r2Objects.filter((k) => k.startsWith(prefix)).map((key) => ({ key })),
        truncated: false,
      }),
      delete: async (keys: string | string[]) => {
        const list = Array.isArray(keys) ? keys : [keys];
        r2Deleted.push(...list);
        r2Objects = r2Objects.filter((k) => !list.includes(k));
      },
    } as any,
    ENVIRONMENT: 'test',
    JWT_SECRET: 'admin-test-secret',
    API_VERSION: 'v1',
    ADMIN_MFA_REQUIRED: 'true',
  } as Env;
});

afterEach(() => {
  expect(stats.maxParams, stats.maxSql).toBeLessThanOrEqual(D1_MAX_PARAMS);
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------------
describe('MFA enrollment scope', () => {
  beforeEach(async () => {
    await addAdmin('adm', 'super_admin');
    addUser('u1');
  });

  it('issues a restricted token that only reaches /me and /mfa/*', async () => {
    const login = await call(null, 'POST', '/admin/auth/login', { email: 'adm@admin.test', password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.data.must_enroll_mfa).toBe(true);
    expect(login.data.permissions).toEqual([]);
    const restricted = login.data.token;

    const blocked = await call(restricted, 'GET', '/admin/users');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('MFA_ENROLL_REQUIRED');
    expect((await call(restricted, 'GET', '/admin/dashboard/overview')).status).toBe(403);

    const me = await call(restricted, 'GET', '/admin/auth/me');
    expect(me.status).toBe(200);
    expect(me.data.must_enroll_mfa).toBe(true);
    expect(me.data.mfa_enabled).toBe(false);
    expect(me.data.permissions).toEqual([]);

    const setup = await call(restricted, 'POST', '/admin/auth/mfa/setup');
    expect(setup.status).toBe(200);
    const secret = setup.data.secret;
    expect(setup.data.otpauth_url).toMatch(/^otpauth:\/\/totp\//);

    const bad = await call(restricted, 'POST', '/admin/auth/mfa/enable', { secret, totp: '000000' });
    expect(bad.status).toBe(400);

    const enabled = await call(restricted, 'POST', '/admin/auth/mfa/enable', { secret, totp: await totpNow(secret) });
    expect(enabled.status).toBe(200);
    expect(enabled.data.recovery_codes).toHaveLength(10);
    const full = enabled.data.token;
    expect(full).toBeTruthy();

    // Restricted session is revoked; the new one has full access.
    expect((await call(restricted, 'GET', '/admin/auth/me')).status).toBe(401);
    expect((await call(full, 'GET', '/admin/users')).status).toBe(200);
    const me2 = await call(full, 'GET', '/admin/auth/me');
    expect(me2.data.mfa_enabled).toBe(true);
    expect(me2.data.must_enroll_mfa).toBe(false);
  });

  it('rejects full tokens of admins without MFA once MFA is required', async () => {
    const legacy = await adminToken('adm');
    const res = await call(legacy, 'GET', '/admin/users');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MFA_ENROLL_REQUIRED');
    // /me still answers so the client can route to setup after a refresh.
    const me = await call(legacy, 'GET', '/admin/auth/me');
    expect(me.status).toBe(200);
    expect(me.data.must_enroll_mfa).toBe(true);

    env.ADMIN_MFA_REQUIRED = 'false';
    expect((await call(legacy, 'GET', '/admin/users')).status).toBe(200);
  });

  it('requires the current code or password to re-enroll', async () => {
    const login = await call(null, 'POST', '/admin/auth/login', { email: 'adm@admin.test', password: PASSWORD });
    const setup = await call(login.data.token, 'POST', '/admin/auth/mfa/setup');
    const secret = setup.data.secret;
    const enabled = await call(login.data.token, 'POST', '/admin/auth/mfa/enable', {
      secret,
      totp: await totpNow(secret),
    });
    const full = enabled.data.token;

    const noProof = await call(full, 'POST', '/admin/auth/mfa/setup');
    expect(noProof.status).toBe(403);
    expect(noProof.body.error.code).toBe('CURRENT_FACTOR_REQUIRED');

    // Calling enable directly with a new secret is refused too.
    const other = (await call(full, 'POST', '/admin/auth/mfa/setup', { password: PASSWORD })).data.secret;
    const sneaky = await call(full, 'POST', '/admin/auth/mfa/enable', { secret: other, totp: await totpNow(other) });
    expect(sneaky.status).toBe(403);

    const withCode = await call(full, 'POST', '/admin/auth/mfa/enable', {
      secret: other,
      totp: await totpNow(other),
      current_totp: await totpNow(secret),
    });
    expect(withCode.status).toBe(200);

    // Login now needs the new factor.
    const noCode = await call(null, 'POST', '/admin/auth/login', { email: 'adm@admin.test', password: PASSWORD });
    expect(noCode.status).toBe(401);
    const ok = await call(null, 'POST', '/admin/auth/login', {
      email: 'adm@admin.test',
      password: PASSWORD,
      totp: await totpNow(other),
    });
    expect(ok.status).toBe(200);
    expect(ok.data.must_enroll_mfa).toBeUndefined();
  });
});

describe('login audit', () => {
  it('records unknown-email failures, successes and logouts', async () => {
    env.ADMIN_MFA_REQUIRED = 'false';
    await addAdmin('adm', 'support_admin');
    await call(null, 'POST', '/admin/auth/login', { email: 'nobody@admin.test', password: 'whatever1' });
    await call(null, 'POST', '/admin/auth/login', { email: 'adm@admin.test', password: 'wrong-pass' });
    const ok = await call(null, 'POST', '/admin/auth/login', { email: 'adm@admin.test', password: PASSWORD });
    expect(ok.status).toBe(200);
    await call(ok.data.token, 'POST', '/admin/auth/logout');

    const rows = db
      .prepare(`SELECT admin_id, action, reason_code, metadata FROM admin_audit_logs ORDER BY rowid`)
      .all() as any[];
    const unknown = rows.find((r) => r.reason_code === 'unknown_email');
    expect(unknown.admin_id).toBe('admin_system');
    expect(JSON.parse(unknown.metadata).email).toBe('nobody@admin.test');
    expect(rows.map((r) => r.action)).toEqual(
      expect.arrayContaining(['admin.login.failed', 'admin.login.success', 'admin.logout'])
    );
    // The system actor itself can never sign in.
    const sys = await call(null, 'POST', '/admin/auth/login', { email: 'system@admin.invalid', password: '!' });
    expect(sys.status).toBe(401);
  });
});

describe('users list and detail', () => {
  it('never returns secrets and trims metadata; detail views are audited', async () => {
    await addAdmin('adm', 'support_admin', { mfa: true });
    const token = await adminToken('adm');
    addUser('alice', { mutedUsers: ['x'], pending_invite_code: 'SECRET', full_name: 'Alice Private', bio: 'hi' });
    db.prepare(`UPDATE users SET password_reset_token_hash = 'resetsecret', invite_code = 'INV1' WHERE id = 'alice'`).run();

    const list = await call(token, 'GET', '/admin/users?q=ali');
    expect(list.status).toBe(200);
    expect(list.data.total).toBe(1);
    const row = list.data.users[0];
    expect(Object.keys(row)).not.toContain('password_hash');
    expect(JSON.stringify(list.data)).not.toMatch(/secret-hash|resetsecret|INV1|SECRET|Alice Private|mutedUsers/);
    expect(row.metadata).toEqual({ username: 'alice', bio: 'hi' });

    const detail = await call(token, 'GET', '/admin/users/alice');
    expect(detail.status).toBe(200);
    expect(JSON.stringify(detail.data)).not.toMatch(/secret-hash|resetsecret|INV1|SECRET|password_hash/);
    const audit = one(`SELECT action, target_id FROM admin_audit_logs WHERE action = 'user.view'`);
    expect(audit).toEqual({ action: 'user.view', target_id: 'alice' });

    // LIKE wildcards in search are literal.
    expect((await call(token, 'GET', '/admin/users?q=%25')).data.total).toBe(0);
  });
});

describe('refunds', () => {
  let finance: string;
  beforeEach(async () => {
    await addAdmin('fin', 'finance_admin', { mfa: true });
    await addAdmin('ops', 'business_ops_admin', { mfa: true });
    finance = await adminToken('fin');
    addUser('buyer');
    addUser('shop', {}, { business: true });
    addProduct('p1', 'shop', 5);
    addOrder('o1', 'buyer', [{ product: 'p1', qty: 2 }], { total: 100 });
  });
  const key = (k: string) => ({ 'Idempotency-Key': `refund-key-${k}` });

  it('refuses while payments are disabled', async () => {
    const res = await call(finance, 'POST', '/admin/business/orders/o1/refund', { amount: 10, reasonText: 'damaged' }, key('a'));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PAYMENTS_DISABLED');
    expect(one(`SELECT refund_amount FROM orders WHERE id = 'o1'`).refund_amount).toBe(0);
  });

  it('partial, idempotent, capped, then full with cancel + restock, then blocked', async () => {
    env.STRIPE_SECRET_KEY = 'sk_test_x';
    const first = await call(finance, 'POST', '/admin/business/orders/o1/refund', { amount: 30, reasonText: 'late' }, key('1'));
    expect(first.status).toBe(200);
    expect(first.data).toMatchObject({ refund_amount: 30, total_refunded: 30, remaining: 70, payment_status: 'paid' });

    const replay = await call(finance, 'POST', '/admin/business/orders/o1/refund', { amount: 30, reasonText: 'late' }, key('1'));
    expect(replay.status).toBe(200);
    expect(replay.data.replayed).toBe(true);
    expect(one(`SELECT refund_amount FROM orders WHERE id = 'o1'`).refund_amount).toBe(30);

    const over = await call(finance, 'POST', '/admin/business/orders/o1/refund', { amount: 80, reasonText: 'too much' }, key('2'));
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe('REFUND_EXCEEDS_REMAINING');

    const noKey = await call(finance, 'POST', '/admin/business/orders/o1/refund', { amount: 5, reasonText: 'no key' });
    expect(noKey.status).toBe(400);

    const rest = await call(finance, 'POST', '/admin/business/orders/o1/refund', { reasonText: 'cancel all' }, key('3'));
    expect(rest.status).toBe(200);
    expect(rest.data).toMatchObject({ refund_amount: 70, remaining: 0, payment_status: 'refunded', status: 'cancelled', restocked: true });
    expect(one(`SELECT stock FROM products WHERE id = 'p1'`).stock).toBe(7);
    expect(one(`SELECT status, payment_status FROM orders WHERE id = 'o1'`)).toEqual({ status: 'cancelled', payment_status: 'refunded' });

    const again = await call(finance, 'POST', '/admin/business/orders/o1/refund', { amount: 1, reasonText: 'again' }, key('4'));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_REFUNDED');
    expect(Number(one(`SELECT COUNT(*) AS n FROM admin_order_refunds`).n)).toBe(2);
  });

  it('does not cancel or restock shipped orders on full refund', async () => {
    env.STRIPE_SECRET_KEY = 'sk_test_x';
    addOrder('o2', 'buyer', [{ product: 'p1', qty: 1 }], { total: 20, status: 'shipped' });
    const res = await call(finance, 'POST', '/admin/business/orders/o2/refund', { reasonText: 'lost' }, key('s'));
    expect(res.data).toMatchObject({ status: 'shipped', payment_status: 'refunded', restocked: false });
    expect(one(`SELECT stock FROM products WHERE id = 'p1'`).stock).toBe(5);
  });

  it('business_ops_admin cannot refund (role and permission agree)', async () => {
    env.STRIPE_SECRET_KEY = 'sk_test_x';
    const ops = await adminToken('ops');
    const res = await call(ops, 'POST', '/admin/business/orders/o1/refund', { amount: 10, reasonText: 'x y z' }, key('o'));
    expect(res.status).toBe(403);
  });

  it('orders list is paginated and carries no shipping address', async () => {
    addOrder('o3', 'buyer', [{ product: 'p1', qty: 1 }]);
    const res = await call(finance, 'GET', '/admin/business/orders?limit=1');
    expect(res.status).toBe(200);
    expect(res.data.orders).toHaveLength(1);
    expect(res.data.total).toBe(2);
    expect(res.data.has_more).toBe(true);
    expect(JSON.stringify(res.data)).not.toMatch(/Secret Street/);
    const detail = await call(finance, 'GET', '/admin/business/orders/o1');
    expect(detail.data.shipping_address.line1).toBe('1 Secret Street');
  });
});

describe('seller cancel', () => {
  beforeEach(() => {
    addUser('buyer');
    addUser('shopA', {}, { business: true });
    addUser('shopB', {}, { business: true });
    addProduct('pa', 'shopA', 5);
    addProduct('pb', 'shopB', 5);
  });

  it('refuses to cancel an order that also holds another shop’s items', async () => {
    addOrder('mixed', 'buyer', [
      { product: 'pa', qty: 1 },
      { product: 'pb', qty: 2 },
    ]);
    const res = await userCall('shopA', 'PATCH', '/marketplace/orders/mixed/status', { status: 'cancelled' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('MIXED_ORDER');
    expect(one(`SELECT status FROM orders WHERE id = 'mixed'`).status).toBe('processing');
    expect(one(`SELECT stock FROM products WHERE id = 'pb'`).stock).toBe(5);
  });

  it('cancels an own-only order and restocks only its items', async () => {
    addOrder('own', 'buyer', [{ product: 'pa', qty: 3 }]);
    const res = await userCall('shopA', 'PATCH', '/marketplace/orders/own/status', { status: 'cancelled' });
    expect(res.status).toBe(200);
    expect(one(`SELECT stock FROM products WHERE id = 'pa'`).stock).toBe(8);
    expect(one(`SELECT stock FROM products WHERE id = 'pb'`).stock).toBe(5);
  });
});

describe('business reactivation', () => {
  it('finds deactivated accounts for detail and reactivation', async () => {
    await addAdmin('ops', 'business_ops_admin', { mfa: true });
    const token = await adminToken('ops');
    addUser('shop', {}, { business: false });
    db.prepare(
      `INSERT INTO business_profiles (user_id, display_name, contact_email, field_of_operation, verification_status, created_at, updated_at)
       VALUES ('shop', 'Shop', 'c@shop.test', 'fitness', 'verified', datetime('now'), datetime('now'))`
    ).run();
    expect((await call(token, 'GET', '/admin/business/accounts/shop')).status).toBe(200);
    const list = await call(token, 'GET', '/admin/business/accounts?status=deactivated&q=shop');
    expect(list.data.accounts.map((a: any) => a.id)).toEqual(['shop']);
    const res = await call(token, 'PATCH', '/admin/business/accounts/shop', { deactivate: false });
    expect(res.status).toBe(200);
    expect(one(`SELECT is_business FROM users WHERE id = 'shop'`).is_business).toBe(1);
    expect(one(`SELECT action FROM admin_audit_logs WHERE target_id = 'shop'`).action).toBe('business.account_reactivate');
  });
});

describe('GDPR purge job', () => {
  function markDeleted(userId: string, when: string) {
    db.prepare(
      `INSERT INTO user_account_states (user_id, status, deletion_requested_at, updated_at)
       VALUES (?, 'deleted_pending', ?, ?)`
    ).run(userId, when, when);
  }

  it('hard-deletes after the grace period, with media, and leaves recent/rejected ones', async () => {
    db.exec('PRAGMA foreign_keys = ON');
    addUser('old');
    addUser('recent');
    addUser('kept');
    addUser('shop', {}, { business: true });
    addProduct('p1', 'shop', 1);
    addOrder('ord', 'kept', [{ product: 'p1', qty: 1 }]);
    db.prepare(`UPDATE orders SET business_id = 'old' WHERE id = 'ord'`).run();
    db.prepare(
      `INSERT INTO posts (id, user_id, image_url, caption, category, created_at, updated_at)
       VALUES ('post1', 'old', 'x', 'hello', 'fitness', datetime('now'), datetime('now'))`
    ).run();
    db.prepare(`INSERT INTO growth_groups (id, slug, name, path_key) VALUES ('g1', 'g1', 'G', 'fitness')`).run();
    db.prepare(`INSERT INTO growth_group_members (group_id, user_id) VALUES ('g1', 'old')`).run();
    markDeleted('old', '2026-11-01 10:00:00');
    markDeleted('recent', '2026-11-16 10:00:00');
    markDeleted('kept', '2026-11-01 10:00:00');
    db.prepare(
      `INSERT INTO privacy_requests (id, user_id, request_type, status, created_at, updated_at)
       VALUES ('pr1', 'kept', 'delete', 'rejected', datetime('now'), datetime('now'))`
    ).run();
    r2Objects = ['proof/old/a.jpg', 'post/old/b.jpg', 'avatar/old/c.jpg', 'post/recent/d.jpg'];

    const purged = await runPrivacyPurge(env, new Date('2026-11-18T12:00:00Z'));
    expect(purged).toBe(1);
    expect(one(`SELECT id FROM users WHERE id = 'old'`)).toBeUndefined();
    expect(one(`SELECT id FROM posts WHERE id = 'post1'`)).toBeUndefined();
    expect(one(`SELECT user_id FROM growth_group_members WHERE user_id = 'old'`)).toBeUndefined();
    expect(one(`SELECT business_id FROM orders WHERE id = 'ord'`).business_id).toBeNull();
    expect(r2Deleted.sort()).toEqual(['avatar/old/c.jpg', 'post/old/b.jpg', 'proof/old/a.jpg']);
    expect(one(`SELECT id FROM users WHERE id = 'recent'`)).toBeTruthy();
    expect(one(`SELECT id FROM users WHERE id = 'kept'`)).toBeTruthy();
    expect(one(`SELECT admin_id, action FROM admin_audit_logs WHERE target_id = 'old'`)).toEqual({
      admin_id: 'admin_system',
      action: 'privacy.purged',
    });

    // Idempotent: nothing left to do.
    expect(await runPrivacyPurge(env, new Date('2026-11-18T13:00:00Z'))).toBe(0);
  });

  it('self-service deletion starts the grace clock', async () => {
    addUser('me');
    const res = await userCall('me', 'POST', '/privacy/delete-account', { confirm: 'DELETE' });
    expect(res.status).toBe(200);
    const st = one(`SELECT status, deletion_requested_at FROM user_account_states WHERE user_id = 'me'`);
    expect(st.status).toBe('deleted_pending');
    expect(st.deletion_requested_at).toBeTruthy();
  });
});

describe('admin privacy requests and export', () => {
  let token: string;
  beforeEach(async () => {
    await addAdmin('sup', 'support_admin', { mfa: true });
    token = await adminToken('sup');
  });

  it('exports every section, excludes reporters, and audits the export', async () => {
    db.exec('PRAGMA foreign_keys = OFF');
    addUser('m');
    addUser('other');
    addUser('coach');
    const ins = (sql: string, ...args: unknown[]) => db.prepare(sql).run(...args);
    ins(`INSERT INTO posts (id, user_id, image_url, caption, category, created_at, updated_at) VALUES ('p1','m','x','my post','fitness',datetime('now'),datetime('now'))`);
    ins(`INSERT INTO post_engagement (id, post_id, user_id, type, content, created_at) VALUES ('c1','p1','m','comment','nice',datetime('now'))`);
    ins(`INSERT INTO journal_entries (id, user_id, title, content, created_at, updated_at) VALUES ('j1','m','t','dear diary',datetime('now'),datetime('now'))`);
    ins(`INSERT INTO daily_checkins (id, user_id, day, tz, mood, created_at, updated_at) VALUES ('d1','m','2026-11-17','UTC',3,datetime('now'),datetime('now'))`);
    ins(`INSERT INTO conversations (id, user_a, user_b, created_at, updated_at) VALUES ('cv','m','other',datetime('now'),datetime('now'))`);
    ins(`INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES ('msg1','cv','m','hello from m',datetime('now'))`);
    ins(`INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES ('msg2','cv','other','private reply',datetime('now'))`);
    ins(`INSERT INTO proofs (id, user_id, kind, text, media_key, context_type, context_id, day, created_at) VALUES ('pf1','m','photo','did it','proof/m/x.jpg','checkin','d1','2026-11-17',datetime('now'))`);
    ins(`INSERT INTO growth_groups (id, slug, name, path_key) VALUES ('g1','g1','Runners','fitness')`);
    ins(`INSERT INTO growth_group_members (group_id, user_id) VALUES ('g1','m')`);
    ins(`INSERT INTO cohorts (id, coach_id, title, start_date) VALUES ('co1','coach','Spring','2026-11-01')`);
    ins(`INSERT INTO cohort_members (cohort_id, user_id) VALUES ('co1','m')`);
    addUser('shop', {}, { business: true });
    addProduct('pr', 'shop', 3);
    addOrder('o1', 'm', [{ product: 'pr', qty: 1 }]);
    ins(
      `INSERT INTO coaching_contracts (id, proposal_id, inquiry_id, instructor_id, client_id, weeks, sessions_per_week, weekly_fee_eur, total_eur, status, started_at, ends_at, created_at)
       VALUES ('cc1','pp','iq','coach','m',4,2,50,200,'active','2026-11-01','2026-11-29',datetime('now'))`
    );
    ins(`INSERT INTO reports (id, reporter_id, target_id, target_type, reason, status, created_at) VALUES ('r1','m','other','user','spam','pending',datetime('now'))`);
    ins(`INSERT INTO reports (id, reporter_id, target_id, target_type, reason, status, created_at) VALUES ('r2','other','m','user','rude','pending',datetime('now'))`);

    const res = await call(token, 'POST', '/admin/privacy/users/m/export');
    expect(res.status).toBe(200);
    const d = res.data;
    expect(d.profile.id).toBe('m');
    expect(d.posts).toHaveLength(1);
    expect(d.comments).toHaveLength(1);
    expect(d.journal_entries).toHaveLength(1);
    expect(d.checkins).toHaveLength(1);
    expect(d.messages_sent.map((x: any) => x.id)).toEqual(['msg1']);
    expect(d.proofs).toHaveLength(1);
    expect(d.proofs[0].has_media).toBe(1);
    expect(d.memberships.groups[0].name).toBe('Runners');
    expect(d.memberships.cohorts[0].title).toBe('Spring');
    expect(d.orders[0].items).toHaveLength(1);
    expect(d.coaching_contracts[0].role).toBe('client');
    expect(d.reports_filed.map((r: any) => r.id)).toEqual(['r1']);
    const text = JSON.stringify(d);
    expect(text).not.toMatch(/"r2"|rude|private reply|password_hash|proof\/m\/x\.jpg/);
    expect(one(`SELECT action FROM admin_audit_logs WHERE target_id = 'm'`).action).toBe('privacy.export');
  });

  it('paginates/searches requests and refuses to change finished ones', async () => {
    addUser('m');
    addUser('n');
    const ins = (id: string, user: string, status: string) =>
      db.prepare(
        `INSERT INTO privacy_requests (id, user_id, request_type, status, created_at, updated_at)
         VALUES (?, ?, 'export', ?, datetime('now'), datetime('now'))`
      ).run(id, user, status);
    ins('a', 'm', 'pending');
    ins('b', 'n', 'completed');
    const list = await call(token, 'GET', '/admin/privacy/requests?q=n%40example&limit=10');
    expect(list.data.requests.map((r: any) => r.id)).toEqual(['b']);
    expect(list.data.requests[0].finished).toBe(true);
    const res = await call(token, 'PATCH', '/admin/privacy/requests/b', { status: 'rejected' });
    expect(res.status).toBe(409);
    expect((await call(token, 'PATCH', '/admin/privacy/requests/a', { status: 'completed' })).status).toBe(200);
  });
});
