/**
 * Growth system (docs/GROWTH_SYSTEM.md) against a real in-memory SQLite built from
 * every migration: streak rules, Today check-ins, badges, recap, progress,
 * challenges, invites and D1's 100-bound-parameter limit.
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import worker from '../../src/index';
import type { Env } from '../../src/types';
import { createSqliteD1, loadMigrationsSql, trackParams } from '../utils/sqliteD1';
import { signAccessToken } from '../../src/utils/jwt';
import { recordActivity, getStreakState, advanceStreak, INITIAL_STREAK } from '../../src/utils/activity';
import { awardBadge, BADGES } from '../../src/utils/badges';
import { addDays, isoWeek, localDay, weekStart } from '../../src/utils/days';
import { growthLevel } from '../../src/utils/points';
import { normalizeInviteCode, redeemPendingSignupInvite, INVITE_REWARD_CAP } from '../../src/utils/invites';
import { CHALLENGES } from '../../src/utils/challenges';
import { GROWTH_PATHS } from '../../src/utils/categories';
import { EMPTY_WEEK_REFLECTION } from '../../src/utils/recap';

const SCHEMA = loadMigrationsSql();
const D1_MAX_PARAMS = 100;
const globalStats = { maxParams: 0, maxSql: '' };

let db: ReturnType<typeof createSqliteD1>['raw'];
let env: Env;
let stats: { maxParams: number; maxSql: string };

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

function setNow(iso: string) {
  vi.setSystemTime(new Date(iso));
}

function addUser(
  id: string,
  opts: { tz?: string; username?: string; createdAt?: string; points?: number } = {}
) {
  db.prepare(
    `INSERT INTO users (id, email, password_hash, points, metadata, email_verified, timezone, created_at, updated_at)
     VALUES (?, ?, 'x', ?, ?, 1, ?, ?, datetime('now'))`
  ).run(
    id,
    `${id}@example.com`,
    opts.points ?? 0,
    JSON.stringify({ username: opts.username ?? id, categories: ['fitness'] }),
    opts.tz ?? 'UTC',
    opts.createdAt ?? new Date().toISOString().slice(0, 19).replace('T', ' ')
  );
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
  return { status: res.status, body: json, data: json.data };
}

function points(userId: string): number {
  return Number((db.prepare('SELECT points FROM users WHERE id = ?').get(userId) as any).points);
}

function streakRow(userId: string): any {
  return db.prepare('SELECT * FROM user_streaks WHERE user_id = ?').get(userId);
}

function notifications(userId: string, type: string): any[] {
  return db.prepare('SELECT * FROM user_notifications WHERE user_id = ? AND type = ?').all(userId, type);
}

/** Record one activity at noon UTC on each given day. */
async function activeOn(userId: string, days: string[], kind: 'post' | 'journal' | 'story' = 'journal') {
  for (const d of days) {
    setNow(`${d}T12:00:00Z`);
    await recordActivity(env, userId, kind);
  }
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
    JWT_SECRET: 'growth-test-secret',
    API_VERSION: 'v1',
  } as Env;
});

afterEach(() => {
  if (stats.maxParams > globalStats.maxParams) Object.assign(globalStats, stats);
  vi.useRealTimers();
});

afterAll(() => {
  // Every statement issued across this file stayed within D1's bound-param limit.
  expect(globalStats.maxParams, globalStats.maxSql).toBeLessThanOrEqual(D1_MAX_PARAMS);
});

