/**
 * Wave 3 mentions (migration 0039): parser edge cases, post/comment mention
 * storage + notifications (blocks, prefs, self, cap), #tags and /mentions/suggest.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../../src/index';
import type { Env } from '../../src/types';
import { createSqliteD1, loadMigrationsSql, trackParams } from '../utils/sqliteD1';
import { signAccessToken } from '../../src/utils/jwt';
import { parseMentions, parseTags, recordPostMentions } from '../../src/utils/mentions';

const SCHEMA = loadMigrationsSql();
const D1_MAX_PARAMS = 100;
const MEDIA = 'https://api.test/api/v1/media/posts/p.jpg';

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

function relate(a: string, b: string, type: 'friend' | 'block') {
  db.prepare(
    `INSERT INTO user_relationships (id, user_id, target_user_id, type, created_at, source)
     VALUES (?, ?, ?, ?, datetime('now'), 'manual')`
  ).run(`rel_${a}_${b}_${type}`, a, b, type);
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

function rows(sql: string, ...args: unknown[]): any[] {
  return db.prepare(sql).all(...args) as any[];
}

async function post(userId: string, caption: string) {
  const res = await call(userId, 'POST', '/feed/posts', { image_url: MEDIA, caption, category: 'fitness' });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.data.id as string;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
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
    JWT_SECRET: 'mentions-test-secret',
    API_VERSION: 'v1',
  } as Env;
});

afterEach(() => {
  expect(stats.maxParams, stats.maxSql).toBeLessThanOrEqual(D1_MAX_PARAMS);
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
describe('parseMentions', () => {
  it('finds mentions at start, mid-sentence and before punctuation', () => {
    expect(parseMentions('@lea morning run with @Max_2, and @sam.k!')).toEqual(['lea', 'max_2', 'sam.k']);
    expect(parseMentions('thanks @lea.')).toEqual(['lea']);
    expect(parseMentions("@lea's idea (@max) @tom?")).toEqual(['lea', 'max', 'tom']);
    expect(parseMentions('line\n@lea\t@max')).toEqual(['lea', 'max']);
  });

  it('ignores emails, URLs and @ inside words', () => {
    expect(parseMentions('mail me at lea@example.com')).toEqual([]);
    expect(parseMentions('see https://x.com/@lea')).toEqual([]);
    expect(parseMentions('a@@lea foo.@max')).toEqual([]);
  });

  it('enforces 2–30 chars and dedupes case-insensitively', () => {
    expect(parseMentions('@a @ab')).toEqual(['ab']);
    expect(parseMentions(`@${'x'.repeat(30)}`)).toEqual(['x'.repeat(30)]);
    expect(parseMentions(`@${'x'.repeat(31)}`)).toEqual([]);
    expect(parseMentions('@Lea @lea @LEA')).toEqual(['lea']);
    expect(parseMentions('@ @. @..')).toEqual([]);
  });

  it('caps at 10', () => {
    const text = Array.from({ length: 15 }, (_, i) => `@user${i}`).join(' ');
    expect(parseMentions(text)).toHaveLength(10);
  });
});

describe('parseTags', () => {
  it('parses unicode tags, lowercases and dedupes', () => {
    expect(parseTags('#Morning run #café #日本語 #morning')).toEqual(['morning', 'café', '日本語']);
    expect(parseTags('day 3 of #30daysOfYoga!')).toEqual(['30daysofyoga']);
  });

  it('skips numbers-only, single chars, URL fragments, entities and too-long tags', () => {
    expect(parseTags('#1 #2024 #a')).toEqual([]);
    expect(parseTags('https://x.com/page#section a&#39;b x#y')).toEqual([]);
    expect(parseTags(`#${'t'.repeat(40)} #${'u'.repeat(41)}`)).toEqual(['t'.repeat(40)]);
  });
});

// ---------------------------------------------------------------------------
describe('mentions on create', () => {
  beforeEach(() => {
    addUser('author');
    addUser('lea', { username: 'Lea' });
    addUser('max');
    addUser('blocker');
    addUser('blockee');
    addUser('quiet', { notifications_prefs: { notificationsEnabled: false } });
    addUser('nomention', { notifications_prefs: { mentions: false } });
    relate('blocker', 'author', 'block');
    relate('author', 'blockee', 'block');
  });

  it('stores post mentions + tags and notifies, respecting blocks, prefs and self', async () => {
    const postId = await post(
      'author',
      'Sunrise run with @lea @max @author @blocker @blockee @quiet @nomention @ghost #Running #running #dawn'
    );
    const mentioned = rows(`SELECT mentioned_user_id AS u FROM post_mentions WHERE post_id = ? ORDER BY u`, postId).map(
      (r) => r.u
    );
    expect(mentioned).toEqual(['lea', 'max', 'nomention', 'quiet']);
    expect(rows(`SELECT tag FROM post_tags WHERE post_id = ? ORDER BY tag`, postId).map((r) => r.tag)).toEqual([
      'dawn',
      'running',
    ]);
    const notes = rows(
      `SELECT user_id, actor_id, title, body, ref_type, ref_id FROM user_notifications WHERE type = 'mention' ORDER BY user_id`
    );
    expect(notes.map((n) => n.user_id)).toEqual(['lea', 'max']);
    expect(notes[0]).toMatchObject({ actor_id: 'author', title: 'author mentioned you', ref_type: 'post', ref_id: postId });
    expect(notes[0].body).toContain('Sunrise run');
  });

  it('comment mentions notify (not the post author twice) and coalesce bursts', async () => {
    const postId = await post('max', 'just a post');
    const c1 = await call('author', 'POST', `/feed/posts/${postId}/comments`, { content: '@lea look! cc @max @blocker' });
    expect(c1.status, JSON.stringify(c1.body)).toBe(201);
    expect(rows(`SELECT mentioned_user_id AS u FROM comment_mentions ORDER BY u`).map((r) => r.u)).toEqual([
      'lea',
      'max',
    ]);
    const mentionNotes = () =>
      rows(`SELECT user_id, title FROM user_notifications WHERE type = 'mention' ORDER BY user_id`);
    // max (post author) gets the post_comment notification instead.
    expect(mentionNotes()).toEqual([{ user_id: 'lea', title: 'author mentioned you in a comment' }]);

    await call('author', 'POST', `/feed/posts/${postId}/comments`, { content: 'again @lea' });
    expect(mentionNotes()).toHaveLength(1);
    // Outside the 10-minute window a new mention notifies again.
    db.prepare(`UPDATE user_notifications SET created_at = datetime('now', '-1 hour') WHERE type = 'mention'`).run();
    await call('author', 'POST', `/feed/posts/${postId}/comments`, { content: 'and again @lea' });
    expect(mentionNotes()).toHaveLength(2);
  });

  it('a block in either direction stops comment mention notifications', async () => {
    const postId = await post('lea', 'hello');
    relate('max', 'author', 'block');
    await call('author', 'POST', `/feed/posts/${postId}/comments`, { content: 'hi @max' });
    expect(rows(`SELECT 1 FROM user_notifications WHERE type = 'mention'`)).toHaveLength(0);
    expect(rows(`SELECT 1 FROM comment_mentions`)).toHaveLength(0);
  });

  it('caps mentions at 10 per item and never throws', async () => {
    for (let i = 0; i < 12; i++) addUser(`u${i}`);
    const postId = await post('author', Array.from({ length: 12 }, (_, i) => `@u${i}`).join(' '));
    expect(rows(`SELECT 1 FROM post_mentions WHERE post_id = ?`, postId)).toHaveLength(10);
    // Broken DB → swallowed.
    const broken = { DB: { prepare: () => { throw new Error('boom'); } } } as unknown as Env;
    await expect(recordPostMentions(broken, 'p', 'author', '@lea #x1')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
describe('GET /mentions/suggest', () => {
  beforeEach(() => {
    addUser('me');
    addUser('lena_friend', { username: 'lena', display_name: 'Lena K', avatar: 'https://a/l.jpg' });
    addUser('leo');
    addUser('lea_x', { username: 'lea' });
    addUser('leblocked', { username: 'lebron' });
    addUser('other', { username: 'max' });
    relate('me', 'lena_friend', 'friend');
    relate('leblocked', 'me', 'block');
  });

  it('friends first, then others by prefix, excluding blocked and self', async () => {
    const res = await call('me', 'GET', '/mentions/suggest?q=@LE');
    expect(res.status).toBe(200);
    expect(res.data.users.map((u: any) => u.username)).toEqual(['lena', 'lea', 'leo']);
    expect(res.data.users[0]).toEqual({
      id: 'lena_friend',
      username: 'lena',
      display_name: 'Lena K',
      avatar_url: 'https://a/l.jpg',
    });
  });

  it('empty query → friends only; invalid query → empty; max 8; auth required', async () => {
    expect((await call('me', 'GET', '/mentions/suggest?q=')).data.users.map((u: any) => u.id)).toEqual([
      'lena_friend',
    ]);
    expect((await call('me', 'GET', '/mentions/suggest?q=%25')).data.users).toEqual([]);
    for (let i = 0; i < 12; i++) addUser(`zz${i}`);
    expect((await call('me', 'GET', '/mentions/suggest?q=zz')).data.users).toHaveLength(8);
    expect((await call(null, 'GET', '/mentions/suggest?q=zz')).status).toBe(401);
  });
});
