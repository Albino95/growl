/**
 * GET /feed/feed cursor paging against a real in-memory SQLite built from every
 * migration: pages are stable, complete and duplicate-free in every mode, the
 * legacy (no cursor / no limit) response keeps its shape, and new posts created
 * mid-scroll don't shift later pages.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import worker from '../../src/index';
import type { Env } from '../../src/types';
import { createSqliteD1, loadMigrationsSql, trackParams } from '../utils/sqliteD1';
import { signAccessToken } from '../../src/utils/jwt';
import { decodeFeedCursor, encodeFeedCursor } from '../../src/routes/feed';

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

let postSeq = 0;
function addPost(userId: string, minutesAgo: number, category = 'fitness', likes = 0) {
  const id = `post_${String(++postSeq).padStart(4, '0')}`;
  db.prepare(
    `INSERT INTO posts (id, user_id, image_url, caption, category, engagement_score, metadata, created_at, updated_at)
     VALUES (?, ?, 'https://cdn.test/x.jpg', 'c', ?, ?, '{}', datetime('now', ?), datetime('now'))`
  ).run(id, userId, category, likes * 2, `-${minutesAgo} minutes`);
  for (let i = 0; i < likes; i++) {
    db.prepare(
      `INSERT INTO post_engagement (id, post_id, user_id, type, created_at) VALUES (?, ?, ?, 'like', datetime('now'))`
    ).run(`eng_${id}_${i}`, id, `liker${i}`);
  }
  return id;
}

async function getFeed(userId: string, qs: string) {
  const res = await worker.fetch(
    new Request(`https://api.test/api/v1/feed/feed${qs}`, {
      headers: { Authorization: `Bearer ${await signAccessToken(userId, env)}` },
    }),
    env,
    ctx
  );
  const body = (await res.json()) as any;
  return { status: res.status, body, data: body.data };
}

type PageItem = { id: string; feed_section?: string };

/** Walks every page; returns ids in order plus per-page sections. */
async function walk(userId: string, mode: string, limit: number) {
  const ids: string[] = [];
  const sections: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const qs = `?mode=${mode}&limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const res = await getFeed(userId, qs);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const items: PageItem[] = Array.isArray(res.data)
      ? res.data
      : [...res.data.following, ...res.data.suggested];
    expect(items.length).toBeLessThanOrEqual(limit);
    if (!Array.isArray(res.data)) expect(res.data.next_cursor).toBe(res.body.meta.next_cursor);
    for (const p of items) {
      ids.push(p.id);
      sections.push(p.feed_section || '');
    }
    cursor = res.body.meta.next_cursor;
    if (cursor) expect(items.length).toBe(limit);
    pages++;
    expect(pages).toBeLessThan(100);
  } while (cursor);
  return { ids, sections, pages };
}

beforeEach(() => {
  postSeq = 0;
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
    JWT_SECRET: 'feed-paging-test-secret',
    API_VERSION: 'v1',
  } as Env;

  addUser('me', { categories: ['fitness'] });
  for (let i = 0; i < 6; i++) addUser(`liker${i}`);
  addUser('friend1');
  addUser('friend2');
  befriend('me', 'friend1');
  befriend('me', 'friend2');
  addUser('stranger1');
  addUser('stranger2');
  addUser('blocked');
  db.prepare(
    `INSERT INTO user_relationships (id, user_id, target_user_id, type, created_at, source)
     VALUES ('rel_block', 'me', 'blocked', 'block', datetime('now'), 'manual')`
  ).run();

  // 3 own, 24 friend, 40 stranger, 5 blocked. Many share identical scores
  // (same minute, same likes) so the id tiebreak is exercised.
  for (let i = 0; i < 3; i++) addPost('me', 10 + i);
  for (let i = 0; i < 24; i++) addPost(i % 2 ? 'friend1' : 'friend2', 30 + Math.floor(i / 3) * 60, 'fitness', i % 4);
  for (let i = 0; i < 40; i++)
    addPost(i % 2 ? 'stranger1' : 'stranger2', 5 + Math.floor(i / 4) * 120, i % 3 ? 'fitness' : 'music', i % 5);
  for (let i = 0; i < 5; i++) addPost('blocked', 1);
});

afterEach(() => {
  expect(stats.maxParams, stats.maxSql).toBeLessThanOrEqual(D1_MAX_PARAMS);
});

describe('GET /feed/feed paging', () => {
  it('foryou: pages are complete, duplicate-free, following before suggested', async () => {
    const { ids, sections, pages } = await walk('me', 'foryou', 7);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(3 + 24 + 40);
    expect(pages).toBe(Math.ceil(67 / 7));
    const firstSuggested = sections.indexOf('suggested');
    expect(sections.slice(0, firstSuggested).every((s) => s === 'following')).toBe(true);
    expect(sections.slice(firstSuggested).every((s) => s === 'suggested')).toBe(true);
    const blocked = db.prepare(`SELECT id FROM posts WHERE user_id = 'blocked'`).all() as { id: string }[];
    for (const b of blocked) expect(ids).not.toContain(b.id);
  });

  it('explore: complete and duplicate-free, non-friends only', async () => {
    const { ids } = await walk('me', 'explore', 9);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(40);
  });

  it('paged order matches the single-shot ranking', async () => {
    const paged = await walk('me', 'foryou', 5);
    const one = await getFeed('me', '?mode=foryou&limit=50');
    const two = await getFeed('me', `?mode=foryou&limit=50&cursor=${encodeURIComponent(one.body.meta.next_cursor)}`);
    const full = [...one.data.following, ...one.data.suggested, ...two.data.following, ...two.data.suggested].map(
      (p: PageItem) => p.id
    );
    expect(paged.ids).toEqual(full);
    expect(two.body.meta.next_cursor).toBeNull();
  });

  it('posts created mid-scroll do not shift later pages', async () => {
    const first = await getFeed('me', '?mode=foryou&limit=10');
    const cursor = first.body.meta.next_cursor as string;
    const seen = new Set([...first.data.following, ...first.data.suggested].map((p: PageItem) => p.id));
    // A brand-new friend post would rank in the following section — it must wait for a refresh.
    const fresh = addPost('friend1', 0, 'fitness', 5);
    const decoded = decodeFeedCursor(cursor)!;
    // Ensure the new post is strictly newer than the snapshot.
    db.prepare(`UPDATE posts SET created_at = ? WHERE id = ?`).run(
      new Date(decoded.t + 5_000).toISOString().replace('T', ' ').slice(0, 19),
      fresh
    );
    let next: string | null = cursor;
    const rest: string[] = [];
    while (next) {
      const res = await getFeed('me', `?mode=foryou&limit=10&cursor=${encodeURIComponent(next)}`);
      rest.push(...[...res.data.following, ...res.data.suggested].map((p: PageItem) => p.id));
      next = res.body.meta.next_cursor;
    }
    expect(rest).not.toContain(fresh);
    for (const id of rest) expect(seen.has(id)).toBe(false);
    expect(seen.size + rest.length).toBe(67);
    // Page 1 after a refresh (new snapshot) shows it in the circle section.
    db.prepare(`UPDATE posts SET created_at = datetime('now', '-1 minutes') WHERE id = ?`).run(fresh);
    const refreshed = await getFeed('me', '?mode=foryou&limit=10');
    expect(refreshed.data.following.map((p: PageItem) => p.id)).toContain(fresh);
  });

  it('legacy call (no cursor/limit) keeps the old shape and size, plus next_cursor', async () => {
    const res = await getFeed('me', '?mode=foryou');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.following)).toBe(true);
    expect(Array.isArray(res.data.suggested)).toBe(true);
    expect(res.data.following.length + res.data.suggested.length).toBe(50);
    expect(typeof res.body.meta.next_cursor).toBe('string');
    const post = res.data.following[0];
    expect(post.metadata).toMatchObject({ username: expect.any(String), has_liked: false });
    expect(post.feed_section).toBe('following');
    expect(post).not.toHaveProperty('user_metadata');

    const explore = await getFeed('me', '?mode=explore');
    expect(Array.isArray(explore.data)).toBe(true);
    expect(explore.data.length).toBe(40);
    expect(explore.body.meta.next_cursor).toBeNull();
  });

  it('clamps limit and defaults to 20 with a cursor', async () => {
    const big = await getFeed('me', '?mode=foryou&limit=500');
    expect(big.data.following.length + big.data.suggested.length).toBe(50);
    const page = await getFeed('me', `?mode=foryou&cursor=${encodeURIComponent(big.body.meta.next_cursor)}`);
    expect(page.data.following.length + page.data.suggested.length).toBe(17);
    const first = await getFeed('me', '?mode=explore&limit=abc');
    expect(first.data.length).toBe(20);
  });

  it('rejects garbage and cross-mode cursors', async () => {
    expect((await getFeed('me', '?mode=foryou&cursor=not-a-cursor')).status).toBe(400);
    const exploreCursor = encodeFeedCursor({ v: 1, m: 'explore', t: Date.now(), r: 0, s: 1, i: 'x' });
    const res = await getFeed('me', `?mode=foryou&cursor=${exploreCursor}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CURSOR');
  });
});
