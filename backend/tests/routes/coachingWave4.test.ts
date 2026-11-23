/**
 * Wave 4 coaching (migration 0042 + routes/wave3/coachx.ts + coaching.ts fixes) against an
 * in-memory SQLite built from every migration: check-in sharing consent (default OFF),
 * private session notes, homework feedback, one active plan per pair, no-payment copy,
 * full-population review ratings, coach↔coach review roles and the instructor pipeline.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../../src/index';
import type { Env } from '../../src/types';
import { createSqliteD1, loadMigrationsSql, trackParams } from '../utils/sqliteD1';
import { signAccessToken } from '../../src/utils/jwt';
import { summarizeCheckins } from '../../src/routes/wave3/coachx';
import { pipelineStage } from '../../src/routes/coaching';

const SCHEMA = loadMigrationsSql();
const D1_MAX_PARAMS = 100;
const TODAY = '2026-11-10';

let db: ReturnType<typeof createSqliteD1>['raw'];
let env: Env;
let stats: { maxParams: number; maxSql: string };

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

function addUser(id: string, instructor = false) {
  db.prepare(
    `INSERT INTO users (id, email, password_hash, metadata, email_verified, timezone, is_instructor, created_at, updated_at)
     VALUES (?, ?, 'x', ?, 1, 'UTC', ?, datetime('now'), datetime('now'))`
  ).run(id, `${id}@example.com`, JSON.stringify({ username: id }), instructor ? 1 : 0);
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

/** coach sends a proposal, client accepts (optionally sharing check-ins) → contract id. */
async function startPlan(coach: string, client: string, acceptBody?: unknown) {
  const sent = await call(coach, 'POST', '/instructor/proposals', {
    client_id: client,
    weeks: 4,
    sessions_per_week: 2,
    weekly_fee_eur: 20,
  });
  expect(sent.status).toBe(201);
  const acc = await call(client, 'POST', `/instructor/proposals/${sent.data.proposal.id}/accept`, acceptBody ?? {});
  expect(acc.status).toBe(200);
  return acc.data.contract.id as string;
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
    JWT_SECRET: 'coaching-wave4-secret',
    API_VERSION: 'v1',
  } as Env;
  addUser('coach', true);
  addUser('client');
  addUser('stranger');
});

afterEach(() => {
  expect(stats.maxParams, stats.maxSql).toBeLessThanOrEqual(D1_MAX_PARAMS);
  vi.useRealTimers();
});

describe('summarizeCheckins (pure)', () => {
  it('folds 7 days ending today with mood average and follow-through', () => {
    const s = summarizeCheckins(
      [
        { day: '2026-11-04', mood: 2, rest: 0, followup: 'no', intention: 'x' },
        { day: '2026-11-08', mood: 4, rest: 0, followup: 'yes', intention: 'Run 5k' },
        { day: '2026-11-10', mood: 5, rest: 1, followup: 'partly', intention: null },
        { day: '2026-11-01', mood: 1, rest: 0, followup: 'yes', intention: 'outside window' },
      ],
      TODAY
    );
    expect(s.from).toBe('2026-11-04');
    expect(s.days).toHaveLength(7);
    expect(s.checked_in_days).toBe(3);
    expect(s.rest_days).toBe(1);
    expect(s.avg_mood).toBe(3.7);
    expect(s.followed_through).toBe(2);
    expect(s.days[4]).toMatchObject({ day: '2026-11-08', intention: 'Run 5k', checked_in: true });
    expect(s.days[1].checked_in).toBe(false);
  });
});

describe('pipelineStage (pure)', () => {
  it('orders active > closed > proposal states > talking', () => {
    expect(pipelineStage('talking', 'sent', 'c1')).toBe('active');
    expect(pipelineStage('closed', 'sent', null)).toBe('closed');
    expect(pipelineStage('talking', 'sent', null)).toBe('proposal_sent');
    expect(pipelineStage('talking', 'declined', null)).toBe('declined');
    expect(pipelineStage('talking', 'accepted', null)).toBe('talking');
    expect(pipelineStage('talking', null, null)).toBe('talking');
  });
});