describe('migration 0034', () => {
  it('applies on top of the full chain and backfills activity days', () => {
    const sqlite = createSqliteD1(loadMigrationsSql({ upTo: '0034' }));
    const raw = sqlite.raw;
    raw.prepare(`INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES ('u1', 'u1@x', 'x', '2026-09-01', '2026-09-01')`).run();
    raw.prepare(
      `INSERT INTO posts (id, user_id, image_url, category, created_at, updated_at)
       VALUES ('p1', 'u1', 'https://x', 'fitness', '2026-10-01 08:00:00', '2026-10-01 08:00:00'),
              ('p2', 'u1', 'https://x', 'art:piano', '2026-10-01 09:00:00', '2026-10-01 09:00:00')`
    ).run();
    raw.prepare(
      `INSERT INTO stories (id, user_id, image_url, created_at, updated_at)
       VALUES ('s1', 'u1', 'https://x', '2026-10-01 10:00:00', '2026-10-01 10:00:00'),
              ('s2', 'u1', 'https://x', '2026-10-02 10:00:00', '2026-10-02 10:00:00')`
    ).run();
    raw.prepare(
      `INSERT INTO journal_entries (id, user_id, content, created_at, updated_at)
       VALUES ('j1', 'u1', 'hi', '2026-10-02T21:00:00.000Z', '2026-10-02T21:00:00.000Z')`
    ).run();
    raw.exec(loadMigrationsSql({ only: '0034_growth_system.sql' }));
    const rows = raw.prepare('SELECT * FROM user_activity_days ORDER BY day').all() as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ day: '2026-10-01', kinds: 3, is_rest: 0 });
    expect(rows[0].paths.split(',').sort()).toEqual(['art', 'fitness']);
    expect(rows[1]).toMatchObject({ day: '2026-10-02', kinds: 6, paths: '' });
    const u = raw.prepare('SELECT timezone, invite_code FROM users').get() as any;
    expect(u).toEqual({ timezone: 'UTC', invite_code: null });
  });

  it('cascades growth rows when a user is hard-deleted', async () => {
    addUser('gone');
    await activeOn('gone', ['2026-11-02']);
    await awardBadge(env, 'gone', 'first_friend');
    db.prepare(`INSERT INTO daily_checkins (id, user_id, day, mood) VALUES ('c', 'gone', '2026-11-02', 3)`).run();
    expect((db.prepare('SELECT COUNT(*) n FROM user_badges WHERE user_id = ?').get('gone') as any).n).toBeGreaterThan(0);
    db.prepare(`DELETE FROM user_notifications WHERE user_id = 'gone'`).run();
    db.prepare(`DELETE FROM users WHERE id = 'gone'`).run();
    for (const t of ['user_activity_days', 'user_streaks', 'daily_checkins', 'user_badges']) {
      expect((db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as any).n, t).toBe(0);
    }
  });
});

