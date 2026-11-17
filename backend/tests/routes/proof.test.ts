/**
 * Wave 5 proof of progress (migration 0044 + routes/wave3/proofx.ts + media.ts 'proof'
 * purpose) against an in-memory SQLite built from every migration: private media,
 * owner / coach (consent, assignment) / friend permissions, cheers + seen, small
 * points bonus, GET /me/today linkage and the cron media expiry.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../../src/index';
import type { Env } from '../../src/types';
import { createSqliteD1, loadMigrationsSql, trackParams } from '../utils/sqliteD1';
import { signAccessToken } from '../../src/utils/jwt';
import {
  cleanProofText,
  expireProofMedia,
  expiryCutoffs,
  sweepOrphanProofUploads,
  deleteUserProofMedia,
  ORPHAN_CURSOR_KEY,
  validateProofShape,
  PROOF_POINTS_DAILY_MAX,
} from '../../src/routes/wave3/proofx';
import { detectProofMime, getMedia, isPrivateMediaKey } from '../../src/routes/media';

const SCHEMA = loadMigrationsSql();
const D1_MAX_PARAMS = 100;
const TODAY = '2026-11-17';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, 0, 0]);
const ascii = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));
const M4A = new Uint8Array([0, 0, 0, 0x1c, ...ascii('ftypM4A '), 0, 0, 0, 0, ...ascii('M4A isom')]);
const ANDROID_M4A = new Uint8Array([0, 0, 0, 0x18, ...ascii('ftypisom'), 0, 0, 0, 0, ...ascii('isom')]);
const ADTS = new Uint8Array([0xff, 0xf1, 0x50, 0x80, 0x02, 0x1f, 0xfc, 0x21, 0, 0, 0, 0, 0, 0]);
const MP4 = new Uint8Array([0, 0, 0, 0x18, ...ascii('ftypmp42'), 0, 0, 0, 0, 0, 0, 0, 0]);

let db: ReturnType<typeof createSqliteD1>['raw'];
let env: Env;
let stats: { maxParams: number; maxSql: string };
let r2: Map<string, { bytes: Uint8Array; contentType?: string; cacheControl?: string; uploaded?: Date }>;
let kvStore: Map<string, string>;

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

function addUser(id: string, instructor = false) {
  db.prepare(
    `INSERT INTO users (id, email, password_hash, metadata, email_verified, timezone, is_instructor, created_at, updated_at)
     VALUES (?, ?, 'x', ?, 1, 'UTC', ?, datetime('now'), datetime('now'))`
  ).run(id, `${id}@example.com`, JSON.stringify({ username: id }), instructor ? 1 : 0);
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

function addPlan(
  id: string,
  coach: string,
  client: string,
  opts: { share?: boolean; status?: string; ends?: string; completed?: string | null } = {}
) {
  // Plans normally come from a proposal/inquiry; the FK chain isn't what's under test.
  db.exec('PRAGMA foreign_keys = OFF');
  db.prepare(
    `INSERT INTO coaching_contracts (id, proposal_id, inquiry_id, instructor_id, client_id, weeks, sessions_per_week,
       weekly_fee_eur, total_eur, status, started_at, ends_at, completed_at, share_checkins)
     VALUES (?, 'prop', 'inq', ?, ?, 4, 2, 20, 80, ?, '2026-11-01T00:00:00.000Z', ?, ?, ?)`
  ).run(
    id,
    coach,
    client,
    opts.status ?? 'active',
    opts.ends ?? '2026-12-01T00:00:00.000Z',
    opts.completed ?? null,
    opts.share ? 1 : 0
  );
  db.exec('PRAGMA foreign_keys = ON');
}

function addAssignment(id: string, contractId: string) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.prepare(
    `INSERT INTO coaching_assignments (id, contract_id, seed_id, title) VALUES (?, ?, 'seed1', 'Run 3x')`
  ).run(id, contractId);
  db.exec('PRAGMA foreign_keys = ON');
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
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* binary */
  }
  return { status: res.status, body: json, data: json?.data, headers: res.headers, text };
}

