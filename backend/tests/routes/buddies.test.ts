/**
 * Path Buddies (migration 0037) against an in-memory SQLite built from every
 * migration: friendship required, cap of 5, invite/accept/decline/end, notifications
 * and the shared-streak math (rest days and life mode never break it).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../../src/index';
import type { Env } from '../../src/types';
import { createSqliteD1, loadMigrationsSql, trackParams } from '../utils/sqliteD1';
import { signAccessToken } from '../../src/utils/jwt';
import { computeBuddyStreak, milestoneFor, MAX_BUDDIES } from '../../src/routes/wave3/buddies';
import { addDays } from '../../src/utils/days';

const SCHEMA = loadMigrationsSql();
const D1_MAX_PARAMS = 100;
const TODAY = '2026-11-02';

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

function activeDays(userId: string, from: string, to: string, except: string[] = []) {
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (except.includes(d)) continue;
    db.prepare(
      `INSERT OR REPLACE INTO user_activity_days (user_id, day, kinds, paths, is_rest) VALUES (?, ?, 8, '', 0)`
    ).run(userId, d);
  }
}

function restDay(userId: string, day: string) {
  db.prepare(
    `INSERT OR REPLACE INTO user_activity_days (user_id, day, kinds, paths, is_rest) VALUES (?, ?, 0, '', 1)`
  ).run(userId, day);
}

function pair(id: string, a: string, b: string, since: string) {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  db.prepare(
    `INSERT INTO path_buddies (id, inviter_id, invitee_id, user_lo, user_hi, status, since_day, accepted_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, datetime('now'))`
  ).run(id, a, b, lo, hi, since);
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
  vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
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
    JWT_SECRET: 'buddies-test-secret',
    API_VERSION: 'v1',
  } as Env;
});

afterEach(() => {
  expect(stats.maxParams, stats.maxSql).toBeLessThanOrEqual(D1_MAX_PARAMS);
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
describe('computeBuddyStreak (pure)', () => {
  const set = (...days: string[]) => {
    const s = new Set(days);
    return (d: string) => s.has(d);
  };
  const range = (from: string, to: string) => {
    const out: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
    return out;
  };

  it('counts consecutive shared days ending yesterday while today is pending', () => {
    const me = set(...range('2026-10-28', TODAY));
    const them = set(...range('2026-10-28', '2026-11-01'));
    const r = computeBuddyStreak(me, them, TODAY, null);
    expect(r.streak).toBe(5);
    expect(r.today).toEqual({ me: true, them: false });
  });

  it('includes today once both showed up', () => {
    const both = set(...range('2026-10-28', TODAY));
    expect(computeBuddyStreak(both, both, TODAY, null).streak).toBe(6);
  });

  it('a gap for either person breaks it; best keeps the longer run', () => {
    const me = set(...range('2026-10-20', TODAY));
    const them = set(...range('2026-10-20', '2026-10-27'), ...range('2026-10-29', '2026-11-01'));
    const r = computeBuddyStreak(me, them, TODAY, null);
    expect(r.streak).toBe(4);
    expect(r.best).toBe(8);
  });

  it('never counts days before the pair started, and is bounded by the lookback', () => {
    const both = set(...range('2026-01-01', TODAY));
    expect(computeBuddyStreak(both, both, TODAY, '2026-10-31').streak).toBe(3);
    expect(computeBuddyStreak(both, both, TODAY, null, 120).streak).toBe(120);
  });

  it('names milestones in Grow language', () => {
    expect(milestoneFor(2)).toBeNull();
    expect(milestoneFor(3)?.name).toBe('Sprout pair');
    expect(milestoneFor(13)?.name).toBe('Seedling pair');
    expect(milestoneFor(100)?.name).toBe('Old growth pair');
  });
});

// ---------------------------------------------------------------------------
describe('invites', () => {
  beforeEach(() => {
    for (const u of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'x']) addUser(u, { display_name: u.toUpperCase() });
    for (const u of ['b', 'c', 'd', 'e', 'f', 'g']) befriend('a', u);
  });

  it('requires auth and friendship', async () => {
    expect((await call(null, 'GET', '/buddies')).status).toBe(401);
    const res = await call('a', 'POST', '/buddies/invite', { user_id: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_FRIENDS');
    expect((await call('a', 'POST', '/buddies/invite', { user_id: 'a' })).status).toBe(400);
    expect((await call('a', 'POST', '/buddies/invite', { user_id: 'nobody' })).status).toBe(404);
  });

  it('invite → notification → accept → both see the pair; duplicates are 409', async () => {
    const inv = await call('a', 'POST', '/buddies/invite', { user_id: 'b' });
    expect(inv.status).toBe(201);
    const id = inv.data.buddy.id;
    expect(inv.data.buddy.user).toMatchObject({ id: 'b', username: 'b', display_name: 'B' });
    expect(count(`SELECT COUNT(*) n FROM user_notifications WHERE user_id = 'b' AND type = 'buddy_invite' AND ref_id = ?`, id)).toBe(1);

    // Either direction is the same pair.
    expect((await call('a', 'POST', '/buddies/invite', { user_id: 'b' })).status).toBe(409);
    const back = await call('b', 'POST', '/buddies/invite', { user_id: 'a' });
    expect(back.status).toBe(409);
    expect(back.body.error.details.incoming).toBe(true);

    const listB = await call('b', 'GET', '/buddies');
    expect(listB.data.invites_in.map((i: any) => i.id)).toEqual([id]);
    expect((await call('a', 'GET', '/buddies')).data.invites_out.map((i: any) => i.user.id)).toEqual(['b']);

    // Only the invitee accepts.
    expect((await call('a', 'POST', `/buddies/${id}/accept`)).status).toBe(403);
    expect((await call('c', 'POST', `/buddies/${id}/accept`)).status).toBe(404);
    const acc = await call('b', 'POST', `/buddies/${id}/accept`);
    expect(acc.status).toBe(200);
    expect(acc.data.buddy).toMatchObject({ id, user: { id: 'a' }, streak: 0, since: TODAY });
    expect(count(`SELECT COUNT(*) n FROM user_notifications WHERE user_id = 'a' AND type = 'buddy_accept'`)).toBe(1);

    const listA = await call('a', 'GET', '/buddies');
    expect(listA.data.buddies).toHaveLength(1);
    expect(listA.data.invites_out).toHaveLength(0);

    // End anytime (either side); the pair can start over.
    expect((await call('a', 'DELETE', `/buddies/${id}`)).status).toBe(200);
    expect((await call('b', 'GET', '/buddies')).data.buddies).toHaveLength(0);
    expect((await call('b', 'POST', '/buddies/invite', { user_id: 'a' })).status).toBe(201);
  });

  it('decline removes the invite (invitee only)', async () => {
    const id = (await call('a', 'POST', '/buddies/invite', { user_id: 'c' })).data.buddy.id;
    expect((await call('a', 'POST', `/buddies/${id}/decline`)).status).toBe(404);
    expect((await call('c', 'POST', `/buddies/${id}/decline`)).status).toBe(200);
    expect(count(`SELECT COUNT(*) n FROM path_buddies`)).toBe(0);
  });

  it(`caps at ${MAX_BUDDIES} (active + outgoing invites)`, async () => {
    for (const u of ['b', 'c', 'd', 'e', 'f']) {
      expect((await call('a', 'POST', '/buddies/invite', { user_id: u })).status).toBe(201);
    }
    const res = await call('a', 'POST', '/buddies/invite', { user_id: 'g' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BUDDY_LIMIT');

    // g is full with 5 active buddies → a's invite to g is refused, and g cannot accept more.
    for (const u of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']) addUser(u);
    for (const u of ['p1', 'p2', 'p3', 'p4', 'p5']) pair(`pair_${u}`, 'g', u, TODAY);
    befriend('g', 'p6');
    const full = await call('p6', 'POST', '/buddies/invite', { user_id: 'g' });
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe('BUDDY_LIMIT_THEIRS');
  });
});

// ---------------------------------------------------------------------------
describe('shared streak', () => {
  beforeEach(() => {
    addUser('a');
    addUser('b', { display_name: 'Lea' });
    befriend('a', 'b');
    pair('bud1', 'a', 'b', '2026-10-25');
  });

  it("a rest day counts; today stays pending until both showed up", async () => {
    activeDays('a', '2026-10-25', TODAY);
    activeDays('b', '2026-10-25', '2026-11-01', ['2026-10-28']);
    restDay('b', '2026-10-28');

    const res = await call('a', 'GET', '/buddies');
    expect(res.status).toBe(200);
    const [bud] = res.data.buddies;
    expect(bud).toMatchObject({
      id: 'bud1',
      user: { id: 'b', display_name: 'Lea' },
      streak: 8,
      best: 8,
      today: { me: true, them: false },
      since: '2026-10-25',
      milestone: { days: 7, name: 'Seedling pair' },
      next_milestone: { days: 14 },
    });

    activeDays('b', TODAY, TODAY);
    const after = (await call('b', 'GET', '/buddies')).data.buddies[0];
    expect(after.streak).toBe(9);
    expect(after.today).toEqual({ me: true, them: true });
    expect(count(`SELECT best AS n FROM path_buddies WHERE id = 'bud1'`)).toBe(9);
  });

  it('life mode protects the buddy streak', async () => {
    activeDays('a', '2026-10-25', TODAY);
    activeDays('b', '2026-10-25', '2026-10-28');
    db.prepare(
      `UPDATE users SET life_mode = 'sick', life_mode_since = '2026-10-29', life_mode_until = '2026-11-05' WHERE id = 'b'`
    ).run();
    const [bud] = (await call('a', 'GET', '/buddies')).data.buddies;
    expect(bud.streak).toBe(9);
    expect(bud.today).toEqual({ me: true, them: true });
  });

  it("a missed day the person's own rest token bridged still counts; a second one breaks it", async () => {
    activeDays('a', '2026-10-25', TODAY);
    // b: active 4 days, then misses 10-29 (bridged by their 1 rest token) and 10-30 (breaks).
    activeDays('b', '2026-10-25', '2026-11-01', ['2026-10-29', '2026-10-30']);
    const [bud] = (await call('a', 'GET', '/buddies')).data.buddies;
    expect(bud.streak).toBe(2);
    expect(bud.best).toBe(5);
    expect(bud.milestone).toBeNull();
  });

  it('stored best survives beyond the lookback', async () => {
    db.prepare(`UPDATE path_buddies SET best = 150 WHERE id = 'bud1'`).run();
    const [bud] = (await call('a', 'GET', '/buddies')).data.buddies;
    expect(bud.best).toBe(150);
    expect(bud.streak).toBe(0);
  });
});