describe('streak rules', () => {
  it('counts consecutive local days and is idempotent per day', async () => {
    addUser('a');
    await activeOn('a', ['2026-11-02', '2026-11-03', '2026-11-04']);
    await activeOn('a', ['2026-11-04'], 'post'); // same day, other kind
    await activeOn('a', ['2026-11-04']); // same day, same kind
    const s = streakRow('a');
    expect(s).toMatchObject({ current: 3, longest: 3, total_days: 3, last_active_day: '2026-11-04' });
    const day = db.prepare(`SELECT kinds FROM user_activity_days WHERE user_id = 'a' AND day = '2026-11-04'`).get() as any;
    expect(day.kinds).toBe(1 | 4);
    const badges = (db.prepare(`SELECT badge_id FROM user_badges WHERE user_id = 'a'`).all() as any[]).map((r) => r.badge_id);
    expect(badges).toContain('streak_3');
  });

  it('a gap covered by a rest token keeps the streak', async () => {
    addUser('a');
    await activeOn('a', ['2026-11-02', '2026-11-03']);
    await activeOn('a', ['2026-11-05']); // 11-04 missed
    const s = streakRow('a');
    expect(s).toMatchObject({ current: 3, longest: 3, total_days: 3, rest_tokens: 0 });
    const rest = db.prepare(`SELECT is_rest FROM user_activity_days WHERE user_id = 'a' AND day = '2026-11-04'`).get() as any;
    expect(rest.is_rest).toBe(1);

    const { data } = await call('a', 'GET', '/me/streak');
    expect(data.week.find((d: any) => d.day === '2026-11-04').status).toBe('rest');
    expect(data.week.find((d: any) => d.day === '2026-11-05').status).toBe('active');
    expect(data.week.find((d: any) => d.day === '2026-11-06').status).toBe('future');
    expect(data.today_done).toBe(true);
  });

  it('a gap with no tokens resets current but keeps longest', async () => {
    addUser('a');
    await activeOn('a', ['2026-11-02', '2026-11-03']);
    await activeOn('a', ['2026-11-06']); // 11-04 rest token, 11-05 none left → reset
    expect(streakRow('a')).toMatchObject({ current: 1, longest: 2, total_days: 3, rest_tokens: 0 });

    // Settling on read: after more missed days the streak shows 0, longest intact.
    setNow('2026-11-09T12:00:00Z');
    const { data } = await call('a', 'GET', '/me/streak');
    expect(data).toMatchObject({ current: 0, longest: 2, total_days: 3, rest_days_left: 0, today_done: false });
    expect(data.week[0]).toEqual({ day: '2026-11-09', status: 'today' });
  });

  it('earns a rest token every 7 active days, capped at 2', async () => {
    addUser('a');
    const days = Array.from({ length: 14 }, (_, i) => addDays('2026-11-01', i));
    await activeOn('a', days.slice(0, 7));
    expect(streakRow('a')).toMatchObject({ current: 7, rest_tokens: 2, active_since_token: 0 });
    await activeOn('a', days.slice(7));
    expect(streakRow('a')).toMatchObject({ current: 14, rest_tokens: 2, active_since_token: 0 });
    // pure fold agrees
    const map = new Map(days.map((d) => [d, { day: d, kinds: 1, is_rest: 0 }]));
    expect(advanceStreak(INITIAL_STREAK, map, days[0], days[13]).state.rest_tokens).toBe(2);
  });

  it('lazily rebuilds from backfilled rows and replays back-dated activity', async () => {
    addUser('a');
    db.prepare(
      `INSERT INTO user_activity_days (user_id, day, kinds) VALUES ('a', '2026-10-30', 1), ('a', '2026-10-31', 1), ('a', '2026-11-01', 4)`
    ).run();
    setNow('2026-11-02T12:00:00Z');
    const got = await getStreakState(env, 'a');
    expect(got?.state).toMatchObject({ current: 3, longest: 3, total_days: 3, settled_through: '2026-11-01' });
  });

  it('counts 00:30 in Europe/Luxembourg as that local day', async () => {
    addUser('lux', { tz: 'Europe/Luxembourg' });
    setNow('2026-11-13T23:30:00Z'); // 00:30 on 14 Nov in Luxembourg (CET, UTC+1)
    expect(localDay('Europe/Luxembourg')).toBe('2026-11-14');
    await recordActivity(env, 'lux', 'post', { path: 'fitness:cardio' });
    const row = db.prepare(`SELECT day, paths FROM user_activity_days WHERE user_id = 'lux'`).get() as any;
    expect(row).toEqual({ day: '2026-11-14', paths: 'fitness' });
    const { data } = await call('lux', 'GET', '/me/streak');
    expect(data.today).toBe('2026-11-14');
    expect(data.today_done).toBe(true);
  });

  it('stores a valid X-Timezone header and ignores invalid ones', async () => {
    addUser('a');
    await call('a', 'GET', '/me/streak', undefined, { 'X-Timezone': 'Not/AZone' });
    expect((db.prepare(`SELECT timezone FROM users WHERE id = 'a'`).get() as any).timezone).toBe('UTC');
    await call('a', 'GET', '/me/streak', undefined, { 'X-Timezone': 'Europe/Luxembourg' });
    expect((db.prepare(`SELECT timezone FROM users WHERE id = 'a'`).get() as any).timezone).toBe('Europe/Luxembourg');
  });

  it('profile streak_days reports the unified current streak', async () => {
    addUser('a');
    await activeOn('a', ['2026-11-02', '2026-11-03']);
    const { data } = await call('a', 'GET', '/profile?stats=1');
    expect(data.streak_days).toBe(2);
  });

  it('journal create records activity and returns new_badges', async () => {
    addUser('a');
    const res = await call('a', 'POST', '/journal/entries', { content: 'Today I stretched.' });
    expect(res.status).toBe(201);
    expect(res.data.new_badges.map((b: any) => b.id)).toEqual(['first_journal']);
    expect(db.prepare(`SELECT kinds FROM user_activity_days WHERE user_id = 'a'`).get()).toEqual({ kinds: 4 });
    const again = await call('a', 'POST', '/journal/entries', { content: 'More.' });
    expect(again.data.new_badges).toEqual([]);
  });
});