async function upload(userId: string, bytes: Uint8Array, type: string, name: string, purpose = 'proof') {
  const form = new FormData();
  form.append('purpose', purpose);
  form.append('file', new File([bytes], name, { type }));
  const res = await worker.fetch(
    new Request('https://api.test/api/v1/media/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await signAccessToken(userId, env)}` },
      body: form,
    }),
    env,
    ctx
  );
  const json = (await res.json()) as any;
  return { status: res.status, data: json.data, body: json };
}

async function note(userId: string, extra: Record<string, unknown> = {}) {
  const res = await call(userId, 'POST', '/proofs', {
    kind: 'note',
    text: 'Did 10 minutes',
    context_type: 'checkin',
    context_id: TODAY,
    ...extra,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.data.proof;
}

async function photo(userId: string, extra: Record<string, unknown> = {}) {
  const up = await upload(userId, JPEG, 'image/jpeg', 'proof.jpg');
  expect(up.status, JSON.stringify(up.body)).toBe(200);
  const res = await call(userId, 'POST', '/proofs', {
    kind: 'photo',
    media_key: up.data.key,
    context_type: 'checkin',
    context_id: TODAY,
    ...extra,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.data.proof;
}

const points = (id: string) => Number((db.prepare(`SELECT points FROM users WHERE id = ?`).get(id) as any).points);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
  const sqlite = createSqliteD1(SCHEMA);
  db = sqlite.raw;
  const tracked = trackParams(sqlite.d1);
  stats = tracked.stats;
  const kv = new Map<string, string>();
  kvStore = kv;
  r2 = new Map();
  env = {
    DB: tracked.d1 as any,
    KV: {
      get: async (k: string) => kv.get(k) ?? null,
      put: async (k: string, v: string) => void kv.set(k, v),
      delete: async (k: string) => void kv.delete(k),
    } as any,
    R2: {
      put: async (key: string, body: Uint8Array, opts?: { httpMetadata?: { contentType?: string; cacheControl?: string } }) => {
        r2.set(key, { bytes: body, contentType: opts?.httpMetadata?.contentType, cacheControl: opts?.httpMetadata?.cacheControl, uploaded: new Date() });
      },
      list: async (opts: { prefix?: string; limit?: number; cursor?: string }) => {
        const keys = [...r2.keys()].filter((k) => k.startsWith(opts.prefix ?? '')).sort();
        const start = opts.cursor ? Number(opts.cursor) : 0;
        const limit = opts.limit ?? 1000;
        const page = keys.slice(start, start + limit);
        const truncated = start + limit < keys.length;
        return {
          objects: page.map((key) => ({ key, uploaded: r2.get(key)!.uploaded ?? new Date(0) })),
          truncated,
          ...(truncated ? { cursor: String(start + limit) } : {}),
        };
      },
      head: async (key: string) => {
        const o = r2.get(key);
        return o ? { size: o.bytes.byteLength, httpMetadata: { contentType: o.contentType } } : null;
      },
      get: async (key: string) => {
        const o = r2.get(key);
        return o ? { size: o.bytes.byteLength, body: o.bytes, httpMetadata: { contentType: o.contentType, cacheControl: o.cacheControl } } : null;
      },
      delete: async (keys: string | string[]) => {
        for (const k of Array.isArray(keys) ? keys : [keys]) r2.delete(k);
      },
    } as any,
    ENVIRONMENT: 'test',
    JWT_SECRET: 'proof-test-secret',
    API_VERSION: 'v1',
  } as Env;
  addUser('client');
  addUser('coach', true);
  addUser('coach2', true);
  addUser('friend');
  addUser('stranger');
});

afterEach(() => {
  expect(stats.maxParams, stats.maxSql).toBeLessThanOrEqual(D1_MAX_PARAMS);
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
describe('pure helpers', () => {
  it('keeps proof text to one trimmed line', () => {
    expect(cleanProofText('  ran\n5k \t today ')).toBe('ran 5k today');
    expect(cleanProofText('   ')).toBeNull();
    expect(cleanProofText('x'.repeat(300))!.length).toBe(140);
  });

  it('checks the fields each kind needs', () => {
    const base = { context_type: 'checkin' as const, context_id: TODAY };
    expect(validateProofShape({ ...base, kind: 'note', text: ' ' })).toMatch(/line/);
    expect(validateProofShape({ ...base, kind: 'timer' })).toMatch(/minutes/);
    expect(validateProofShape({ ...base, kind: 'number', number: 0 })).toBeNull();
    expect(validateProofShape({ ...base, kind: 'photo' })).toMatch(/photo/);
    expect(validateProofShape({ ...base, kind: 'note', text: 'x', media_key: 'proof/a/b.jpg' })).toMatch(/file/);
  });

  it('sniffs proof audio and refuses video', () => {
    expect(detectProofMime(M4A)?.mime).toBe('audio/mp4');
    expect(detectProofMime(ANDROID_M4A, 'audio/m4a')?.kind).toBe('audio');
    expect(detectProofMime(ANDROID_M4A, 'video/mp4')).toBeNull();
    expect(detectProofMime(MP4)).toBeNull();
    expect(detectProofMime(ADTS)?.mime).toBe('audio/aac');
    expect(detectProofMime(JPEG)?.kind).toBe('image');
  });

  it('computes retention cut-offs', () => {
    expect(expiryCutoffs(new Date('2026-11-17T12:00:00Z'))).toEqual({ personal: '2025-11-17', coach: '2026-08-19' });
  });
});

// ---------------------------------------------------------------------------
describe('proof uploads stay private', () => {
  it('stores under proof/{userId}/ with no public url and no public cache', async () => {
    const up = await upload('client', JPEG, 'image/jpeg', 'p.jpg');
    expect(up.status).toBe(200);
    expect(up.data.key).toMatch(/^proof\/client\/.+\.jpg$/);
    expect(up.data.url).toBeUndefined();
    expect(r2.get(up.data.key)!.cacheControl).toBe('private, no-store');
  });

  it('GET /media/:key refuses proof keys (encoded or not)', async () => {
    const up = await upload('client', JPEG, 'image/jpeg', 'p.jpg');
    const plain = await call(null, 'GET', `/media/${up.data.key}`);
    expect(plain.status).toBe(404);
    const encoded = await call('client', 'GET', `/media/${encodeURIComponent(up.data.key)}`);
    expect(encoded.status).toBe(404);
    const direct = await getMedia(new Request('https://api.test/x'), env, `/${up.data.key}`);
    expect(direct.status).toBe(404);
    expect(isPrivateMediaKey('Proof/x')).toBe(true);
  });

  it('accepts m4a voice notes and enforces size limits', async () => {
    const voice = await upload('client', M4A, 'audio/m4a', 'voice.m4a');
    expect(voice.status).toBe(200);
    expect(voice.data.contentType).toBe('audio/mp4');
    expect(voice.data.mediaType).toBe('audio');
    const video = await upload('client', MP4, 'video/mp4', 'clip.mp4');
    expect(video.status).toBe(415);
    const big = new Uint8Array(1.6 * 1024 * 1024);
    big.set(JPEG);
    expect((await upload('client', big, 'image/jpeg', 'big.jpg')).status).toBe(413);
  });

  it('public purposes are unchanged: audio is still refused for posts', async () => {
    const res = await upload('client', ADTS, 'audio/aac', 'a.aac', 'post');
    expect(res.status).toBe(415);
    const img = await upload('client', JPEG, 'image/jpeg', 'p.jpg', 'post');
    expect(img.status).toBe(200);
    expect(img.data.url).toContain('/media/post%2Fclient');
  });

  it('a proof can only use the uploader’s own proof key', async () => {
    const up = await upload('stranger', JPEG, 'image/jpeg', 'p.jpg');
    const res = await call('client', 'POST', '/proofs', {
      kind: 'photo',
      media_key: up.data.key,
      context_type: 'checkin',
      context_id: TODAY,
    });
    expect(res.status).toBe(400);
    const voice = await upload('client', M4A, 'audio/m4a', 'v.m4a');
    const wrongKind = await call('client', 'POST', '/proofs', {
      kind: 'photo',
      media_key: voice.data.key,
      context_type: 'checkin',
      context_id: TODAY,
    });
    expect(wrongKind.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
describe('owner', () => {
  it('creates, sees today’s proofs on /me/today, and deletes (file too)', async () => {
    const p = await photo('client', { text: 'Leg day' });
    expect(p).toMatchObject({ kind: 'photo', shared_with_coach: false, shared_with_friends: false, cheers: 0 });
    expect(p.media_url).toBe(`https://api.test/api/v1/proofs/${p.id}/media`);

    const today = await call('client', 'GET', `/me/today?day=${TODAY}`);
    expect(today.data.proofs.map((x: any) => x.id)).toEqual([p.id]);

    const media = await call('client', 'GET', `/proofs/${p.id}/media`);
    expect(media.status).toBe(200);
    expect(media.headers.get('Cache-Control')).toBe('private, no-store');
    expect(media.headers.get('Content-Type')).toBe('image/jpeg');
    expect((await call(null, 'GET', `/proofs/${p.id}/media`)).status).toBe(401);

    const key = (db.prepare(`SELECT media_key FROM proofs WHERE id = ?`).get(p.id) as any).media_key;
    expect((await call('stranger', 'DELETE', `/proofs/${p.id}`)).status).toBe(404);
    expect((await call('client', 'DELETE', `/proofs/${p.id}`)).status).toBe(200);
    expect(r2.has(key)).toBe(false);
    expect((await call('client', 'GET', `/proofs/${p.id}`)).status).toBe(404);
  });

  it('gives +1 per proof, at most twice a day, refunded on delete; idempotent create', async () => {
    const before = points('client');
    const key = { 'Idempotency-Key': 'proof-key-00000001' };
    const body = { kind: 'timer', minutes: 20, context_type: 'checkin', context_id: TODAY };
    const one = await call('client', 'POST', '/proofs', body, key);
    const replay = await call('client', 'POST', '/proofs', body, key);
    expect(replay.data.proof.id).toBe(one.data.proof.id);
    expect(one.data.points_awarded).toBe(1);
    const two = await call('client', 'POST', '/proofs', { kind: 'number', number: 30, unit: 'reps', context_type: 'checkin', context_id: TODAY });
    const three = await call('client', 'POST', '/proofs', { kind: 'note', text: 'more', context_type: 'checkin', context_id: TODAY });
    expect(two.data.points_awarded).toBe(1);
    expect(three.data.points_awarded).toBe(0);
    expect(points('client') - before).toBe(PROOF_POINTS_DAILY_MAX);
    await call('client', 'DELETE', `/proofs/${one.data.proof.id}`);
    expect(points('client') - before).toBe(1);
  });

  it('rejects proofs for another day’s check-in or someone else’s homework', async () => {
    const old = await call('client', 'POST', '/proofs', { kind: 'note', text: 'x', context_type: 'checkin', context_id: '2026-11-01' });
    expect(old.status).toBe(400);
    addPlan('plan1', 'coach', 'friend');
    addAssignment('hw1', 'plan1');
    const res = await call('client', 'POST', '/proofs', { kind: 'note', text: 'x', context_type: 'assignment', context_id: 'hw1' });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
describe('coach', () => {
  it('sees a shared check-in proof only with check-in consent on an active plan', async () => {
    addPlan('plan1', 'coach', 'client', { share: false });
    const p = await photo('client', { share_with_coach: true });
    expect(p.shared_with_coach).toBe(true);

    // No consent → hidden (list filtered, media 404, seen 404).
    const list = await call('coach', 'GET', '/proofs?user_id=client');
    expect(list.status).toBe(200);
    expect(list.data.proofs).toEqual([]);
    expect((await call('coach', 'GET', `/proofs/${p.id}/media`)).status).toBe(404);
    expect((await call('coach', 'POST', `/proofs/${p.id}/seen`)).status).toBe(404);

    // Consent on → visible; seen ✓; cheer works.
    db.prepare(`UPDATE coaching_contracts SET share_checkins = 1 WHERE id = 'plan1'`).run();
    const visible = await call('coach', 'GET', '/proofs?user_id=client');
    expect(visible.data.proofs.map((x: any) => x.id)).toEqual([p.id]);
    expect((await call('coach', 'GET', `/proofs/${p.id}/media`)).status).toBe(200);
    const seen = await call('coach', 'POST', `/proofs/${p.id}/seen`);
    expect(seen.status).toBe(200);
    expect(seen.data.seen_by_coach_at).toBeTruthy();
    const cheer = await call('coach', 'POST', `/proofs/${p.id}/cheer`);
    expect(cheer.data).toEqual({ cheers: 1, cheered_by_me: true });

    // An unshared proof stays private even with consent.
    const priv = await note('client');
    const again = await call('coach', 'GET', '/proofs?user_id=client');
    expect(again.data.proofs.map((x: any) => x.id)).not.toContain(priv.id);

    // Plan ends → coach loses access.
    db.prepare(`UPDATE coaching_contracts SET status = 'completed', completed_at = datetime('now') WHERE id = 'plan1'`).run();
    expect((await call('coach', 'GET', '/proofs?user_id=client')).status).toBe(403);
    expect((await call('coach', 'GET', `/proofs/${p.id}/media`)).status).toBe(404);
  });

  it('homework proofs go to that plan’s coach without check-in consent; other coaches get 404', async () => {
    addPlan('plan1', 'coach', 'client', { share: false });
    addPlan('plan2', 'coach2', 'friend', { share: true });
    addAssignment('hw1', 'plan1');
    const res = await call('client', 'POST', '/proofs', {
      kind: 'number',
      number: 5,
      unit: 'km',
      context_type: 'assignment',
      context_id: 'hw1',
    });
    expect(res.status).toBe(201);
    const p = res.data.proof;
    expect(p.shared_with_coach).toBe(true);
    const list = await call('coach', 'GET', '/proofs?user_id=client&context_type=assignment&context_id=hw1');
    expect(list.data.proofs.map((x: any) => x.id)).toEqual([p.id]);
    expect((await call('coach', 'GET', `/proofs/${p.id}`)).status).toBe(200);
    expect((await call('coach2', 'GET', `/proofs/${p.id}`)).status).toBe(404);
    expect((await call('coach2', 'GET', '/proofs?user_id=client')).status).toBe(403);
    // Client can take it back.
    await call('client', 'PATCH', `/proofs/${p.id}`, { share_with_coach: false });
    expect((await call('coach', 'GET', `/proofs/${p.id}`)).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
describe('friends, buddies and strangers', () => {
  it('friends see a proof only after the owner shares it; cheers toggle', async () => {
    befriend('client', 'friend');
    const p = await photo('client');
    expect((await call('friend', 'GET', '/proofs?user_id=client')).data.proofs).toEqual([]);
    expect((await call('friend', 'GET', `/proofs/${p.id}/media`)).status).toBe(404);
    expect((await call('friend', 'POST', `/proofs/${p.id}/cheer`)).status).toBe(404);

    const shared = await call('client', 'PATCH', `/proofs/${p.id}`, { share_with_friends: true });
    expect(shared.data.proof.shared_with_friends).toBe(true);
    expect((await call('friend', 'GET', `/proofs/${p.id}/media`)).status).toBe(200);
    expect((await call('friend', 'POST', `/proofs/${p.id}/cheer`)).data).toEqual({ cheers: 1, cheered_by_me: true });
    const n = db.prepare(`SELECT COUNT(*) n FROM user_notifications WHERE user_id = 'client' AND type = 'proof_cheer'`).get() as any;
    expect(Number(n.n)).toBe(1);
    expect((await call('friend', 'POST', `/proofs/${p.id}/cheer`)).data).toEqual({ cheers: 0, cheered_by_me: false });
    expect((await call('client', 'POST', `/proofs/${p.id}/cheer`)).status).toBe(403);
    expect((await call('friend', 'POST', `/proofs/${p.id}/seen`)).status).toBe(403);
    expect((await call('friend', 'DELETE', `/proofs/${p.id}`)).status).toBe(403);
    const owner = await call('client', 'GET', `/proofs/${p.id}`);
    expect(owner.data.proof.cheers).toBe(0);
  });

  it('strangers get 403 on lists and 404 on proofs, even when shared with friends', async () => {
    const p = await photo('client', { share_with_friends: true });
    expect((await call('stranger', 'GET', '/proofs?user_id=client')).status).toBe(403);
    expect((await call('stranger', 'GET', `/proofs/${p.id}`)).status).toBe(404);
    expect((await call('stranger', 'GET', `/proofs/${p.id}/media`)).status).toBe(404);
    expect((await call('stranger', 'POST', `/proofs/${p.id}/cheer`)).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
describe('cron media expiry', () => {
  function seed(id: string, created: string, contractId: string | null) {
    const key = `proof/client/${id}.jpg`;
    r2.set(key, { bytes: JPEG, contentType: 'image/jpeg' });
    db.prepare(
      `INSERT INTO proofs (id, user_id, kind, media_key, media_type, context_type, context_id, contract_id, day, created_at)
       VALUES (?, 'client', 'photo', ?, 'image/jpeg', 'checkin', ?, ?, ?, ?)`
    ).run(id, key, created.slice(0, 10), contractId, created.slice(0, 10), created);
    return key;
  }

  it('drops personal files after 365 days and coach files 90 days after the plan ended', async () => {
    addPlan('ended', 'coach', 'client', { status: 'completed', ends: '2026-07-01T00:00:00.000Z', completed: '2026-07-01 10:00:00' });
    addPlan('recent', 'coach2', 'client', { status: 'completed', ends: '2026-10-01T00:00:00.000Z', completed: '2026-10-01 10:00:00' });
    addPlan('live', 'coach', 'friend');
    const oldPersonal = seed('p_old', '2025-10-01T09:00:00.000Z', null);
    const newPersonal = seed('p_new', '2026-03-01T09:00:00.000Z', null);
    const endedCoach = seed('p_ended', '2026-06-01T09:00:00.000Z', 'ended');
    const recentCoach = seed('p_recent', '2026-09-01T09:00:00.000Z', 'recent');
    const liveCoach = seed('p_live', '2025-01-01T09:00:00.000Z', 'live');

    const n = await expireProofMedia(env, new Date(`${TODAY}T12:00:00Z`));
    expect(n).toBe(2);
    expect(r2.has(oldPersonal)).toBe(false);
    expect(r2.has(endedCoach)).toBe(false);
    expect(r2.has(newPersonal)).toBe(true);
    expect(r2.has(recentCoach)).toBe(true);
    expect(r2.has(liveCoach)).toBe(true);

    const row = db.prepare(`SELECT media_key, media_expired_at FROM proofs WHERE id = 'p_old'`).get() as any;
    expect(row.media_key).toBeNull();
    expect(row.media_expired_at).toBeTruthy();
    const media = await call('client', 'GET', '/proofs/p_old/media');
    expect(media.status).toBe(410);
    const got = await call('client', 'GET', '/proofs/p_old');
    expect(got.data.proof).toMatchObject({ media_url: null, media_expired: true });
  });

  it('is bounded per run and chunked under the D1 parameter cap', async () => {
    for (let i = 0; i < 230; i++) seed(`bulk${String(i).padStart(3, '0')}`, '2024-01-01T00:00:00.000Z', null);
    expect(await expireProofMedia(env, new Date(`${TODAY}T12:00:00Z`))).toBe(200);
    expect(await expireProofMedia(env, new Date(`${TODAY}T12:00:00Z`))).toBe(30);
  });
});

// ---------------------------------------------------------------------------
describe('group plan homework proofs', () => {
  function addCohort(coach: string, members: string[]) {
    db.prepare(
      `INSERT INTO cohorts (id, coach_id, title, start_date, capacity) VALUES ('coh1', ?, 'Run club', '2026-11-10', 10)`
    ).run(coach);
    db.prepare(
      `INSERT INTO cohort_assignments (id, cohort_id, title, created_at) VALUES ('chw1', 'coh1', 'Run 3 km', datetime('now'))`
    ).run();
    for (const m of members) {
      db.prepare(`INSERT INTO cohort_members (cohort_id, user_id, status) VALUES ('coh1', ?, 'active')`).run(m);
      db.prepare(
        `INSERT INTO cohort_member_assignments (id, assignment_id, cohort_id, user_id, status) VALUES (?, 'chw1', 'coh1', ?, 'assigned')`
      ).run(`cohort_asg_${m}`, m);
    }
  }

  it('a member proves group homework; only the group coach sees it', async () => {
    addCohort('coach', ['client', 'friend']);
    const up = await upload('client', JPEG, 'image/jpeg', 'run.jpg');
    const res = await call('client', 'POST', '/proofs', {
      kind: 'photo',
      media_key: up.data.key,
      context_type: 'assignment',
      context_id: 'cohort_asg_client',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const p = res.data.proof;
    expect(p.shared_with_coach).toBe(true);

    expect((await call('coach', 'GET', `/proofs/${p.id}`)).status).toBe(200);
    expect((await call('coach', 'GET', `/proofs/${p.id}/media`)).status).toBe(200);
    expect((await call('coach', 'POST', `/proofs/${p.id}/seen`)).status).toBe(200);
    // Another member, another coach and a stranger: 404.
    expect((await call('friend', 'GET', `/proofs/${p.id}`)).status).toBe(404);
    expect((await call('friend', 'GET', `/proofs/${p.id}/media`)).status).toBe(404);
    expect((await call('coach2', 'GET', `/proofs/${p.id}`)).status).toBe(404);
    expect((await call('stranger', 'GET', `/proofs/${p.id}/media`)).status).toBe(404);

    // The member leaves the group → the coach loses access.
    db.prepare(`UPDATE cohort_members SET status = 'left' WHERE user_id = 'client'`).run();
    expect((await call('coach', 'GET', `/proofs/${p.id}`)).status).toBe(404);
  });

  it('opting out of coach sharing keeps it private; someone else’s homework id is 404', async () => {
    addCohort('coach', ['client', 'friend']);
    const priv = await call('client', 'POST', '/proofs', {
      kind: 'note',
      text: 'Done',
      context_type: 'assignment',
      context_id: 'cohort_asg_client',
      share_with_coach: false,
    });
    expect(priv.status).toBe(201);
    expect(priv.data.proof.shared_with_coach).toBe(false);
    expect((await call('coach', 'GET', `/proofs/${priv.data.proof.id}`)).status).toBe(404);

    const other = await call('client', 'POST', '/proofs', {
      kind: 'note',
      text: 'Done',
      context_type: 'assignment',
      context_id: 'cohort_asg_friend',
    });
    expect(other.status).toBe(404);
    const stranger = await call('stranger', 'POST', '/proofs', {
      kind: 'note',
      text: 'Done',
      context_type: 'assignment',
      context_id: 'cohort_asg_client',
    });
    expect(stranger.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
describe('orphan uploads and account deletion', () => {
  const old = new Date(`2026-11-14T00:00:00Z`);
  it('sweeps unattached uploads older than 48 h, paging with a KV cursor', async () => {
    const attached = await photo('client');
    const attachedKey = db.prepare(`SELECT media_key FROM proofs WHERE id = ?`).get(attached.id) as any;
    r2.get(attachedKey.media_key)!.uploaded = old;
    for (let i = 0; i < 250; i++) {
      r2.set(`proof/client/orphan${String(i).padStart(3, '0')}.jpg`, { bytes: JPEG, uploaded: old });
    }
    r2.set('proof/client/fresh.jpg', { bytes: JPEG, uploaded: new Date() });
    r2.set('post/client/public.jpg', { bytes: JPEG, uploaded: old });

    const now = new Date(`${TODAY}T12:00:00Z`);
    const first = await sweepOrphanProofUploads(env, now);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThanOrEqual(200);
    expect(kvStore.get(ORPHAN_CURSOR_KEY)).toBeTruthy();
    for (let i = 0; i < 5 && kvStore.get(ORPHAN_CURSOR_KEY); i++) await sweepOrphanProofUploads(env, now);
    await sweepOrphanProofUploads(env, now);
    const left = [...r2.keys()].filter((k) => k.includes('orphan'));
    expect(left).toEqual([]);
    expect(r2.has(attachedKey.media_key)).toBe(true);
    expect(r2.has('proof/client/fresh.jpg')).toBe(true);
    expect(r2.has('post/client/public.jpg')).toBe(true);
  });

  it('account deletion removes the user’s proof files and rows only', async () => {
    await photo('client');
    await photo('friend');
    r2.set('proof/client/never-attached.jpg', { bytes: JPEG });
    expect(await deleteUserProofMedia(env, 'client')).toBe(2);
    expect([...r2.keys()].some((k) => k.startsWith('proof/client/'))).toBe(false);
    expect([...r2.keys()].some((k) => k.startsWith('proof/friend/'))).toBe(true);

    await photo('client');
    const res = await call('client', 'POST', '/privacy/delete-account', { confirm: 'DELETE' });
    expect(res.status).toBe(200);
    expect([...r2.keys()].some((k) => k.startsWith('proof/client/'))).toBe(false);
    const n = db.prepare(`SELECT COUNT(*) n FROM proofs WHERE user_id = 'client'`).get() as any;
    expect(Number(n.n)).toBe(0);
  });
});
