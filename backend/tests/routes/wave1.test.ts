/**
 * Wave 1 backend (migration 0036) against a real in-memory SQLite built from every
 * migration: Idempotency-Key replay, refresh-token rotation grace, life mode streak
 * protection, DM privacy, blocks list and the reactions IN-list chunking.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../../src/index';
import type { Env } from '../../src/types';
import { createSqliteD1, loadMigrationsSql, trackParams } from '../utils/sqliteD1';
import { signAccessToken } from '../../src/utils/jwt';
import { recordActivity } from '../../src/utils/activity';
import { issueSessionTokens, rotateRefreshToken, revokeRefreshToken } from '../../src/utils/sessions';
import { chunk, IN_CHUNK, loadReactionsForMessages } from '../../src/routes/messages';
import { dmPolicyAllows } from '../../src/utils/dmPolicy';

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

// ---------------------------------------------------------------------------
describe('Idempotency-Key', () => {
  beforeEach(() => {
    addUser('a');
    addUser('b');
    befriend('a', 'b');
  });

  it('replays the original message response without creating a duplicate', async () => {
    const conv = await openConversation('a', 'b');
    const key = { 'Idempotency-Key': '7d2c7f3e-1111-4a5b-9c1d-000000000001' };
    const first = await call('a', 'POST', `/messages/conversations/${conv}/messages`, { body: 'hi' }, key);
    expect(first.status).toBe(201);
    const second = await call('a', 'POST', `/messages/conversations/${conv}/messages`, { body: 'hi' }, key);
    expect(second.status).toBe(201);
    expect(second.headers.get('Idempotent-Replayed')).toBe('true');
    expect(second.data.id).toBe(first.data.id);
    expect(count(`SELECT COUNT(*) n FROM messages WHERE conversation_id = ?`, conv)).toBe(1);

    // Without a key (or with a new key) a new message is created.
    await call('a', 'POST', `/messages/conversations/${conv}/messages`, { body: 'hi' });
    await call('a', 'POST', `/messages/conversations/${conv}/messages`, { body: 'hi' }, {
      'Idempotency-Key': '7d2c7f3e-1111-4a5b-9c1d-000000000002',
    });
    expect(count(`SELECT COUNT(*) n FROM messages WHERE conversation_id = ?`, conv)).toBe(3);
  });

  it('keys are per user, expire after 24 h, and are not stored for failures', async () => {
    const key = { 'Idempotency-Key': 'journal-key-0001' };
    const entry = { content: 'grew a little', mood: 'calm' };
    const one = await call('a', 'POST', '/journal/entries', entry, key);
    expect(one.status).toBe(201);
    const replay = await call('a', 'POST', '/journal/entries', entry, key);
    expect(replay.data.id).toBe(one.data.id);
    // Same key, other user → independent.
    const other = await call('b', 'POST', '/journal/entries', entry, key);
    expect(other.status).toBe(201);
    expect(other.data.id).not.toBe(one.data.id);
    // Reused for a different endpoint → rejected.
    const misuse = await call('a', 'POST', '/feed/posts', { caption: 'x', category: 'fitness' }, key);
    expect(misuse.status).toBe(422);
    // A 4xx is not stored: fixing the request and retrying with the same key works.
    const badKey = { 'Idempotency-Key': 'journal-key-0002' };
    const bad = await call('a', 'POST', '/journal/entries', { content: '' }, badKey);
    expect(bad.status).toBe(400);
    const good = await call('a', 'POST', '/journal/entries', entry, badKey);
    expect(good.status).toBe(201);
    // After 24 h the key is free again.
    setNow('2026-11-03T12:00:01Z');
    const later = await call('a', 'POST', '/journal/entries', entry, key);
    expect(later.status).toBe(201);
    expect(later.data.id).not.toBe(one.data.id);
    expect(count(`SELECT COUNT(*) n FROM journal_entries WHERE user_id = 'a'`)).toBe(3);
  });

  it('applies to check-ins and comments too', async () => {
    const key = { 'Idempotency-Key': 'checkin-key-0001' };
    const c1 = await call('a', 'PUT', '/me/today', { day: '2026-11-02', mood: 4 }, key);
    expect(c1.status).toBe(200);
    const c2 = await call('a', 'PUT', '/me/today', { day: '2026-11-02', mood: 4 }, key);
    expect(c2.headers.get('Idempotent-Replayed')).toBe('true');
    expect(c2.body).toEqual(c1.body);

    db.prepare(
      `INSERT INTO posts (id, user_id, image_url, category, created_at, updated_at)
       VALUES ('p1', 'b', 'https://x', 'fitness', datetime('now'), datetime('now'))`
    ).run();
    const ck = { 'Idempotency-Key': 'comment-key-0001' };
    const m1 = await call('a', 'POST', '/feed/posts/p1/comments', { content: 'nice' }, ck);
    expect(m1.status).toBeLessThan(300);
    await call('a', 'POST', '/feed/posts/p1/comments', { content: 'nice' }, ck);
    expect(count(`SELECT COUNT(*) n FROM post_engagement WHERE post_id = 'p1' AND type = 'comment'`)).toBe(1);
  });

  it('rejects malformed keys', async () => {
    const res = await call('a', 'POST', '/journal/entries', { content: 'x', mood: 'calm' }, {
      'Idempotency-Key': 'bad key!',
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
describe('refresh-token rotation grace', () => {
  beforeEach(() => addUser('a'));

  it('returns the same new pair for a just-rotated token within 60 s', async () => {
    const issued = await issueSessionTokens(env, 'a');
    const first = await rotateRefreshToken(env, issued.refreshToken);
    expect(first).not.toBeNull();
    setNow('2026-11-02T12:00:30Z');
    const again = await rotateRefreshToken(env, issued.refreshToken);
    expect(again).toMatchObject({ userId: 'a', token: first!.token, refreshToken: first!.refreshToken });
    // The grace payload is not the raw token.
    const row = db.prepare(`SELECT grace_payload FROM auth_refresh_sessions WHERE replaced_by IS NOT NULL`).get() as any;
    expect(row.grace_payload).not.toContain(first!.refreshToken);
    // The replacement still rotates normally.
    const next = await rotateRefreshToken(env, first!.refreshToken);
    expect(next?.refreshToken).not.toBe(first!.refreshToken);
  });

  it('expires after 60 s and when the replacement is revoked', async () => {
    const issued = await issueSessionTokens(env, 'a');
    const first = await rotateRefreshToken(env, issued.refreshToken);
    setNow('2026-11-02T12:01:01Z');
    expect(await rotateRefreshToken(env, issued.refreshToken)).toBeNull();

    const issued2 = await issueSessionTokens(env, 'a');
    const r2 = await rotateRefreshToken(env, issued2.refreshToken);
    await revokeRefreshToken(env, r2!.refreshToken); // sign-out
    expect(await rotateRefreshToken(env, issued2.refreshToken)).toBeNull();
    expect(first).not.toBeNull();
  });

  it('a signed-out token never gets grace', async () => {
    const issued = await issueSessionTokens(env, 'a');
    await revokeRefreshToken(env, issued.refreshToken);
    expect(await rotateRefreshToken(env, issued.refreshToken)).toBeNull();
  });

  it('concurrent refreshes get the same pair and only one session is created', async () => {
    const issued = await issueSessionTokens(env, 'a');
    const [x, y] = await Promise.all([
      rotateRefreshToken(env, issued.refreshToken),
      rotateRefreshToken(env, issued.refreshToken),
    ]);
    expect(x).not.toBeNull();
    expect(y?.refreshToken).toBe(x!.refreshToken);
    expect(count(`SELECT COUNT(*) n FROM auth_refresh_sessions WHERE revoked_at IS NULL`)).toBe(1);
  });

  it('works through POST /auth/refresh', async () => {
    const issued = await issueSessionTokens(env, 'a');
    const r1 = await call(null, 'POST', '/auth/refresh', { refreshToken: issued.refreshToken });
    expect(r1.status).toBe(200);
    const r2 = await call(null, 'POST', '/auth/refresh', { refreshToken: issued.refreshToken });
    expect(r2.status).toBe(200);
    expect(r2.data.refreshToken).toBe(r1.data.refreshToken);
    expect(r2.data.token).toBe(r1.data.token);
  });
});

// ---------------------------------------------------------------------------
describe('life mode', () => {
  const activeOn = async (userId: string, days: string[]) => {
    for (const d of days) {
      setNow(`${d}T12:00:00Z`);
      await recordActivity(env, userId, 'journal');
    }
  };
  const restKind = (userId: string, day: string) =>
    (db.prepare(`SELECT is_rest FROM user_activity_days WHERE user_id = ? AND day = ?`).get(userId, day) as any)
      ?.is_rest;

  beforeEach(() => addUser('a'));

  it('GET/PUT round trip, validation and GET /me/today', async () => {
    expect((await call('a', 'GET', '/me/life-mode')).data).toEqual({ mode: 'none', until: null });
    const put = await call('a', 'PUT', '/me/life-mode', { mode: 'sick', until: '2026-11-05' });
    expect(put.status).toBe(200);
    expect(put.data).toEqual({ mode: 'sick', until: '2026-11-05' });
    expect((await call('a', 'GET', '/me/life-mode')).data).toEqual({ mode: 'sick', until: '2026-11-05' });
    expect((await call('a', 'GET', '/me/today')).data.life_mode).toEqual({ mode: 'sick', until: '2026-11-05' });

    expect((await call('a', 'PUT', '/me/life-mode', { mode: 'travel', until: '2026-12-03' })).status).toBe(400);
    expect((await call('a', 'PUT', '/me/life-mode', { mode: 'travel', until: '2026-11-01' })).status).toBe(400);
    expect((await call('a', 'PUT', '/me/life-mode', { mode: 'party' })).status).toBe(400);
    expect((await call('a', 'PUT', '/me/life-mode', { mode: 'travel', until: '2026-12-02' })).status).toBe(200);
    expect((await call('a', 'PUT', '/me/life-mode', { mode: 'break' })).data).toEqual({ mode: 'break', until: null });

    // Expired modes read as none.
    await call('a', 'PUT', '/me/life-mode', { mode: 'sick', until: '2026-11-03' });
    setNow('2026-11-04T12:00:00Z');
    expect((await call('a', 'GET', '/me/life-mode')).data).toEqual({ mode: 'none', until: null });
    expect((await call('a', 'GET', '/me/today')).data.life_mode).toEqual({ mode: 'none', until: null });

    const cleared = await call('a', 'PUT', '/me/life-mode', { mode: 'none', until: '2026-11-10' });
    expect(cleared.data).toEqual({ mode: 'none', until: null });
  });

  it('missed days inside the window neither break the streak nor use rest days', async () => {
    await activeOn('a', ['2026-11-02', '2026-11-03', '2026-11-04']);
    await call('a', 'PUT', '/me/life-mode', { mode: 'sick', until: '2026-11-08' });
    await activeOn('a', ['2026-11-10']); // 05..08 protected, 09 uses the rest token
    const s = db.prepare(`SELECT * FROM user_streaks WHERE user_id = 'a'`).get() as any;
    expect(s).toMatchObject({ current: 4, total_days: 4, rest_tokens: 0 });
    for (const d of ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']) expect(restKind('a', d)).toBe(2);
    expect(restKind('a', '2026-11-09')).toBe(1);
  });

  it('without life mode the same gap breaks the streak (control)', async () => {
    await activeOn('a', ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-10']);
    expect((db.prepare(`SELECT current FROM user_streaks WHERE user_id = 'a'`).get() as any).current).toBe(1);
  });

  it('clearing life mode keeps the days it already protected (also after a full replay)', async () => {
    await activeOn('a', ['2026-11-02', '2026-11-03', '2026-11-04']);
    await call('a', 'PUT', '/me/life-mode', { mode: 'travel' });
    setNow('2026-11-07T12:00:00Z');
    await call('a', 'PUT', '/me/life-mode', { mode: 'none' });
    expect(restKind('a', '2026-11-05')).toBe(2);
    expect(restKind('a', '2026-11-06')).toBe(2);
    await activeOn('a', ['2026-11-07']);
    expect((db.prepare(`SELECT current, rest_tokens FROM user_streaks WHERE user_id = 'a'`).get() as any)).toMatchObject({
      current: 4,
      rest_tokens: 1,
    });
    // Back-dated activity forces a replay from the rows; the protected days survive it.
    await recordActivity(env, 'a', 'post', { day: '2026-11-01' });
    expect((db.prepare(`SELECT current FROM user_streaks WHERE user_id = 'a'`).get() as any).current).toBe(5);
  });

  it('an explicit rest check-in during life mode does not use a rest token', async () => {
    await activeOn('a', ['2026-11-02', '2026-11-03']);
    db.prepare(`UPDATE user_streaks SET rest_tokens = 0 WHERE user_id = 'a'`).run();
    await call('a', 'PUT', '/me/life-mode', { mode: 'sick' });
    setNow('2026-11-04T12:00:00Z');
    const res = await call('a', 'PUT', '/me/today', { day: '2026-11-04', rest: true });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(restKind('a', '2026-11-04')).toBe(2);
    expect(res.data.streak).toMatchObject({ current: 2, rest_days_left: 0 });
  });
});

// ---------------------------------------------------------------------------
describe('DM privacy', () => {
  beforeEach(() => {
    addUser('a');
    addUser('b');
    befriend('a', 'b');
  });

  it('GET/PUT /me/privacy', async () => {
    expect((await call('b', 'GET', '/me/privacy')).data).toEqual({ dm_policy: 'everyone' });
    expect((await call('b', 'PUT', '/me/privacy', { dm_policy: 'friends' })).data).toEqual({ dm_policy: 'friends' });
    expect((await call('b', 'GET', '/me/privacy')).data).toEqual({ dm_policy: 'friends' });
    expect((await call('b', 'PUT', '/me/privacy', { dm_policy: 'strangers' })).status).toBe(400);
  });

  it("'nobody' rejects starting a conversation and sending a message", async () => {
    const conv = await openConversation('a', 'b');
    await call('b', 'PUT', '/me/privacy', { dm_policy: 'nobody' });
    const start = await call('a', 'POST', '/messages/conversations', { targetUserId: 'b' });
    expect(start.status).toBe(403);
    expect(start.body.error.message).toBe("This person isn't taking messages right now.");
    const send = await call('a', 'POST', `/messages/conversations/${conv}/messages`, { body: 'hey' });
    expect(send.status).toBe(403);
    expect(send.body.error.code).toBe('DM_NOT_ALLOWED');
    // b can still message a (a's policy is 'everyone').
    expect((await call('b', 'POST', `/messages/conversations/${conv}/messages`, { body: 'hi' })).status).toBe(201);
  });

  it("'friends' allows friends", async () => {
    const conv = await openConversation('a', 'b');
    await call('b', 'PUT', '/me/privacy', { dm_policy: 'friends' });
    expect((await call('a', 'POST', `/messages/conversations/${conv}/messages`, { body: 'hey' })).status).toBe(201);
  });

  it('dmPolicyAllows decision table', async () => {
    db.prepare(`UPDATE users SET dm_policy = 'friends' WHERE id = 'b'`).run();
    expect(await dmPolicyAllows(env, 'b', async () => false)).toBe(false);
    expect(await dmPolicyAllows(env, 'b', async () => true)).toBe(true);
    db.prepare(`UPDATE users SET dm_policy = 'nobody' WHERE id = 'b'`).run();
    expect(await dmPolicyAllows(env, 'b', async () => true)).toBe(false);
    expect(await dmPolicyAllows(env, 'a', async () => false)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('GET /social/blocks', () => {
  it('lists people I blocked, newest first', async () => {
    addUser('a');
    addUser('b', { display_name: 'Bee', avatar: 'https://cdn/b.jpg' });
    addUser('c');
    db.prepare(
      `INSERT INTO user_relationships (id, user_id, target_user_id, type, created_at)
       VALUES ('r1', 'a', 'b', 'block', '2026-11-01 10:00:00'),
              ('r2', 'a', 'c', 'block', '2026-11-02 10:00:00'),
              ('r3', 'c', 'a', 'block', '2026-11-02 11:00:00')`
    ).run();
    const res = await call('a', 'GET', '/social/blocks');
    expect(res.status).toBe(200);
    expect(res.data.blocks).toEqual([
      { id: 'c', username: 'c', display_name: 'c', avatar_url: null, blocked_at: '2026-11-02 10:00:00' },
      { id: 'b', username: 'b', display_name: 'Bee', avatar_url: 'https://cdn/b.jpg', blocked_at: '2026-11-01 10:00:00' },
    ]);
    await call('a', 'DELETE', '/social/block/c');
    expect((await call('a', 'GET', '/social/blocks')).data.blocks.map((b: any) => b.id)).toEqual(['b']);
    expect((await call(null, 'GET', '/social/blocks')).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
describe('message reactions chunking', () => {
  it('chunk() splits into ≤ 90-id slices', () => {
    const ids = Array.from({ length: 200 }, (_, i) => `m${i}`);
    const parts = chunk(ids);
    expect(IN_CHUNK).toBeLessThanOrEqual(90);
    expect(parts.map((p) => p.length)).toEqual([90, 90, 20]);
    expect(parts.flat()).toEqual(ids);
    expect(chunk([])).toEqual([]);
  });

  it('loads reactions for > 100 messages within the bound-param limit', async () => {
    addUser('a');
    addUser('b');
    befriend('a', 'b');
    const conv = await openConversation('a', 'b');
    const ids: string[] = [];
    for (let i = 0; i < 250; i++) {
      const id = `m${String(i).padStart(3, '0')}`;
      ids.push(id);
      db.prepare(
        `INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES (?, ?, 'a', 'x', ?)`
      ).run(id, conv, new Date(Date.UTC(2026, 10, 1, 0, 0, i)).toISOString());
      if (i % 2 === 0) {
        db.prepare(`INSERT INTO message_reactions (message_id, user_id, emoji, created_at) VALUES (?, 'b', 'fire', 'now')`).run(id);
      }
    }
    const map = await loadReactionsForMessages(env, ids, 'a');
    expect(Object.keys(map)).toHaveLength(125);
    expect(map.m248).toEqual({ counts: { fire: 1 }, mine: null });

    const page = await call('a', 'GET', `/messages/conversations/${conv}/messages?limit=200`);
    expect(page.status).toBe(200);
    expect(page.data.limit).toBe(100);
    expect(page.data.messages).toHaveLength(100);
    expect(page.data.has_more).toBe(true);
    expect(stats.maxParams).toBeLessThanOrEqual(D1_MAX_PARAMS);
  });
});