describe('Today check-in', () => {
  it('upserts per day and awards DAILY_CHECKIN points only on first insert', async () => {
    addUser('a');
    const day = '2026-11-02';
    const first = await call('a', 'PUT', '/me/today', { day, mood: 4, path: 'fitness:cardio', intention: 'Walk 20 min' });
    expect(first.status).toBe(200);
    expect(first.data.points_awarded).toBe(2);
    expect(first.data.checkin).toMatchObject({ day, mood: 4, path: 'fitness:cardio', intention: 'Walk 20 min', rest: false, followup: null });
    expect(first.data.new_badges.map((b: any) => b.id)).toContain('first_checkin');
    expect(first.data.streak).toMatchObject({ current: 1, today_done: true, today: day });
    expect(points('a')).toBe(2 + 10);

    const edit = await call('a', 'PUT', '/me/today', { day, followup: 'yes' });
    expect(edit.status).toBe(200);
    expect(edit.data.points_awarded).toBe(0);
    expect(edit.data.checkin).toMatchObject({ mood: 4, intention: 'Walk 20 min', followup: 'yes' });
    expect(edit.data.new_badges).toEqual([]);
    expect(points('a')).toBe(12);
    expect((db.prepare(`SELECT COUNT(*) n FROM daily_checkins WHERE user_id = 'a'`).get() as any).n).toBe(1);

    const today = await call('a', 'GET', '/me/today');
    expect(today.data.checkin.followup).toBe('yes');
    expect(today.data.streak.current).toBe(1);
  });

  it('validates day window, mood, path and follow-up', async () => {
    addUser('a');
    expect((await call('a', 'PUT', '/me/today', { day: '2026-10-20', mood: 3 })).body.error.code).toBe('INVALID_DAY');
    expect((await call('a', 'PUT', '/me/today', { day: '2026-11-02' })).status).toBe(400);
    expect((await call('a', 'PUT', '/me/today', { day: '2026-11-02', mood: 3, path: 'astrology' })).status).toBe(400);
    expect((await call('a', 'PUT', '/me/today', { day: '2026-11-02', mood: 3, followup: 'yes' })).status).toBe(400);
    expect((await call('a', 'PUT', '/me/today', { day: '2026-11-02', mood: 9 })).status).toBe(400);
    expect((await call('a', 'PUT', '/me/today', { day: '2026-11-02', mood: 3, intention: 'x'.repeat(141) })).status).toBe(400);
    // ±1 day of the server UTC date is accepted
    expect((await call('a', 'PUT', '/me/today', { day: '2026-11-03', mood: 3 })).status).toBe(200);
  });

  it('rest check-in uses a token, keeps the streak, no points; 409 NO_REST_LEFT when none', async () => {
    addUser('a');
    await activeOn('a', ['2026-11-01']);
    const before = points('a');
    setNow('2026-11-02T12:00:00Z');
    const rest = await call('a', 'PUT', '/me/today', { day: '2026-11-02', rest: true });
    expect(rest.status).toBe(200);
    expect(rest.data.points_awarded).toBe(0);
    expect(rest.data.checkin.rest).toBe(true);
    expect(rest.data.streak).toMatchObject({ current: 1, rest_days_left: 0, today_done: true });
    expect(points('a')).toBe(before);

    setNow('2026-11-03T12:00:00Z');
    const none = await call('a', 'PUT', '/me/today', { day: '2026-11-03', rest: true });
    expect(none.status).toBe(409);
    expect(none.body.error.code).toBe('NO_REST_LEFT');
    expect(db.prepare(`SELECT 1 FROM daily_checkins WHERE user_id = 'a' AND day = '2026-11-03'`).get()).toBeUndefined();

    const grow = await call('a', 'PUT', '/me/today', { day: '2026-11-03', mood: 5 });
    expect(grow.data.streak.current).toBe(2);
  });

  it('a rest day that later gets activity becomes active and refunds the token', async () => {
    addUser('a');
    await call('a', 'PUT', '/me/today', { day: '2026-11-02', rest: true });
    expect(streakRow('a').rest_tokens).toBe(0);
    await recordActivity(env, 'a', 'journal');
    expect(streakRow('a')).toMatchObject({ current: 1, rest_tokens: 1, total_days: 1 });
  });
});