describe('accepting a proposal', () => {
  it('defaults check-in sharing OFF and posts no-payment copy', async () => {
    const id = await startPlan('coach', 'client');
    const got = await call('client', 'GET', `/instructor/contracts/${id}`);
    expect(got.data.contract.share_checkins).toBe(false);
    const msg = db.prepare(`SELECT body FROM messages ORDER BY created_at DESC, rowid DESC LIMIT 1`).get() as any;
    expect(msg.body).toContain('agree the details together');
    expect(msg.body).not.toMatch(/billing coming/i);
  });

  it('can opt in to sharing at accept time', async () => {
    const id = await startPlan('coach', 'client', { share_checkins: true });
    const got = await call('coach', 'GET', `/instructor/contracts/${id}`);
    expect(got.data.contract.share_checkins).toBe(true);
  });

  it('blocks a second proposal while a plan is active', async () => {
    await startPlan('coach', 'client');
    const again = await call('coach', 'POST', '/instructor/proposals', { client_id: 'client', weeks: 2 });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ACTIVE_PLAN');
  });
});

describe('check-in sharing', () => {
  it('coach sees nothing until the client opts in, and loses access when they opt out', async () => {
    const id = await startPlan('coach', 'client');
    db.prepare(
      `INSERT INTO daily_checkins (id, user_id, day, mood, intention, followup) VALUES ('d1', 'client', ?, 4, 'Stretch', 'yes')`
    ).run(TODAY);

    let r = await call('coach', 'GET', `/instructor/x/contracts/${id}/checkins`);
    expect(r.status).toBe(200);
    expect(r.data).toEqual({ shared: false, summary: null });

    expect((await call('coach', 'PUT', `/instructor/x/contracts/${id}/sharing`, { share_checkins: true })).status).toBe(403);
    expect((await call('client', 'PUT', `/instructor/x/contracts/${id}/sharing`, { share_checkins: 'yes' })).status).toBe(400);
    expect((await call('client', 'PUT', `/instructor/x/contracts/${id}/sharing`, { share_checkins: true })).status).toBe(200);

    r = await call('coach', 'GET', `/instructor/x/contracts/${id}/checkins`);
    expect(r.data.shared).toBe(true);
    expect(r.data.summary.checked_in_days).toBe(1);
    expect(r.data.summary.days[6]).toMatchObject({ day: TODAY, mood: 4, intention: 'Stretch' });

    await call('client', 'PUT', `/instructor/x/contracts/${id}/sharing`, { share_checkins: false });
    r = await call('coach', 'GET', `/instructor/x/contracts/${id}/checkins`);
    expect(r.data.summary).toBeNull();

    // The client always sees their own preview; strangers see nothing.
    expect((await call('client', 'GET', `/instructor/x/contracts/${id}/checkins`)).data.summary.checked_in_days).toBe(1);
    expect((await call('stranger', 'GET', `/instructor/x/contracts/${id}/checkins`)).status).toBe(403);
  });
});

describe('session notes', () => {
  it('are private to the coach', async () => {
    const id = await startPlan('coach', 'client');
    const add = await call('coach', 'POST', `/instructor/x/contracts/${id}/notes`, { body: '  Knee sore, go easy  ' });
    expect(add.status).toBe(201);
    expect(add.data.note.body).toBe('Knee sore, go easy');
    expect((await call('coach', 'POST', `/instructor/x/contracts/${id}/notes`, { body: '   ' })).status).toBe(400);

    const list = await call('coach', 'GET', `/instructor/x/contracts/${id}/notes`);
    expect(list.data.notes).toHaveLength(1);
    expect((await call('client', 'GET', `/instructor/x/contracts/${id}/notes`)).status).toBe(403);
    expect((await call('client', 'POST', `/instructor/x/contracts/${id}/notes`, { body: 'hi' })).status).toBe(403);

    const noteId = add.data.note.id;
    expect((await call('client', 'DELETE', `/instructor/x/notes/${noteId}`)).status).toBe(403);
    expect((await call('coach', 'DELETE', `/instructor/x/notes/${noteId}`)).status).toBe(200);
    expect((await call('coach', 'GET', `/instructor/x/contracts/${id}/notes`)).data.notes).toHaveLength(0);
  });
});

