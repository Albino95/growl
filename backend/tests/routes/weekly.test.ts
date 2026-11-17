/**
 * Wave 5 weekly rituals (migration 0046 + routes/wave3/weekly.ts): Sunday check-in
 * form selection (coach custom vs default), the Saturday-noon → Monday-noon window
 * and editability, coach permission, commitment math with rest passes + timezones,
 * and cron idempotency (Saturday nudge, batched coach pings).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../../src/index';
import type { Env } from '../../src/types';
import { createSqliteD1, loadMigrationsSql, trackParams } from '../utils/sqliteD1';
import { signAccessToken } from '../../src/utils/jwt';
import {
  checkinWindow,
  commitmentProgress,
  defaultQuestionsFor,
  normalizeCoachQuestions,
  runCron,
  selectForm,
  validateAnswers,
  type CommitmentRow,
} from '../../src/routes/wave3/weekly';

const SCHEMA = loadMigrationsSql();
const D1_MAX_PARAMS = 100;

// Saturday 14 Nov 2026 is in ISO week 2026-W46 (Mon 9 … Sun 15).
const SAT_1300 = '2026-11-14T13:00:00Z';

let db: ReturnType<typeof createSqliteD1>['raw'];
let env: Env;
let stats: { maxParams: number; maxSql: string };

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

function addUser(id: string, opts: { instructor?: boolean; tz?: string } = {}) {
  db.prepare(
    `INSERT INTO users (id, email, password_hash, metadata, email_verified, timezone, is_instructor, created_at, updated_at)
     VALUES (?, ?, 'x', ?, 1, ?, ?, datetime('now'), datetime('now'))`
  ).run(id, `${id}@example.com`, JSON.stringify({ username: id }), opts.tz ?? 'UTC', opts.instructor ? 1 : 0);
}

function at(iso: string) {
  vi.setSystemTime(new Date(iso));
}

async function call(userId: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
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

async function startPlan(coach: string, client: string) {
  const sent = await call(coach, 'POST', '/instructor/proposals', {
    client_id: client,
    weeks: 4,
    sessions_per_week: 2,
    weekly_fee_eur: 20,
  });
  expect(sent.status).toBe(201);
  const acc = await call(client, 'POST', `/instructor/proposals/${sent.data.proposal.id}/accept`, {});
  expect(acc.status).toBe(200);
  return acc.data.contract.id as string;
}

function activity(userId: string, ...days: string[]) {
  for (const d of days) {
    db.prepare(
      `INSERT INTO user_activity_days (user_id, day, kinds, paths, is_rest) VALUES (?, ?, 8, '', 0)`
    ).run(userId, d);
  }
}

function notifs(userId: string, refType?: string): any[] {
  return db
    .prepare(
      `SELECT * FROM user_notifications WHERE user_id = ? ${refType ? 'AND ref_type = ?' : ''} ORDER BY rowid`
    )
    .all(...(refType ? [userId, refType] : [userId])) as any[];
}

function points(userId: string): number {
  return Number((db.prepare(`SELECT points FROM users WHERE id = ?`).get(userId) as any).points);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  at(SAT_1300);
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
    JWT_SECRET: 'weekly-test-secret',
    API_VERSION: 'v1',
  } as Env;
  addUser('coach', { instructor: true });
  addUser('client');
  addUser('solo');
  addUser('stranger');
});

afterEach(() => {
  expect(stats.maxParams, stats.maxSql).toBeLessThanOrEqual(D1_MAX_PARAMS);
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
describe('checkinWindow (pure)', () => {
  it('opens Saturday 12:00 and closes Monday 12:00 local', () => {
    expect(checkinWindow('UTC', new Date('2026-11-14T11:59:00Z')).open).toBe(false);
    const sat = checkinWindow('UTC', new Date('2026-11-14T12:00:00Z'));
    expect(sat).toMatchObject({ open: true, week: '2026-W46', week_start: '2026-11-09', closes_on: '2026-11-16' });
    expect(checkinWindow('UTC', new Date('2026-11-15T23:30:00Z'))).toMatchObject({ open: true, week: '2026-W46' });
    expect(checkinWindow('UTC', new Date('2026-11-16T11:59:00Z'))).toMatchObject({ open: true, week: '2026-W46' });
    const mon = checkinWindow('UTC', new Date('2026-11-16T12:00:00Z'));
    expect(mon).toMatchObject({ open: false, week: '2026-W47', opens_on: '2026-11-21', latest_week: '2026-W46' });
  });

  it('uses the user timezone', () => {
    // 03:00 UTC Saturday = 12:00 in Tokyo.
    expect(checkinWindow('Asia/Tokyo', new Date('2026-11-14T03:00:00Z')).open).toBe(true);
    expect(checkinWindow('UTC', new Date('2026-11-14T03:00:00Z')).open).toBe(false);
    // 03:00 UTC Monday = Monday 12:00 Tokyo → closed; still Monday 03:00 in UTC → open.
    expect(checkinWindow('Asia/Tokyo', new Date('2026-11-16T03:00:00Z')).open).toBe(false);
    expect(checkinWindow('UTC', new Date('2026-11-16T03:00:00Z')).open).toBe(true);
    // Sunday 20:00 in Los Angeles is already Monday 04:00 UTC.
    expect(checkinWindow('America/Los_Angeles', new Date('2026-11-16T04:00:00Z'))).toMatchObject({
      open: true,
      week: '2026-W46',
    });
  });
});

describe('form selection (pure)', () => {
  it('default form: coach question only with an active coach', () => {
    expect(defaultQuestionsFor(false).map((q) => q.id)).toEqual(['feel', 'went_well', 'in_the_way', 'focus']);
    const none = selectForm([]);
    expect(none.source).toBe('default');
    expect(none.coach).toBeNull();
    const withCoach = selectForm([{ coach_id: 'c1', username: 'Coach', questions: null }]);
    expect(withCoach.questions.map((q) => q.id)).toContain('for_coach');
    expect(withCoach.coach?.id).toBe('c1');
  });

  it('the newest coach with a custom form wins', () => {
    const custom = [{ id: 'q1', type: 'text' as const, prompt: 'Sleep?' }];
    const f = selectForm([
      { coach_id: 'new', username: 'New', questions: null },
      { coach_id: 'old', username: 'Old', questions: custom },
    ]);
    expect(f).toMatchObject({ source: 'coach', coach: { id: 'old' }, questions: custom });
  });

  it('validates coach questions (≤ 5, chips need options)', () => {
    const six = Array.from({ length: 6 }, () => ({ type: 'text', prompt: 'x' }));
    expect(normalizeCoachQuestions({ questions: six })).toEqual({ error: 'Up to 5 questions' });
    expect('error' in normalizeCoachQuestions({ questions: [{ type: 'chips', prompt: 'x', options: ['a'] }] })).toBe(true);
    const ok = normalizeCoachQuestions({
      questions: [
        { type: 'scale', prompt: 'Energy?' },
        { id: 'sleep', type: 'text', prompt: 'Sleep?' },
      ],
    });
    expect(ok).toEqual({
      questions: [
        { id: 'q1', type: 'scale', prompt: 'Energy?' },
        { id: 'sleep', type: 'text', prompt: 'Sleep?' },
      ],
    });
  });

  it('validates answers against the questions', () => {
    const qs = defaultQuestionsFor(false);
    expect(validateAnswers(qs, { feel: 6 })).toHaveProperty('error');
    expect(validateAnswers(qs, { in_the_way: { chips: ['Weather'] } })).toHaveProperty('error');
    expect(validateAnswers(qs, { feel: '', focus: '  ' })).toEqual({ error: 'Answer at least one question' });
    expect(
      validateAnswers(qs, { feel: 4, in_the_way: { chips: ['Time', 'Time'], text: ' kids ' }, nope: 'x', for_coach: 'hi' })
    ).toEqual({ answers: { feel: 4, in_the_way: { chips: ['Time'], text: 'kids' } } });
  });
});

describe('commitmentProgress (pure)', () => {
  const row = (over: Partial<CommitmentRow> = {}): CommitmentRow => ({
    id: 'w1',
    week: '2026-W46',
    week_start: '2026-11-09',
    target_days: 5,
    pass_days: '',
    status: 'active',
    covered_days: null,
    points_awarded: 0,
    settled_at: null,
    created_at: '',
    ...over,
  });

  it('counts active days plus passes, never double-counting', () => {
    const active = new Set(['2026-11-09', '2026-11-10', '2026-11-12', '2026-11-20']);
    const p = commitmentProgress(row({ pass_days: '2026-11-11,2026-11-12' }), active, '2026-11-13');
    expect(p.active_days).toBe(3);
    expect(p.covered).toBe(4); // pass on the 12th was active anyway
    expect(p.passes_used).toBe(2);
    expect(p.remaining).toBe(1);
    expect(p.reachable).toBe(true);
    expect(p.days.map((d) => d.status)).toEqual(['active', 'active', 'pass', 'active', 'today', 'future', 'future']);
  });

  it('is unreachable when too few days and passes remain', () => {
    const p = commitmentProgress(row({ target_days: 7 }), new Set(), '2026-11-15');
    expect(p.reachable).toBe(false);
    expect(p.days.filter((d) => d.status === 'open')).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
describe('weekly check-in routes', () => {
  it('needs auth', async () => {
    expect((await call(null, 'GET', '/weekly/current')).status).toBe(401);
  });

  it('submits once per week, edits until Monday noon, then locks', async () => {
    const cur = await call('solo', 'GET', '/weekly/current');
    expect(cur.status).toBe(200);
    expect(cur.data.window).toMatchObject({ open: true, week: '2026-W46' });
    expect(cur.data.has_coach).toBe(false);
    expect(cur.data.form.questions.map((q: any) => q.id)).not.toContain('for_coach');

    const first = await call('solo', 'POST', '/weekly/checkins', { answers: { feel: 4, went_well: 'Ran twice' } });
    expect(first.status).toBe(201);
    expect(first.data.created).toBe(true);
    expect(first.data.checkin).toMatchObject({ week: '2026-W46', editable: true, shared_with_coach: false });

    at('2026-11-16T11:00:00Z');
    const edit = await call('solo', 'POST', '/weekly/checkins', { week: '2026-W46', answers: { feel: 5 } });
    expect(edit.status).toBe(200);
    expect(edit.data.checkin.id).toBe(first.data.checkin.id);
    expect(edit.data.checkin.answers).toEqual({ feel: 5 });
    expect(Number((db.prepare(`SELECT COUNT(*) AS n FROM weekly_checkins`).get() as any).n)).toBe(1);

    at('2026-11-16T12:00:00Z');
    const late = await call('solo', 'POST', '/weekly/checkins', { answers: { feel: 3 } });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('WINDOW_CLOSED');
    const list = await call('solo', 'GET', '/weekly/checkins?week=2026-W46');
    expect(list.data.checkins).toHaveLength(1);
    expect(list.data.checkins[0]).toMatchObject({ editable: false, answers: { feel: 5 } });
  });

  it('is closed on a weekday and replays an idempotent create', async () => {
    at('2026-11-12T10:00:00Z');
    const closed = await call('solo', 'POST', '/weekly/checkins', { answers: { feel: 3 } });
    expect(closed.status).toBe(409);
    at(SAT_1300);
    const h = { 'Idempotency-Key': 'weekly-key-123456' };
    const a = await call('solo', 'POST', '/weekly/checkins', { answers: { feel: 3 } }, h);
    const b = await call('solo', 'POST', '/weekly/checkins', { answers: { feel: 3 } }, h);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.data.checkin.id).toBe(a.data.checkin.id);
  });

  it('rejects bad answers', async () => {
    const r = await call('solo', 'POST', '/weekly/checkins', { answers: { feel: 9 } });
    expect(r.status).toBe(400);
  });

  it('clients get their coach’s custom form; only coaches can set one', async () => {
    expect((await call('client', 'PUT', '/weekly/form', { questions: [{ type: 'text', prompt: 'x' }] })).status).toBe(403);
    const put = await call('coach', 'PUT', '/weekly/form', {
      questions: [
        { type: 'scale', prompt: 'Energy this week?' },
        { type: 'chips', prompt: 'Workouts', options: ['0', '1-2', '3+'] },
      ],
    });
    expect(put.status).toBe(200);
    expect(put.data.my_form).toHaveLength(2);
    // Not a client yet → default form.
    expect((await call('client', 'GET', '/weekly/current')).data.form.source).toBe('default');

    await startPlan('coach', 'client');
    const cur = await call('client', 'GET', '/weekly/current');
    expect(cur.data.form).toMatchObject({ source: 'coach', coach: { id: 'coach', username: 'coach' } });
    expect(cur.data.has_coach).toBe(true);
    const sub = await call('client', 'POST', '/weekly/checkins', { answers: { q1: 4, q2: { chips: ['3+'] } } });
    expect(sub.status).toBe(201);
    expect(sub.data.checkin).toMatchObject({ form_source: 'coach', shared_with_coach: true });

    // The coach edits the form later: the client's answered snapshot is kept.
    await call('coach', 'PUT', '/weekly/form', { questions: [{ type: 'text', prompt: 'New?' }] });
    const again = await call('client', 'GET', '/weekly/current');
    expect(again.data.form.questions.map((q: any) => q.prompt)).toEqual(['Energy this week?', 'Workouts']);

    const reset = await call('coach', 'PUT', '/weekly/form', { questions: [] });
    expect(reset.data.my_form).toBeNull();
    expect((await call('coach', 'GET', '/weekly/form')).data).toMatchObject({ my_form: null, is_coach: true });
  });

  it('a coach with an active plan sees shared answers; others do not', async () => {
    // Submitted before coaching started → not shared, stays private.
    await call('client', 'POST', '/weekly/checkins', { answers: { feel: 2 } });
    const contractId = await startPlan('coach', 'client');
    expect((await call('coach', 'GET', '/weekly/checkins?user_id=client')).data.checkins).toHaveLength(0);

    at('2026-11-21T13:00:00Z');
    const sub = await call('client', 'POST', '/weekly/checkins', { answers: { feel: 4, for_coach: 'Knee is sore' } });
    expect(sub.data.checkin.answers.for_coach).toBe('Knee is sore');
    const seen = await call('coach', 'GET', '/weekly/checkins?user_id=client');
    expect(seen.status).toBe(200);
    expect(seen.data.checkins).toHaveLength(1);
    expect(seen.data.checkins[0]).toMatchObject({ week: '2026-W47', editable: false });

    expect((await call('stranger', 'GET', '/weekly/checkins?user_id=client')).status).toBe(403);
    expect((await call('client', 'GET', '/weekly/checkins?user_id=coach')).status).toBe(403);

    const board = await call('coach', 'GET', '/weekly/coach/checkins');
    expect(board.data.week).toBe('2026-W47');
    expect(board.data.clients).toEqual([
      expect.objectContaining({ user: expect.objectContaining({ id: 'client' }), contract_id: contractId }),
    ]);
    expect(board.data.clients[0].checkin.answers.feel).toBe(4);

    db.prepare(`UPDATE coaching_contracts SET status = 'completed' WHERE id = ?`).run(contractId);
    expect((await call('coach', 'GET', '/weekly/checkins?user_id=client')).status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
describe('coach notifications (batched)', () => {
  beforeEach(() => {
    addUser('client2');
  });

  it('notifies on the first submit, then at most once per hour with a count', async () => {
    await startPlan('coach', 'client');
    await startPlan('coach', 'client2');
    await call('client', 'POST', '/weekly/checkins', { answers: { feel: 4 } });
    let n = notifs('coach', 'weekly_coach');
    expect(n).toHaveLength(1);
    expect(n[0].title).toBe('client sent their week');

    // Edits never notify; a second client inside the hour waits for the batch.
    await call('client', 'POST', '/weekly/checkins', { answers: { feel: 5 } });
    at('2026-11-14T13:20:00Z');
    await call('client2', 'POST', '/weekly/checkins', { answers: { feel: 3 } });
    await runCron(env, new Date('2026-11-14T13:40:00Z'));
    expect(notifs('coach', 'weekly_coach')).toHaveLength(1);

    at('2026-11-14T14:05:00Z');
    await runCron(env, new Date('2026-11-14T14:05:00Z'));
    n = notifs('coach', 'weekly_coach');
    expect(n).toHaveLength(2);
    expect(n[1].title).toBe('client2 sent their week');
    await runCron(env, new Date('2026-11-14T15:10:00Z'));
    expect(notifs('coach', 'weekly_coach')).toHaveLength(2);
  });

  it('counts several clients in one ping', async () => {
    await startPlan('coach', 'client');
    await startPlan('coach', 'client2');
    db.prepare(`INSERT INTO weekly_coach_pings (coach_id, last_sent_at) VALUES ('coach', ?)`).run('2026-11-14T12:30:00.000Z');
    await call('client', 'POST', '/weekly/checkins', { answers: { feel: 4 } });
    await call('client2', 'POST', '/weekly/checkins', { answers: { feel: 4 } });
    expect(notifs('coach', 'weekly_coach')).toHaveLength(0);
    await runCron(env, new Date('2026-11-14T13:31:00Z'));
    const n = notifs('coach', 'weekly_coach');
    expect(n).toHaveLength(1);
    expect(n[0].title).toBe('2 clients sent their week');
  });
});

describe('Saturday nudge cron', () => {
  it('sends once per user per week, only Saturday noon onward, in local time', async () => {
    addUser('tokyo', { tz: 'Asia/Tokyo' });
    await runCron(env, new Date('2026-11-13T15:00:00Z')); // Friday
    expect(notifs('solo', 'weekly_checkin')).toHaveLength(0);

    // 03:00 UTC Saturday: noon in Tokyo, 03:00 in UTC.
    await runCron(env, new Date('2026-11-14T03:00:00Z'));
    expect(notifs('tokyo', 'weekly_checkin')).toHaveLength(1);
    expect(notifs('solo', 'weekly_checkin')).toHaveLength(0);

    await call('client', 'POST', '/weekly/checkins', { answers: { feel: 4 } }); // already answered → skipped
    await runCron(env, new Date('2026-11-14T12:00:00Z'));
    await runCron(env, new Date('2026-11-14T13:00:00Z'));
    await runCron(env, new Date('2026-11-15T09:00:00Z'));
    const solo = notifs('solo', 'weekly_checkin');
    expect(solo).toHaveLength(1);
    expect(solo[0]).toMatchObject({ title: 'Your week in 2 minutes', ref_id: '2026-W46', type: 'system' });
    expect(notifs('tokyo', 'weekly_checkin')).toHaveLength(1);
    expect(notifs('client', 'weekly_checkin')).toHaveLength(0);
    // Monday morning (window still open) sends nothing new; next Saturday does.
    await runCron(env, new Date('2026-11-16T08:00:00Z'));
    expect(notifs('stranger', 'weekly_checkin')).toHaveLength(1);
    await runCron(env, new Date('2026-11-21T12:30:00Z'));
    expect(notifs('solo', 'weekly_checkin')).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
describe('weekly commitment', () => {
  it('validates the target and tracks progress with passes', async () => {
    at('2026-11-11T09:00:00Z'); // Wednesday W46
    expect((await call('solo', 'PUT', '/weekly/commitment', { target_days: 2 })).status).toBe(400);
    expect((await call('solo', 'PUT', '/weekly/commitment', { target_days: 8 })).status).toBe(400);
    const set = await call('solo', 'PUT', '/weekly/commitment', { target_days: 5 });
    expect(set.status).toBe(200);
    expect(set.data.commitment).toMatchObject({ week: '2026-W46', target_days: 5, covered: 0, passes_total: 2 });

    activity('solo', '2026-11-09', '2026-11-11');
    const streakBefore = db.prepare(`SELECT * FROM user_streaks WHERE user_id = 'solo'`).get();
    const pass = await call('solo', 'POST', '/weekly/commitment/pass', { day: '2026-11-10' });
    expect(pass.status).toBe(200);
    expect(pass.data.commitment).toMatchObject({ covered: 3, passes_used: 1, active_days: 2 });
    // Passes never touch the growth streak or rest days.
    expect(db.prepare(`SELECT * FROM user_streaks WHERE user_id = 'solo'`).get()).toEqual(streakBefore);
    expect(Number((db.prepare(`SELECT COUNT(*) AS n FROM user_activity_days WHERE user_id = 'solo'`).get() as any).n)).toBe(2);

    expect((await call('solo', 'POST', '/weekly/commitment/pass', { day: '2026-11-11' })).body.error.code).toBe('ALREADY_ACTIVE');
    expect((await call('solo', 'POST', '/weekly/commitment/pass', { day: '2026-11-13' })).status).toBe(400); // future
    expect((await call('solo', 'POST', '/weekly/commitment/pass', { day: '2026-11-02' })).status).toBe(400); // last week
    // Idempotent re-use of the same day.
    expect((await call('solo', 'POST', '/weekly/commitment/pass', { day: '2026-11-10' })).data.commitment.passes_used).toBe(1);
    db.prepare(`DELETE FROM user_activity_days WHERE user_id = 'solo' AND day = '2026-11-09'`).run();
    expect((await call('solo', 'POST', '/weekly/commitment/pass', { day: '2026-11-09' })).data.commitment.passes_used).toBe(2);
    expect((await call('solo', 'POST', '/weekly/commitment/pass', { day: '2026-11-11' })).status).toBe(409);
    const undo = await call('solo', 'DELETE', '/weekly/commitment/pass/2026-11-09');
    expect(undo.data.commitment.passes_used).toBe(1);
  });

  it('kept → +10 points exactly once; missed → partly, no penalty', async () => {
    at('2026-11-09T08:00:00Z');
    await call('solo', 'PUT', '/weekly/commitment', { target_days: 4 });
    await call('client', 'PUT', '/weekly/commitment', { target_days: 5 });
    activity('solo', '2026-11-09', '2026-11-10', '2026-11-12');
    activity('client', '2026-11-09', '2026-11-10');
    at('2026-11-14T10:00:00Z');
    await call('solo', 'POST', '/weekly/commitment/pass', { day: '2026-11-11' });
    const before = points('solo');

    at('2026-11-16T09:00:00Z'); // next week
    const g1 = await call('solo', 'GET', '/weekly/commitment');
    expect(g1.data.commitment).toBeNull();
    expect(g1.data.last_result).toMatchObject({ status: 'kept', covered: 4, points_awarded: 10 });
    await call('solo', 'GET', '/weekly/commitment');
    await call('solo', 'GET', '/weekly/commitments');
    expect(points('solo')).toBe(before + 10);

    const clientBefore = points('client');
    const g2 = await call('client', 'GET', '/weekly/commitment');
    expect(g2.data.last_result).toMatchObject({ status: 'partly', covered: 2, target_days: 5, points_awarded: 0 });
    expect(points('client')).toBe(clientBefore);

    const hist = await call('solo', 'GET', '/weekly/commitments?limit=8');
    expect(hist.data.commitments).toHaveLength(1);
    expect(hist.data.commitments[0].status).toBe('kept');
  });

  it('uses the user’s local week', async () => {
    addUser('kiwi', { tz: 'Pacific/Auckland' });
    // Sunday 22 Nov 2026 12:00 UTC is already Monday 23 Nov in Auckland (UTC+13).
    at('2026-11-22T12:00:00Z');
    const kiwi = await call('kiwi', 'PUT', '/weekly/commitment', { target_days: 3 });
    expect(kiwi.data.commitment.week).toBe('2026-W48');
    const utc = await call('solo', 'PUT', '/weekly/commitment', { target_days: 3 });
    expect(utc.data.commitment.week).toBe('2026-W47');
    expect((await call('kiwi', 'POST', '/weekly/commitment/pass', { day: '2026-11-23' })).status).toBe(200);
  });

  it('can be removed', async () => {
    await call('solo', 'PUT', '/weekly/commitment', { target_days: 3 });
    expect((await call('solo', 'DELETE', '/weekly/commitment')).data.removed).toBe(true);
    expect((await call('solo', 'GET', '/weekly/commitment')).data.commitment).toBeNull();
  });
});