describe('badges & level', () => {
  it('awardBadge is idempotent: points and notification once', async () => {
    addUser('a');
    expect(await awardBadge(env, 'a', 'first_friend')).toMatchObject({ id: 'first_friend', points: 15 });
    expect(await awardBadge(env, 'a', 'first_friend')).toBeNull();
    expect(points('a')).toBe(15);
    const n = notifications('a', 'badge_earned');
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ title: 'You earned Grow Together 🤝', ref_type: 'badge', ref_id: 'first_friend' });
  });

  it('GET /me/badges back-fills, reports progress/next/level; seen; public view respects blocks', async () => {
    addUser('a');
    addUser('b');
    const ins = db.prepare(
      `INSERT INTO posts (id, user_id, image_url, category, created_at, updated_at) VALUES (?, 'a', 'https://x', ?, datetime('now'), datetime('now'))`
    );
    ins.run('p1', 'fitness');
    ins.run('p2', 'art:piano');
    ins.run('p3', 'coding');
    const { data } = await call('a', 'GET', '/me/badges');
    const ids = data.earned.map((e: any) => e.id);
    expect(ids).toEqual(expect.arrayContaining(['first_post', 'path_explorer']));
    expect(data.earned[0]).toHaveProperty('seen', false);
    expect(data.catalog).toHaveLength(BADGES.length);
    expect(data.catalog.find((c: any) => c.id === 'checkins_7')).toMatchObject({
      category: 'consistency',
      tier: 'common',
      points: 30,
      progress: { current: 0, target: 7 },
    });
    expect(data.catalog.find((c: any) => c.id === 'streak_100').tier).toBe('rare');
    expect(data.next).toHaveProperty('progress.target');
    expect(data.level).toEqual(growthLevel(10 + 30));
    expect(notifications('a', 'badge_earned')).toHaveLength(0); // silent back-fill

    // second GET awards nothing new
    await call('a', 'GET', '/me/badges');
    expect(points('a')).toBe(40);

    await call('a', 'POST', '/me/badges/seen', { ids: ['first_post'] });
    const again = await call('a', 'GET', '/me/badges');
    expect(again.data.earned.find((e: any) => e.id === 'first_post').seen).toBe(true);

    const pub = await call('b', 'GET', '/users/a/badges');
    expect(pub.status).toBe(200);
    expect(pub.data.earned.every((e: any) => Object.keys(e).sort().join() === 'earned_at,id')).toBe(true);
    expect(pub.data.level.name).toBe('Seed');

    db.prepare(
      `INSERT INTO user_relationships (id, user_id, target_user_id, type, created_at) VALUES ('blk', 'a', 'b', 'block', datetime('now'))`
    ).run();
    expect((await call('b', 'GET', '/users/a/badges')).status).toBe(404);
  });

  it('first like received awards Seen once', async () => {
    addUser('a');
    addUser('b');
    db.prepare(
      `INSERT INTO posts (id, user_id, image_url, category, created_at, updated_at) VALUES ('p1', 'a', 'https://x', 'fitness', datetime('now'), datetime('now'))`
    ).run();
    await call('b', 'POST', '/feed/posts/p1/like');
    await call('b', 'POST', '/feed/posts/p1/like');
    await call('b', 'POST', '/feed/posts/p1/like');
    expect(db.prepare(`SELECT badge_id FROM user_badges WHERE user_id = 'a'`).all()).toEqual([
      { badge_id: 'first_encourage_received' },
    ]);
    expect(notifications('a', 'badge_earned')).toHaveLength(1);
  });

  it('growthLevel thresholds', () => {
    expect(growthLevel(0)).toEqual({ n: 1, name: 'Seed', points: 0, next_at: 50 });
    expect(growthLevel(150)).toMatchObject({ n: 3, name: 'Sapling', next_at: 400 });
    expect(growthLevel(9999)).toMatchObject({ n: 6, name: 'Grove', next_at: null });
  });
});

describe('weekly recap', () => {
  it('returns the last complete local week and stores it once ended', async () => {
    addUser('a', { createdAt: '2026-09-01 10:00:00' });
    await activeOn('a', ['2026-10-20']); // older activity → not first week
    // Week of Mon 2026-11-02
    setNow('2026-11-03T09:00:00Z');
    await call('a', 'PUT', '/me/today', { day: '2026-11-03', mood: 4, path: 'fitness' });
    db.prepare(
      `INSERT INTO posts (id, user_id, image_url, category, metadata, created_at, updated_at)
       VALUES ('r1', 'a', 'https://x', 'fitness', '{"format":"reel"}', '2026-11-04 10:00:00', '2026-11-04 10:00:00'),
              ('p1', 'a', 'https://x', 'art', '{}', '2026-11-04 11:00:00', '2026-11-04 11:00:00')`
    ).run();
    setNow('2026-11-04T12:00:00Z');
    await recordActivity(env, 'a', 'post', { path: 'fitness' });

    setNow('2026-11-10T08:00:00Z');
    const { status, data } = await call('a', 'GET', '/me/recap');
    expect(status).toBe(200);
    expect(data).toMatchObject({
      week: isoWeek('2026-11-02'),
      start: '2026-11-02',
      end: '2026-11-08',
      is_first_week: false,
      empty: false,
      active_days: 2,
      posts: 1,
      reels: 1,
      checkins: 1,
      top_path: 'fitness',
      avg_mood: 4,
    });
    expect(data.days).toHaveLength(7);
    expect(typeof data.reflection).toBe('string');
    for (const k of ['current_streak', 'stories', 'journal_entries', 'encouragement_received', 'new_friends']) {
      expect(typeof data[k]).toBe('number');
    }
    expect(Array.isArray(data.badges_earned)).toBe(true);
    const stored = db.prepare(`SELECT week FROM weekly_recaps WHERE user_id = 'a'`).all();
    expect(stored).toEqual([{ week: data.week }]);
  });

  it('empty week copy, first week flag, current week not stored, bad week 400', async () => {
    addUser('a', { createdAt: '2026-11-02 08:00:00' });
    setNow('2026-11-17T08:00:00Z');
    const empty = await call('a', 'GET', `/me/recap?week=${isoWeek('2026-10-26')}`);
    expect(empty.data).toMatchObject({ empty: true, active_days: 0, reflection: EMPTY_WEEK_REFLECTION });

    setNow('2026-11-03T08:00:00Z');
    await recordActivity(env, 'a', 'journal');
    setNow('2026-11-10T08:00:00Z');
    const first = await call('a', 'GET', `/me/recap?week=${isoWeek('2026-11-02')}`);
    expect(first.data.is_first_week).toBe(true);
    expect(first.data.reflection).toMatch(/first week/i);

    const current = await call('a', 'GET', `/me/recap?week=${isoWeek('2026-11-10')}`);
    expect(current.status).toBe(200);
    expect(
      db.prepare(`SELECT 1 FROM weekly_recaps WHERE user_id = 'a' AND week = ?`).get(isoWeek('2026-11-10'))
    ).toBeUndefined();
    expect((await call('a', 'GET', '/me/recap?week=2026-W99')).status).toBe(400);
    expect((await call('a', 'GET', `/me/recap?week=${isoWeek('2026-12-01')}`)).status).toBe(400);
  });
});

