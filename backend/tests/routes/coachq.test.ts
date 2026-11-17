/**
 * Wave 5 coach supervision (migration 0045 + routes/wave3/coachq.ts) against an in-memory
 * SQLite built from every migration: queue signals (pure, incl. consent off), handled /
 * override expiry, review items, templates, homework proof request, Monday summary
 * idempotency + timezone, and the 100-param guard.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../../src/index';
import type { Env } from '../../src/types';
import { createSqliteD1, loadMigrationsSql, trackParams } from '../utils/sqliteD1';
import { signAccessToken } from '../../src/utils/jwt';
import {
  applyMark,
  cleanTemplates,
  coachSummaryTitle,
  computeSignals,
  isSummaryTime,
  parseProofKind,
  runCron,
  type SignalInput,
} from '../../src/routes/wave3/coachq';
import { addDays } from '../../src/utils/days';

const SCHEMA = loadMigrationsSql();
const D1_MAX_PARAMS = 100;
// Tuesday
const NOW = '2026-11-17T12:00:00Z';
const TODAY = '2026-11-17';

let db: ReturnType<typeof createSqliteD1>['raw'];
let env: Env;
let stats: { maxParams: number; maxSql: string };

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

function addUser(id: string, tz = 'UTC', instructor = false) {
  db.prepare(
    `INSERT INTO users (id, email, password_hash, metadata, email_verified, timezone, is_instructor, created_at, updated_at)
     VALUES (?, ?, 'x', ?, 1, ?, ?, datetime('now'), datetime('now'))`
  ).run(id, `${id}@example.com`, JSON.stringify({ username: id }), tz, instructor ? 1 : 0);
}

function addContract(
  id: string,
  coach: string,
  client: string,
  opts: { share?: boolean; startedDaysAgo?: number; endsInDays?: number; weeks?: number; status?: string } = {}
) {
  const now = Date.parse(NOW);
  const started = new Date(now - (opts.startedDaysAgo ?? 3) * 86_400_000).toISOString();
  const ends = new Date(now + (opts.endsInDays ?? 30) * 86_400_000).toISOString();
  db.prepare(
    `INSERT INTO coaching_inquiries (id, instructor_id, client_id) VALUES (?, ?, ?)`
  ).run(`i_${id}`, coach, client);
  db.prepare(
    `INSERT INTO coaching_proposals (id, inquiry_id, instructor_id, client_id, weeks, sessions_per_week, weekly_fee_eur, total_eur)
     VALUES (?, ?, ?, ?, 4, 2, 10, 40)`
  ).run(`p_${id}`, `i_${id}`, coach, client);
  db.prepare(
    `INSERT INTO coaching_contracts (id, proposal_id, inquiry_id, instructor_id, client_id, weeks, sessions_per_week,
       weekly_fee_eur, total_eur, status, started_at, ends_at, share_checkins)
     VALUES (?, ?, ?, ?, ?, ?, 2, 10, 40, ?, ?, ?, ?)`
  ).run(id, `p_${id}`, `i_${id}`, coach, client, opts.weeks ?? 4, opts.status ?? 'active', started, ends, opts.share ? 1 : 0);
}

function addCheckin(user: string, day: string, mood: number | null, followup: string | null = null) {
  db.prepare(
    `INSERT INTO daily_checkins (id, user_id, day, mood, followup) VALUES (?, ?, ?, ?, ?)`
  ).run(`ci_${user}_${day}`, user, day, mood, followup);
}

function addAssignment(
  id: string,
  contract: string,
  opts: { status?: string; due?: string | null; completedAt?: string | null; proofKind?: string | null; feedback?: string | null } = {}
) {
  db.prepare(
    `INSERT INTO coaching_assignments (id, contract_id, seed_id, title, due_at, status, created_at, completed_at, proof_kind, coach_feedback)
     VALUES (?, ?, 'seed_x', ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    contract,
    `HW ${id}`,
    opts.due ?? null,
    opts.status ?? 'assigned',
    '2026-11-01 10:00:00',
    opts.completedAt ?? null,
    opts.proofKind ?? null,
    opts.feedback ?? null
  );
}

function addProof(
  id: string,
  user: string,
  ctxType: string,
  ctxId: string,
  opts: { shared?: boolean; createdAt?: string; kind?: string; seen?: string | null } = {}
) {
  db.prepare(
    `INSERT INTO proofs (id, user_id, kind, text, context_type, context_id, day, shared_with_coach, seen_by_coach_at, created_at)
     VALUES (?, ?, ?, 'did it', ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    user,
    opts.kind ?? 'note',
    ctxType,
    ctxId,
    TODAY,
    opts.shared === false ? 0 : 1,
    opts.seen ?? null,
    opts.createdAt ?? NOW
  );
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  const sqlite = createSqliteD1(SCHEMA);
  db = sqlite.raw;
  const tracked = trackParams(sqlite.d1);
  stats = tracked.stats;
  (tracked.d1 as any).batch = async (stmts: { run: () => Promise<unknown> }[]) => {
    const out = [];
    for (const s of stmts) out.push(await s.run());
    return out;
  };
  const kv = new Map<string, string>();
  env = {
    DB: tracked.d1 as any,
    KV: {
      get: async (k: string) => kv.get(k) ?? null,
      put: async (k: string, v: string) => void kv.set(k, v),
      delete: async (k: string) => void kv.delete(k),
    } as any,
    ENVIRONMENT: 'test',
    JWT_SECRET: 'coachq-secret',
    API_VERSION: 'v1',
  } as Env;
  addUser('coach', 'UTC', true);
  addUser('client');
});

afterEach(() => {
  expect(stats.maxParams, stats.maxSql).toBeLessThanOrEqual(D1_MAX_PARAMS);
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
function baseInput(over: Partial<SignalInput> = {}): SignalInput {
  return {
    now: new Date(NOW),
    today: TODAY,
    share_checkins: true,
    checkins: [],
    assignments: [],
    proofs: [],
    first_proof_at: null,
    streak_current: null,
    contract: { started_at: '2026-11-14T12:00:00Z', ends_at: '2026-12-30T00:00:00Z', weeks: 4 },
    last_message: null,
    last_coach_message_at: null,
    ...over,
  };
}
const days = (from: number, to: number) => {
  const out: string[] = [];
  for (let i = from; i <= to; i++) out.push(addDays(TODAY, -i));
  return out;
};
const codes = (s: { reasons: { code: string }[] }) => s.reasons.map((r) => r.code);

describe('computeSignals (pure)', () => {
  it('is green with nothing going on', () => {
    const s = computeSignals(baseInput());
    expect(s.status).toBe('green');
    expect(s.reasons).toEqual([]);
  });

  it('flags a 3-day gap only for someone who usually checks in', () => {
    const regular = days(3, 10).map((day) => ({ day, mood: 4, followup: 'yes' }));
    const s = computeSignals(baseInput({ checkins: regular }));
    expect(codes(s)).toContain('no_checkins');
    expect(s.status).toBe('red');
    expect(s.reasons.find((r) => r.code === 'no_checkins')!.label).toBe('No check-in for 3 days');

    const occasional = days(3, 5).map((day) => ({ day, mood: 4, followup: 'yes' }));
    expect(codes(computeSignals(baseInput({ checkins: occasional })))).not.toContain('no_checkins');

    const recent = [...regular, { day: addDays(TODAY, -1), mood: 4, followup: null }];
    expect(codes(computeSignals(baseInput({ checkins: recent })))).not.toContain('no_checkins');
  });

  it('uses a personal mood baseline, worded neutrally', () => {
    const older = days(7, 27).map((day) => ({ day, mood: 5, followup: null }));
    const week = days(0, 3).map((day) => ({ day, mood: 3, followup: null }));
    const s = computeSignals(baseInput({ checkins: [...older, ...week] }));
    const r = s.reasons.find((x) => x.code === 'mood_lower');
    expect(r?.label).toBe('Mood’s been lower this week');
    expect(s.week.mood_trend).toBe('down');
    // A steady 3 is somebody's normal, not a flag.
    const steady = days(0, 27).map((day) => ({ day, mood: 3, followup: null }));
    const s2 = computeSignals(baseInput({ checkins: steady }));
    expect(codes(s2)).not.toContain('mood_lower');
    expect(s2.week.mood_trend).toBe('flat');
  });

  it('flags three low moods in a row', () => {
    const s = computeSignals(
      baseInput({ checkins: days(0, 2).map((day) => ({ day, mood: 2, followup: null })) })
    );
    expect(codes(s)).toContain('low_moods');
    expect(s.status).toBe('red');
  });

  it('ignores every check-in signal when sharing is off', () => {
    const s = computeSignals(
      baseInput({
        share_checkins: false,
        checkins: [
          ...days(3, 10).map((day) => ({ day, mood: 1, followup: 'no' })),
        ],
        streak_current: 30,
      })
    );
    expect(codes(s)).toEqual([]);
    expect(s.wins).toEqual([]);
    expect(s.week).toMatchObject({ days_checked_in: null, mood_avg: null, mood_trend: null, yes_rate: null });
  });

  it('follow-through: partly counts half, needs 3 answers', () => {
    const two = days(0, 1).map((day) => ({ day, mood: null, followup: 'no' }));
    expect(codes(computeSignals(baseInput({ checkins: two })))).not.toContain('low_follow_through');
    const three = [
      { day: days(0, 0)[0], mood: null, followup: 'no' },
      { day: days(1, 1)[0], mood: null, followup: 'partly' },
      { day: days(2, 2)[0], mood: null, followup: 'no' },
    ];
    const s = computeSignals(baseInput({ checkins: three }));
    expect(s.week.yes_rate).toBe(0.17);
    expect(codes(s)).toContain('low_follow_through');
    expect(s.status).toBe('amber');
  });

  it('homework overdue (red at 2+ days), missing proof (amber)', () => {
    const s = computeSignals(
      baseInput({
        assignments: [
          { id: 'a1', title: 'x', due_at: addDays(TODAY, -1), status: 'assigned', completed_at: null, proof_kind: null, coach_feedback_at: null },
        ],
      })
    );
    expect(codes(s)).not.toContain('homework_overdue');
    expect(s.week.homework_overdue).toBe(1);
    const s2 = computeSignals(
      baseInput({
        assignments: [
          { id: 'a1', title: 'x', due_at: `${addDays(TODAY, -3)}T09:00:00Z`, status: 'assigned', completed_at: null, proof_kind: null, coach_feedback_at: null },
          { id: 'a2', title: 'y', due_at: null, status: 'done', completed_at: '2026-11-16 10:00:00', proof_kind: 'photo', coach_feedback_at: null },
          { id: 'a3', title: 'z', due_at: null, status: 'done', completed_at: '2026-11-16 10:00:00', proof_kind: 'timer', coach_feedback_at: null },
        ],
        proofs: [{ id: 'p1', context_type: 'assignment', context_id: 'a3', created_at: NOW }],
      })
    );
    expect(codes(s2)).toEqual(['homework_overdue', 'proof_missing']);
    expect(s2.reasons[0].label).toBe('Homework 3 days overdue');
    expect(s2.week).toMatchObject({ homework_done: 2, proofs: 1 });
  });

  it('unanswered DM after 48 h, no contact after 7 days, plan ending', () => {
    const s = computeSignals(
      baseInput({
        contract: { started_at: '2026-10-01T00:00:00Z', ends_at: '2026-11-20T00:00:00Z', weeks: 8 },
        last_message: { from: 'client', at: '2026-11-15T10:00:00Z' },
        last_coach_message_at: '2026-11-05T10:00:00Z',
      })
    );
    expect(codes(s)).toEqual(['dm_unanswered', 'no_contact', 'plan_ending']);
    expect(s.reasons[2].label).toBe('Plan ends in 3 days');
    expect(s.last_contact_at).toBe('2026-11-05T10:00:00.000Z');
    // A fresh client message is not "unanswered" yet.
    const s2 = computeSignals(baseInput({ last_message: { from: 'client', at: '2026-11-16T13:00:00Z' } }));
    expect(codes(s2)).not.toContain('dm_unanswered');
  });

  it('wins: streak milestone, first proof, plan week', () => {
    const s = computeSignals(
      baseInput({
        streak_current: 15,
        first_proof_at: '2026-11-16T09:00:00Z',
        proofs: [{ id: 'p', context_type: 'checkin', context_id: TODAY, created_at: '2026-11-16T09:00:00Z' }],
        contract: { started_at: '2026-11-09T12:00:00Z', ends_at: '2026-12-07T00:00:00Z', weeks: 4 },
        last_coach_message_at: '2026-11-16T09:00:00Z',
      })
    );
    expect(s.wins.map((w) => w.code)).toEqual(['streak', 'first_proof', 'plan_week']);
    expect(s.wins[0].label).toBe('14-day streak');
    expect(s.wins[2].label).toBe('Finished week 1 of 4');
  });
});

describe('applyMark (pure)', () => {
  const sig = computeSignals(
    baseInput({ checkins: days(0, 2).map((day) => ({ day, mood: 1, followup: null })) })
  );
  it('handled snoozes current reasons until it expires', () => {
    const mark = {
      handled_until: '2026-11-20T00:00:00Z',
      handled_codes: JSON.stringify(['low_moods']),
      override_status: null,
      override_reason: null,
      override_until: null,
    };
    const a = applyMark(sig, mark, new Date(NOW));
    expect(a.status).toBe('green');
    expect(a.reasons[0].snoozed).toBe(true);
    expect(a.handled_until).toBe('2026-11-20T00:00:00Z');
    const b = applyMark(sig, mark, new Date('2026-11-21T00:00:00Z'));
    expect(b.status).toBe('red');
    expect(b.handled_until).toBeNull();
  });
  it('override wins until it expires', () => {
    const mark = {
      handled_until: null,
      handled_codes: null,
      override_status: 'green',
      override_reason: 'Talked on the phone',
      override_until: '2026-11-24T12:00:00Z',
    };
    expect(applyMark(sig, mark, new Date(NOW))).toMatchObject({
      status: 'green',
      override: { status: 'green', reason: 'Talked on the phone' },
    });
    const later = applyMark(sig, mark, new Date('2026-11-25T00:00:00Z'));
    expect(later.status).toBe('red');
    expect(later.override).toBeUndefined();
  });
});

describe('helpers (pure)', () => {
  it('parses proof kinds and cleans templates', () => {
    expect(parseProofKind('none')).toBeNull();
    expect(parseProofKind(undefined)).toBeNull();
    expect(parseProofKind('photo')).toBe('photo');
    expect(parseProofKind('video')).toBe('invalid');
    expect(cleanTemplates([' Nice ', 'Nice', '', 'Go'])).toEqual(['Nice', 'Go']);
    expect(cleanTemplates(Array.from({ length: 21 }, (_, i) => `t${i}`))).toBeNull();
    expect(cleanTemplates('x')).toBeNull();
  });
  it('Monday 07:00 in the user timezone', () => {
    // Mon 2026-11-16 06:30 UTC = 07:30 in Luxembourg, 06:30 in London.
    const at = new Date('2026-11-16T06:30:00Z');
    expect(isSummaryTime('Europe/Luxembourg', at)).toBe(true);
    expect(isSummaryTime('Europe/London', at)).toBe(false);
    expect(isSummaryTime('UTC', new Date('2026-11-17T08:00:00Z'))).toBe(false);
    expect(coachSummaryTitle({ red: 3, amber: 2, green: 41, wins: 5 })).toBe('Your week: 3 need you, 41 on track, 5 wins');
  });
});

// ---------------------------------------------------------------------------
describe('GET /instructor/x/queue', () => {
  it('lists active clients with status, consent-gated week stats and counts', async () => {
    addUser('shy');
    addUser('ended');
    addContract('c1', 'coach', 'client', { share: true });
    addContract('c2', 'coach', 'shy', { share: false });
    addContract('c3', 'coach', 'ended', { status: 'completed' });
    for (const day of days(3, 10)) addCheckin('client', day, 4, 'yes');
    for (const day of days(3, 10)) addCheckin('shy', day, 1, 'no');
    addAssignment('hw1', 'c2', { due: addDays(TODAY, -4) });

    const res = await call('coach', 'GET', '/instructor/x/queue');
    expect(res.status).toBe(200);
    expect(res.data.active_clients).toBe(2);
    expect(res.data.counts).toMatchObject({ red: 2, amber: 0, green: 0 });
    const client = res.data.clients.find((c: any) => c.contract_id === 'c1');
    expect(client.client).toMatchObject({ id: 'client', username: 'client' });
    expect(client.reasons.map((r: any) => r.code)).toEqual(['no_checkins']);
    const shy = res.data.clients.find((c: any) => c.contract_id === 'c2');
    expect(shy.reasons.map((r: any) => r.code)).toEqual(['homework_overdue']);
    expect(shy.week.days_checked_in).toBeNull();
    expect(res.data.est_weekly_minutes).toBe(20);

    // Not a coach → empty queue, not someone else's clients.
    const other = await call('client', 'GET', '/instructor/x/queue');
    expect(other.data.clients).toEqual([]);
    expect((await call(null, 'GET', '/instructor/x/queue')).status).toBe(401);
  });

  it('counts only proofs shared with the coach; DM signals from the conversation', async () => {
    addContract('c1', 'coach', 'client', { share: false });
    addAssignment('hw1', 'c1', { status: 'done', completedAt: '2026-11-16 09:00:00', proofKind: 'photo' });
    addProof('p_private', 'client', 'assignment', 'hw1', { shared: false });
    addProof('p_checkin', 'client', 'checkin', TODAY, { shared: true });
    db.prepare(
      `INSERT INTO conversations (id, user_a, user_b, created_at, updated_at) VALUES ('conv', 'client', 'coach', ?, ?)`
    ).run(NOW, NOW);
    db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES ('m1', 'conv', 'coach', 'hi', '2026-11-12T10:00:00.000Z')`
    ).run();
    db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES ('m2', 'conv', 'client', 'help?', '2026-11-14T10:00:00.000Z')`
    ).run();
    const res = await call('coach', 'GET', '/instructor/x/queue');
    const c = res.data.clients[0];
    // Private assignment proof and check-in proof (sharing off) are both invisible.
    expect(c.week.proofs).toBe(0);
    expect(c.recent_proofs).toEqual([]);
    expect(c.reasons.map((r: any) => r.code)).toEqual(['proof_missing', 'dm_unanswered']);
    expect(c.last_contact_at).toBe('2026-11-12T10:00:00.000Z');

    db.prepare(`UPDATE proofs SET shared_with_coach = 1 WHERE id = 'p_private'`).run();
    const again = await call('coach', 'GET', '/instructor/x/queue');
    expect(again.data.clients[0].week.proofs).toBe(1);
    expect(again.data.clients[0].recent_proofs[0]).toMatchObject({ id: 'p_private', kind: 'note' });
    expect(again.data.clients[0].reasons.map((r: any) => r.code)).toEqual(['dm_unanswered']);
  });

  it('handled snoozes for 7 days; a new reason still surfaces; override expires', async () => {
    addContract('c1', 'coach', 'client', { share: true });
    addAssignment('hw1', 'c1', { due: addDays(TODAY, -3) });

    expect((await call('client', 'POST', '/instructor/x/queue/c1/handled', {})).status).toBe(403);
    const h = await call('coach', 'POST', '/instructor/x/queue/c1/handled', {});
    expect(h.status).toBe(200);
    expect(h.data.snoozed).toEqual(['homework_overdue']);
    let q = await call('coach', 'GET', '/instructor/x/queue');
    expect(q.data.clients[0].status).toBe('green');
    expect(q.data.clients[0].handled_until).toBe('2026-11-24T12:00:00.000Z');

    // New problem → back in the queue despite the snooze.
    for (const day of days(0, 2)) addCheckin('client', day, 1);
    q = await call('coach', 'GET', '/instructor/x/queue');
    expect(q.data.clients[0].status).toBe('red');
    db.prepare(`DELETE FROM daily_checkins`).run();

    vi.setSystemTime(new Date('2026-11-25T12:00:00Z'));
    q = await call('coach', 'GET', '/instructor/x/queue');
    expect(q.data.clients[0].status).toBe('red');
    expect(q.data.clients[0].handled_until).toBeNull();

    const bad = await call('coach', 'POST', '/instructor/x/queue/c1/override', { status: 'green' });
    expect(bad.status).toBe(400);
    const o = await call('coach', 'POST', '/instructor/x/queue/c1/override', { status: 'green', reason: 'On holiday' });
    expect(o.data.override).toMatchObject({ status: 'green', reason: 'On holiday' });
    q = await call('coach', 'GET', '/instructor/x/queue');
    expect(q.data.clients[0]).toMatchObject({ status: 'green', override: { reason: 'On holiday' } });
    vi.setSystemTime(new Date('2026-12-03T12:00:00Z'));
    q = await call('coach', 'GET', '/instructor/x/queue');
    expect(q.data.clients[0].status).toBe('red');
    expect(q.data.clients[0].override).toBeUndefined();
  });

  it('stays under 100 params with 150 clients', async () => {
    for (let i = 0; i < 150; i++) {
      addUser(`u${i}`);
      addContract(`k${i}`, 'coach', `u${i}`, { share: i % 2 === 0 });
      addCheckin(`u${i}`, TODAY, 3, 'yes');
      db.prepare(
        `INSERT INTO conversations (id, user_a, user_b, created_at, updated_at) VALUES (?, 'coach', ?, ?, ?)`
      ).run(`cv${i}`, `u${i}`, NOW, NOW);
    }
    const res = await call('coach', 'GET', '/instructor/x/queue');
    expect(res.status).toBe(200);
    expect(res.data.clients).toHaveLength(150);
  });
});

describe('GET /instructor/x/review', () => {
  it('lists finished homework without feedback and unseen shared proofs', async () => {
    addContract('c1', 'coach', 'client', { share: true });
    addAssignment('hw_done', 'c1', { status: 'done', completedAt: '2026-11-16 09:00:00', proofKind: 'photo' });
    addAssignment('hw_fb', 'c1', { status: 'done', completedAt: '2026-11-16 09:00:00', feedback: 'Nice' });
    addAssignment('hw_open', 'c1');
    addProof('p_hw', 'client', 'assignment', 'hw_done', { createdAt: '2026-11-16T09:00:00.000Z' });
    addProof('p_ci', 'client', 'checkin', TODAY, { createdAt: '2026-11-15T09:00:00.000Z' });
    addProof('p_seen', 'client', 'checkin', '2026-11-14', { seen: NOW });
    addProof('p_private', 'client', 'checkin', '2026-11-13', { shared: false });

    const res = await call('coach', 'GET', '/instructor/x/review');
    expect(res.status).toBe(200);
    expect(res.data.items.map((i: any) => i.id)).toEqual(['proof:p_ci', 'hw:hw_done']);
    const hw = res.data.items[1];
    expect(hw.homework).toMatchObject({ id: 'hw_done', proof_kind: 'photo' });
    expect(hw.proofs.map((p: any) => p.id)).toEqual(['p_hw']);

    // Sharing off hides check-in proofs; feedback clears homework and marks its proofs seen.
    db.prepare(`UPDATE coaching_contracts SET share_checkins = 0`).run();
    const fb = await call('coach', 'POST', '/instructor/x/assignments/hw_done/feedback', { body: 'Great form!' });
    expect(fb.status).toBe(200);
    expect(rows(`SELECT seen_by_coach_at FROM proofs WHERE id = 'p_hw'`)[0].seen_by_coach_at).toBeTruthy();
    const after = await call('coach', 'GET', '/instructor/x/review');
    expect(after.data.items).toEqual([]);
  });
});

describe('templates & settings', () => {
  it('defaults, saves up to 20, and toggles the email digest (default off)', async () => {
    const t = await call('coach', 'GET', '/instructor/x/templates');
    expect(t.data.templates.length).toBeGreaterThan(0);
    const put = await call('coach', 'PUT', '/instructor/x/templates', { templates: ['Nice!', ' Keep going '] });
    expect(put.data.templates).toEqual(['Nice!', 'Keep going']);
    expect((await call('coach', 'GET', '/instructor/x/templates')).data.templates).toEqual(['Nice!', 'Keep going']);
    const tooMany = await call('coach', 'PUT', '/instructor/x/templates', {
      templates: Array.from({ length: 21 }, (_, i) => `t${i}`),
    });
    expect(tooMany.status).toBe(400);

    expect((await call('coach', 'GET', '/instructor/x/settings')).data.email_digest).toBe(false);
    expect((await call('coach', 'PUT', '/instructor/x/settings', { email_digest: true })).data.email_digest).toBe(true);
    expect((await call('coach', 'GET', '/instructor/x/settings')).data.email_digest).toBe(true);
  });
});

describe('homework proof request', () => {
  it('stores proof_kind and returns proofs on the assignment', async () => {
    addContract('c1', 'coach', 'client', { share: false });
    db.prepare(`UPDATE users SET metadata = ? WHERE id = 'client'`).run(
      JSON.stringify({ username: 'client', categories: ['fitness'] })
    );
    const bad = await call('coach', 'POST', '/instructor/contracts/c1/assignments', { title: 'Run', proof_kind: 'video' });
    expect(bad.status).toBe(400);
    const res = await call('coach', 'POST', '/instructor/contracts/c1/assignments', {
      title: 'Run 5k',
      category_key: 'fitness',
      proof_kind: 'timer',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.data.assignment).toMatchObject({ proof_kind: 'timer', proofs: [] });
    const id = res.data.assignment.id;
    addProof('p1', 'client', 'assignment', id, { kind: 'timer', shared: true });
    addProof('p2', 'client', 'assignment', id, { kind: 'note', shared: false });
    const asCoach = await call('coach', 'GET', '/instructor/contracts/c1');
    expect(asCoach.data.assignments[0].proofs.map((p: any) => p.id)).toEqual(['p1']);
    const asClient = await call('client', 'GET', '/instructor/contracts/c1');
    expect(asClient.data.assignments[0].proofs.map((p: any) => p.id)).toEqual(['p1', 'p2']);
    const none = await call('coach', 'POST', '/instructor/contracts/c1/assignments', {
      title: 'Stretch',
      category_key: 'fitness',
      proof_kind: 'none',
    });
    expect(none.data.assignment.proof_kind).toBeNull();
  });
});

describe('Monday summary cron', () => {
  it('sends once per ISO week at Monday 07:00 local, coach + client', async () => {
    db.prepare(`UPDATE users SET timezone = 'Europe/Luxembourg' WHERE id = 'coach'`).run();
    db.prepare(`UPDATE users SET timezone = 'America/New_York' WHERE id = 'client'`).run();
    addContract('c1', 'coach', 'client', { share: true });
    addCheckin('client', '2026-11-20', 4, 'yes');

    const notes = (u: string, type: string) =>
      rows(`SELECT title, body, ref_type, ref_id FROM user_notifications WHERE user_id = ? AND type = ?`, u, type);

    // Mon 2026-11-23 05:30 UTC = 06:30 Luxembourg → too early.
    await runCron(env, new Date('2026-11-23T05:30:00Z'));
    expect(notes('coach', 'coach_weekly_summary')).toHaveLength(0);
    // 06:30 UTC = 07:30 Luxembourg → coach summary; NY still 01:30 → no client recap.
    await runCron(env, new Date('2026-11-23T06:30:00Z'));
    const coachNotes = notes('coach', 'coach_weekly_summary');
    expect(coachNotes).toHaveLength(1);
    expect(coachNotes[0]).toMatchObject({ ref_type: 'coach_queue' });
    expect(coachNotes[0].title).toMatch(/^Your week: \d+ needs? you, \d+ on track, \d+ wins?$/);
    expect(notes('client', 'coaching_weekly_recap')).toHaveLength(0);
    // Later hours repeat nothing for the coach; NY reaches 07:00 at 12:00 UTC.
    await runCron(env, new Date('2026-11-23T08:30:00Z'));
    await runCron(env, new Date('2026-11-23T12:30:00Z'));
    await runCron(env, new Date('2026-11-23T13:30:00Z'));
    expect(notes('coach', 'coach_weekly_summary')).toHaveLength(1);
    const recap = notes('client', 'coaching_weekly_recap');
    expect(recap).toHaveLength(1);
    expect(recap[0]).toMatchObject({ title: 'Your week with coach', ref_type: 'coaching_contract', ref_id: 'c1' });
    expect(recap[0].body).toContain('1 check-in');
    // Next Monday sends again.
    await runCron(env, new Date('2026-11-30T07:30:00Z'));
    expect(notes('coach', 'coach_weekly_summary')).toHaveLength(2);
  });

  it('skips clients without an active plan', async () => {
    addContract('c1', 'coach', 'client', { status: 'completed' });
    await runCron(env, new Date('2026-11-23T08:00:00Z'));
    expect(rows(`SELECT 1 FROM user_notifications`)).toHaveLength(0);
  });
});
