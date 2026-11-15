/**
 * Wave 4 main-user backend: one-level comment replies (migration 0043), journal
 * `q=` search + `has_more`, and the Sunday circle recap (GET /me/circle/week).
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

function block(a: string, b: string) {
  db.prepare(
    `INSERT INTO user_relationships (id, user_id, target_user_id, type, created_at)
     VALUES (?, ?, ?, 'block', datetime('now'))`
  ).run(`blk_${a}_${b}`, a, b);
}

function addJournal(id: string, userId: string, content: string, isPublic: boolean, createdAt: string) {
  db.prepare(
    `INSERT INTO journal_entries (id, user_id, title, content, mood, tags, is_public, metadata, created_at, updated_at)
     VALUES (?, ?, NULL, ?, NULL, '[]', ?, '{}', ?, ?)`
  ).run(id, userId, content, isPublic ? 1 : 0, createdAt, createdAt);
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

function count(sql: string, ...args: unknown[]): number {
  return Number((db.prepare(sql).get(...args) as any).n);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // Sunday 15 Nov 2026, 17:00 UTC → local week (UTC) is Mon 9 … Sun 15.
  vi.setSystemTime(new Date('2026-11-15T17:00:00Z'));
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
    JWT_SECRET: 'wave4-user-test-secret',
    API_VERSION: 'v1',
  } as Env;
});

afterEach(() => {
  expect(stats.maxParams, stats.maxSql).toBeLessThanOrEqual(D1_MAX_PARAMS);
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
describe('comment replies (one level)', () => {
  beforeEach(() => {
    addUser('author');
    addUser('ann');
    addUser('bob');
    db.prepare(
      `INSERT INTO posts (id, user_id, category, created_at, updated_at) VALUES ('p1', 'author', 'fitness', datetime('now'), datetime('now'))`
    ).run();
  });

  it('threads a reply under its top-level comment and notifies the person replied to', async () => {
    const top = await call('ann', 'POST', '/feed/posts/p1/comments', { content: 'Nice run!' });
    expect(top.status, JSON.stringify(top.body)).toBe(201);
    expect(top.data.parent_id).toBeNull();

    const reply = await call('bob', 'POST', '/feed/posts/p1/comments', {
      content: 'Agreed',
      parent_id: top.data.id,
    });
    expect(reply.status).toBe(201);
    expect(reply.data.parent_id).toBe(top.data.id);

    // Reply to a reply attaches to the same top-level comment (never two levels).
    const nested = await call('ann', 'POST', '/feed/posts/p1/comments', {
      content: 'Thanks Bob',
      parent_id: reply.data.id,
    });
    expect(nested.data.parent_id).toBe(top.data.id);

    const list = await call('author', 'GET', '/feed/posts/p1/comments');
    // Same-second timestamps: compare as a multiset.
    expect(list.data.map((c: any) => c.parent_id ?? '').sort()).toEqual(['', top.data.id, top.data.id]);

    expect(
      count(`SELECT COUNT(*) AS n FROM user_notifications WHERE user_id = 'ann' AND type = 'comment_reply'`)
    ).toBe(1);
    expect(
      count(`SELECT COUNT(*) AS n FROM user_notifications WHERE user_id = 'bob' AND type = 'comment_reply'`)
    ).toBe(1);
  });

  it('rejects a reply to a missing comment and removes replies with their parent', async () => {
    const missing = await call('bob', 'POST', '/feed/posts/p1/comments', {
      content: 'hi',
      parent_id: 'comment_nope',
    });
    expect(missing.status).toBe(404);

    const top = await call('ann', 'POST', '/feed/posts/p1/comments', { content: 'Top' });
    await call('bob', 'POST', '/feed/posts/p1/comments', { content: 'R', parent_id: top.data.id });
    const del = await call('ann', 'DELETE', `/feed/posts/p1/comments/${top.data.id}`);
    expect(del.status).toBe(200);
    expect(count(`SELECT COUNT(*) AS n FROM post_engagement WHERE post_id = 'p1' AND type = 'comment'`)).toBe(0);
  });

  it('post author replying to a comment gets no self notification; commenter gets one', async () => {
    const top = await call('ann', 'POST', '/feed/posts/p1/comments', { content: 'Q?' });
    await call('author', 'POST', '/feed/posts/p1/comments', { content: 'A!', parent_id: top.data.id });
    expect(count(`SELECT COUNT(*) AS n FROM user_notifications WHERE user_id = 'author' AND actor_id = 'author'`)).toBe(0);
    expect(count(`SELECT COUNT(*) AS n FROM user_notifications WHERE user_id = 'ann' AND type = 'comment_reply'`)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe('journal list: q= search and has_more', () => {
  beforeEach(() => {
    addUser('me');
    addUser('other');
    addJournal('j1', 'me', 'Ran 5k by the river', false, '2026-11-10 08:00:00');
    addJournal('j2', 'me', 'Quiet day, 50% energy', true, '2026-11-11 08:00:00');
    addJournal('j3', 'me', 'Meditation felt easy', false, '2026-11-12 08:00:00');
    addJournal('j4', 'other', 'Ran a marathon', true, '2026-11-12 08:00:00');
  });

  it('searches only my entries, case-insensitive, with literal wildcards', async () => {
    const ran = await call('me', 'GET', '/journal/entries?q=RAN');
    expect(ran.data.entries.map((e: any) => e.id)).toEqual(['j1']);
    const pct = await call('me', 'GET', '/journal/entries?q=50%25');
    expect(pct.data.entries.map((e: any) => e.id)).toEqual(['j2']);
    const underscore = await call('me', 'GET', '/journal/entries?q=_');
    expect(underscore.data.entries).toHaveLength(0);
  });

  it('reports has_more for offset paging', async () => {
    const page1 = await call('me', 'GET', '/journal/entries?limit=2');
    expect(page1.data.entries.map((e: any) => e.id)).toEqual(['j3', 'j2']);
    expect(page1.data.has_more).toBe(true);
    const page2 = await call('me', 'GET', '/journal/entries?limit=2&offset=2');
    expect(page2.data.entries.map((e: any) => e.id)).toEqual(['j1']);
    expect(page2.data.has_more).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('GET /me/circle/week', () => {
  beforeEach(() => {
    for (const id of ['me', 'f1', 'f2', 'f3', 'stranger']) addUser(id);
    befriend('me', 'f1');
    befriend('me', 'f2');
    befriend('me', 'f3');
    block('f3', 'me');
    const act = db.prepare(`INSERT INTO user_activity_days (user_id, day, kinds) VALUES (?, ?, 8)`);
    act.run('f1', '2026-11-09');
    act.run('f1', '2026-11-12');
    act.run('f1', '2026-11-08'); // last week — not counted
    act.run('f2', '2026-11-14');
    act.run('f3', '2026-11-14'); // blocked
    act.run('stranger', '2026-11-14');
    db.prepare(`INSERT INTO daily_checkins (id, user_id, day) VALUES ('c1', 'f1', '2026-11-12')`).run();
    addJournal('m1', 'f1', 'Felt strong on the hill today', true, '2026-11-12 09:00:00');
    addJournal('m2', 'f1', 'Second page', true, '2026-11-13 09:00:00');
    addJournal('m3', 'f2', 'Private thoughts', false, '2026-11-14 09:00:00');
    addJournal('m4', 'f2', 'Shared reflection', true, '2026-11-14 10:00:00');
    addJournal('old', 'f2', 'Last week', true, '2026-11-07 10:00:00');
    addJournal('blk', 'f3', 'Blocked author', true, '2026-11-14 10:00:00');
  });

  it('returns counts only until I share a moment this week', async () => {
    const res = await call('me', 'GET', '/me/circle/week');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.data).toMatchObject({
      week_start: '2026-11-09',
      today: '2026-11-15',
      shared: false,
      friends_total: 2,
      friends_active: 2,
      checkins: 1,
      members: [],
      moments: [],
    });
  });

  it('a private page does not unlock; a shared page does (faces + one moment per friend first)', async () => {
    addJournal('mine-private', 'me', 'just me', false, '2026-11-15 08:00:00');
    expect((await call('me', 'GET', '/me/circle/week')).data.shared).toBe(false);

    addJournal('mine-shared', 'me', 'my moment', true, '2026-11-15 09:00:00');
    const res = await call('me', 'GET', '/me/circle/week');
    expect(res.data.shared).toBe(true);
    expect(res.data.members.map((m: any) => [m.id, m.days])).toEqual([
      ['f1', 2],
      ['f2', 1],
    ]);
    expect(res.data.moments.map((m: any) => m.id)).toEqual(['m4', 'm2', 'm1']);
  });

  it('a post this week also unlocks', async () => {
    db.prepare(
      `INSERT INTO posts (id, user_id, category, created_at, updated_at) VALUES ('px', 'me', 'fitness', '2026-11-10 10:00:00', '2026-11-10 10:00:00')`
    ).run();
    const res = await call('me', 'GET', '/me/circle/week');
    expect(res.data.shared).toBe(true);
    expect(res.data.moments.length).toBeGreaterThan(0);
  });

  it('requires auth', async () => {
    expect((await call(null, 'GET', '/me/circle/week')).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
describe('DELETE /feed/posts/:id', () => {
  beforeEach(() => {
    addUser('author');
    addUser('fan');
    db.prepare(
      `INSERT INTO posts (id, user_id, caption, category, created_at, updated_at) VALUES ('p1', 'author', 'Hill #run @fan', 'fitness', datetime('now'), datetime('now'))`
    ).run();
    db.prepare(
      `INSERT INTO posts (id, user_id, caption, category, created_at, updated_at) VALUES ('p2', 'author', 'keep', 'fitness', datetime('now'), datetime('now'))`
    ).run();
  });

  it('author deletes the post and everything hanging off it', async () => {
    await call('fan', 'POST', '/feed/posts/p1/like');
    const c = await call('fan', 'POST', '/feed/posts/p1/comments', { content: 'go @author' });
    expect(c.status).toBe(201);
    db.prepare(`INSERT INTO post_tags (post_id, tag) VALUES ('p1', 'run')`).run();
    db.prepare(`INSERT INTO post_mentions (post_id, mentioned_user_id, author_id) VALUES ('p1', 'fan', 'author')`).run();
    expect(count(`SELECT COUNT(*) AS n FROM user_notifications WHERE ref_id = 'p1'`)).toBeGreaterThan(0);

    const res = await call('author', 'DELETE', '/feed/posts/p1');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.data).toEqual({ deleted: true, id: 'p1' });

    expect(count(`SELECT COUNT(*) AS n FROM posts WHERE id = 'p1'`)).toBe(0);
    expect(count(`SELECT COUNT(*) AS n FROM posts WHERE id = 'p2'`)).toBe(1);
    expect(count(`SELECT COUNT(*) AS n FROM post_engagement WHERE post_id = 'p1'`)).toBe(0);
    expect(count(`SELECT COUNT(*) AS n FROM post_tags WHERE post_id = 'p1'`)).toBe(0);
    expect(count(`SELECT COUNT(*) AS n FROM post_mentions WHERE post_id = 'p1'`)).toBe(0);
    expect(count(`SELECT COUNT(*) AS n FROM comment_mentions WHERE post_id = 'p1'`)).toBe(0);
    expect(count(`SELECT COUNT(*) AS n FROM user_notifications WHERE ref_id = 'p1'`)).toBe(0);
    expect(count(`SELECT COUNT(*) AS n FROM search_posts WHERE post_id = 'p1'`)).toBe(0);

    expect((await call('author', 'GET', '/feed/posts/p1')).status).toBe(404);
    expect((await call('author', 'DELETE', '/feed/posts/p1')).status).toBe(404);
  });

  it('someone else cannot delete it; guests need auth', async () => {
    expect((await call('fan', 'DELETE', '/feed/posts/p1')).status).toBe(403);
    expect((await call(null, 'DELETE', '/feed/posts/p1')).status).toBe(401);
    expect(count(`SELECT COUNT(*) AS n FROM posts WHERE id = 'p1'`)).toBe(1);
  });
});
