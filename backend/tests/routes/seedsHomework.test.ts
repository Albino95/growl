/**
 * Coaching homework on hidden Seeds: client paths, cap, batching, atomic scoring,
 * targeted assignment completion, and the SEEDS_ENABLED=false gate.
 * Runs against a real in-memory SQLite schema.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockEnv, parseJsonResponse } from '../utils/test-helpers';
import { createSqliteD1, SOCIAL_SCHEMA } from '../utils/sqliteD1';
import type { Env } from '../../src/types';

// Requests carry the acting user in X-Test-User (the shared auth bypass is always `test-user`).
vi.mock('../../src/utils/auth', () => ({
  getRequestContext: async (request: Request, env: Env) => {
    const userId = request.headers.get('X-Test-User');
    if (!userId) return { isAuthenticated: false };
    const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
    return user ? { isAuthenticated: true, userId, user } : { isAuthenticated: false };
  },
}));

import * as seedsRoutes from '../../src/routes/seeds';
import * as coachingRoutes from '../../src/routes/coaching';
import { pickHomeworkPath } from '../../src/routes/coaching';

const SEEDS_SCHEMA = `
CREATE TABLE growth_seeds (
  id TEXT PRIMARY KEY, category_key TEXT NOT NULL, subcategory_key TEXT NOT NULL, title TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'seed', growth_score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'growing', ownership TEXT NOT NULL DEFAULT 'solo',
  visibility TEXT NOT NULL DEFAULT 'private', planted_by_user_id TEXT NOT NULL,
  planted_at TEXT NOT NULL DEFAULT (datetime('now')), matured_at TEXT, resting_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  metric_type TEXT, metric_unit TEXT, metric_start REAL, metric_target REAL, metric_current REAL,
  goal_detail TEXT
);
CREATE TABLE growth_seed_members (
  seed_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
  joined_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (seed_id, user_id)
);
CREATE TABLE growth_seed_events (
  id TEXT PRIMARY KEY, seed_id TEXT NOT NULL, actor_user_id TEXT NOT NULL, action TEXT NOT NULL,
  delta INTEGER NOT NULL DEFAULT 0, ref_type TEXT, ref_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  note TEXT, photo_url TEXT, metric_value REAL, days_since_plant INTEGER
);
CREATE TABLE coaching_inquiries (
  id TEXT PRIMARY KEY, instructor_id TEXT NOT NULL, client_id TEXT NOT NULL, conversation_id TEXT,
  status TEXT NOT NULL DEFAULT 'talking', created_at TEXT, updated_at TEXT
);
CREATE TABLE coaching_contracts (
  id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL, inquiry_id TEXT NOT NULL, instructor_id TEXT NOT NULL,
  client_id TEXT NOT NULL, weeks INTEGER NOT NULL, sessions_per_week INTEGER NOT NULL,
  weekly_fee_eur REAL NOT NULL, total_eur REAL NOT NULL, trial_days INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR', draw TEXT NOT NULL DEFAULT 'weekly',
  status TEXT NOT NULL DEFAULT 'active', started_at TEXT NOT NULL, ends_at TEXT NOT NULL,
  completed_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE coaching_assignments (
  id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, seed_id TEXT NOT NULL, title TEXT, due_at TEXT,
  status TEXT NOT NULL DEFAULT 'assigned', created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
`;

const BASE = 'https://api.test/api/v1';
const COACH = 'coach';
const CLIENT = 'client';
const PHOTO = 'https://cdn.example.com/p.jpg';

function req(user: string | null, path: string, body?: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (user) headers['X-Test-User'] = user;
  return new Request(`${BASE}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('coaching homework on hidden seeds', () => {
  let env: Env;
  let db: ReturnType<typeof createSqliteD1>['raw'];
  let batchCalls: number;

  const addUser = (id: string, categories: string[] = []) =>
    db
      .prepare(`INSERT INTO users (id, email, metadata) VALUES (?, ?, ?)`)
      .run(id, `${id}@example.com`, JSON.stringify({ username: id, categories }));

  const addSeed = (id: string, owner: string, extra: Record<string, unknown> = {}) => {
    const cols = { id, category_key: 'fitness', subcategory_key: 'running', title: id, planted_by_user_id: owner, ...extra };
    const keys = Object.keys(cols);
    db.prepare(
      `INSERT INTO growth_seeds (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
    ).run(...(Object.values(cols) as (string | number | null)[]));
    db.prepare(`INSERT INTO growth_seed_members (seed_id, user_id, role, status) VALUES (?, ?, 'owner', 'active')`).run(id, owner);
  };

  const addAssignment = (id: string, seedId: string, createdAt: string) =>
    db
      .prepare(
        `INSERT INTO coaching_assignments (id, contract_id, seed_id, status, created_at) VALUES (?, 'ctr1', ?, 'assigned', ?)`
      )
      .run(id, seedId, createdAt);

  const rows = (sql: string, ...args: (string | number)[]) =>
    db.prepare(sql).all(...args) as Record<string, any>[];

  beforeEach(() => {
    const sqlite = createSqliteD1(SOCIAL_SCHEMA + SEEDS_SCHEMA);
    db = sqlite.raw;
    batchCalls = 0;
    // D1 batch = all-or-nothing transaction.
    const d1 = sqlite.d1 as any;
    d1.batch = async (stmts: { run: () => Promise<unknown> }[]) => {
      batchCalls += 1;
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        db.exec('COMMIT');
        return out;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    };
    env = createMockEnv();
    env.DB = d1;
    addUser(COACH, ['music:guitar']);
    addUser(CLIENT, ['fitness:running', 'art']);
    db.prepare(
      `INSERT INTO coaching_contracts (id, proposal_id, inquiry_id, instructor_id, client_id, weeks,
         sessions_per_week, weekly_fee_eur, total_eur, status, started_at, ends_at)
       VALUES ('ctr1', 'p1', 'i1', ?, ?, 2, 3, 10, 20, 'active', datetime('now'), datetime('now', '+14 days'))`
    ).run(COACH, CLIENT);
  });

  describe('assignHomework', () => {
    it('plants on the client path (not the coach path), solo, batched, notifies with the contract ref', async () => {
      const res = await coachingRoutes.assignHomework(
        req(COACH, '/instructor/contracts/ctr1/assignments', { title: 'Run 5k' }),
        env,
        'ctr1'
      );
      expect(res.status).toBe(201);
      expect(batchCalls).toBe(1);

      const [seed] = rows(`SELECT * FROM growth_seeds`);
      expect(seed.category_key).toBe('fitness');
      expect(seed.subcategory_key).toBe('running');
      expect(seed.ownership).toBe('solo');
      expect(seed.metric_target).toBeNull();
      expect(seed.metric_type).toBeNull();

      const members = rows(`SELECT user_id, role FROM growth_seed_members ORDER BY role`);
      expect(members).toEqual([
        { user_id: COACH, role: 'instructor' },
        { user_id: CLIENT, role: 'owner' },
      ]);

      const notes = rows(`SELECT * FROM user_notifications WHERE user_id = ?`, CLIENT);
      expect(notes).toHaveLength(1);
      expect(notes[0].type).toBe('coaching_homework');
      expect(notes[0].ref_type).toBe('coaching_contract');
      expect(notes[0].ref_id).toBe('ctr1');
    });

    it('ignores a requested category that is not on the client paths', async () => {
      await coachingRoutes.assignHomework(
        req(COACH, '/x', { title: 'Scales', category_key: 'music', subcategory_key: 'guitar' }),
        env,
        'ctr1'
      );
      const [seed] = rows(`SELECT category_key, subcategory_key FROM growth_seeds`);
      expect(seed).toEqual({ category_key: 'fitness', subcategory_key: 'running' });
    });

    it('falls back to the coach path only when the client has none', async () => {
      db.prepare(`UPDATE users SET metadata = ? WHERE id = ?`).run(JSON.stringify({ username: CLIENT }), CLIENT);
      await coachingRoutes.assignHomework(req(COACH, '/x', { title: 'Scales' }), env, 'ctr1');
      const [seed] = rows(`SELECT category_key, subcategory_key FROM growth_seeds`);
      expect(seed).toEqual({ category_key: 'music', subcategory_key: 'guitar' });
    });

    it('does not count against the 3-growing-seed cap (and homework does not block planting caps)', async () => {
      addSeed('s1', CLIENT);
      addSeed('s2', CLIENT);
      addSeed('s3', CLIENT);
      const res = await coachingRoutes.assignHomework(req(COACH, '/x', { title: 'Extra' }), env, 'ctr1');
      expect(res.status).toBe(201);

      const list = await parseJsonResponse(await seedsRoutes.listSeeds(req(CLIENT, '/seeds'), env));
      expect(list.data.seeds).toHaveLength(4);
      expect(list.data.active_growing_count).toBe(3);
    });

    it('leaves no orphan seed when the assignment insert fails', async () => {
      db.exec(
        `CREATE TRIGGER fail_asg BEFORE INSERT ON coaching_assignments BEGIN SELECT RAISE(ABORT, 'boom'); END;`
      );
      const res = await coachingRoutes.assignHomework(req(COACH, '/x', { title: 'Boom' }), env, 'ctr1');
      expect(res.status).toBe(500);
      expect(rows(`SELECT id FROM growth_seeds`)).toHaveLength(0);
      expect(rows(`SELECT seed_id FROM growth_seed_members`)).toHaveLength(0);
    });

    it('pickHomeworkPath prefers real sub-paths over "practice"', () => {
      expect(pickHomeworkPath(['fitness'], '', '', 'Morning Mobility')).toEqual({
        categoryKey: 'fitness',
        subcategoryKey: 'morning-mobility',
      });
      expect(pickHomeworkPath(['fitness'], 'fitness', 'yoga', '')).toEqual({
        categoryKey: 'fitness',
        subcategoryKey: 'yoga',
      });
      expect(pickHomeworkPath(['fitness'], '', '', '')).toEqual({
        categoryKey: 'fitness',
        subcategoryKey: 'practice',
      });
      expect(pickHomeworkPath([], '', '', 'x')).toBeNull();
    });
  });

  describe('watering homework seeds', () => {
    beforeEach(() => {
      addSeed('hw', CLIENT);
      db.prepare(`INSERT INTO growth_seed_members (seed_id, user_id, role, status) VALUES ('hw', ?, 'instructor', 'active')`).run(COACH);
      addAssignment('a-old', 'hw', '2026-01-01T00:00:00.000Z');
      addAssignment('a-mid', 'hw', '2026-01-02T00:00:00.000Z');
      addAssignment('a-new', 'hw', '2026-01-03T00:00:00.000Z');
    });

    it('increments growth_score atomically (SQL-side), even from a stale read', async () => {
      // Simulate a concurrent writer bumping the score after the route read it.
      db.prepare(`UPDATE growth_seeds SET growth_score = 14, stage = 'sprout' WHERE id = 'hw'`).run();
      const res = await seedsRoutes.waterSeed(req(CLIENT, '/seeds/hw/water', { action: 'water' }), env, 'hw');
      expect(res.status).toBe(200);
      const body = await parseJsonResponse(res);
      expect(body.data.seed.growth_score).toBe(16);
      expect(body.data.seed.stage).toBe('sapling');
      expect(body.data.staged_up).toBe(true);
      // Stage-up notifications are growth_seed refs → suppressed while hidden.
      expect(rows(`SELECT id FROM user_notifications`)).toHaveLength(0);
    });

    it('owners get 0 for journal/breathe/instructor_tend without a linked object; instructors still tend', async () => {
      for (const action of ['journal', 'breathe', 'instructor_tend']) {
        const res = await seedsRoutes.waterSeed(req(CLIENT, '/seeds/hw/water', { action }), env, 'hw');
        expect(res.status).toBe(200);
      }
      expect(rows(`SELECT growth_score FROM growth_seeds WHERE id = 'hw'`)[0].growth_score).toBe(0);

      await seedsRoutes.waterSeed(req(COACH, '/seeds/hw/water', { action: 'instructor_tend' }), env, 'hw');
      expect(rows(`SELECT growth_score FROM growth_seeds WHERE id = 'hw'`)[0].growth_score).toBe(4);
    });

    it('a photo check-in completes only the targeted assignment', async () => {
      const res = await seedsRoutes.waterSeed(
        req(CLIENT, '/seeds/hw/water', { action: 'check_in', photo_url: PHOTO, assignment_id: 'a-mid' }),
        env,
        'hw'
      );
      expect(res.status).toBe(200);
      expect((await parseJsonResponse(res)).data.completed_assignment_id).toBe('a-mid');
      const status = Object.fromEntries(
        rows(`SELECT id, status FROM coaching_assignments`).map((r) => [r.id, r.status])
      );
      expect(status).toEqual({ 'a-old': 'assigned', 'a-mid': 'done', 'a-new': 'assigned' });
    });

    it('a note-only check-in completes the targeted assignment (client only)', async () => {
      const res = await seedsRoutes.waterSeed(
        req(CLIENT, '/seeds/hw/water', { action: 'check_in', note: 'Did it!', assignment_id: 'a-new' }),
        env,
        'hw'
      );
      expect(res.status).toBe(200);
      expect((await parseJsonResponse(res)).data.completed_assignment_id).toBe('a-new');
      expect(rows(`SELECT id FROM coaching_assignments WHERE status = 'done'`).map((r) => r.id)).toEqual(['a-new']);

      // The coach can't complete it for them; an empty targeted check-in is rejected.
      const coach = await seedsRoutes.waterSeed(
        req(COACH, '/seeds/hw/water', { action: 'check_in', note: 'x', assignment_id: 'a-old' }),
        env,
        'hw'
      );
      expect(coach.status).toBe(403);
      const empty = await seedsRoutes.waterSeed(
        req(CLIENT, '/seeds/hw/water', { action: 'check_in', assignment_id: 'a-old' }),
        env,
        'hw'
      );
      expect(empty.status).toBe(400);
      expect(rows(`SELECT status FROM coaching_assignments WHERE id = 'a-old'`)[0].status).toBe('assigned');
    });

    it('without a photo or assignment_id a check-in completes nothing', async () => {
      await seedsRoutes.waterSeed(req(CLIENT, '/seeds/hw/water', { action: 'check_in', note: 'hi' }), env, 'hw');
      expect(rows(`SELECT id FROM coaching_assignments WHERE status = 'done'`)).toHaveLength(0);
    });

    it('without assignment_id it completes only the oldest open assignment', async () => {
      await seedsRoutes.waterSeed(req(CLIENT, '/seeds/hw/water', { action: 'check_in', photo_url: PHOTO }), env, 'hw');
      const done = rows(`SELECT id FROM coaching_assignments WHERE status = 'done'`).map((r) => r.id);
      expect(done).toEqual(['a-old']);
    });

    it('rejects an assignment_id that is not on this seed', async () => {
      const res = await seedsRoutes.waterSeed(
        req(CLIENT, '/seeds/hw/water', { action: 'check_in', photo_url: PHOTO, assignment_id: 'nope' }),
        env,
        'hw'
      );
      expect(res.status).toBe(404);
      expect(rows(`SELECT id FROM growth_seed_events`)).toHaveLength(0);
    });

    it('GET works for homework seeds', async () => {
      const res = await seedsRoutes.getSeed(req(CLIENT, '/seeds/hw'), env, 'hw');
      expect(res.status).toBe(200);
    });

    it('mature requires the numeric target when the seed has one', async () => {
      db.prepare(
        `UPDATE growth_seeds SET growth_score = 60, metric_type = 'distance', metric_start = 0,
           metric_target = 5, metric_current = 3 WHERE id = 'hw'`
      ).run();
      let res = await seedsRoutes.matureSeed(req(CLIENT, '/seeds/hw/mature', {}), env, 'hw');
      expect(res.status).toBe(400);
      expect((await parseJsonResponse(res)).error.code).toBe('NOT_READY');

      db.prepare(`UPDATE growth_seeds SET metric_current = 5 WHERE id = 'hw'`).run();
      res = await seedsRoutes.matureSeed(req(CLIENT, '/seeds/hw/mature', {}), env, 'hw');
      expect(res.status).toBe(200);
    });
  });

  describe('SEEDS_ENABLED = false', () => {
    beforeEach(() => {
      addSeed('plain', CLIENT, { growth_score: 60 });
      db.prepare(`INSERT INTO user_relationships (id, user_id, target_user_id, type) VALUES ('r1', ?, ?, 'friend')`).run(CLIENT, COACH);
    });

    it('is off', () => {
      expect(seedsRoutes.SEEDS_ENABLED).toBe(false);
    });

    it('plant/invite/accept/mature/water/get return 404 FEATURE_DISABLED for non-homework seeds', async () => {
      const calls: [string, Promise<Response>][] = [
        ['plant', seedsRoutes.createSeed(req(CLIENT, '/seeds', { category_key: 'fitness', subcategory_key: 'running' }), env)],
        ['invite', seedsRoutes.inviteToSeed(req(CLIENT, '/seeds/plain/invite', { user_id: COACH }), env, 'plain')],
        ['accept', seedsRoutes.acceptSeedInvite(req(COACH, '/seeds/plain/accept', {}), env, 'plain')],
        ['mature', seedsRoutes.matureSeed(req(CLIENT, '/seeds/plain/mature', {}), env, 'plain')],
        ['water', seedsRoutes.waterSeed(req(CLIENT, '/seeds/plain/water', { action: 'water' }), env, 'plain')],
        ['get', seedsRoutes.getSeed(req(CLIENT, '/seeds/plain'), env, 'plain')],
      ];
      for (const [name, p] of calls) {
        const res = await p;
        const body = await parseJsonResponse(res);
        expect({ name, status: res.status, code: body.error?.code }).toEqual({
          name,
          status: 404,
          code: 'FEATURE_DISABLED',
        });
      }
      expect(rows(`SELECT id FROM growth_seeds`)).toHaveLength(1);
      expect(rows(`SELECT id FROM user_notifications`)).toHaveLength(0);
    });

    it('homework water still works once the seed is linked from an assignment', async () => {
      addAssignment('a1', 'plain', '2026-01-01T00:00:00.000Z');
      const res = await seedsRoutes.waterSeed(
        req(CLIENT, '/seeds/plain/water', { action: 'check_in', photo_url: PHOTO }),
        env,
        'plain'
      );
      expect(res.status).toBe(200);
      expect(rows(`SELECT status FROM coaching_assignments WHERE id = 'a1'`)[0].status).toBe('done');
    });

    it('invite on a homework seed keeps ownership solo until accepted; re-invite stays pending', async () => {
      addAssignment('a1', 'plain', '2026-01-01T00:00:00.000Z');
      for (let i = 0; i < 2; i += 1) {
        const res = await seedsRoutes.inviteToSeed(
          req(CLIENT, '/seeds/plain/invite', { user_id: COACH, role: 'owner' }),
          env,
          'plain'
        );
        expect(res.status).toBe(200);
      }
      expect(rows(`SELECT ownership FROM growth_seeds WHERE id = 'plain'`)[0].ownership).toBe('solo');
      expect(rows(`SELECT status FROM growth_seed_members WHERE user_id = ?`, COACH)[0].status).toBe('pending');
    });
  });
});