describe('progress', () => {
  it('returns ≤182 days with per-path counts and mood by week', async () => {
    addUser('a');
    await call('a', 'PUT', '/me/today', { day: '2026-11-02', mood: 2, path: 'mindset' });
    db.prepare(
      `INSERT INTO posts (id, user_id, image_url, category, created_at, updated_at) VALUES ('p1', 'a', 'https://x', 'mindset:meditation', datetime('now'), datetime('now'))`
    ).run();
    const { data } = await call('a', 'GET', '/me/progress?range=500');
    expect(data.days).toHaveLength(182);
    expect(data.days[181]).toEqual({ day: '2026-11-02', active: true, rest: false, kinds: 8, mood: 2 });
    expect(data.by_path).toEqual([{ path: 'mindset', count: 2 }]);
    expect(data.mood_by_week.at(-1)).toEqual({ week: isoWeek('2026-11-02'), avg: 2 });
    expect(data).toMatchObject({ longest_streak: 1, total_active_days: 1 });
    const short = await call('a', 'GET', '/me/progress?range=7');
    expect(short.data.days).toHaveLength(7);
  });
});

describe('challenges', () => {
  it('catalog has 2–3 challenges for every top-level path', () => {
    for (const p of GROWTH_PATHS) {
      const n = CHALLENGES.filter((c) => c.path === p).length;
      expect(n, p).toBeGreaterThanOrEqual(2);
      expect(n, p).toBeLessThanOrEqual(3);
    }
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(CHALLENGES.length);
  });

  it('join → progress on path activity → completion (+100, badge, notification); friends-only leaderboard', async () => {
    addUser('a');
    addUser('friend');
    addUser('stranger');
    befriend('a', 'friend');
    const c = CHALLENGES.find((x) => x.id === 'coding-ship-7')!; // 5 of 7 days
    for (const u of ['a', 'friend', 'stranger']) {
      expect((await call(u, 'POST', `/challenges/${c.id}/join`)).status).toBe(200);
    }
    const again = await call('a', 'POST', `/challenges/${c.id}/join`);
    expect(again.data).toMatchObject({ joined: true, joined_at: '2026-11-02', ends_at: addDays('2026-11-02', c.duration_days - 1) });
    expect(again.data.days).toHaveLength(c.duration_days);

    await call('friend', 'PUT', '/me/today', { day: '2026-11-02', mood: 3, path: 'coding' });
    const before = points('a');
    for (let i = 0; i < c.target_days; i++) {
      const day = addDays('2026-11-02', i);
      setNow(`${day}T12:00:00Z`);
      if (i % 2) await recordActivity(env, 'a', 'post', { path: 'coding:web' });
      else await call('a', 'PUT', '/me/today', { day, mood: 4, path: 'coding' });
      if (i === 1) await recordActivity(env, 'a', 'journal'); // no path → no progress
    }
    const detail = await call('a', 'GET', `/challenges/${c.id}`);
    expect(detail.data).toMatchObject({ completed: true, progress: c.target_days });
    expect(detail.data.days.filter((d: any) => d.done)).toHaveLength(c.target_days);
    const board = detail.data.leaderboard;
    expect(board.map((r: any) => r.user_id).sort()).toEqual(['a', 'friend']);
    expect(board[0]).toMatchObject({ user_id: 'a', is_me: true, progress: c.target_days });
    expect(board[1]).toMatchObject({ user_id: 'friend', is_me: false, progress: 1, username: 'friend' });

    const completedRow = db.prepare(`SELECT completed_at FROM challenge_participants WHERE user_id = 'a'`).get() as any;
    expect(completedRow.completed_at).toBeTruthy();
    expect(notifications('a', 'challenge_completed')).toHaveLength(1);
    expect(db.prepare(`SELECT 1 FROM user_badges WHERE user_id = 'a' AND badge_id = 'challenge_complete'`).get()).toBeTruthy();
    // +100 for the challenge and +50 for Finisher landed on top of check-in/badge points
    expect(points('a') - before).toBeGreaterThanOrEqual(150);

    // Reading again doesn't award twice
    await call('a', 'GET', `/challenges/${c.id}`);
    expect(notifications('a', 'challenge_completed')).toHaveLength(1);

    const list = await call('a', 'GET', '/challenges?path=coding');
    expect(list.data.challenges).toHaveLength(CHALLENGES.filter((x) => x.path === 'coding').length);
    const item = list.data.challenges.find((x: any) => x.id === c.id);
    expect(item).toMatchObject({ joined: true, completed: true, progress: c.target_days, participants: 3, emoji: c.emoji });
    expect(list.data.challenges.find((x: any) => x.id !== c.id)).toMatchObject({ joined: false, progress: 0 });

    expect((await call('stranger', 'DELETE', `/challenges/${c.id}/join`)).data).toEqual({ ok: true });
    expect((await call('a', 'GET', '/challenges/nope')).status).toBe(404);
  });
});