describe('homework feedback', () => {
  it('coach leaves feedback, client is notified and sees it on the plan', async () => {
    const id = await startPlan('coach', 'client');
    db.prepare(
      `INSERT INTO coaching_assignments (id, contract_id, seed_id, title, status) VALUES ('a1', ?, 'seed_x', 'Plank', 'done')`
    ).run(id);
    expect((await call('client', 'POST', '/instructor/x/assignments/a1/feedback', { body: 'nice' })).status).toBe(403);
    const fb = await call('coach', 'POST', '/instructor/x/assignments/a1/feedback', { body: 'Great form!' });
    expect(fb.status).toBe(200);
    const plan = await call('client', 'GET', `/instructor/contracts/${id}`);
    expect(plan.data.assignments[0].coach_feedback).toBe('Great form!');
    const n = db.prepare(`SELECT COUNT(*) AS n FROM user_notifications WHERE user_id = 'client' AND type = 'coaching_homework'`).get() as any;
    expect(Number(n.n)).toBe(1);
  });
});

describe('reviews', () => {
  it('rating counts every review, not just the 12 listed', async () => {
    for (let i = 0; i < 14; i++) {
      addUser(`c${i}`);
      db.prepare(
        `INSERT INTO coaching_reviews (id, instructor_id, client_id, reviewer_id, subject_id, direction, stars)
         VALUES (?, 'coach', ?, ?, 'coach', 'client_to_instructor', ?)`
      ).run(`r${i}`, `c${i}`, `c${i}`, i < 7 ? 5 : 3);
    }
    const r = await call(null, 'GET', '/instructor/instructors/coach/reviews');
    expect(r.data.reviews).toHaveLength(12);
    expect(r.data.rating).toEqual({ avg: 4, count: 14 });
  });

  it('an instructor who was coached by another instructor reviews as the client', async () => {
    addUser('coach2', true);
    const k = await startPlan('coach', 'coach2');
    db.prepare(`UPDATE coaching_contracts SET status = 'completed' WHERE id = ?`).run(k);
    const elig = await call('coach2', 'GET', '/instructor/reviews/eligibility?peer_id=coach');
    expect(elig.data).toMatchObject({ eligible: true, direction: 'client_to_instructor' });
    const saved = await call('coach2', 'POST', '/instructor/reviews', { peer_id: 'coach', stars: 5 });
    expect(saved.status).toBe(201);
    expect(saved.data.review.direction).toBe('client_to_instructor');
  });
});

describe('pipeline on GET /instructor/inquiries', () => {
  it('shows proposal_sent, then active after accept', async () => {
    await call('client', 'POST', '/instructor/inquiries', { instructor_id: 'coach', message: 'hi' });
    let rows = (await call('coach', 'GET', '/instructor/inquiries')).data.inquiries;
    expect(rows[0].stage).toBe('talking');
    const sent = await call('coach', 'POST', '/instructor/proposals', { client_id: 'client', weeks: 2 });
    rows = (await call('coach', 'GET', '/instructor/inquiries')).data.inquiries;
    expect(rows[0].stage).toBe('proposal_sent');
    await call('client', 'POST', `/instructor/proposals/${sent.data.proposal.id}/accept`, {});
    rows = (await call('coach', 'GET', '/instructor/inquiries')).data.inquiries;
    expect(rows[0].stage).toBe('active');
    expect(rows[0].active_contract_id).toBeTruthy();
  });
});
