/**
 * Wave 6 integration: buyer ↔ business messaging rules, auto-reply flag, journal reports
 * filed against the author, explicit empty product images, per-account sign-in limit.
 */
import { describe, it, expect } from 'vitest';
import { createMockEnv } from '../utils/test-helpers';
import type { Env } from '../../src/types';
import { canMessagePeer, messagingAccess, isAutoMessage } from '../../src/routes/messages';
import { reportContent } from '../../src/routes/friends';
import { signIn } from '../../src/routes/auth';
import { updateProductSchema } from '../../src/utils/validation';

const ME = 'test-user';

type Route = {
  match: (sql: string, args: unknown[]) => boolean;
  first?: (args: unknown[]) => unknown;
  all?: (args: unknown[]) => unknown[];
};
type Call = { sql: string; args: unknown[] };

function mockDb(routes: Route[]) {
  const calls: Call[] = [];
  const exec = (sql: string, args: unknown[]) => {
    calls.push({ sql, args });
    return routes.find((r) => r.match(sql, args));
  };
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...next: unknown[]) => stmt(sql, next),
    first: async () => exec(sql, args)?.first?.(args) ?? null,
    all: async () => ({ results: exec(sql, args)?.all?.(args) ?? [] }),
    run: async () => (exec(sql, args), { success: true, meta: { changes: 1 } }),
  });
  return { db: { prepare: (sql: string) => stmt(sql) }, calls };
}

const has = (...parts: string[]) => (sql: string) => parts.every((p) => sql.includes(p));

type World = {
  business?: string[];
  policies?: Record<string, string>;
  blocked?: boolean;
  friends?: boolean;
  conversation?: boolean;
  order?: boolean;
  interest?: boolean;
  wroteFirst?: boolean;
};

function worldRoutes(w: World): Route[] {
  return [
    { match: has("type = 'block'"), first: () => (w.blocked ? { ok: 1 } : null) },
    { match: has("type = 'friend'"), first: () => (w.friends ? { ok: 1 } : null) },
    {
      match: has('SELECT is_business FROM users WHERE id'),
      first: (args) => ({ is_business: (w.business || []).includes(String(args[0])) ? 1 : 0 }),
    },
    {
      match: has('SELECT dm_policy FROM users'),
      first: (args) => ({ dm_policy: w.policies?.[String(args[0])] ?? 'everyone' }),
    },
    { match: has('FROM messages m JOIN conversations c'), first: () => (w.wroteFirst ? { ok: 1 } : null) },
    { match: has('FROM conversations WHERE user_a = ? AND user_b = ?'), first: () => (w.conversation ? { id: 'conv' } : null) },
    { match: has('FROM orders o'), first: () => (w.order ? { id: 'o1' } : null) },
    { match: has('FROM product_questions', 'product_saves'), first: () => (w.interest ? { ok: 1 } : null) },
  ];
}

function envWith(db: unknown, kv?: Partial<Env['KV']>): Env {
  const env = createMockEnv();
  env.DB = db as any;
  if (kv) env.KV = { ...env.KV, ...kv } as any;
  return env;
}

describe('buyer ↔ business messaging', () => {
  it('lets a customer write to any business, but not to a stranger', async () => {
    const shop = mockDb(worldRoutes({ business: ['shop'] }));
    expect(await canMessagePeer(envWith(shop.db), 'buyer', 'shop', { is_business: false })).toBe(true);
    const person = mockDb(worldRoutes({ business: [] }));
    expect(await canMessagePeer(envWith(person.db), 'buyer', 'stranger', { is_business: false })).toBe(false);
  });

  it('blocks win either way', async () => {
    const { db } = mockDb(worldRoutes({ business: ['shop'], blocked: true, conversation: true }));
    expect(await canMessagePeer(envWith(db), 'buyer', 'shop', { is_business: false })).toBe(false);
    expect(await canMessagePeer(envWith(db), 'shop', 'buyer', { is_business: true })).toBe(false);
    expect(await messagingAccess(envWith(db), 'buyer', 'shop', { is_business: false })).toBe('blocked');
  });

  it('a business needs a reason to reach a customer', async () => {
    const cold = mockDb(worldRoutes({ business: ['shop'] }));
    expect(await canMessagePeer(envWith(cold.db), 'shop', 'buyer', { is_business: true })).toBe(false);
    for (const reason of ['conversation', 'order', 'interest'] as const) {
      const { db } = mockDb(worldRoutes({ business: ['shop'], [reason]: true }));
      expect(await canMessagePeer(envWith(db), 'shop', 'buyer', { is_business: true })).toBe(true);
    }
  });

  it('only looks at questions / saves from the last 30 days', async () => {
    const { db, calls } = mockDb(worldRoutes({ business: ['shop'] }));
    await canMessagePeer(envWith(db), 'shop', 'buyer', { is_business: true });
    const q = calls.find((c) => c.sql.includes('FROM product_questions'));
    expect(q).toBeTruthy();
    const since = Date.parse(String(q!.args[2]));
    const days = (Date.now() - since) / 86400000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });

  it("treats a business's 'friends' policy as open to customers and honours 'nobody'", async () => {
    const friendsOnly = mockDb(worldRoutes({ business: ['shop'], policies: { shop: 'friends' } }));
    expect(await messagingAccess(envWith(friendsOnly.db), 'buyer', 'shop', { is_business: false })).toBe('ok');
    const closed = mockDb(worldRoutes({ business: ['shop'], policies: { shop: 'nobody' } }));
    expect(await messagingAccess(envWith(closed.db), 'buyer', 'shop', { is_business: false })).toBe('not_accepting');
  });

  it("lets a business reply to a customer who wrote first, despite the customer's policy", async () => {
    const replied = mockDb(
      worldRoutes({ business: ['shop'], conversation: true, wroteFirst: true, policies: { buyer: 'friends' } })
    );
    expect(await messagingAccess(envWith(replied.db), 'shop', 'buyer', { is_business: true })).toBe('ok');
    const cold = mockDb(worldRoutes({ business: ['shop'], order: true, policies: { buyer: 'friends' } }));
    expect(await messagingAccess(envWith(cold.db), 'shop', 'buyer', { is_business: true })).toBe('not_accepting');
  });
});