describe('invites', () => {
  it('lazily creates a stable Crockford code; public lookup', async () => {
    addUser('inv', { username: 'Mia' });
    const first = await call('inv', 'GET', '/me/invite');
    expect(first.data.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(first.data).toMatchObject({ url: `https://letsgrow.lu/i/${first.data.code}`, invited_count: 0, rewarded_count: 0 });
    expect((await call('inv', 'GET', '/me/invite')).data.code).toBe(first.data.code);

    const lookup = await call(null, 'GET', `/invites/${first.data.code.toLowerCase()}`);
    expect(lookup.status).toBe(200);
    expect(lookup.data).toEqual({ inviter: { username: 'Mia', avatar: null } });
    expect((await call(null, 'GET', '/invites/ZZZZZZZZ')).status).toBe(404);
    expect(normalizeInviteCode('abcd-efgo')).toBe('ABCDEFG0');
    expect(normalizeInviteCode('short')).toBeNull();
  });

  it('public lookup is rate-limited', async () => {
    addUser('inv');
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await call(null, 'GET', '/invites/ZZZZZZZZ')).status;
    expect(last).toBe(429);
  });

  it('redeem rules, friend edge, reward on first activity', async () => {
    addUser('inv', { username: 'Mia' });
    addUser('new', { username: 'Noah' });
    addUser('old', { createdAt: '2026-10-01 10:00:00' });
    addUser('blocked');
    const code = (await call('inv', 'GET', '/me/invite')).data.code;

    expect((await call('inv', 'POST', '/me/invite/redeem', { code })).body.error.code).toBe('OWN_INVITE');
    expect((await call('old', 'POST', '/me/invite/redeem', { code })).status).toBe(403);
    db.prepare(
      `INSERT INTO user_relationships (id, user_id, target_user_id, type, created_at) VALUES ('blk', 'inv', 'blocked', 'block', datetime('now'))`
    ).run();
    expect((await call('blocked', 'POST', '/me/invite/redeem', { code })).status).toBe(404);
    expect((await call('new', 'POST', '/me/invite/redeem', { code: 'ZZZZZZZZ' })).status).toBe(404);
    expect((await call('new', 'POST', '/me/invite/redeem', {})).status).toBe(400);

    const ok = await call('new', 'POST', '/me/invite/redeem', { code });
    expect(ok.status).toBe(200);
    expect(ok.data).toMatchObject({ inviter: { username: 'Mia', avatar: null }, friend: true });
    const edges = db.prepare(`SELECT user_id, target_user_id, source FROM user_relationships WHERE type = 'friend' ORDER BY user_id`).all();
    expect(edges).toEqual([
      { user_id: 'inv', target_user_id: 'new', source: 'manual' },
      { user_id: 'new', target_user_id: 'inv', source: 'manual' },
    ]);
    expect((await call('new', 'POST', '/me/invite/redeem', { code })).status).toBe(409);

    const before = points('inv');
    expect(db.prepare(`SELECT status FROM invite_redemptions WHERE invitee_id = 'new'`).get()).toEqual({ status: 'pending' });
    await recordActivity(env, 'new', 'journal');
    await recordActivity(env, 'new', 'post', { path: 'art' }); // same day: no double reward
    expect(db.prepare(`SELECT status FROM invite_redemptions WHERE invitee_id = 'new'`).get()).toEqual({ status: 'rewarded' });
    expect(points('inv') - before).toBe(50 + 50); // reward + Gardener badge
    expect(notifications('inv', 'invite_joined')).toHaveLength(1);
    expect(db.prepare(`SELECT 1 FROM user_badges WHERE user_id = 'inv' AND badge_id = 'first_invite'`).get()).toBeTruthy();
    const mine = await call('inv', 'GET', '/me/invite');
    expect(mine.data).toMatchObject({ invited_count: 1, rewarded_count: 1 });
  });

  it(`caps rewards at ${INVITE_REWARD_CAP} per inviter per 30 days`, async () => {
    addUser('inv');
    const code = (await call('inv', 'GET', '/me/invite')).data.code;
    for (let i = 0; i < INVITE_REWARD_CAP; i++) {
      addUser(`r${i}`);
      db.prepare(
        `INSERT INTO invite_redemptions (invitee_id, inviter_id, status, rewarded_at) VALUES (?, 'inv', 'rewarded', datetime('now', '-1 day'))`
      ).run(`r${i}`);
    }
    addUser('late');
    expect((await call('late', 'POST', '/me/invite/redeem', { code })).status).toBe(200);
    const before = points('inv');
    await recordActivity(env, 'late', 'journal');
    expect(db.prepare(`SELECT status FROM invite_redemptions WHERE invitee_id = 'late'`).get()).toEqual({ status: 'pending' });
    expect(points('inv')).toBe(before);
  });

  it('sign-up invite code is redeemed after verification', async () => {
    addUser('inv');
    const code = (await call('inv', 'GET', '/me/invite')).data.code;
    addUser('signup');
    db.prepare(`UPDATE users SET metadata = json_set(metadata, '$.pending_invite_code', ?) WHERE id = 'signup'`).run(code);
    await redeemPendingSignupInvite(env, 'signup');
    expect(db.prepare(`SELECT inviter_id FROM invite_redemptions WHERE invitee_id = 'signup'`).get()).toEqual({ inviter_id: 'inv' });
    const meta = JSON.parse((db.prepare(`SELECT metadata FROM users WHERE id = 'signup'`).get() as any).metadata);
    expect(meta.pending_invite_code).toBeUndefined();
  });
});

