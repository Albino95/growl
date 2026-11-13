/**
 * POST /waitlist (landing early-access signups) against an in-memory SQLite built
 * from every migration: validation, dedupe without enumeration, rate limits.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../../src/index';
import type { Env } from '../../src/types';
import { createSqliteD1, loadMigrationsSql } from '../utils/sqliteD1';
import { WAITLIST_LIMIT_PER_CLIENT } from '../../src/routes/waitlist';

const SCHEMA = loadMigrationsSql();
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

let db: ReturnType<typeof createSqliteD1>['raw'];
let env: Env;

beforeEach(() => {
  const sqlite = createSqliteD1(SCHEMA);
  db = sqlite.raw;
  const kv = new Map<string, string>();
  env = {
    DB: sqlite.d1 as any,
    KV: {
      get: async (k: string) => kv.get(k) ?? null,
      put: async (k: string, v: string) => void kv.set(k, v),
      delete: async (k: string) => void kv.delete(k),
    } as any,
    ENVIRONMENT: 'test',
    JWT_SECRET: 'waitlist-test-secret',
    API_VERSION: 'v1',
  } as Env;
});

async function join(body: unknown, headers: Record<string, string> = {}) {
  const res = await worker.fetch(
    new Request('https://api.test/api/v1/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    env,
    ctx
  );
  return { status: res.status, body: (await res.json()) as any };
}

function rows(): any[] {
  return db.prepare('SELECT email, platform, source FROM waitlist_signups ORDER BY email, platform').all();
}

describe('POST /waitlist', () => {
  it('stores a signup with the email lowercased and trimmed', async () => {
    const res = await join({ email: '  Ana@Example.COM ', platform: 'android', source: 'landing-hero' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ ok: true });
    expect(rows()).toEqual([{ email: 'ana@example.com', platform: 'android', source: 'landing-hero' }]);
  });

  it('works without a source', async () => {
    const res = await join({ email: 'b@example.com', platform: 'web' });
    expect(res.status).toBe(200);
    expect(rows()).toEqual([{ email: 'b@example.com', platform: 'web', source: null }]);
  });

  it('dedupes per (email, platform) and answers the same either way', async () => {
    const first = await join({ email: 'c@example.com', platform: 'android' });
    const again = await join({ email: 'C@example.com', platform: 'android', source: 'footer' });
    expect(first.status).toBe(200);
    expect(again.status).toBe(200);
    expect(again.body.data).toEqual(first.body.data);
    await join({ email: 'c@example.com', platform: 'ios' });
    expect(rows()).toEqual([
      { email: 'c@example.com', platform: 'android', source: null },
      { email: 'c@example.com', platform: 'ios', source: null },
    ]);
  });

  it.each([
    [{ email: 'not-an-email', platform: 'android' }],
    [{ email: 'd@example.com' }],
    [{ email: 'd@example.com', platform: 'windows' }],
    [{ email: `${'a'.repeat(250)}@example.com`, platform: 'android' }],
    [{ email: 'd@example.com', platform: 'android', source: 'x'.repeat(41) }],
    [{ platform: 'android' }],
  ])('rejects invalid input %j', async (body) => {
    const res = await join(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(rows()).toEqual([]);
  });

  it('rejects malformed JSON', async () => {
    const res = await join('{nope');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('rate limits per visitor IP', async () => {
    for (let i = 0; i < WAITLIST_LIMIT_PER_CLIENT; i++) {
      expect((await join({ email: `r${i}@example.com`, platform: 'android' })).status).toBe(200);
    }
    const limited = await join({ email: 'over@example.com', platform: 'android' });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(rows().some((r) => r.email === 'over@example.com')).toBe(false);

    // A different direct caller is unaffected.
    const other = await join({ email: 'other@example.com', platform: 'android' }, { 'CF-Connecting-IP': '198.51.100.2' });
    expect(other.status).toBe(200);
  });

  it('limits proxied visitors separately via the forwarded client IP', async () => {
    const proxy = { 'CF-Connecting-IP': '76.76.21.21' };
    for (let i = 0; i < WAITLIST_LIMIT_PER_CLIENT; i++) {
      await join({ email: `p${i}@example.com`, platform: 'android' }, { ...proxy, 'X-Grow-Client-IP': '192.0.2.1' });
    }
    const sameVisitor = await join(
      { email: 'p-over@example.com', platform: 'android' },
      { ...proxy, 'X-Grow-Client-IP': '192.0.2.1' }
    );
    expect(sameVisitor.status).toBe(429);
    const nextVisitor = await join(
      { email: 'q@example.com', platform: 'android' },
      { ...proxy, 'X-Grow-Client-IP': '192.0.2.2' }
    );
    expect(nextVisitor.status).toBe(200);
  });
});

describe('migration 0035', () => {
  it('enforces the platform check and (email, platform) uniqueness', () => {
    expect(() =>
      db.prepare(`INSERT INTO waitlist_signups (id, email, platform) VALUES ('a', 'x@y.z', 'desktop')`).run()
    ).toThrow();
    db.prepare(`INSERT INTO waitlist_signups (id, email, platform) VALUES ('b', 'x@y.z', 'android')`).run();
    expect(() =>
      db.prepare(`INSERT INTO waitlist_signups (id, email, platform) VALUES ('c', 'x@y.z', 'android')`).run()
    ).toThrow();
    const row = db.prepare(`SELECT created_at FROM waitlist_signups WHERE id = 'b'`).get() as any;
    expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});