describe('auto-reply flag', () => {
  it('reads metadata.auto', () => {
    expect(isAutoMessage('{"auto":true}')).toBe(true);
    expect(isAutoMessage('{"auto":false}')).toBe(false);
    expect(isAutoMessage(null)).toBe(false);
    expect(isAutoMessage(undefined)).toBe(false);
    expect(isAutoMessage('not json')).toBe(false);
  });
});

function meRoute(): Route {
  return {
    match: has('LEFT JOIN user_account_states'),
    first: () => ({
      id: ME,
      email: 'me@example.com',
      metadata: '{}',
      points: 0,
      is_instructor: 0,
      is_business: 0,
      acct_status: null,
      acct_suspended_until: null,
    }),
  };
}

describe('journal reports', () => {
  it('files a journal report against the author with the entry in details', async () => {
    const { db, calls } = mockDb([
      meRoute(),
      {
        match: has('FROM journal_entries WHERE id'),
        first: () => ({ id: 'j1', user_id: 'author', body: 'Something hurtful written here' }),
      },
    ]);
    const res = await reportContent(
      new Request('https://api.test/api/v1/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
        body: JSON.stringify({ targetType: 'journal', targetId: 'j1', reason: 'harassment' }),
      }),
      envWith(db)
    );
    expect(res.status).toBe(200);
    const insert = calls.find((c) => c.sql.includes('INSERT INTO reports'));
    expect(insert).toBeTruthy();
    const [, reporter, targetId, targetType, reason, details] = insert!.args as string[];
    expect(reporter).toBe(ME);
    expect(targetId).toBe('author');
    expect(targetType).toBe('user');
    expect(reason).toBe('harassment');
    expect(JSON.parse(details)).toMatchObject({
      kind: 'journal',
      item_id: 'j1',
      userId: 'author',
      excerpt: 'Something hurtful written here',
    });
  });

  it('keeps post reports as posts', async () => {
    const { db, calls } = mockDb([
      meRoute(),
      { match: has('FROM posts WHERE id'), first: () => ({ id: 'p1', user_id: 'author' }) },
    ]);
    const res = await reportContent(
      new Request('https://api.test/api/v1/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
        body: JSON.stringify({ targetType: 'post', targetId: 'p1', reason: 'spam' }),
      }),
      envWith(db)
    );
    expect(res.status).toBe(200);
    const insert = calls.find((c) => c.sql.includes('INSERT INTO reports'))!;
    expect(insert.args[2]).toBe('p1');
    expect(insert.args[3]).toBe('post');
  });
});

describe('product images on update', () => {
  it('clears on an explicit empty list and leaves omitted alone', () => {
    expect(updateProductSchema.parse({ images: [] }).images).toEqual([]);
    expect(updateProductSchema.parse({ images: null }).images).toEqual([]);
    expect(updateProductSchema.parse({ name: 'x' }).images).toBeUndefined();
    // Only local picker URIs (upload still pending) → unchanged, never a wipe.
    expect(updateProductSchema.parse({ images: ['file:///tmp/a.jpg'] }).images).toBeUndefined();
    expect(updateProductSchema.parse({ images: ['https://cdn.test/a.jpg', 'ph://x'] }).images).toEqual([
      'https://cdn.test/a.jpg',
    ]);
  });
});

describe('sign-in per-account rate limit', () => {
  it('returns 429 once an account has 10 attempts in the window', async () => {
    const { db, calls } = mockDb([]);
    const env = envWith(db, {
      get: (async (key: string) => (key.startsWith('rl:signin:email:someone@example.com:') ? '10' : null)) as any,
      put: (async () => {}) as any,
    });
    const res = await signIn(
      new Request('https://api.test/api/v1/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'Someone@Example.com', password: 'whatever-123' }),
      }),
      env
    );
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('RATE_LIMITED');
    expect(calls.some((c) => c.sql.includes('FROM users WHERE email'))).toBe(false);
  });
});