describe('write limits and D1 params', () => {
  it('check-in PUT is limited to 30/hour', async () => {
    addUser('a');
    let status = 0;
    for (let i = 0; i < 31; i++) {
      status = (await call('a', 'PUT', '/me/today', { day: '2026-11-02', mood: (i % 5) + 1 })).status;
    }
    expect(status).toBe(429);
  });

  it('a long history rebuild stays under 100 bound params per statement', async () => {
    addUser('a');
    // 120 alternating active/missed days → many rest rows written in one rebuild.
    const ins = db.prepare(`INSERT INTO user_activity_days (user_id, day, kinds) VALUES ('a', ?, 1)`);
    for (let i = 0; i < 240; i += 1) {
      if (i % 3 !== 2) ins.run(addDays('2026-03-01', i));
    }
    setNow(`${addDays('2026-03-01', 240)}T12:00:00Z`);
    const got = await getStreakState(env, 'a');
    expect(got?.state.total_days).toBe(160);
    expect(stats.maxParams).toBeLessThanOrEqual(D1_MAX_PARAMS);
    await call('a', 'GET', '/me/progress?range=182');
    await call('a', 'GET', `/me/recap?week=${isoWeek(weekStart(addDays('2026-03-01', 200)))}`);
    expect(stats.maxParams).toBeLessThanOrEqual(D1_MAX_PARAMS);
  });
});
