/**
 * Wave 5 group plans (migration 0047) against a real in-memory SQLite built from every
 * migration: membership + capacity, permissions (coach / member / stranger), invite
 * codes, broadcast notifications, group homework fan-out at 150 members (≤100 params
 * per statement), privacy, and the coach's weekly summary.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../../src/index';
import type { Env } from '../../src/types';
import { createSqliteD1, loadMigrationsSql, trackParams } from '../utils/sqliteD1';
import { signAccessToken } from '../../src/utils/jwt';
import {
  cohortCoachCanSeeProof,
  dayDiff,
  isPostMediaUrl,
  programWeek,
  COHORT_MAX_CAPACITY,
} from '../../src/routes/wave3/cohorts';

const SCHEMA = loadMigrationsSql();
const D1_MAX_PARAMS = 100;

let db: ReturnType<typeof createSqliteD1>['raw'];
let env: Env;
let stats: { maxParams: number; maxSql: string };

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

function addUser(id: string, opts: { instructor?: boolean } = {}) {
  db.prepare(
    `INSERT INTO users (id, email, password_hash, metadata, email_verified, timezone, is_instructor, created_at, updated_at)
     VALUES (?, ?, 'x', ?, 1, 'UTC', ?, datetime('now'), datetime('now'))`
  ).run(id, `${id}@example.com`, JSON.stringify({ username: id, display_name: id.toUpperCase() }), opts.instructor ? 1 : 0);
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
  return { status: res.status, body: json, data: json.data, headers: res.headers };
}

function count(sql: string, ...args: unknown[]): number {
  return Number((db.prepare(sql).get(...args) as any).n);
}

async function createCohort(coach = 'coach', extra: Record<string, unknown> = {}) {
  const res = await call(coach, 'POST', '/cohorts', {
    title: 'Spring strength',
    path: 'fitness',
    description: 'Four weeks of basics',
    weeks: 4,
    start_date: '2026-11-02',
    capacity: 10,
    ...extra,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.data.cohort as { id: string; invite_code: string; invite_link: string };
}

async function join(userId: string, code: string) {
  return call(userId, 'POST', '/cohorts/join', { code });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
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
    JWT_SECRET: 'cohorts-test-secret',
    API_VERSION: 'v1',
  } as Env;
  addUser('coach', { instructor: true });
  addUser('ann');
  addUser('bob');
  addUser('eve');
});

afterEach(() => {
  expect(stats.maxParams, stats.maxSql).toBeLessThanOrEqual(D1_MAX_PARAMS);
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
describe('pure helpers', () => {
  it('computes program week, day diff and media url checks', () => {
    expect(programWeek('2026-11-02', 4, '2026-11-01')).toBe(0);
    expect(programWeek('2026-11-02', 4, '2026-11-02')).toBe(1);
    expect(programWeek('2026-11-02', 4, '2026-11-09')).toBe(2);
    expect(programWeek('2026-11-02', 4, '2027-01-01')).toBe(5);
    expect(dayDiff('2026-11-01', '2026-11-10')).toBe(9);
    expect(isPostMediaUrl('https://api.test/api/v1/media/post%2Fu1%2Fx.jpg')).toBe(true);
    expect(isPostMediaUrl('https://api.test/api/v1/media/proof%2Fu1%2Fx.jpg')).toBe(false);
    expect(isPostMediaUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('creating and listing', () => {
  it('only coaches can create; validates capacity and weeks', async () => {
    expect((await call('ann', 'POST', '/cohorts', { title: 'X group', weeks: 4, start_date: '2026-11-02', capacity: 5 })).status).toBe(403);
    expect((await call('coach', 'POST', '/cohorts', { title: 'X group', weeks: 13, start_date: '2026-11-02', capacity: 5 })).status).toBe(400);
    expect((await call('coach', 'POST', '/cohorts', { title: 'X group', weeks: 4, start_date: '2026-11-02', capacity: 1 })).status).toBe(400);
    expect((await call('coach', 'POST', '/cohorts', { title: 'X group', weeks: 4, start_date: '2026-11-02', capacity: 151 })).status).toBe(400);
    expect((await call(null, 'GET', '/cohorts')).status).toBe(401);

    const c = await createCohort();
    expect(c.invite_code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(c.invite_link).toBe(`growl://cohort/${c.invite_code}`);

    const list = await call('coach', 'GET', '/cohorts');
    expect(list.data.coaching).toHaveLength(1);
    expect(list.data.coaching[0].billing_note).toMatch(/No payment through Grow! yet/);
    expect(list.data.coaching[0].current_week).toBe(2);
  });

  it('is idempotent with an Idempotency-Key', async () => {
    const key = { 'Idempotency-Key': 'cohort-create-0001' };
    const body = { title: 'Same group', weeks: 4, start_date: '2026-11-02', capacity: 5 };
    const a = await call('coach', 'POST', '/cohorts', body, key);
    const b = await call('coach', 'POST', '/cohorts', body, key);
    expect(b.data.cohort.id).toBe(a.data.cohort.id);
    expect(count(`SELECT COUNT(*) n FROM cohorts`)).toBe(1);
  });
});

describe('invite codes and membership', () => {
  it('joins by code (lenient formatting), lists as member, hides the code from members', async () => {
    const c = await createCohort();
    const pretty = `${c.invite_code.slice(0, 4).toLowerCase()}-${c.invite_code.slice(4)}`;
    const preview = await call('ann', 'GET', `/cohorts/preview?code=${encodeURIComponent(pretty)}`);
    expect(preview.status).toBe(200);
    expect(preview.data.cohort.invite_code).toBeNull();

    const j = await join('ann', pretty);
    expect(j.status, JSON.stringify(j.body)).toBe(200);
    expect(j.data.cohort.role).toBe('member');
    expect(j.data.cohort.invite_code).toBeNull();
    // Joining twice is harmless.
    expect((await join('ann', c.invite_code)).status).toBe(200);
    expect(count(`SELECT COUNT(*) n FROM cohort_members WHERE cohort_id = ?`, c.id)).toBe(1);

    const list = await call('ann', 'GET', '/cohorts');
    expect(list.data.member.map((x: any) => x.id)).toEqual([c.id]);
    // The coach was told (one notification).
    expect(count(`SELECT COUNT(*) n FROM user_notifications WHERE user_id = 'coach' AND type = 'cohort_join'`)).toBe(1);

    expect((await join('bob', 'NOTACODE')).status).toBe(404);
    expect((await join('bob', 'x')).status).toBe(400);
    expect((await join('coach', c.invite_code)).status).toBe(409);
  });

  it('rotating the code invalidates the old one', async () => {
    const c = await createCohort();
    expect((await call('ann', 'POST', `/cohorts/${c.id}/invite-code`)).status).toBe(404);
    const r = await call('coach', 'POST', `/cohorts/${c.id}/invite-code`);
    expect(r.data.invite_code).not.toBe(c.invite_code);
    expect((await join('ann', c.invite_code)).status).toBe(404);
    expect((await join('ann', r.data.invite_code)).status).toBe(200);
  });

  it('enforces capacity', async () => {
    const c = await createCohort('coach', { capacity: 2 });
    expect((await join('ann', c.invite_code)).status).toBe(200);
    expect((await join('bob', c.invite_code)).status).toBe(200);
    const full = await join('eve', c.invite_code);
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe('COHORT_FULL');
    // Capacity can't drop below the member count.
    expect((await call('coach', 'PATCH', `/cohorts/${c.id}`, { capacity: 2 })).status).toBe(200);
    // Someone leaves → a spot opens.
    expect((await call('bob', 'POST', `/cohorts/${c.id}/leave`)).status).toBe(200);
    expect((await join('eve', c.invite_code)).status).toBe(200);
  });

  it('coach removes a member; removed members need a direct invite to rejoin', async () => {
    const c = await createCohort();
    await join('ann', c.invite_code);
    expect((await call('bob', 'DELETE', `/cohorts/${c.id}/members/ann`)).status).toBe(404);
    expect((await call('coach', 'DELETE', `/cohorts/${c.id}/members/ann`)).status).toBe(200);
    expect((await call('ann', 'GET', `/cohorts/${c.id}`)).status).toBe(404);
    const again = await join('ann', c.invite_code);
    expect(again.status).toBe(403);

    befriend('coach', 'ann');
    const inv = await call('coach', 'POST', `/cohorts/${c.id}/invites`, { user_ids: ['ann'] });
    expect(inv.data.invited).toBe(1);
    expect((await join('ann', c.invite_code)).status).toBe(200);
  });

  it('archived groups stop taking members and posts', async () => {
    const c = await createCohort();
    await join('ann', c.invite_code);
    expect((await call('ann', 'PATCH', `/cohorts/${c.id}`, { status: 'archived' })).status).toBe(404);
    expect((await call('coach', 'PATCH', `/cohorts/${c.id}`, { status: 'archived' })).status).toBe(200);
    expect((await join('bob', c.invite_code)).status).toBe(409);
    expect((await call('coach', 'POST', `/cohorts/${c.id}/posts`, { body: 'hi' })).status).toBe(409);
    // Members can still read.
    expect((await call('ann', 'GET', `/cohorts/${c.id}/posts`)).status).toBe(200);
  });
});

describe('direct invites', () => {
  it('only clients and friends can be invited; invitees see a preview and can join or decline', async () => {
    const c = await createCohort();
    befriend('coach', 'ann');
    db.prepare(
      `INSERT INTO coaching_inquiries (id, instructor_id, client_id, status) VALUES ('inq1', 'coach', 'bob', 'agreed')`
    ).run();
    db.prepare(
      `INSERT INTO coaching_proposals (id, inquiry_id, instructor_id, client_id, weeks, sessions_per_week, weekly_fee_eur, total_eur)
       VALUES ('prop1', 'inq1', 'coach', 'bob', 4, 2, 10, 40)`
    ).run();
    db.prepare(
      `INSERT INTO coaching_contracts (id, proposal_id, inquiry_id, instructor_id, client_id, weeks, sessions_per_week, weekly_fee_eur, total_eur, started_at, ends_at)
       VALUES ('ct1', 'prop1', 'inq1', 'coach', 'bob', 4, 2, 10, 40, '2026-11-01', '2026-11-29')`
    ).run();

    const cands = await call('coach', 'GET', `/cohorts/${c.id}/invite-candidates`);
    expect(cands.data.candidates.map((x: any) => [x.user.id, x.source])).toEqual([
      ['bob', 'client'],
      ['ann', 'friend'],
    ]);

    const inv = await call('coach', 'POST', `/cohorts/${c.id}/invites`, { user_ids: ['ann', 'bob', 'eve'] });
    expect(inv.data).toEqual({ invited: 2, skipped: 1 });
    expect(count(`SELECT COUNT(*) n FROM user_notifications WHERE type = 'cohort_invite'`)).toBe(2);

    const annList = await call('ann', 'GET', '/cohorts');
    expect(annList.data.invites).toHaveLength(1);
    const preview = await call('ann', 'GET', `/cohorts/${c.id}`);
    expect(preview.data.cohort.role).toBe('invited');
    expect(preview.data.members).toEqual([]);
    // Strangers see nothing.
    expect((await call('eve', 'GET', `/cohorts/${c.id}`)).status).toBe(404);
    expect((await call('eve', 'POST', '/cohorts/join', { cohort_id: c.id })).status).toBe(404);

    expect((await call('ann', 'POST', '/cohorts/join', { cohort_id: c.id })).status).toBe(200);
    expect((await call('bob', 'POST', `/cohorts/${c.id}/decline`)).status).toBe(200);
    expect((await call('bob', 'GET', '/cohorts')).data.invites).toHaveLength(0);
  });
});

describe('broadcast updates', () => {
  it('coach posts → members notified once (batched); members ❤️ and reply; strangers blocked', async () => {
    const c = await createCohort();
    await join('ann', c.invite_code);
    await join('bob', c.invite_code);

    expect((await call('ann', 'POST', `/cohorts/${c.id}/posts`, { body: 'hello' })).status).toBe(403);
    expect((await call('eve', 'POST', `/cohorts/${c.id}/posts`, { body: 'hello' })).status).toBe(404);
    expect(
      (await call('coach', 'POST', `/cohorts/${c.id}/posts`, { body: 'x', media_url: 'https://evil.test/a.jpg' })).status
    ).toBe(400);

    const p = await call('coach', 'POST', `/cohorts/${c.id}/posts`, {
      body: 'Week 2 starts today!',
      media_url: 'https://api.test/api/v1/media/post%2Fcoach%2F1.jpg',
    });
    expect(p.status).toBe(201);
    const postId = p.data.post.id;
    expect(count(`SELECT COUNT(*) n FROM user_notifications WHERE type = 'cohort_update'`)).toBe(2);
    // A second post within 30 minutes is coalesced while the first is unread.
    await call('coach', 'POST', `/cohorts/${c.id}/posts`, { body: 'One more thing' });
    expect(count(`SELECT COUNT(*) n FROM user_notifications WHERE type = 'cohort_update'`)).toBe(2);

    const r1 = await call('ann', 'POST', `/cohorts/${c.id}/posts/${postId}/react`);
    expect(r1.data).toEqual({ hearts: 1, hearted_by_me: true });
    const r2 = await call('ann', 'POST', `/cohorts/${c.id}/posts/${postId}/react`);
    expect(r2.data).toEqual({ hearts: 0, hearted_by_me: false });
    await call('bob', 'POST', `/cohorts/${c.id}/posts/${postId}/react`);

    const rep = await call('ann', 'POST', `/cohorts/${c.id}/posts/${postId}/replies`, { body: 'Let’s go' });
    expect(rep.status).toBe(201);
    expect((await call('eve', 'POST', `/cohorts/${c.id}/posts/${postId}/replies`, { body: 'hi' })).status).toBe(404);
    expect(count(`SELECT COUNT(*) n FROM user_notifications WHERE type = 'cohort_reply' AND user_id = 'coach'`)).toBe(1);

    const feed = await call('bob', 'GET', `/cohorts/${c.id}/posts`);
    expect(feed.data.posts).toHaveLength(2);
    const first = feed.data.posts.find((x: any) => x.id === postId);
    expect(first.hearts).toBe(1);
    expect(first.hearted_by_me).toBe(true);
    expect(first.reply_count).toBe(1);
    expect(first.replies[0].author.id).toBe('ann');

    const all = await call('bob', 'GET', `/cohorts/${c.id}/posts/${postId}/replies`);
    expect(all.data.replies).toHaveLength(1);
    expect((await call('eve', 'GET', `/cohorts/${c.id}/posts`)).status).toBe(404);

    expect((await call('ann', 'DELETE', `/cohorts/${c.id}/posts/${postId}`)).status).toBe(403);
    expect((await call('coach', 'DELETE', `/cohorts/${c.id}/posts/${postId}`)).status).toBe(200);
  });
});

describe('group homework', () => {
  it('fans out to 150 members within the D1 param limit; coach grid + bulk seen', async () => {
    const c = await createCohort('coach', { capacity: COHORT_MAX_CAPACITY });
    const ids: string[] = [];
    for (let i = 0; i < 150; i++) {
      const id = `m${String(i).padStart(3, '0')}`;
      addUser(id);
      ids.push(id);
      db.prepare(`INSERT INTO cohort_members (cohort_id, user_id, status, joined_at) VALUES (?, ?, 'active', datetime('now'))`).run(c.id, id);
    }
    // Capacity holds at 150.
    expect((await join('ann', c.invite_code)).status).toBe(409);

    const hw = await call('coach', 'POST', `/cohorts/${c.id}/homework`, {
      title: '3 × 10 squats',
      due_at: '2026-11-12',
      proof_kind: 'photo',
    });
    expect(hw.status, JSON.stringify(hw.body)).toBe(201);
    expect(hw.data.assigned).toBe(150);
    expect(count(`SELECT COUNT(*) n FROM cohort_member_assignments WHERE assignment_id = ?`, hw.data.assignment.id)).toBe(150);
    expect(count(`SELECT COUNT(*) n FROM cohort_member_assignments WHERE id NOT LIKE 'cohort_asg_%'`)).toBe(0);
    expect(count(`SELECT COUNT(*) n FROM user_notifications WHERE type = 'cohort_homework'`)).toBe(150);

    // Members complete a few.
    const rows = db
      .prepare(`SELECT id, user_id FROM cohort_member_assignments WHERE assignment_id = ? ORDER BY user_id`)
      .all(hw.data.assignment.id) as { id: string; user_id: string }[];
    for (const r of rows.slice(0, 3)) {
      const done = await call(r.user_id, 'POST', `/cohorts/${c.id}/homework/complete`, {
        member_assignment_id: r.id,
        status: 'done',
        proof_id: `proof_${r.user_id}`,
        proof_kind: 'photo',
      });
      expect(done.status, JSON.stringify(done.body)).toBe(200);
    }
    // The coach is notified once per hour, not per member.
    expect(count(`SELECT COUNT(*) n FROM user_notifications WHERE type = 'cohort_homework_done'`)).toBe(1);

    const grid = await call('coach', 'GET', `/cohorts/${c.id}/homework`);
    expect(grid.data.role).toBe('coach');
    expect(grid.data.members).toHaveLength(150);
    expect(grid.data.cells).toHaveLength(150);
    expect(grid.data.assignments[0].completion_pct).toBe(2);
    const proofCell = grid.data.cells.find((x: any) => x.proof);
    expect(proofCell.proof.media_url).toMatch(/\/api\/v1\/proofs\/proof_m00\d\/media$/);
    expect(proofCell.proof.context_type).toBe('assignment');

    // Bulk seen with 160 ids (chunked).
    const seen = await call('coach', 'POST', `/cohorts/${c.id}/homework/seen`, {
      member_assignment_ids: [...rows.map((r) => r.id), ...Array.from({ length: 10 }, (_, i) => `nope${i}`)],
    });
    expect(seen.data.updated).toBe(3);

    // Proof access helper for the proofs module.
    expect(await cohortCoachCanSeeProof(env, 'coach', rows[0].user_id, rows[0].id)).toBe(true);
    expect(await cohortCoachCanSeeProof(env, 'm001', rows[0].user_id, rows[0].id)).toBe(false);
    expect(await cohortCoachCanSeeProof(env, 'coach', rows[1].user_id, rows[0].id)).toBe(false);
  });

  it('privacy: members see only their own record + group %, never others’ completions', async () => {
    const c = await createCohort();
    await join('ann', c.invite_code);
    await join('bob', c.invite_code);
    const hw = await call('coach', 'POST', `/cohorts/${c.id}/homework`, { title: 'Journal 5 min' });
    expect((await call('ann', 'POST', `/cohorts/${c.id}/homework`, { title: 'x' })).status).toBe(403);

    const annView = await call('ann', 'GET', `/cohorts/${c.id}/homework`);
    expect(annView.data.role).toBe('member');
    expect(annView.data.cells).toBeUndefined();
    expect(annView.data.members).toBeUndefined();
    const mine = annView.data.assignments[0].mine;
    expect(mine.id).toMatch(/^cohort_asg_/);

    // Bob can't complete Ann's record.
    expect(
      (await call('bob', 'POST', `/cohorts/${c.id}/homework/complete`, { member_assignment_id: mine.id, status: 'done' })).status
    ).toBe(404);
    // Coach can't complete for members; members can't mark seen.
    expect(
      (await call('coach', 'POST', `/cohorts/${c.id}/homework/complete`, { member_assignment_id: mine.id, status: 'done' })).status
    ).toBe(403);
    expect((await call('ann', 'POST', `/cohorts/${c.id}/homework/seen`, { assignment_id: hw.data.assignment.id })).status).toBe(403);

    expect(
      (await call('ann', 'POST', `/cohorts/${c.id}/homework/complete`, { member_assignment_id: mine.id, status: 'partly' })).data.mine.status
    ).toBe('partly');

    const bobView = await call('bob', 'GET', `/cohorts/${c.id}/homework`);
    expect(bobView.data.assignments[0].completion_pct).toBe(50);
    expect(bobView.data.assignments[0].mine.status).toBe('assigned');
    expect(JSON.stringify(bobView.data)).not.toContain(mine.id);

    // Members see names/avatars but no activity detail; progress is coach-only.
    const detail = await call('bob', 'GET', `/cohorts/${c.id}`);
    expect(detail.data.members.map((m: any) => m.user.id).sort()).toEqual(['ann', 'bob']);
    expect(detail.data.members[0].last_active_at).toBeUndefined();
    expect(detail.data.group.completion_pct).toBe(50);
    expect(detail.data.mine).toEqual({ done: 0, total: 1, pct: 0 });
    expect((await call('bob', 'GET', `/cohorts/${c.id}/progress`)).status).toBe(403);
    expect((await call('eve', 'GET', `/cohorts/${c.id}/homework`)).status).toBe(404);

    // Undo works.
    expect(
      (await call('ann', 'POST', `/cohorts/${c.id}/homework/complete`, { member_assignment_id: mine.id, status: 'assigned' })).data.mine.status
    ).toBe('assigned');
  });

  it('uses the real proofs table: ownership check, proof object, seen sync', async () => {
    const c = await createCohort();
    await join('ann', c.invite_code);
    await join('bob', c.invite_code);
    await call('coach', 'POST', `/cohorts/${c.id}/homework`, { title: 'Sketch', proof_kind: 'photo' });
    const mine = (await call('ann', 'POST', '/cohorts/' + c.id + '/homework', undefined)).status; // member can't assign
    expect(mine).toBe(403);
    const annRow = db.prepare(`SELECT id FROM cohort_member_assignments WHERE user_id = 'ann'`).get() as { id: string };
    const insert = (id: string, user: string) =>
      db.prepare(
        `INSERT INTO proofs (id, user_id, kind, text, media_key, media_type, context_type, context_id, day, shared_with_coach, created_at)
         VALUES (?, ?, 'photo', 'Done!', ?, 'image/jpeg', 'assignment', ?, '2026-11-10', 1, '2026-11-10 12:00:00')`
      ).run(id, user, `proof/${user}/${id}.jpg`, annRow.id);
    insert('pf_ann', 'ann');
    insert('pf_bob', 'bob');

    // Someone else's proof is refused.
    expect(
      (await call('ann', 'POST', `/cohorts/${c.id}/homework/complete`, { member_assignment_id: annRow.id, status: 'done', proof_id: 'pf_bob' })).status
    ).toBe(400);
    const ok = await call('ann', 'POST', `/cohorts/${c.id}/homework/complete`, {
      member_assignment_id: annRow.id,
      status: 'done',
      proof_id: 'pf_ann',
    });
    expect(ok.data.mine.proof_kind).toBe('photo');

    const grid = await call('coach', 'GET', `/cohorts/${c.id}/homework`);
    const cell = grid.data.cells.find((x: any) => x.user_id === 'ann');
    expect(cell.proof).toMatchObject({ id: 'pf_ann', kind: 'photo', text: 'Done!', context_id: annRow.id, media_expired: false });
    expect(cell.proof.media_url).toBe('https://api.test/api/v1/proofs/pf_ann/media');

    await call('coach', 'POST', `/cohorts/${c.id}/homework/seen`, { member_assignment_ids: [annRow.id] });
    expect((db.prepare(`SELECT seen_by_coach_at FROM proofs WHERE id = 'pf_ann'`).get() as any).seen_by_coach_at).toBeTruthy();
    expect((db.prepare(`SELECT seen_by_coach_at FROM proofs WHERE id = 'pf_bob'`).get() as any).seen_by_coach_at).toBeNull();
  });

  it('late joiners get open homework only', async () => {
    const c = await createCohort();
    await join('ann', c.invite_code);
    await call('coach', 'POST', `/cohorts/${c.id}/homework`, { title: 'Past', due_at: '2026-11-05' });
    await call('coach', 'POST', `/cohorts/${c.id}/homework`, { title: 'Open', due_at: '2026-11-20' });
    await call('coach', 'POST', `/cohorts/${c.id}/homework`, { title: 'No date' });
    await join('bob', c.invite_code);
    const bob = await call('bob', 'GET', `/cohorts/${c.id}/homework`);
    expect(bob.data.assignments.map((a: any) => a.title).sort()).toEqual(['No date', 'Open']);
  });
});

describe('weekly progress', () => {
  it('counts active members, completion and who needs attention', async () => {
    const c = await createCohort();
    await join('ann', c.invite_code);
    await join('bob', c.invite_code);
    await join('eve', c.invite_code);

    // Ann was active in the app 2 days ago; Bob finishes homework today; Eve has been quiet.
    db.prepare(`INSERT INTO user_activity_days (user_id, day, kinds) VALUES ('ann', '2026-11-08', 1)`).run();
    const hw = await call('coach', 'POST', `/cohorts/${c.id}/homework`, { title: 'Walk', due_at: '2026-11-10' });
    const bobRow = db
      .prepare(`SELECT id FROM cohort_member_assignments WHERE assignment_id = ? AND user_id = 'bob'`)
      .get(hw.data.assignment.id) as { id: string };
    await call('bob', 'POST', `/cohorts/${c.id}/homework/complete`, { member_assignment_id: bobRow.id, status: 'done' });
    // SQLite's datetime('now') runs on the real clock; pin the stamps to the faked week.
    db.prepare(`UPDATE cohort_members SET joined_at = '2026-11-01 12:00:00', last_active_at = NULL`).run();
    db.prepare(`UPDATE cohort_member_assignments SET completed_at = '2026-11-10 12:00:00' WHERE completed_at IS NOT NULL`).run();

    const p = await call('coach', 'GET', `/cohorts/${c.id}/progress`);
    expect(p.status, JSON.stringify(p.body)).toBe(200);
    expect(p.data.members_total).toBe(3);
    expect(p.data.active_this_week).toBe(2);
    expect(p.data.completion_pct).toBe(33);
    expect(p.data.needs_attention.map((x: any) => x.user.id)).toEqual(['eve']);
    expect(p.data.needs_attention[0].days_inactive).toBe(9);
    expect(p.data.week.current_week).toBe(2);
  });
});
