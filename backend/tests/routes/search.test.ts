/**
 * Wave 3 search (migration 0038) against a real in-memory SQLite built from every migration:
 * FTS triggers, prefix matching, ranking, sanitisation, hashtags and visibility filters.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import worker from '../../src/index';
import type { Env } from '../../src/types';
import { createSqliteD1, loadMigrationsSql, trackParams } from '../utils/sqliteD1';
import { signAccessToken } from '../../src/utils/jwt';
import { parseQuery, extractTags, queryTokens } from '../../src/routes/wave3/search';

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

let postSeq = 0;
function addPost(userId: string, caption: string, opts: { category?: string; image?: string | null; hidden?: boolean } = {}) {
  const id = `p${++postSeq}`;
  db.prepare(
    `INSERT INTO posts (id, user_id, image_url, caption, category, created_at, updated_at, is_hidden)
     VALUES (?, ?, ?, ?, ?, datetime('now', ?), datetime('now'), ?)`
  ).run(
    id,
    userId,
    opts.image === undefined ? `https://img.test/${id}.jpg` : opts.image,
    caption,
    opts.category ?? 'fitness',
    `-${postSeq} minutes`,
    opts.hidden ? 1 : 0
  );
  return id;
}

function relate(a: string, b: string, type: string) {
  db.prepare(
    `INSERT INTO user_relationships (id, user_id, target_user_id, type, created_at, source)
     VALUES (?, ?, ?, ?, datetime('now'), 'manual')`
  ).run(`rel_${a}_${b}_${type}`, a, b, type);
}

async function search(userId: string | null, params: Record<string, string>) {
  const h: Record<string, string> = {};
  if (userId) h.Authorization = `Bearer ${await signAccessToken(userId, env)}`;
  const qs = new URLSearchParams(params).toString();
  const res = await worker.fetch(new Request(`https://api.test/api/v1/search?${qs}`, { headers: h }), env, ctx);
  const body = (await res.json()) as any;
  return { status: res.status, body, data: body.data };
}

beforeEach(() => {
  postSeq = 0;
  const sqlite = createSqliteD1(SCHEMA);
  db = sqlite.raw;
  const tracked = trackParams(sqlite.d1);
  stats = tracked.stats;
  env = {
    DB: tracked.d1 as any,
    KV: { get: async () => null, put: async () => {}, delete: async () => {} } as any,
    ENVIRONMENT: 'test',
    JWT_SECRET: 'search-test-secret',
    API_VERSION: 'v1',
  } as Env;
  addUser('me', { username: 'viewer' });
});

afterEach(() => {
  expect(stats.maxParams, stats.maxSql).toBeLessThanOrEqual(D1_MAX_PARAMS);
});

describe('query parsing', () => {
  it('turns words into quoted prefix tokens and drops FTS syntax', () => {
    expect(parseQuery('yo fl')).toEqual({ kind: 'text', tokens: ['yo', 'fl'], match: '"yo"* "fl"*' });
    const evil = parseQuery('a" OR "b NEAR(c d) -e col:f ^g * "');
    expect(evil.kind).toBe('text');
    if (evil.kind === 'text') {
      expect(evil.match).not.toMatch(/[():^-]/);
      expect(evil.tokens).toEqual(['a', 'or', 'b', 'near', 'c', 'd']);
    }
    expect(parseQuery('  "*:()  ')).toEqual({ kind: 'empty' });
    expect(parseQuery('#')).toEqual({ kind: 'empty' });
    expect(parseQuery('#Café')).toEqual({ kind: 'tag', tag: 'cafe', match: 'tags : "ht_cafe"*' });
    expect(queryTokens('a b c d e f g h')).toHaveLength(6);
  });

  it('extracts folded unique hashtags', () => {
    expect(extractTags('Run #Yoga #yoga and #café_time! #')).toEqual(['yoga', 'cafe_time']);
  });
});

describe('GET /search', () => {
  it('requires auth and returns empty sections for an empty query', async () => {
    expect((await search(null, { q: 'x' })).status).toBe(401);
    const res = await search('me', { q: '  "" ' });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ people: [], posts: [], tags: [], next_cursor: null });
    expect((await search('me', { q: 'x', type: 'bogus' })).status).toBe(400);
  });

  it('prefix-matches people and ranks username matches above bio matches', async () => {
    addUser('u_bio', { username: 'zed', bio: 'I love yoga every morning' });
    addUser('u_name', { username: 'yogamaster', display_name: 'Mia' });
    addUser('u_exact', { username: 'yoga' });
    addUser('u_paths', { username: 'kim', categories: ['yoga', 'music'] });
    addUser('u_other', { username: 'bob' });

    const res = await search('me', { q: 'yog', type: 'people' });
    expect(res.status).toBe(200);
    const ids = res.data.people.map((p: any) => p.id);
    expect(ids.slice(0, 2)).toEqual(['u_exact', 'u_name']);
    expect(ids).toContain('u_bio');
    expect(ids).toContain('u_paths');
    expect(ids).not.toContain('u_other');
    // Exact full username wins over a longer prefix match.
    const exact = await search('me', { q: 'yoga', type: 'people' });
    expect(exact.data.people[0].id).toBe('u_exact');
    const kim = res.data.people.find((p: any) => p.id === 'u_paths');
    expect(kim).toMatchObject({ username: 'kim', display_name: 'kim', paths: ['yoga', 'music'], is_friend: false });
  });

  it('matches multi-word, diacritics and display names; puts friends first among equals', async () => {
    addUser('u1', { username: 'anna_s', display_name: 'Anna Sørensen', bio: 'Café runner' });
    addUser('u2', { username: 'anna_k', display_name: 'Anna Kowalski' });
    relate('me', 'u2', 'friend');
    const res = await search('me', { q: 'anna', type: 'people' });
    expect(res.data.people.map((p: any) => p.id)).toEqual(['u2', 'u1']);
    expect(res.data.people[0].is_friend).toBe(true);
    expect((await search('me', { q: 'anna kow', type: 'people' })).data.people.map((p: any) => p.id)).toEqual(['u2']);
    expect((await search('me', { q: 'cafe', type: 'people' })).data.people.map((p: any) => p.id)).toEqual(['u1']);
  });

  it('survives FTS syntax in the query', async () => {
    addUser('u1', { username: 'quote_me' });
    for (const q of ['"', 'quote" OR', 'NEAR(', '*', 'quote_me:', '-quote', 'a AND', '(((']) {
      const res = await search('me', { q });
      expect(res.status, q).toBe(200);
    }
    expect((await search('me', { q: '"quote' })).data.people.map((p: any) => p.id)).toEqual(['u1']);
  });

  it('keeps the index in sync on update and delete', async () => {
    addUser('u1', { username: 'oldname' });
    expect((await search('me', { q: 'oldn', type: 'people' })).data.people).toHaveLength(1);
    db.prepare(`UPDATE users SET metadata = ? WHERE id = 'u1'`).run(JSON.stringify({ username: 'newname' }));
    expect((await search('me', { q: 'oldn', type: 'people' })).data.people).toHaveLength(0);
    expect((await search('me', { q: 'newn', type: 'people' })).data.people).toHaveLength(1);
    // Unrelated column updates don't break anything.
    db.prepare(`UPDATE users SET points = 5 WHERE id = 'u1'`).run();
    expect((await search('me', { q: 'newn', type: 'people' })).data.people).toHaveLength(1);

    const pid = addPost('u1', 'Sunrise stretch');
    expect((await search('me', { q: 'sunr', type: 'posts' })).data.posts.map((p: any) => p.id)).toEqual([pid]);
    db.prepare(`UPDATE posts SET caption = 'Evening walk' WHERE id = ?`).run(pid);
    expect((await search('me', { q: 'sunr', type: 'posts' })).data.posts).toHaveLength(0);
    expect((await search('me', { q: 'even', type: 'posts' })).data.posts).toHaveLength(1);
    db.prepare(`DELETE FROM posts WHERE id = ?`).run(pid);
    expect((await search('me', { q: 'even', type: 'posts' })).data.posts).toHaveLength(0);
    db.prepare(`DELETE FROM users WHERE id = 'u1'`).run();
    expect((await search('me', { q: 'newn', type: 'people' })).data.people).toHaveLength(0);
    expect(Number((db.prepare(`SELECT COUNT(*) n FROM search_users WHERE user_id = 'u1'`).get() as any).n)).toBe(0);
  });

  it('excludes blocked users both ways, self, banned accounts, muted authors and hidden posts', async () => {
    addUser('blocker', { username: 'garden_a' });
    addUser('blocked', { username: 'garden_b' });
    addUser('banned', { username: 'garden_c' });
    addUser('muted', { username: 'garden_d' });
    addUser('fine', { username: 'garden_e' });
    relate('blocker', 'me', 'block');
    relate('me', 'blocked', 'block');
    relate('me', 'muted', 'mute');
    db.prepare(`INSERT INTO user_account_states (user_id, status, updated_at) VALUES ('banned', 'banned', datetime('now'))`).run();
    for (const u of ['blocker', 'blocked', 'banned', 'muted', 'fine', 'me']) addPost(u, `garden day by ${u}`);
    addPost('fine', 'garden hidden', { hidden: true });
    addPost('fine', 'garden no image', { image: null });

    const res = await search('me', { q: 'garden' });
    expect(res.data.people.map((p: any) => p.id).sort()).toEqual(['fine', 'muted']);
    const authors = res.data.posts.map((p: any) => p.author.id).sort();
    expect(authors).toEqual(['fine', 'me']);
    expect(res.data.posts.every((p: any) => !/hidden|no image/.test(p.caption_snippet))).toBe(true);
  });

  it('ranks posts by bm25 and returns snippet, thumb and author', async () => {
    addUser('a', { username: 'alice', display_name: 'Alice A', avatar: 'https://img.test/a.png' });
    const weak = addPost('a', 'A long day with lots of things happening and some painting at the end', { category: 'art' });
    const strong = addPost('a', 'Painting painting painting', { category: 'art' });
    const res = await search('me', { q: 'paint', type: 'posts' });
    expect(res.data.posts.map((p: any) => p.id)).toEqual([strong, weak]);
    expect(res.data.posts[0]).toMatchObject({
      thumb_url: `https://img.test/${strong}.jpg`,
      caption_snippet: 'Painting painting painting',
      author: { id: 'a', username: 'alice', display_name: 'Alice A', avatar_url: 'https://img.test/a.png' },
    });
  });

  it('searches hashtags with # and counts tags', async () => {
    addUser('a');
    addPost('a', 'Flow #yoga #YogaFlow');
    addPost('a', 'More #yoga');
    addPost('a', 'Just yoga, no tag');
    addPost('a', 'Other #yodel');
    const res = await search('me', { q: '#yo' });
    expect(res.data.people).toEqual([]);
    expect(res.data.tags).toEqual([
      { tag: 'yoga', count: 2 },
      { tag: 'yodel', count: 1 },
      { tag: 'yogaflow', count: 1 },
    ]);
    expect(res.data.posts).toHaveLength(3); // only posts carrying a matching tag
    const exact = await search('me', { q: '#yoga', type: 'tags' });
    expect(exact.data.tags[0]).toEqual({ tag: 'yoga', count: 2 });
    // Plain single-word query also suggests tags.
    expect((await search('me', { q: 'yod' })).data.tags).toEqual([{ tag: 'yodel', count: 1 }]);
  });

  it('paginates a single section with next_cursor', async () => {
    for (let i = 0; i < 5; i++) addUser(`m${i}`, { username: `maple${i}` });
    const one = await search('me', { q: 'maple', type: 'people', limit: '2' });
    expect(one.data.people).toHaveLength(2);
    expect(one.data.next_cursor).toBe('2');
    const two = await search('me', { q: 'maple', type: 'people', limit: '2', cursor: '2' });
    const three = await search('me', { q: 'maple', type: 'people', limit: '2', cursor: '4' });
    expect(three.data.people).toHaveLength(1);
    expect(three.data.next_cursor).toBeNull();
    const all = [...one.data.people, ...two.data.people, ...three.data.people].map((p: any) => p.id);
    expect(new Set(all).size).toBe(5);
    // type=all gives capped sections + `more` flags, no cursor.
    for (let i = 5; i < 8; i++) addUser(`m${i}`, { username: `maple${i}` });
    const overview = await search('me', { q: 'maple' });
    expect(overview.data.people).toHaveLength(5);
    expect(overview.data.more.people).toBe(true);
    expect(overview.data.next_cursor).toBeNull();
  });
});
