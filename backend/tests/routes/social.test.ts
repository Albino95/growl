/**
 * Wave 3 social (migration 0040): message unsend permissions + placeholder, and
 * GET /me/circle/today timezone window + friendship/block filter.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../../src/index';
import type { Env } from '../../src/types';
import { createSqliteD1, loadMigrationsSql, trackParams } from '../utils/sqliteD1';
import { signAccessToken } from '../../src/utils/jwt';

const SCHEMA = loadMigrationsSql();
const D1_MAX_PARAMS = 100;

let db: ReturnType<typeof createSqliteD1>['raw'];
let env: Env;
let stats: { maxParams: number; maxSql: string };

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

function setNow(iso: string) {
  vi.setSystemTime(new Date(iso));
}

function addUser(id: string, meta: Record<string, unknown> = {}) {
  db.prepare(
    `INSERT INTO users (id, email, password_hash, metadata, email_verified, timezone, created_at, updated_at)
     VALUES (?, ?, 'x', ?, 1, 'UTC', datetime('now'), datetime('now'))`
  ).run(id, `${id}@example.com`, JSON.stringify({ username: id, ...meta }));
}

function befriend(a: string, b: string) {
  for (const [x, y] of [
    [a, b],
    [b, a],
  ]) {
    db.prepare(
      `INSERT INTO user_relationships (id, user_id, target_user_id, type, created_at, source)
       VALUES (?, ?, ?, 'friend', datetime('now'), 'manual')`
    ).run(`rel_${x}_${y}`, x, y);
  }
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
  return { status: res.status, body: json, data: json.data, headers: res.headers };
}

function count(sql: string, ...args: unknown[]): number {
  return Number((db.prepare(sql).get(...args) as any).n);
}

async function openConversation(a: string, b: string): Promise<string> {
  const res = await call(a, 'POST', '/messages/conversations', { targetUserId: b });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.data.conversation.id;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  setNow('2026-11-02T12:00:00Z');
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
    JWT_SECRET: 'wave1-test-secret',
    API_VERSION: 'v1',
  } as Env;
});

afterEach(() => {
  expect(stats.maxParams, stats.maxSql).toBeLessThanOrEqual(D1_MAX_PARAMS);
  vi.useRealTimers();
});


function setTz(id: string, tz: string) {
  db.prepare(`UPDATE users SET timezone = ? WHERE id = ?`).run(tz, id);
}

function checkin(userId: string, createdAtUtc: string, day = createdAtUtc.slice(0, 10)) {
  db.prepare(
    `INSERT INTO daily_checkins (id, user_id, day, tz, created_at, updated_at) VALUES (?, ?, ?, 'UTC', ?, ?)`
  ).run(`ci_${userId}_${day}`, userId, day, createdAtUtc, createdAtUtc);
}

function block(a: string, b: string) {
  db.prepare(
    `INSERT INTO user_relationships (id, user_id, target_user_id, type, created_at, source)
     VALUES (?, ?, ?, 'block', datetime('now'), 'manual')`
  ).run(`blk_${a}_${b}`, a, b);
}

describe('message unsend', () => {
  let conv: string;
  let mid: string;
  beforeEach(async () => {
    addUser('a');
    addUser('b');
    addUser('c');
    befriend('a', 'b');
    conv = await openConversation('a', 'b');
    const sent = await call('a', 'POST', `/messages/conversations/${conv}/messages`, { body: 'secret' });
    expect(sent.status).toBe(201);
    mid = sent.data.id;
    const r = await call('b', 'PUT', `/messages/conversations/${conv}/messages/${mid}/reaction`, { emoji: 'love' });
    expect(r.status).toBe(200);
  });

  it('only the sender can unsend', async () => {
    const peer = await call('b', 'DELETE', `/messages/conversations/${conv}/messages/${mid}`);
    expect(peer.status).toBe(403);
    const outsider = await call('c', 'DELETE', `/messages/conversations/${conv}/messages/${mid}`);
    expect(outsider.status).toBe(404);
    const anon = await call(null, 'DELETE', `/messages/conversations/${conv}/messages/${mid}`);
    expect(anon.status).toBe(401);
    const missing = await call('a', 'DELETE', `/messages/conversations/${conv}/messages/msg_nope`);
    expect(missing.status).toBe(404);
    expect((db.prepare('SELECT body FROM messages WHERE id = ?').get(mid) as any).body).toBe('secret');
  });

  it('soft deletes, clears the body and lists a placeholder for both sides', async () => {
    const res = await call('a', 'DELETE', `/messages/conversations/${conv}/messages/${mid}`);
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ id: mid, deleted: true });

    const row = db.prepare('SELECT body, deleted_at FROM messages WHERE id = ?').get(mid) as any;
    expect(row.body).toBe('');
    expect(row.deleted_at).toBeTruthy();
    expect(count('SELECT COUNT(*) AS n FROM message_reactions WHERE message_id = ?', mid)).toBe(0);

    for (const who of ['a', 'b']) {
      const list = await call(who, 'GET', `/messages/conversations/${conv}/messages`);
      expect(list.status).toBe(200);
      const m = list.data.messages.find((x: any) => x.id === mid);
      expect(m.deleted).toBe(true);
      expect(m.body).toBeUndefined();
      expect(m.reactions).toBeUndefined();
    }
    const inbox = await call('b', 'GET', '/messages/conversations');
    expect(inbox.data.conversations[0].last_message).toBe('Message unsent');

    // Idempotent; reacting to an unsent message is a 404.
    const again = await call('a', 'DELETE', `/messages/conversations/${conv}/messages/${mid}`);
    expect(again.status).toBe(200);
    const react = await call('b', 'PUT', `/messages/conversations/${conv}/messages/${mid}/reaction`, { emoji: 'love' });
    expect(react.status).toBe(404);
  });
});

describe('GET /me/circle/today', () => {
  beforeEach(() => {
    addUser('me');
    for (const f of ['f1', 'f2', 'f3']) {
      addUser(f);
      befriend('me', f);
    }
    addUser('stranger');
    addUser('blocked');
    befriend('me', 'blocked');
    block('blocked', 'me');
  });

  it('returns only friends, newest check-in first, skipping strangers and blocks', async () => {
    setNow('2026-11-02T12:00:00Z');
    checkin('f1', '2026-11-02 08:00:00');
    checkin('f2', '2026-11-02 11:00:00');
    checkin('stranger', '2026-11-02 11:30:00');
    checkin('blocked', '2026-11-02 11:45:00');
    const res = await call('me', 'GET', '/me/circle/today');
    expect(res.status).toBe(200);
    expect(res.data.friends.map((f: any) => f.id)).toEqual(['f2', 'f1']);
    expect(res.data.friends[0]).toEqual({ id: 'f2', display_name: 'f2', initial: 'F', checked_in: true });
  });

  it("uses the viewer's timezone for today", async () => {
    // 12:00Z = 01:00 next day in Auckland (UTC+13 in November).
    setNow('2026-11-02T12:00:00Z');
    setTz('me', 'Pacific/Auckland');
    checkin('f1', '2026-11-02 10:30:00'); // 23:30 on Nov 2 Auckland → yesterday
    checkin('f2', '2026-11-02 11:30:00'); // 00:30 on Nov 3 Auckland → today
    checkin('f3', '2026-11-01 13:00:00'); // long ago
    const res = await call('me', 'GET', '/me/circle/today', undefined, { 'X-Timezone': 'Pacific/Auckland' });
    expect(res.status).toBe(200);
    expect(res.data.friends.map((f: any) => f.id)).toEqual(['f2']);

    setTz('me', 'UTC');
    const utc = await call('me', 'GET', '/me/circle/today', undefined, { 'X-Timezone': 'UTC' });
    expect(utc.data.friends.map((f: any) => f.id)).toEqual(['f2', 'f1']);
  });

  it('caps at 8 and requires auth', async () => {
    setNow('2026-11-02T12:00:00Z');
    for (let i = 0; i < 12; i++) {
      addUser(`g${i}`);
      befriend('me', `g${i}`);
      checkin(`g${i}`, `2026-11-02 ${String(i).padStart(2, '0')}:10:00`);
    }
    const res = await call('me', 'GET', '/me/circle/today');
    expect(res.data.friends).toHaveLength(8);
    expect(res.data.friends[0].id).toBe('g11');
    expect((await call(null, 'GET', '/me/circle/today')).status).toBe(401);
  });
});
