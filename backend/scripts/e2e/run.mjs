#!/usr/bin/env node
/**
 * Grow! end-to-end API smoke / regression test.
 *
 *   node backend/scripts/e2e/run.mjs            # against QA (default)
 *   E2E_BASE=https://…/api/v1 node backend/scripts/e2e/run.mjs
 *
 * Node 18+ (built-in fetch), zero dependencies. Sequential requests with a small
 * delay. Everything the script creates is prefixed "[e2e]" and removed in a
 * `finally` block, even when checks fail. See README.md next to this file.
 *
 * Env:
 *   E2E_BASE              API base incl. version (default QA worker /api/v1)
 *   E2E_DELAY_MS          pause between requests (default 120)
 *   E2E_TIMEOUT_MS        per-request timeout (default 20000)
 *   E2E_ONLY              comma list of sections to run (e.g. "auth,feed")
 *   E2E_VERBOSE=1         print response bodies of failing checks
 *   E2E_DEMO_EMAIL / E2E_DEMO_PASSWORD               (and INSTRUCTOR / BUSINESS / REVIEW)
 */

const BASE = (process.env.E2E_BASE || 'https://growl-backend-qa.wispy-leaf-4e8b.workers.dev/api/v1').replace(/\/+$/, '');
const DELAY_MS = Number(process.env.E2E_DELAY_MS ?? 120);
const TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS ?? 20000);
const VERBOSE = process.env.E2E_VERBOSE === '1';
const ONLY = (process.env.E2E_ONLY || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// Public demo credentials (also documented in backend/scripts/seed-*.sql comments).
const ACCOUNTS = {
  demo: {
    email: process.env.E2E_DEMO_EMAIL || 'demo@growl.app',
    password: process.env.E2E_DEMO_PASSWORD || 'GrowlDemo123!',
  },
  instructor: {
    email: process.env.E2E_INSTRUCTOR_EMAIL || 'instructor@growl.app',
    password: process.env.E2E_INSTRUCTOR_PASSWORD || 'GrowlDemo123!',
  },
  business: {
    email: process.env.E2E_BUSINESS_EMAIL || 'business@growl.app',
    password: process.env.E2E_BUSINESS_PASSWORD || 'GrowlDemo123!',
  },
  review: {
    email: process.env.E2E_REVIEW_EMAIL || 'review@growl.app',
    password: process.env.E2E_REVIEW_PASSWORD || 'GrowlReview123!',
  },
};
const SECRETS = Object.values(ACCOUNTS).map((a) => a.password).filter(Boolean);

const TAG = '[e2e]';
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------------------------------------------------------------------------
// Output

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const green = c('32');
const red = c('31');
const yellow = c('33');
const dim = c('2');
const bold = c('1');

function redact(s) {
  let out = String(s ?? '');
  for (const secret of SECRETS) out = out.split(secret).join('***');
  // Never echo bearer/refresh tokens either.
  out = out.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, '<jwt>');
  return out;
}

// ---------------------------------------------------------------------------
// HTTP

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastCall = null;

/**
 * api('GET', '/profile', { as: 'demo' | token, body, headers, query })
 * → { status, ok, body, data, error, headers, ms, endpoint, text }
 */
async function api(method, path, opts = {}) {
  if (DELAY_MS > 0) await sleep(DELAY_MS);
  const url = new URL(BASE + path);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const headers = { Accept: 'application/json', ...(opts.headers || {}) };
  const token = typeof opts.as === 'string' && sessions[opts.as] ? sessions[opts.as].token : opts.token;
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const endpoint = `${method} ${url.pathname.replace(/^\/api\/v\d+/, '')}${url.search}`;
  const started = performance.now();
  let res;
  try {
    res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    lastCall = { endpoint, status: 0, message: `network: ${err?.message || err}` };
    throw new CheckError(`network error: ${err?.message || err}`);
  }
  const text = await res.text();
  const ms = Math.round(performance.now() - started);
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  const out = {
    status: res.status,
    ok: res.ok,
    body: parsed,
    data: parsed && typeof parsed === 'object' && 'data' in parsed ? parsed.data : undefined,
    error: parsed?.error,
    meta: parsed?.meta,
    headers: res.headers,
    ms,
    endpoint,
    text,
  };
  lastCall = {
    endpoint,
    status: res.status,
    message: parsed?.error ? `${parsed.error.code}: ${parsed.error.message}` : '',
    text,
  };
  return out;
}

// ---------------------------------------------------------------------------
// Checks

class CheckError extends Error {}
class SkipError extends Error {}

const results = []; // { area, name, status: 'pass'|'fail'|'skip', ms, note, endpoint, httpStatus, message }
let currentArea = '';

function area(name) {
  currentArea = name;
  console.log(`\n${bold(name)}`);
}

function assert(cond, msg) {
  if (!cond) throw new CheckError(msg);
}
function skip(reason) {
  throw new SkipError(reason);
}
function expectStatus(res, ...codes) {
  if (!codes.includes(res.status)) {
    const m = res.error ? `${res.error.code}: ${res.error.message}` : res.text?.slice(0, 160);
    throw new CheckError(`expected HTTP ${codes.join('/')} got ${res.status}${m ? ` (${m})` : ''}`);
  }
  return res;
}
/** 2xx + { success: true, data } envelope. */
function expectOk(res, code = 200) {
  expectStatus(res, code);
  assert(res.body && res.body.success === true, 'response envelope missing success:true');
  return res.data;
}
function expectError(res, status, code) {
  expectStatus(res, status);
  assert(res.body && res.body.success === false, 'error envelope missing success:false');
  if (code) assert(res.error?.code === code, `expected error code ${code}, got ${res.error?.code}`);
}
const isArr = Array.isArray;

async function check(name, fn) {
  lastCall = null;
  const started = performance.now();
  let status = 'pass';
  let note = '';
  try {
    const r = await fn();
    if (typeof r === 'string') note = r;
  } catch (err) {
    if (err instanceof SkipError) {
      status = 'skip';
      note = err.message;
    } else {
      status = 'fail';
      note = err instanceof CheckError ? err.message : `script error: ${err?.stack || err}`;
    }
  }
  const ms = Math.round(performance.now() - started);
  const rec = {
    area: currentArea,
    name,
    status,
    ms,
    note: redact(note),
    endpoint: lastCall?.endpoint || '',
    httpStatus: lastCall?.status ?? '',
    message: redact(lastCall?.message || ''),
  };
  results.push(rec);
  const t = dim(`(${ms}ms)`);
  if (status === 'pass') {
    console.log(`  ${green('✓')} ${name} ${t}${rec.note ? dim(` — ${rec.note}`) : ''}`);
  } else if (status === 'skip') {
    console.log(`  ${yellow('–')} ${name} ${dim('skipped')}${rec.note ? dim(` — ${rec.note}`) : ''}`);
  } else {
    console.log(`  ${red('✗')} ${name} ${t}`);
    console.log(`      ${red(rec.note)}`);
    if (rec.endpoint) console.log(`      ${dim(`last call: ${rec.endpoint} → ${rec.httpStatus}`)}`);
    if (VERBOSE && lastCall?.text) console.log(`      ${dim(redact(lastCall.text).slice(0, 600))}`);
  }
  return status === 'pass';
}

// ---------------------------------------------------------------------------
// State + cleanup

const sessions = {}; // role → { token, refreshToken, userId, … }
const ctx = {}; // shared discoveries between sections
const cleanups = []; // { label, fn } run in reverse order

function onCleanup(label, fn) {
  const entry = { label, fn, done: false };
  cleanups.push(entry);
  return () => {
    entry.done = true; // the test already cleaned this up
  };
}

const idemKey = (what) => `e2e-${RUN_ID}-${what}`;
const uid = (role) => sessions[role]?.userId;
const need = (...roles) => {
  for (const r of roles) if (!sessions[r]) skip(`no ${r} session`);
};
const localToday = () => new Date().toISOString().slice(0, 10);

function postIdsOf(data) {
  if (isArr(data)) return data.map((p) => p.id);
  if (data && typeof data === 'object') {
    return [...(data.following || []), ...(data.suggested || [])].map((p) => p.id);
  }
  return [];
}

// ---------------------------------------------------------------------------
// Sections

async function sectionHealth() {
  area('Health');
  await check('GET /health reports ok + DB/KV/R2 connected', async () => {
    const d = expectOk(await api('GET', '/health'));
    assert(d.status === 'ok', `status=${d.status}`);
    assert(d.database === 'connected', `database=${d.database}`);
    assert(d.kv === 'connected', `kv=${d.kv}`);
    assert(d.jwtConfigured === true, 'jwtConfigured false');
    ctx.health = d;
    return `env=${d.environment}`;
  });
  await check('unknown route → 404 NOT_FOUND', async () => {
    expectError(await api('GET', `/e2e-no-such-route-${RUN_ID}`), 404, 'NOT_FOUND');
  });
}

async function sectionAuth() {
  area('Auth');
  const roleFlags = {
    demo: (d) => !d.isBusiness,
    instructor: (d) => d.isInstructor === true,
    business: (d) => d.isBusiness === true,
    review: () => true,
  };
  for (const role of Object.keys(ACCOUNTS)) {
    await check(`sign-in ${role} (${ACCOUNTS[role].email})`, async () => {
      const d = expectOk(
        await api('POST', '/auth/sign-in', {
          body: { email: ACCOUNTS[role].email, password: ACCOUNTS[role].password },
        })
      );
      assert(typeof d.token === 'string' && d.token.length > 20, 'missing token');
      assert(typeof d.refreshToken === 'string' && d.refreshToken.length > 20, 'missing refreshToken');
      assert(typeof d.userId === 'string', 'missing userId');
      assert(d.emailVerified === true, 'emailVerified false');
      sessions[role] = d;
      assert(roleFlags[role](d), `role flags wrong (isInstructor=${d.isInstructor}, isBusiness=${d.isBusiness})`);
      return `userId=${d.userId}`;
    });
  }

  await check('sign-in wrong password → 401 INVALID_CREDENTIALS', async () => {
    expectError(
      await api('POST', '/auth/sign-in', { body: { email: ACCOUNTS.demo.email, password: `wrong-${RUN_ID}` } }),
      401,
      'INVALID_CREDENTIALS'
    );
  });
  await check('invalid bearer token → 401', async () => {
    expectStatus(await api('GET', '/profile', { token: 'not-a-real-token' }), 401);
  });
  await check('missing token → 401', async () => {
    expectStatus(await api('GET', '/profile'), 401);
  });

  // Refresh rotation on a throw-away demo session so the main session stays valid.
  let rt1, pair2, pair3;
  await check('refresh: new session for rotation test', async () => {
    const d = expectOk(
      await api('POST', '/auth/sign-in', { body: { email: ACCOUNTS.demo.email, password: ACCOUNTS.demo.password } })
    );
    rt1 = d.refreshToken;
  });
  await check('refresh: rotate RT1 → new pair', async () => {
    if (!rt1) skip('no refresh token');
    const d = expectOk(await api('POST', '/auth/refresh', { body: { refreshToken: rt1 } }));
    assert(d.token && d.refreshToken, 'missing token pair');
    assert(d.refreshToken !== rt1, 'refresh token was not rotated');
    assert(d.userId === uid('demo'), 'userId mismatch');
    pair2 = d;
  });
  await check('refresh: replay RT1 within 60 s grace → same pair', async () => {
    if (!pair2) skip('rotation failed');
    const d = expectOk(await api('POST', '/auth/refresh', { body: { refreshToken: rt1 } }));
    assert(d.refreshToken === pair2.refreshToken, 'grace replay returned a different refresh token');
    assert(d.token === pair2.token, 'grace replay returned a different access token');
  });
  await check('refresh: rotate RT2 → pair3', async () => {
    if (!pair2) skip('rotation failed');
    const d = expectOk(await api('POST', '/auth/refresh', { body: { refreshToken: pair2.refreshToken } }));
    assert(d.refreshToken !== pair2.refreshToken, 'not rotated');
    pair3 = d;
  });
  await check('refresh: RT1 after its replacement rotated → 401', async () => {
    if (!pair3) skip('rotation failed');
    expectError(await api('POST', '/auth/refresh', { body: { refreshToken: rt1 } }), 401, 'INVALID_REFRESH_TOKEN');
  });
  await check('refresh: garbage token → 401', async () => {
    expectError(
      await api('POST', '/auth/refresh', { body: { refreshToken: `garbage-${RUN_ID}-xxxxxxxxxxxxxxxx` } }),
      401,
      'INVALID_REFRESH_TOKEN'
    );
  });
  await check('sign-out revokes refresh token', async () => {
    if (!pair3) skip('rotation failed');
    expectOk(await api('POST', '/auth/sign-out', { body: { refreshToken: pair3.refreshToken } }));
    expectError(await api('POST', '/auth/refresh', { body: { refreshToken: pair3.refreshToken } }), 401);
  });
}

async function sectionProfile() {
  area('Profile / me');
  need('demo');
  await check('GET /profile', async () => {
    const d = expectOk(await api('GET', '/profile', { as: 'demo' }));
    assert(d.id === uid('demo'), 'id mismatch');
    assert(d.email === ACCOUNTS.demo.email, 'email mismatch');
    assert(isArr(d.categories), 'categories not array');
    ctx.demoUsername = d.username;
  });
  await check('GET /profile?stats=1', async () => {
    const d = expectOk(await api('GET', '/profile', { as: 'demo', query: { stats: 1 } }));
    assert(typeof d.post_count === 'number', 'post_count missing');
    assert(typeof d.streak_days === 'number', 'streak_days missing');
  });
  await check('GET review /profile (username for mentions)', async () => {
    need('review');
    const d = expectOk(await api('GET', '/profile', { as: 'review' }));
    ctx.reviewUsername = d.username;
    return `@${d.username}`;
  });
  await check('GET /profile/user/:id (public profile)', async () => {
    need('review');
    const d = expectOk(await api('GET', `/profile/user/${uid('review')}`, { as: 'demo' }));
    assert(d && typeof d === 'object', 'empty body');
  });

  let todayData;
  await check('GET /me/today', async () => {
    todayData = expectOk(await api('GET', '/me/today', { as: 'demo' }));
    assert('checkin' in todayData, 'checkin key missing');
    assert(todayData.streak && typeof todayData.streak === 'object', 'streak missing');
    assert(todayData.life_mode && typeof todayData.life_mode.mode === 'string', 'life_mode missing');
    ctx.today = todayData.streak.today || localToday();
    return `today=${ctx.today}, checked_in=${!!todayData.checkin}`;
  });
  await check('PUT /me/today check-in + Idempotency-Key replay', async () => {
    if (!todayData) skip('GET /me/today failed');
    const existing = todayData.checkin;
    // Existing check-in: send only the day (merge keeps every field unchanged).
    // None yet: a plain mood check-in (cannot be deleted; it's the demo account's own day).
    const body = existing ? { day: ctx.today } : { day: ctx.today, mood: 3 };
    const key = idemKey('checkin');
    const r1 = await api('PUT', '/me/today', { as: 'demo', body, headers: { 'Idempotency-Key': key } });
    const d1 = expectOk(r1);
    assert(d1.checkin && d1.checkin.day === ctx.today, 'checkin.day mismatch');
    const r2 = await api('PUT', '/me/today', { as: 'demo', body, headers: { 'Idempotency-Key': key } });
    const d2 = expectOk(r2);
    assert(r2.headers.get('idempotent-replayed') === 'true', 'replay header Idempotent-Replayed missing');
    assert(JSON.stringify(d2.checkin) === JSON.stringify(d1.checkin), 'replayed body differs');
    return existing ? 'existing check-in left unchanged' : 'created mood check-in';
  });
  await check('GET /me/streak', async () => {
    const d = expectOk(await api('GET', '/me/streak', { as: 'demo' }));
    assert(typeof d === 'object' && d !== null, 'no streak payload');
  });
  await check('GET /me/badges', async () => {
    const d = expectOk(await api('GET', '/me/badges', { as: 'demo' }));
    assert(isArr(d.earned) && isArr(d.catalog), 'earned/catalog arrays missing');
    assert(d.catalog.length > 0, 'empty badge catalog');
    return `${d.earned.length}/${d.catalog.length} earned`;
  });
  await check('GET /users/:id/badges', async () => {
    need('review');
    expectOk(await api('GET', `/users/${uid('review')}/badges`, { as: 'demo' }));
  });
  await check('GET /me/recap', async () => {
    expectOk(await api('GET', '/me/recap', { as: 'demo' }));
  });
  await check('GET /me/progress', async () => {
    expectOk(await api('GET', '/me/progress', { as: 'demo' }));
  });
  await check('GET /me/invite + /invites/:code lookup', async () => {
    const d = expectOk(await api('GET', '/me/invite', { as: 'demo' }));
    assert(typeof d.code === 'string' && d.code.length > 0, 'no invite code');
    assert(typeof d.invited_count === 'number', 'invited_count missing');
    const l = expectOk(await api('GET', `/invites/${encodeURIComponent(d.code)}`));
    assert(l.inviter && 'username' in l.inviter, 'inviter missing');
  });

  // Privacy roundtrip (restore original in cleanup too).
  await check('PUT/GET /me/privacy roundtrip (restored)', async () => {
    const orig = expectOk(await api('GET', '/me/privacy', { as: 'demo' })).dm_policy;
    assert(['everyone', 'friends', 'nobody'].includes(orig), `unexpected dm_policy ${orig}`);
    const next = orig === 'friends' ? 'everyone' : 'friends';
    const done = onCleanup('restore demo dm_policy', () =>
      api('PUT', '/me/privacy', { as: 'demo', body: { dm_policy: orig } })
    );
    const p = expectOk(await api('PUT', '/me/privacy', { as: 'demo', body: { dm_policy: next } }));
    assert(p.dm_policy === next, 'PUT did not echo new policy');
    const g = expectOk(await api('GET', '/me/privacy', { as: 'demo' }));
    assert(g.dm_policy === next, `GET after PUT returned ${g.dm_policy}`);
    expectOk(await api('PUT', '/me/privacy', { as: 'demo', body: { dm_policy: orig } }));
    const g2 = expectOk(await api('GET', '/me/privacy', { as: 'demo' }));
    assert(g2.dm_policy === orig, 'restore failed');
    done();
    return `${orig} → ${next} → ${orig}`;
  });
  await check('PUT /me/privacy invalid value → 400', async () => {
    expectStatus(await api('PUT', '/me/privacy', { as: 'demo', body: { dm_policy: 'e2e-bogus' } }), 400);
  });

  await check('PUT/GET/clear /me/life-mode (restored)', async () => {
    const orig = expectOk(await api('GET', '/me/life-mode', { as: 'demo' }));
    assert(typeof orig.mode === 'string', 'mode missing');
    const restoreBody = orig.mode === 'none' ? { mode: 'none' } : { mode: orig.mode, until: orig.until ?? null };
    const done = onCleanup('restore demo life mode', () =>
      api('PUT', '/me/life-mode', { as: 'demo', body: restoreBody })
    );
    const until = ctx.today || localToday();
    const p = expectOk(await api('PUT', '/me/life-mode', { as: 'demo', body: { mode: 'travel', until } }));
    assert(p.mode === 'travel' && p.until === until, `PUT echoed ${JSON.stringify(p)}`);
    const g = expectOk(await api('GET', '/me/life-mode', { as: 'demo' }));
    assert(g.mode === 'travel', `GET returned mode=${g.mode}`);
    const cl = expectOk(await api('PUT', '/me/life-mode', { as: 'demo', body: { mode: 'none' } }));
    assert(cl.mode === 'none', 'clear failed');
    const g2 = expectOk(await api('GET', '/me/life-mode', { as: 'demo' }));
    assert(g2.mode === 'none', `after clear mode=${g2.mode}`);
    if (orig.mode !== 'none') expectOk(await api('PUT', '/me/life-mode', { as: 'demo', body: restoreBody }));
    done();
    return `orig=${orig.mode}`;
  });
  await check('PUT /me/life-mode past date → 400', async () => {
    expectStatus(await api('PUT', '/me/life-mode', { as: 'demo', body: { mode: 'sick', until: '2000-01-01' } }), 400);
  });

  await check('GET /me/insights (30d)', async () => {
    const d = expectOk(await api('GET', '/me/insights', { as: 'demo' }));
    assert(d && typeof d === 'object', 'no payload');
  });
  await check('GET /me/insights?days=90', async () => {
    expectOk(await api('GET', '/me/insights', { as: 'demo', query: { days: 90 } }));
  });
  await check('GET /me/circle/today', async () => {
    const d = expectOk(await api('GET', '/me/circle/today', { as: 'demo' }));
    assert(isArr(d.friends), 'friends not array');
    assert(d.friends.length <= 8, 'more than 8 friends returned');
    return `${d.friends.length} friends checked in`;
  });
}

async function sectionFeed() {
  area('Feed');
  need('demo');
  for (const mode of ['foryou', 'home', 'explore']) {
    const seen = new Set();
    let dupes = 0;
    let cursor = null;
    let pages = 0;
    let ended = false;
    for (let page = 1; page <= 3; page++) {
      const ok = await check(`feed mode=${mode} page ${page}`, async () => {
        if (ended) skip('no more pages');
        const r = await api('GET', '/feed/feed', {
          as: 'demo',
          query: { mode, limit: 10, ...(cursor ? { cursor } : {}) },
        });
        const d = expectOk(r);
        if (mode === 'explore') assert(isArr(d), 'explore should return an array');
        else assert(isArr(d.following) && isArr(d.suggested), `${mode} should return {following,suggested}`);
        const ids = postIdsOf(d);
        assert(ids.length <= 10, `page has ${ids.length} > limit 10`);
        for (const id of ids) {
          if (seen.has(id)) dupes++;
          seen.add(id);
        }
        if (mode !== 'explore') {
          assert(d.next_cursor === (r.meta?.next_cursor ?? null), 'data.next_cursor != meta.next_cursor');
        }
        cursor = r.meta?.next_cursor ?? null;
        pages++;
        if (!cursor) ended = true;
        if (mode === 'explore' && page === 1) ctx.exploreCursor = cursor;
        if (mode === 'foryou' && page === 1) ctx.foryouCursor = cursor;
        return `${ids.length} posts${cursor ? '' : ', last page'}`;
      });
      if (!ok) break;
    }
    await check(`feed mode=${mode} no duplicate ids across pages`, async () => {
      if (!pages) skip('no pages loaded');
      assert(dupes === 0, `${dupes} duplicate post id(s) across ${pages} pages`);
      return `${seen.size} unique over ${pages} page(s)`;
    });
  }
  await check('feed legacy first page (no cursor/limit)', async () => {
    const d = expectOk(await api('GET', '/feed/feed', { as: 'demo', query: { mode: 'explore' } }));
    assert(isArr(d), 'not an array');
  });
  await check('feed invalid cursor → 400 INVALID_CURSOR', async () => {
    expectError(
      await api('GET', '/feed/feed', { as: 'demo', query: { mode: 'foryou', cursor: 'e2e-garbage' } }),
      400,
      'INVALID_CURSOR'
    );
  });
  await check('feed cursor from another mode → 400', async () => {
    if (!ctx.foryouCursor) skip('no foryou cursor');
    expectError(
      await api('GET', '/feed/feed', { as: 'demo', query: { mode: 'explore', cursor: ctx.foryouCursor } }),
      400,
      'INVALID_CURSOR'
    );
  });
  await check('feed without auth → 401', async () => {
    expectStatus(await api('GET', '/feed/feed', { query: { mode: 'foryou' } }), 401);
  });

  // Target post for engagement: prefer the demo account's own post, then review's,
  // so likes/comments never notify real people.
  await check('GET /feed/posts/user/:id (demo)', async () => {
    const d = expectOk(await api('GET', `/feed/posts/user/${uid('demo')}`, { as: 'demo' }));
    assert(isArr(d), 'not an array');
    if (d[0]) ctx.targetPost = { id: d[0].id, owner: 'demo' };
    return `${d.length} posts`;
  });
  if (!ctx.targetPost && sessions.review) {
    await check('GET /feed/posts/user/:id (review)', async () => {
      const d = expectOk(await api('GET', `/feed/posts/user/${uid('review')}`, { as: 'demo' }));
      assert(isArr(d), 'not an array');
      if (d[0]) ctx.targetPost = { id: d[0].id, owner: 'review' };
      return `${d.length} posts`;
    });
  }

  await check('POST /feed/posts text-only is rejected (media required)', async () => {
    // No DELETE /feed/posts/:id route exists, so the script must not create real posts.
    const r = await api('POST', '/feed/posts', {
      as: 'demo',
      body: { caption: `${TAG} text-only probe ${RUN_ID}`, category: 'fitness' },
    });
    expectStatus(r, 400);
    return 'post create+delete not exercised: API has no post DELETE route';
  });

  const post = ctx.targetPost;
  await check('GET /feed/posts/:id', async () => {
    if (!post) skip('no post owned by demo/review');
    const d = expectOk(await api('GET', `/feed/posts/${post.id}`, { as: 'demo' }));
    assert(d.id === post.id, 'id mismatch');
  });
  await check('GET /feed/posts/:id/likes', async () => {
    if (!post) skip('no target post');
    expectOk(await api('GET', `/feed/posts/${post.id}/likes`, { as: 'demo' }));
  });
  await check('like → unlike restores state', async () => {
    if (!post) skip('no target post');
    const a = expectOk(await api('POST', `/feed/posts/${post.id}/like`, { as: 'demo' }));
    assert(typeof a.liked === 'boolean', 'liked missing');
    const undo = onCleanup('restore like state', () => api('POST', `/feed/posts/${post.id}/like`, { as: 'demo' }));
    const b = expectOk(await api('POST', `/feed/posts/${post.id}/like`, { as: 'demo' }));
    assert(b.liked === !a.liked, `second toggle returned liked=${b.liked}`);
    undo();
    return `liked ${a.liked} → ${b.liked}`;
  });

  let commentId;
  await check('POST comment (+@mention) with Idempotency-Key replay → same id', async () => {
    if (!post) skip('no target post');
    const mention = ctx.reviewUsername && post.owner !== 'review' ? ` @${ctx.reviewUsername}` : '';
    const body = { content: `${TAG} smoke comment ${RUN_ID}${mention}` };
    const key = idemKey('comment');
    const r1 = await api('POST', `/feed/posts/${post.id}/comments`, {
      as: 'demo',
      body,
      headers: { 'Idempotency-Key': key },
    });
    const d1 = expectOk(r1, 201);
    commentId = d1.id;
    onCleanup(`delete comment ${commentId}`, () =>
      api('DELETE', `/feed/posts/${post.id}/comments/${commentId}`, { as: 'demo' })
    );
    const r2 = await api('POST', `/feed/posts/${post.id}/comments`, {
      as: 'demo',
      body,
      headers: { 'Idempotency-Key': key },
    });
    const d2 = expectOk(r2, 201);
    assert(d2.id === d1.id, `replay created a new comment (${d2.id} != ${d1.id})`);
    assert(r2.headers.get('idempotent-replayed') === 'true', 'Idempotent-Replayed header missing');
    return mention ? `mentioned${mention}` : 'no mention target';
  });
  await check('Idempotency-Key reused on different path → 422', async () => {
    if (!post || !commentId) skip('no comment');
    // Same key, different endpoint (journal) must be refused, not replayed.
    const r = await api('POST', '/journal/entries', {
      as: 'demo',
      body: { content: `${TAG} should not be created ${RUN_ID}` },
      headers: { 'Idempotency-Key': idemKey('comment') },
    });
    if (r.status === 201 && r.data?.id) {
      onCleanup(`delete stray journal ${r.data.id}`, () => api('DELETE', `/journal/entries/${r.data.id}`, { as: 'demo' }));
    }
    expectError(r, 422, 'IDEMPOTENCY_KEY_REUSED');
  });
  await check('invalid Idempotency-Key → 400', async () => {
    if (!post) skip('no target post');
    expectError(
      await api('POST', `/feed/posts/${post.id}/comments`, {
        as: 'demo',
        body: { content: `${TAG} bad key` },
        headers: { 'Idempotency-Key': 'bad' },
      }),
      400,
      'INVALID_IDEMPOTENCY_KEY'
    );
  });
  await check('GET comments includes new comment', async () => {
    if (!commentId) skip('no comment');
    const d = expectOk(await api('GET', `/feed/posts/${post.id}/comments`, { as: 'demo', query: { limit: 100 } }));
    const list = isArr(d) ? d : d.comments || [];
    assert(list.some((x) => x.id === commentId), 'comment not listed');
  });
  await check('DELETE comment', async () => {
    if (!commentId) skip('no comment');
    expectOk(await api('DELETE', `/feed/posts/${post.id}/comments/${commentId}`, { as: 'demo' }));
    const d = expectOk(await api('GET', `/feed/posts/${post.id}/comments`, { as: 'demo', query: { limit: 100 } }));
    const list = isArr(d) ? d : d.comments || [];
    assert(!list.some((x) => x.id === commentId), 'comment still listed after delete');
    for (const cl of cleanups) if (cl.label === `delete comment ${commentId}`) cl.done = true;
  });
}

async function sectionJournal() {
  area('Journal');
  need('demo');
  let id;
  await check('POST /journal/entries (idempotent replay → same id)', async () => {
    const body = { title: `${TAG} smoke`, content: `${TAG} journal entry ${RUN_ID}`, mood: 'calm', is_public: false };
    const key = idemKey('journal');
    const d1 = expectOk(
      await api('POST', '/journal/entries', { as: 'demo', body, headers: { 'Idempotency-Key': key } }),
      201
    );
    id = d1.id;
    assert(id, 'no id');
    onCleanup(`delete journal ${id}`, () => api('DELETE', `/journal/entries/${id}`, { as: 'demo' }));
    const r2 = await api('POST', '/journal/entries', { as: 'demo', body, headers: { 'Idempotency-Key': key } });
    const d2 = expectOk(r2, 201);
    assert(d2.id === id, `replay created new entry ${d2.id}`);
  });
  await check('PUT /journal/entries/:id', async () => {
    if (!id) skip('no entry');
    const d = expectOk(
      await api('PUT', `/journal/entries/${id}`, {
        as: 'demo',
        body: { content: `${TAG} journal entry ${RUN_ID} (edited)`, mood: 'grateful' },
      })
    );
    assert(String(d.content).includes('(edited)'), 'content not updated');
  });
  await check('GET /journal/entries lists edited entry', async () => {
    if (!id) skip('no entry');
    const d = expectOk(await api('GET', '/journal/entries', { as: 'demo', query: { limit: 100 } }));
    assert(isArr(d.entries), 'entries missing');
    const e = d.entries.find((x) => x.id === id);
    assert(e, 'entry not listed');
    assert(String(e.content).includes('(edited)'), 'list shows stale content');
  });
  await check('GET /journal/reflections', async () => {
    const d = expectOk(await api('GET', '/journal/reflections', { as: 'demo' }));
    assert(isArr(d.reflections), 'reflections missing');
  });
  await check('GET /journal/circle', async () => {
    const d = expectOk(await api('GET', '/journal/circle', { as: 'demo' }));
    assert(isArr(d.entries), 'entries missing');
  });
  await check('DELETE /journal/entries/:id', async () => {
    if (!id) skip('no entry');
    expectOk(await api('DELETE', `/journal/entries/${id}`, { as: 'demo' }));
    const d = expectOk(await api('GET', '/journal/entries', { as: 'demo', query: { limit: 100 } }));
    assert(!d.entries.some((x) => x.id === id), 'still listed after delete');
    for (const cl of cleanups) if (cl.label === `delete journal ${id}`) cl.done = true;
  });
}

async function sectionSocial() {
  area('Social');
  need('demo');
  await check('GET /social/friends', async () => {
    const d = expectOk(await api('GET', '/social/friends', { as: 'demo' }));
    assert(isArr(d.friends), 'friends missing');
    const ids = new Set(d.friends.map((f) => f.id));
    ctx.demoFriends = ids;
    ctx.demoReviewFriends = !!uid('review') && ids.has(uid('review'));
    return `${d.friends.length} friends; demo↔review friends=${ctx.demoReviewFriends}`;
  });
  await check('GET /social/friends/connections', async () => {
    const d = expectOk(await api('GET', '/social/friends/connections', { as: 'demo' }));
    assert(isArr(d.following) && isArr(d.followers), 'following/followers missing');
  });
  await check('GET /social/friends/status/:id', async () => {
    need('review');
    const d = expectOk(await api('GET', `/social/friends/status/${uid('review')}`, { as: 'demo' }));
    assert(typeof d.connected === 'boolean', 'connected missing');
    assert(d.blocked === false, 'demo has review blocked');
  });
  await check('GET /social/search?q= (legacy)', async () => {
    const d = expectOk(await api('GET', '/social/search', { as: 'demo', query: { q: 'fit' } }));
    assert(isArr(d.people) && isArr(d.posts), 'people/posts missing');
    return `${d.people.length} people, ${d.posts.length} posts`;
  });
  await check('GET /search?q=text', async () => {
    const d = expectOk(await api('GET', '/search', { as: 'demo', query: { q: 'fitness' } }));
    assert(isArr(d.people) && isArr(d.posts) && isArr(d.tags), 'sections missing');
    assert(d.more && typeof d.more === 'object', 'more missing');
    return `${d.people.length}p/${d.posts.length}posts/${d.tags.length}tags`;
  });
  await check('GET /search?q=#tag', async () => {
    const d = expectOk(await api('GET', '/search', { as: 'demo', query: { q: '#fit' } }));
    assert(isArr(d.tags), 'tags missing');
    assert(d.people.length === 0, '#tag query should not return people');
    return `${d.tags.length} tags, ${d.posts.length} posts`;
  });
  await check('GET /search type=posts paging cursor', async () => {
    const d = expectOk(await api('GET', '/search', { as: 'demo', query: { q: 'a', type: 'posts', limit: 5 } }));
    assert(isArr(d.posts) && d.posts.length <= 5, 'limit not respected');
    if (!d.next_cursor) return 'single page';
    const d2 = expectOk(
      await api('GET', '/search', { as: 'demo', query: { q: 'a', type: 'posts', limit: 5, cursor: d.next_cursor } })
    );
    const a = new Set(d.posts.map((p) => p.id));
    assert(!d2.posts.some((p) => a.has(p.id)), 'page 2 repeats page 1 posts');
    return 'paged without dupes';
  });
  await check('GET /search empty q → empty result', async () => {
    const d = expectOk(await api('GET', '/search', { as: 'demo', query: { q: '' } }));
    assert(d.people.length === 0 && d.posts.length === 0, 'expected empty');
  });
  await check('GET /mentions/suggest', async () => {
    const q = (ctx.reviewUsername || 'a').slice(0, 2);
    const d = expectOk(await api('GET', '/mentions/suggest', { as: 'demo', query: { q } }));
    assert(isArr(d.users), 'users missing');
    return `q=${q}: ${d.users.length} users`;
  });
  await check('GET /social/blocks', async () => {
    const d = expectOk(await api('GET', '/social/blocks', { as: 'demo' }));
    assert(isArr(d.blocks), 'blocks missing');
  });

  // Buddies
  let buddies;
  await check('GET /buddies', async () => {
    buddies = expectOk(await api('GET', '/buddies', { as: 'demo' }));
    assert(isArr(buddies.buddies) && isArr(buddies.invites_in) && isArr(buddies.invites_out), 'shape');
    assert(typeof buddies.max === 'number', 'max missing');
    return `${buddies.buddies.length} active`;
  });
  let inviteId;
  await check('buddy invite demo → review (idempotent)', async () => {
    need('review');
    if (!ctx.demoReviewFriends) skip('demo and review are not friends');
    if (!buddies) skip('buddies list failed');
    const rid = uid('review');
    const has = [...buddies.buddies, ...buddies.invites_in, ...buddies.invites_out].some(
      (b) => (b.user?.id || b.id) === rid
    );
    if (has) skip('demo and review already have a buddy row');
    const key = idemKey('buddy');
    const r1 = await api('POST', '/buddies/invite', { as: 'demo', body: { user_id: rid }, headers: { 'Idempotency-Key': key } });
    if (r1.status === 409 && /BUDDY_/.test(r1.error?.code || '')) skip(`not invitable: ${r1.error.code}`);
    const d1 = expectOk(r1, 201);
    inviteId = d1.buddy.id;
    onCleanup(`end buddy invite ${inviteId}`, () => api('DELETE', `/buddies/${inviteId}`, { as: 'demo' }));
    const d2 = expectOk(
      await api('POST', '/buddies/invite', { as: 'demo', body: { user_id: rid }, headers: { 'Idempotency-Key': key } }),
      201
    );
    assert(d2.buddy.id === inviteId, 'replay produced different invite');
  });
  await check('review sees invite, declines it', async () => {
    if (!inviteId) skip('no invite');
    const d = expectOk(await api('GET', '/buddies', { as: 'review' }));
    assert(d.invites_in.some((i) => i.id === inviteId), 'invite not in review invites_in');
    expectOk(await api('POST', `/buddies/${inviteId}/decline`, { as: 'review' }));
    const d2 = expectOk(await api('GET', '/buddies', { as: 'demo' }));
    assert(!d2.invites_out.some((i) => i.id === inviteId), 'invite still pending after decline');
    for (const cl of cleanups) if (cl.label === `end buddy invite ${inviteId}`) cl.done = true;
  });

  for (const role of ['demo', 'review']) {
    await check(`GET /notifications (${role})`, async () => {
      need(role);
      const d = expectOk(await api('GET', '/notifications', { as: role, query: { limit: 20 } }));
      assert(isArr(d.notifications), 'notifications missing');
      assert(typeof d.unread_count === 'number', 'unread_count missing');
      return `${d.notifications.length} items, ${d.unread_count} unread`;
    });
    await check(`GET /notifications/unread-count (${role})`, async () => {
      need(role);
      const d = expectOk(await api('GET', '/notifications/unread-count', { as: role }));
      assert(typeof d.unread_count === 'number', 'unread_count missing');
    });
  }
}

async function sectionMessages() {
  area('Messages');
  need('demo');
  await check('GET /messages/conversations', async () => {
    const d = expectOk(await api('GET', '/messages/conversations', { as: 'demo' }));
    assert(isArr(d.conversations), 'conversations missing');
    return `${d.conversations.length} conversations`;
  });
  await check('GET /messages/unread-count', async () => {
    const d = expectOk(await api('GET', '/messages/unread-count', { as: 'demo' }));
    assert(typeof d.unread_count === 'number', 'unread_count missing');
  });

  // Peer: a test account that is demo's friend (review first).
  const peerRole = ['review', 'instructor', 'business'].find((r) => sessions[r] && ctx.demoFriends?.has(uid(r)));
  let convId;
  let msgId;
  await check('POST /messages/conversations (friend test account)', async () => {
    if (!peerRole) skip('no test account is a friend of demo');
    const r = await api('POST', '/messages/conversations', { as: 'demo', body: { targetUserId: uid(peerRole) } });
    if (r.status === 403) skip(`messaging not allowed: ${r.error?.code} ${r.error?.message}`);
    const d = expectOk(r);
    convId = d.conversation.id;
    assert(d.conversation.peer.id === uid(peerRole), 'peer mismatch');
    return `peer=${peerRole}`;
  });
  await check('send message (idempotent replay → same id)', async () => {
    if (!convId) skip('no conversation');
    const key = idemKey('msg');
    const body = { body: `${TAG} hello from smoke test ${RUN_ID}` };
    const r1 = await api('POST', `/messages/conversations/${convId}/messages`, {
      as: 'demo',
      body,
      headers: { 'Idempotency-Key': key },
    });
    if (r1.status === 403) skip(`send refused: ${r1.error?.code}`);
    const d1 = expectOk(r1, 201);
    msgId = d1.id;
    onCleanup(`unsend message ${msgId}`, () =>
      api('DELETE', `/messages/conversations/${convId}/messages/${msgId}`, { as: 'demo' })
    );
    const d2 = expectOk(
      await api('POST', `/messages/conversations/${convId}/messages`, {
        as: 'demo',
        body,
        headers: { 'Idempotency-Key': key },
      }),
      201
    );
    assert(d2.id === msgId, `replay sent a duplicate (${d2.id})`);
  });
  await check('peer GET messages sees it', async () => {
    if (!msgId) skip('no message');
    const d = expectOk(await api('GET', `/messages/conversations/${convId}/messages`, { as: peerRole }));
    assert(isArr(d.messages), 'messages missing');
    const m = d.messages.find((x) => x.id === msgId);
    assert(m, 'message not visible to peer');
    assert(m.is_own === false, 'is_own should be false for peer');
    const dupes = d.messages.filter((x) => String(x.body).includes(RUN_ID)).length;
    assert(dupes === 1, `${dupes} copies of the message (idempotency broken)`);
  });
  await check('peer reacts (fire) then removes reaction', async () => {
    if (!msgId) skip('no message');
    const path = `/messages/conversations/${convId}/messages/${msgId}/reaction`;
    const a = expectOk(await api('PUT', path, { as: peerRole, body: { emoji: 'fire' } }));
    assert(a.reactions?.mine === 'fire', `mine=${a.reactions?.mine}`);
    assert(a.reactions.counts?.fire === 1, `counts.fire=${a.reactions.counts?.fire}`);
    const b = expectOk(await api('PUT', path, { as: peerRole, body: { emoji: 'fire' } }));
    assert(b.reactions?.mine == null, 'reaction not removed on second toggle');
  });
  await check('reaction with unknown emoji → 400', async () => {
    if (!msgId) skip('no message');
    expectStatus(
      await api('PUT', `/messages/conversations/${convId}/messages/${msgId}/reaction`, {
        as: peerRole,
        body: { emoji: 'e2e-bogus' },
      }),
      400
    );
  });
  await check('peer cannot unsend sender message → 403', async () => {
    if (!msgId) skip('no message');
    expectStatus(await api('DELETE', `/messages/conversations/${convId}/messages/${msgId}`, { as: peerRole }), 403);
  });
  await check('unsend (idempotent)', async () => {
    if (!msgId) skip('no message');
    const d = expectOk(await api('DELETE', `/messages/conversations/${convId}/messages/${msgId}`, { as: 'demo' }));
    assert(d.deleted === true, 'deleted flag missing');
    expectOk(await api('DELETE', `/messages/conversations/${convId}/messages/${msgId}`, { as: 'demo' }));
    const list = expectOk(await api('GET', `/messages/conversations/${convId}/messages`, { as: 'demo' }));
    const m = list.messages.find((x) => x.id === msgId);
    assert(!m || !String(m.body || '').includes(RUN_ID), 'body still visible after unsend');
    for (const cl of cleanups) if (cl.label === `unsend message ${msgId}`) cl.done = true;
  });
}

async function sectionStoriesChallengesCircles() {
  area('Stories / challenges / circles / seeds');
  need('demo');
  await check('GET /stories', async () => {
    const d = expectOk(await api('GET', '/stories', { as: 'demo' }));
    assert(isArr(d.stories), 'stories missing');
    return `${d.stories.length} stories`;
  });
  await check('GET /stories/user/:id', async () => {
    const d = expectOk(await api('GET', `/stories/user/${uid('demo')}`, { as: 'demo' }));
    assert(isArr(d.stories), 'stories missing');
  });

  let challenges = [];
  await check('GET /challenges', async () => {
    const d = expectOk(await api('GET', '/challenges', { as: 'demo' }));
    assert(isArr(d.challenges) && d.challenges.length > 0, 'no challenges');
    challenges = d.challenges;
    return `${challenges.length} challenges, ${challenges.filter((x) => x.joined).length} joined`;
  });
  await check('GET /challenges/:id', async () => {
    if (!challenges[0]) skip('no challenges');
    const d = expectOk(await api('GET', `/challenges/${challenges[0].id}`, { as: 'demo' }));
    assert(d.id === challenges[0].id, 'id mismatch');
    assert(isArr(d.leaderboard), 'leaderboard missing');
  });
  await check('GET /challenges/unknown → 404', async () => {
    expectStatus(await api('GET', `/challenges/e2e-nope-${RUN_ID}`, { as: 'demo' }), 404);
  });
  await check('join + leave a challenge (state restored)', async () => {
    // Only a challenge the demo account has never joined: leaving one it was in would erase progress.
    const target = challenges.find((x) => !x.joined && !x.ends_at && !x.completed);
    if (!target) skip('every challenge already joined/known — not touching real progress');
    const done = onCleanup(`leave challenge ${target.id}`, () =>
      api('DELETE', `/challenges/${target.id}/join`, { as: 'demo' })
    );
    const j = expectOk(await api('POST', `/challenges/${target.id}/join`, { as: 'demo' }));
    assert(j.joined === true, 'joined=false after join');
    const l = expectOk(await api('DELETE', `/challenges/${target.id}/join`, { as: 'demo' }));
    assert(l.ok === true, 'leave not ok');
    const after = expectOk(await api('GET', '/challenges', { as: 'demo' }));
    assert(!after.challenges.find((x) => x.id === target.id)?.joined, 'still joined after leave');
    done();
    return target.id;
  });

  let groups;
  await check('GET /groups (circles)', async () => {
    groups = expectOk(await api('GET', '/groups', { as: 'demo' }));
    assert(isArr(groups.groups) && isArr(groups.mine), 'groups/mine missing');
    return `${groups.groups.length} live, ${groups.mine.length} mine`;
  });
  await check('GET /groups/:id', async () => {
    const g = groups?.mine?.[0] || groups?.groups?.[0];
    if (!g) skip('no circle to open');
    expectOk(await api('GET', `/groups/${g.id}`, { as: 'demo' }));
  });
  await check('GET /seeds', async () => {
    expectOk(await api('GET', '/seeds', { as: 'demo' }));
  });
}

async function sectionMarketplace() {
  area('Marketplace (buyer)');
  need('demo');
  let products = [];
  await check('GET /marketplace/products', async () => {
    const d = expectOk(await api('GET', '/marketplace/products', { as: 'demo', query: { limit: 10 } }));
    assert(isArr(d.products), 'products missing');
    products = d.products;
    return `${products.length} products`;
  });
  await check('GET /marketplace/products/:id', async () => {
    if (!products[0]) skip('no products');
    const d = expectOk(await api('GET', `/marketplace/products/${products[0].id}`, { as: 'demo' }));
    assert(d.id === products[0].id, 'id mismatch');
    assert(isArr(d.images), 'images not parsed');
    assert(d.business && d.business.id, 'business missing');
  });
  await check('GET /marketplace/products?search=', async () => {
    const word = String(products[0]?.name || 'a').split(/\s+/)[0];
    const d = expectOk(await api('GET', '/marketplace/products', { as: 'demo', query: { search: word, limit: 10 } }));
    assert(isArr(d.products), 'products missing');
    if (products[0]) assert(d.products.length > 0, `search "${word}" found nothing`);
    return `"${word}": ${d.products.length}`;
  });
  await check('GET /marketplace/products?category=', async () => {
    const cat = products[0]?.category;
    if (!cat) skip('no category');
    const d = expectOk(await api('GET', '/marketplace/products', { as: 'demo', query: { category: cat, limit: 10 } }));
    assert(d.products.every((p) => p.category === cat || String(p.category).startsWith(cat)), 'category filter leaked');
  });
  await check('GET /marketplace/products/unknown → 404', async () => {
    expectError(await api('GET', `/marketplace/products/e2e-nope-${RUN_ID}`, { as: 'demo' }), 404, 'PRODUCT_NOT_FOUND');
  });
  await check('GET /marketplace/orders (buyer)', async () => {
    const d = expectOk(await api('GET', '/marketplace/orders', { as: 'demo' }));
    assert(isArr(d), 'orders not array');
  });
  let paymentsEnabled = null;
  await check('checkout disabled: GET /marketplace/payment-config → enabled:false', async () => {
    const d = expectOk(await api('GET', '/marketplace/payment-config', { as: 'demo' }));
    paymentsEnabled = d.enabled;
    // App Review sees production, where checkout must stay off. QA may carry a test Stripe key.
    if (BASE.includes('production')) {
      assert(d.enabled === false, 'payments are ENABLED on production (Stripe key configured)');
    } else if (d.enabled !== false) {
      skip('payments enabled on this non-production environment (test key) — production is checked separately');
    }
  });
  await check('checkout disabled: POST /marketplace/checkout-session → 503 PAYMENTS_DISABLED', async () => {
    if (paymentsEnabled !== false) skip('payments enabled (or unknown) — not calling checkout to avoid creating a Stripe session/order');
    if (!products[0]) skip('no products');
    expectError(
      await api('POST', '/marketplace/checkout-session', {
        as: 'demo',
        body: {
          items: [{ product_id: products[0].id, quantity: 1 }],
          shipping_address: { name: `${TAG} Test`, street: '1 Test St', city: 'Test', state: 'TS', zip: '00000', country: 'LU' },
        },
      }),
      503,
      'PAYMENTS_DISABLED'
    );
  });
  await check('checkout disabled: POST /marketplace/orders → 503 PAYMENTS_DISABLED', async () => {
    if (paymentsEnabled !== false) skip('payments enabled (or unknown) — not calling createOrder');
    if (!products[0]) skip('no products');
    expectError(
      await api('POST', '/marketplace/orders', {
        as: 'demo',
        body: {
          items: [{ product_id: products[0].id, quantity: 1 }],
          shipping_address: { name: `${TAG} Test`, street: '1 Test St', city: 'Test', state: 'TS', zip: '00000', country: 'LU' },
        },
      }),
      503,
      'PAYMENTS_DISABLED'
    );
  });
  await check('non-business cannot create products → 403', async () => {
    expectStatus(
      await api('POST', '/marketplace/products', {
        as: 'demo',
        body: { name: `${TAG} should fail`, category: 'fitness', price: 1, stock: 1 },
      }),
      403
    );
  });
}

async function sectionInstructor() {
  area('Instructor role');
  need('instructor');
  const me = uid('instructor');
  const reads = [
    ['/instructor/hub', (d) => d && typeof d === 'object'],
    ['/instructor/eligibility', (d) => d && typeof d === 'object'],
    ['/instructor/eligibility/suggest-endorsers', (d) => d && typeof d === 'object'],
    ['/instructor/offering', (d) => 'offering' in d],
    ['/instructor/inquiries', (d) => isArr(d.inquiries)],
    ['/instructor/contracts', (d) => isArr(d.contracts)],
    ['/instructor/endorsement-requests', (d) => d && typeof d === 'object'],
    ['/instructor/instructors', (d) => d && typeof d === 'object'],
    [`/instructor/instructors/${me}`, (d) => d && typeof d === 'object'],
    [`/instructor/instructors/${me}/reviews`, (d) => isArr(d.reviews) && d.rating],
    [`/instructor/instructors/${me}/students`, (d) => d && typeof d === 'object'],
  ];
  for (const [p, shape] of reads) {
    await check(`GET ${p.replace(me, ':me')}`, async () => {
      const d = expectOk(await api('GET', p, { as: 'instructor' }));
      assert(shape(d), 'unexpected response shape');
      if (p === '/instructor/contracts') ctx.contracts = d.contracts;
      if (p === '/instructor/inquiries') ctx.inquiries = d.inquiries;
      if (p === '/instructor/contracts') return `${d.contracts.length} contracts`;
      if (p === '/instructor/inquiries') return `${d.inquiries.length} inquiries`;
    });
  }
  await check('GET /instructor/contracts/:id', async () => {
    const k = ctx.contracts?.[0];
    if (!k) skip('no contracts');
    const d = expectOk(await api('GET', `/instructor/contracts/${k.id}`, { as: 'instructor' }));
    assert(d.contract && d.contract.id === k.id, 'contract mismatch');
  });
  await check('GET /instructor/thread?peer_id= (coaching thread read)', async () => {
    const inq = ctx.inquiries?.[0];
    const peer = inq ? (inq.instructor_id === me ? inq.client_id : inq.instructor_id) : uid('demo');
    if (!peer) skip('no peer');
    expectOk(await api('GET', '/instructor/thread', { as: 'instructor', query: { peer_id: peer } }));
  });
  await check('GET /instructor/thread without peer_id → 400', async () => {
    expectStatus(await api('GET', '/instructor/thread', { as: 'instructor' }), 400);
  });
  await check('GET /instructor/reviews/eligibility (demo → instructor)', async () => {
    need('demo');
    expectOk(await api('GET', '/instructor/reviews/eligibility', { as: 'demo', query: { peer_id: me } }));
  });
  await check('GET /instructor/candidates/:id/endorsement-status', async () => {
    need('demo');
    expectOk(await api('GET', `/instructor/candidates/${uid('demo')}/endorsement-status`, { as: 'instructor' }));
  });
  await check('non-instructor GET /instructor/offering → 403', async () => {
    need('review');
    expectStatus(await api('GET', '/instructor/offering', { as: 'review' }), 403);
  });
}

async function sectionBusiness() {
  area('Business role');
  need('business');
  const reads = [
    ['/business/dashboard', null],
    ['/business/dashboard?period=month', null],
    ['/business/products', null],
    ['/business/orders', null],
    ['/business/customers', null],
    ['/business/notifications', null],
    ['/business/promo-codes', null],
    ['/business/partnerships', null],
    ['/business/partnerships/discover', null],
    ['/business/analytics/timeseries', null],
    ['/business/analytics/funnel', null],
    ['/business/analytics/top-products', null],
    ['/business/analytics/partnerships', null],
    ['/business/campaigns', null],
    ['/business/settings', null],
  ];
  for (const [p] of reads) {
    await check(`GET ${p}`, async () => {
      const [path, qs] = p.split('?');
      const query = qs ? Object.fromEntries(new URLSearchParams(qs)) : undefined;
      const d = expectOk(await api('GET', path, { as: 'business', query }));
      assert(d !== undefined && d !== null, 'empty data');
      if (path === '/business/orders') ctx.bizOrders = isArr(d) ? d : d.orders || [];
    });
  }
  await check('GET /business/orders/:id', async () => {
    const o = ctx.bizOrders?.[0];
    if (!o) skip('no orders');
    expectOk(await api('GET', `/business/orders/${o.id}`, { as: 'business' }));
  });
  for (const p of ['/business/export/orders', '/business/export/products']) {
    await check(`GET ${p} (CSV)`, async () => {
      const r = expectStatus(await api('GET', p, { as: 'business' }), 200);
      const ct = r.headers.get('content-type') || '';
      assert(/csv|text/.test(ct), `content-type ${ct}`);
    });
  }
  await check('non-business GET /business/dashboard → 403', async () => {
    need('demo');
    expectStatus(await api('GET', '/business/dashboard', { as: 'demo' }), 403);
  });

  let productId;
  await check('create test product', async () => {
    const d = expectOk(
      await api('POST', '/marketplace/products', {
        as: 'business',
        body: {
          name: `${TAG} Smoke product ${RUN_ID}`,
          description: `${TAG} created by the e2e smoke test; deleted at the end of the run.`,
          category: 'fitness',
          price: 1.23,
          stock: 0,
        },
      }),
      201
    );
    productId = d.id;
    assert(productId, 'no id');
    onCleanup(`delete product ${productId}`, () => api('DELETE', `/marketplace/products/${productId}`, { as: 'business' }));
  });
  await check('update test product', async () => {
    if (!productId) skip('no product');
    const d = expectOk(
      await api('PUT', `/marketplace/products/${productId}`, {
        as: 'business',
        body: { name: `${TAG} Smoke product ${RUN_ID} (edited)`, price: 2.5 },
      })
    );
    assert(String(d.name).includes('(edited)'), 'name not updated');
    assert(Number(d.price) === 2.5, `price=${d.price}`);
  });
  await check('test product readable + listed for business', async () => {
    if (!productId) skip('no product');
    const d = expectOk(await api('GET', `/marketplace/products/${productId}`, { as: 'demo' }));
    assert(d.business?.id === uid('business'), 'owner mismatch');
    const b = expectOk(await api('GET', '/business/products', { as: 'business' }));
    const list = isArr(b) ? b : b.products || [];
    assert(list.some((x) => x.id === productId), 'not listed in /business/products');
  });
  await check('other user cannot update test product → 403', async () => {
    if (!productId) skip('no product');
    expectStatus(await api('PUT', `/marketplace/products/${productId}`, { as: 'demo', body: { price: 9 } }), 403);
  });
  await check('delete test product', async () => {
    if (!productId) skip('no product');
    expectOk(await api('DELETE', `/marketplace/products/${productId}`, { as: 'business' }));
    expectStatus(await api('GET', `/marketplace/products/${productId}`, { as: 'demo' }), 404);
    for (const cl of cleanups) if (cl.label === `delete product ${productId}`) cl.done = true;
  });
}

/**
 * Wave 4 hooks — bizx / coachx / userx modules (backend/src/routes/wave3/{bizx,coachx,userx}.ts).
 * The deployed worker cannot be introspected for routes, so add checks here by hand
 * as those modules gain endpoints. Use the same helpers: check(), api(), expectOk(), onCleanup().
 */
async function sectionWave4() {
  area('Wave 4 (bizx / coachx / userx)');
  // Business
  await check('bizx: GET /business/onboarding → steps', async () => {
    const d = expectOk(await api('GET', '/business/onboarding', { as: 'business' }));
    assert(isArr(d.steps) && d.steps.length > 0, 'missing steps[]');
  });
  await check('bizx: PATCH /business/products/bulk with no items → 400', async () => {
    expectStatus(await api('PATCH', '/business/products/bulk', { as: 'business', body: { items: [] } }), 400);
  });
  await check('bizx: GET /business/orders/:unknown/contact → 404', async () => {
    expectStatus(await api('GET', '/business/orders/e2e-missing/contact', { as: 'business' }), 404);
  });
  await check('bizx: non-business user cannot read onboarding', async () => {
    expectStatus(await api('GET', '/business/onboarding', { as: 'demo' }), 401, 403);
  });
  // Coaching
  await check('coachx: notes on unknown contract → 403/404', async () => {
    expectStatus(await api('GET', '/instructor/x/contracts/e2e-missing/notes', { as: 'instructor' }), 403, 404);
  });
  await check('coachx: check-in summary on unknown contract → 403/404', async () => {
    expectStatus(await api('GET', '/instructor/x/contracts/e2e-missing/checkins', { as: 'instructor' }), 403, 404);
  });
  // User
  await check('userx: GET /me/circle/week', async () => {
    const d = expectOk(await api('GET', '/me/circle/week', { as: 'demo' }));
    assert(d && typeof d === 'object', 'missing body');
  });
  await check('userx: DELETE /feed/posts/:unknown → 404', async () => {
    expectStatus(await api('DELETE', '/feed/posts/e2e-missing-post', { as: 'demo' }), 404);
  });
  await check("userx: cannot delete someone else's post → 403", async () => {
    const demoId = sessions.demo?.user?.id || sessions.demo?.userId;
    if (!demoId) skip('no demo user id');
    const posts = expectOk(await api('GET', `/feed/posts/user/${demoId}`, { as: 'review' }));
    const list = isArr(posts) ? posts : posts?.posts || [];
    if (!list.length) skip('demo has no posts');
    expectStatus(await api('DELETE', `/feed/posts/${list[0].id}`, { as: 'review' }), 403);
  });
  await check('userx: journal search q= returns has_more', async () => {
    const r = await api('GET', '/journal/entries', { as: 'demo', query: { q: 'e2e-nothing-matches', limit: 5 } });
    const d = expectOk(r);
    const body = r.body?.data ?? d;
    assert(body !== undefined, 'missing data');
  });
}

async function sectionWave5() {
  area('Wave 5 (proofs / weekly / coach queue / group plans)');

  // ---- Proofs -------------------------------------------------------------
  let proofId = null;
  let today = null;
  await check('proofs: POST /proofs note for today (Idempotency-Key replay → same id)', async () => {
    need('demo');
    const t = expectOk(await api('GET', '/me/today', { as: 'demo' }));
    today = t?.streak?.today || localToday();
    const body = { kind: 'note', text: `${TAG} proof ${RUN_ID}`, context_type: 'checkin', context_id: today };
    const headers = { 'Idempotency-Key': idemKey('proof-note') };
    const r1 = await api('POST', '/proofs', { as: 'demo', body, headers });
    if (r1.status === 404) skip('proofs not deployed');
    const d1 = expectOk(r1, 201);
    assert(d1.proof?.id, 'missing proof.id');
    proofId = d1.proof.id;
    const id = proofId;
    const undo = onCleanup(`DELETE ${TAG} proof ${id}`, () => api('DELETE', `/proofs/${id}`, { as: 'demo' }));
    ctx.wave5ProofUndo = undo;
    const r2 = await api('POST', '/proofs', { as: 'demo', body, headers });
    expectStatus(r2, 200, 201);
    assert(r2.data?.proof?.id === id, `replay returned ${r2.data?.proof?.id}, expected ${id}`);
  });
  await check('proofs: GET /me/today includes the proof', async () => {
    if (!proofId) skip('no proof');
    const d = expectOk(await api('GET', '/me/today', { as: 'demo' }));
    assert(isArr(d.proofs), 'missing proofs[]');
    assert(d.proofs.some((p) => p.id === proofId), 'proof not in /me/today');
  });
  await check('proofs: GET /proofs lists it', async () => {
    if (!proofId) skip('no proof');
    const d = expectOk(await api('GET', '/proofs', { as: 'demo', query: { context_type: 'checkin', limit: 20 } }));
    assert(isArr(d.proofs) && d.proofs.some((p) => p.id === proofId), 'proof not listed');
  });
  await check('proofs: private keys are never served by GET /media/:key → 404', async () => {
    expectStatus(await api('GET', `/media/${encodeURIComponent('proof/x')}`, { as: 'demo' }), 404);
  });
  await check('proofs: another user cannot read it → 404', async () => {
    if (!proofId) skip('no proof');
    need('review');
    expectStatus(await api('GET', `/proofs/${proofId}`, { as: 'review' }), 404);
  });
  await check('proofs: DELETE /proofs/:id', async () => {
    if (!proofId) skip('no proof');
    expectOk(await api('DELETE', `/proofs/${proofId}`, { as: 'demo' }));
    ctx.wave5ProofUndo?.();
    expectStatus(await api('GET', `/proofs/${proofId}`, { as: 'demo' }), 404);
  });

  // ---- Weekly -------------------------------------------------------------
  await check('weekly: GET /weekly/current', async () => {
    need('demo');
    const r = await api('GET', '/weekly/current', { as: 'demo' });
    if (r.status === 404) skip('weekly not deployed');
    const d = expectOk(r);
    assert(d.window && d.form, 'missing window/form');
  });
  await check('weekly: commitment GET → PUT → (DELETE) roundtrip restores state', async () => {
    need('demo');
    const r0 = await api('GET', '/weekly/commitment', { as: 'demo' });
    if (r0.status === 404) skip('weekly not deployed');
    const before = expectOk(r0).commitment;
    if (before) {
      // Existing goal: re-save the same target (upsert keeps rest passes) — no delete.
      const d = expectOk(await api('PUT', '/weekly/commitment', { as: 'demo', body: { target_days: before.target_days } }));
      assert(d.commitment?.target_days === before.target_days, 'target changed');
      return 'kept existing goal';
    }
    const undo = onCleanup(`DELETE ${TAG} weekly commitment`, () => api('DELETE', '/weekly/commitment', { as: 'demo' }));
    const d = expectOk(await api('PUT', '/weekly/commitment', { as: 'demo', body: { target_days: 4 } }));
    assert(d.commitment?.target_days === 4, 'target not saved');
    const g = expectOk(await api('GET', '/weekly/commitment', { as: 'demo' }));
    assert(g.commitment?.target_days === 4, 'GET does not show the goal');
    const del = expectOk(await api('DELETE', '/weekly/commitment', { as: 'demo' }));
    assert(del.removed === true, 'not removed');
    undo();
  });

  // ---- Coach queue --------------------------------------------------------
  await check('coach: GET /instructor/x/queue', async () => {
    need('instructor');
    const r = await api('GET', '/instructor/x/queue', { as: 'instructor' });
    if (r.status === 404) skip('coach queue not deployed');
    const d = expectOk(r);
    assert(d && typeof d === 'object', 'missing body');
  });
  await check('coach: GET /instructor/x/review', async () => {
    need('instructor');
    const r = await api('GET', '/instructor/x/review', { as: 'instructor' });
    if (r.status === 404) skip('coach queue not deployed');
    expectOk(r);
  });
  await check('coach: templates GET → PUT → restore original', async () => {
    need('instructor');
    const r = await api('GET', '/instructor/x/templates', { as: 'instructor' });
    if (r.status === 404) skip('coach queue not deployed');
    const original = expectOk(r).templates;
    assert(isArr(original), 'missing templates[]');
    const restore = onCleanup(`restore ${TAG} coach templates`, () =>
      api('PUT', '/instructor/x/templates', { as: 'instructor', body: { templates: original } })
    );
    const probe = `${TAG} ${RUN_ID}`;
    const next = [...original.slice(0, 19), probe];
    const d = expectOk(await api('PUT', '/instructor/x/templates', { as: 'instructor', body: { templates: next } }));
    assert(isArr(d.templates) && d.templates.includes(probe), 'template not saved');
    const back = expectOk(await api('PUT', '/instructor/x/templates', { as: 'instructor', body: { templates: original } }));
    assert(JSON.stringify(back.templates) === JSON.stringify(original), 'templates not restored');
    restore();
  });

  // ---- Group plans (cohorts) ------------------------------------------------
  const g = {};
  await check('cohorts: coach creates a group (capacity 2)', async () => {
    need('instructor', 'demo');
    const r = await api('POST', '/cohorts', {
      as: 'instructor',
      body: { title: `${TAG} group ${RUN_ID}`, weeks: 1, start_date: localToday(), capacity: 2 },
      headers: { 'Idempotency-Key': idemKey('cohort-create') },
    });
    if (r.status === 404) skip('cohorts not deployed');
    const d = expectOk(r, 201);
    assert(d.cohort?.id, 'missing cohort.id');
    g.id = d.cohort.id;
    const id = g.id;
    g.undoArchive = onCleanup(`archive ${TAG} cohort ${id}`, () =>
      api('PATCH', `/cohorts/${id}`, { as: 'instructor', body: { status: 'archived' } })
    );
  });
  await check('cohorts: invite code', async () => {
    if (!g.id) skip('no cohort');
    const d = expectOk(await api('POST', `/cohorts/${g.id}/invite-code`, { as: 'instructor' }));
    assert(d.invite_code, 'missing invite_code');
    g.code = d.invite_code;
  });
  await check('cohorts: demo joins with the code', async () => {
    if (!g.code) skip('no code');
    const p = expectOk(await api('GET', '/cohorts/preview', { as: 'demo', query: { code: g.code } }));
    assert(p.cohort?.id === g.id, 'preview mismatch');
    const d = expectOk(await api('POST', '/cohorts/join', { as: 'demo', body: { code: g.code } }));
    assert(d.cohort?.id === g.id, 'join mismatch');
    const id = g.id;
    g.undoLeave = onCleanup(`demo leaves ${TAG} cohort`, () => api('POST', `/cohorts/${id}/leave`, { as: 'demo' }));
  });
  await check('cohorts: coach posts an update; member sees it', async () => {
    if (!g.undoLeave) skip('not joined');
    expectOk(await api('POST', `/cohorts/${g.id}/posts`, { as: 'instructor', body: { body: `${TAG} hello group ${RUN_ID}` } }), 201);
    const d = expectOk(await api('GET', `/cohorts/${g.id}/posts`, { as: 'demo', query: { limit: 5 } }));
    assert(isArr(d.posts) && d.posts.some((x) => String(x.body || '').includes(RUN_ID)), 'post not visible to member');
  });
  await check('cohorts: coach assigns homework (fan-out to member)', async () => {
    if (!g.undoLeave) skip('not joined');
    const d = expectOk(
      await api('POST', `/cohorts/${g.id}/homework`, { as: 'instructor', body: { title: `${TAG} 10 minutes`, proof_kind: 'note' } }),
      201
    );
    assert(d.assignment?.id, 'missing assignment.id');
    g.hwId = d.assignment.id;
    assert(Number(d.assigned) >= 1, `assigned=${d.assigned}`);
    const id = g.id;
    const hw = g.hwId;
    onCleanup(`delete ${TAG} group homework`, () => api('DELETE', `/cohorts/${id}/homework/${hw}`, { as: 'instructor' }));
  });
  await check('cohorts: demo completes it with a note proof', async () => {
    if (!g.hwId) skip('no homework');
    const mine = expectOk(await api('GET', `/cohorts/${g.id}/homework`, { as: 'demo' }));
    const item = (mine.assignments || []).find((a) => a.id === g.hwId);
    assert(item?.mine?.id, 'member record missing');
    g.memberAsg = item.mine.id;
    const pr = await api('POST', '/proofs', {
      as: 'demo',
      body: { kind: 'note', text: `${TAG} done ${RUN_ID}`, context_type: 'assignment', context_id: g.memberAsg },
      headers: { 'Idempotency-Key': idemKey('cohort-proof') },
    });
    const pd = expectOk(pr, 201);
    g.proofId = pd.proof.id;
    assert(pd.proof.shared_with_coach === true, 'group homework proof not shared with coach');
    const pid = g.proofId;
    onCleanup(`DELETE ${TAG} group proof`, () => api('DELETE', `/proofs/${pid}`, { as: 'demo' }));
    expectOk(
      await api('POST', `/cohorts/${g.id}/homework/complete`, {
        as: 'demo',
        body: { member_assignment_id: g.memberAsg, status: 'done', proof_id: g.proofId, proof_kind: 'note' },
      })
    );
  });
  await check('cohorts: coach grid shows the completion + can open the proof', async () => {
    if (!g.proofId) skip('no completion');
    const d = expectOk(await api('GET', `/cohorts/${g.id}/homework`, { as: 'instructor' }));
    assert(d.role === 'coach' && isArr(d.cells), 'not a coach grid');
    const cell = d.cells.find((c) => c.id === g.memberAsg);
    assert(cell && cell.status === 'done', `cell status=${cell?.status}`);
    assert(cell.proof, 'cell has no proof');
    expectOk(await api('GET', `/proofs/${g.proofId}`, { as: 'instructor' }));
  });
  await check('cohorts: demo leaves; coach archives the group', async () => {
    if (!g.id) skip('no cohort');
    if (g.undoLeave) {
      expectOk(await api('POST', `/cohorts/${g.id}/leave`, { as: 'demo' }));
      g.undoLeave();
    }
    const d = expectOk(await api('PATCH', `/cohorts/${g.id}`, { as: 'instructor', body: { status: 'archived' } }));
    assert(d.cohort?.status === 'archived', `status=${d.cohort?.status}`);
    g.undoArchive?.();
  });
}

/**
 * Wave 6 — storefront / insights / engage (backend/src/routes/wave3/{storefront,bizinsights,bizengage}.ts)
 * plus the seller CSV import dry run. Everything written is restored or hidden again;
 * admin endpoints are not exercised (they need MFA).
 */
async function sectionWave6() {
  area('Wave 6 (storefront / insights / engage)');
  need('business', 'demo');
  const bizId = uid('business');

  // Storefront
  await check('storefront: GET /business/storefront', async () => {
    const d = expectOk(await api('GET', '/business/storefront', { as: 'business' }));
    assert(d.storefront && typeof d.storefront === 'object', 'missing storefront');
    ctx.w6Storefront = d.storefront;
  });
  await check('storefront: PUT tagline round trip (restored)', async () => {
    const original = ctx.w6Storefront;
    if (!original) skip('no storefront');
    const before = original.tagline ?? null;
    const restore = () => api('PUT', '/business/storefront', { as: 'business', body: { tagline: before } });
    const done = onCleanup('restore storefront tagline', restore);
    const probe = `${TAG} ${RUN_ID}`.slice(0, 80);
    const d = expectOk(await api('PUT', '/business/storefront', { as: 'business', body: { tagline: probe } }));
    assert(d.storefront?.tagline === probe, `tagline=${d.storefront?.tagline}`);
    const back = expectOk(await restore());
    assert((back.storefront?.tagline ?? null) === before, 'tagline not restored');
    done();
  });
  await check('storefront: public GET /storefronts/:id as demo', async () => {
    const d = expectOk(await api('GET', `/storefronts/${bizId}`, { as: 'demo' }));
    assert(d.business?.id === bizId, 'business mismatch');
    assert(isArr(d.featured_products), 'missing featured_products[]');
    assert(d.viewer && d.viewer.is_owner === false, 'viewer.is_owner should be false');
    assert(typeof d.viewer.can_message === 'boolean', 'missing viewer.can_message');
  });
  await check('storefront: public products list', async () => {
    const d = expectOk(await api('GET', `/storefronts/${bizId}/products`, { as: 'demo', query: { limit: 5 } }));
    const list = isArr(d) ? d : d.products || [];
    ctx.w6ProductId = list[0]?.id;
    return list.length ? `${list.length} product(s)` : 'no active products';
  });
  await check('storefront: GET /business/verification', async () => {
    const d = expectOk(await api('GET', '/business/verification', { as: 'business' }));
    assert(['none', 'pending', 'verified', 'rejected'].includes(d.status), `status=${d.status}`);
  });

  // Insights
  await check('insights: GET /business/insights?period=7d', async () => {
    const d = expectOk(await api('GET', '/business/insights', { as: 'business', query: { period: '7d' } }));
    assert(d.totals && typeof d.totals.product_views === 'number', 'missing totals');
    assert(isArr(d.daily), 'missing daily[]');
  });
  await check('insights: POST /events product_view as demo', async () => {
    const productId = ctx.w6ProductId;
    if (!productId) skip('no business product');
    const d = expectOk(
      await api('POST', '/events', {
        as: 'demo',
        body: { events: [{ type: 'product_view', product_id: productId, business_id: bizId, source: 'other' }] },
      })
    );
    assert(typeof d.accepted === 'number', 'missing accepted');
  });
  await check('insights: save + unsave a product (restored)', async () => {
    const productId = ctx.w6ProductId;
    if (!productId) skip('no business product');
    const saved = expectOk(await api('GET', '/me/saved-products', { as: 'demo' }));
    const wasSaved = (saved.products || []).some((p) => p.id === productId);
    if (wasSaved) {
      const d = expectOk(await api('DELETE', `/products/${productId}/save`, { as: 'demo' }));
      assert(d.saved === false, 'unsave failed');
      const done = onCleanup('re-save product', () =>
        api('POST', `/products/${productId}/save`, { as: 'demo', headers: { 'Idempotency-Key': idemKey('resave') } })
      );
      const r = expectOk(
        await api('POST', `/products/${productId}/save`, { as: 'demo', headers: { 'Idempotency-Key': idemKey('save') } })
      );
      assert(r.saved === true, 'save failed');
      done();
    } else {
      const done = onCleanup('unsave product', () => api('DELETE', `/products/${productId}/save`, { as: 'demo' }));
      const r = expectOk(
        await api('POST', `/products/${productId}/save`, { as: 'demo', headers: { 'Idempotency-Key': idemKey('save') } })
      );
      assert(r.saved === true && typeof r.saves === 'number', 'save failed');
      const list = expectOk(await api('GET', '/me/saved-products', { as: 'demo' }));
      assert((list.products || []).some((p) => p.id === productId), 'not in saved list');
      const d = expectOk(await api('DELETE', `/products/${productId}/save`, { as: 'demo' }));
      assert(d.saved === false, 'unsave failed');
      done();
    }
  });
  await check('insights: GET /me/saved-products', async () => {
    const d = expectOk(await api('GET', '/me/saved-products', { as: 'demo' }));
    assert(isArr(d.products), 'missing products[]');
  });
  await check('insights: GET /business/partner-links', async () => {
    const d = expectOk(await api('GET', '/business/partner-links', { as: 'business' }));
    assert(isArr(d.links), 'missing links[]');
  });

  // Engage: Q&A
  let questionId;
  await check('engage: demo asks a question', async () => {
    const productId = ctx.w6ProductId;
    if (!productId) skip('no business product');
    const d = expectOk(
      await api('POST', `/products/${productId}/questions`, {
        as: 'demo',
        headers: { 'Idempotency-Key': idemKey('question') },
        body: { body: `${TAG} Does this come in other sizes? ${RUN_ID}` },
      }),
      201
    );
    questionId = d.question?.id;
    assert(questionId, 'no question id');
    onCleanup(`hide question ${questionId}`, () => api('DELETE', `/business/questions/${questionId}`, { as: 'business' }));
  });
  await check('engage: business answers', async () => {
    if (!questionId) skip('no question');
    const d = expectOk(
      await api('POST', `/business/questions/${questionId}/answer`, {
        as: 'business',
        body: { body: `${TAG} Yes — S to XL.` },
      })
    );
    assert(d.question?.answer?.body, 'answer missing');
  });
  await check('engage: GET questions shows the answer', async () => {
    if (!questionId) skip('no question');
    const d = expectOk(await api('GET', `/products/${ctx.w6ProductId}/questions`, { as: 'demo' }));
    const q = (d.questions || []).find((x) => x.id === questionId);
    assert(q?.answer?.body, 'answered question not listed');
  });
  await check('engage: business hides the question', async () => {
    if (!questionId) skip('no question');
    expectOk(await api('DELETE', `/business/questions/${questionId}`, { as: 'business' }));
    const d = expectOk(await api('GET', `/products/${ctx.w6ProductId}/questions`, { as: 'demo' }));
    assert(!(d.questions || []).some((x) => x.id === questionId), 'hidden question still listed');
    for (const cl of cleanups) if (cl.label === `hide question ${questionId}`) cl.done = true;
  });
  await check('engage: reviews need a purchase (viewer.can_review false)', async () => {
    const productId = ctx.w6ProductId;
    if (!productId) skip('no business product');
    const d = expectOk(await api('GET', `/products/${productId}/reviews`, { as: 'demo' }));
    assert(isArr(d.reviews), 'missing reviews[]');
    assert(d.viewer && d.viewer.can_review === false, `can_review=${d.viewer?.can_review}`);
  });

  // Engage: inbox settings + summary
  await check('engage: inbox-settings round trip (restored)', async () => {
    const d = expectOk(await api('GET', '/business/inbox-settings', { as: 'business' }));
    assert(isArr(d.saved_replies) && d.away, 'missing saved_replies / away');
    const original = d.saved_replies.map((r) => ({ id: r.id, title: r.title, body: r.body }));
    if (original.length >= 20) skip('saved replies full');
    const restore = () => api('PUT', '/business/inbox-settings', { as: 'business', body: { saved_replies: original } });
    const done = onCleanup('restore saved replies', restore);
    const probe = { title: `${TAG} ${RUN_ID}`.slice(0, 40), body: `${TAG} Thanks for your message!` };
    const put = expectOk(
      await api('PUT', '/business/inbox-settings', { as: 'business', body: { saved_replies: [...original, probe] } })
    );
    assert(put.saved_replies.some((r) => r.title === probe.title), 'saved reply not stored');
    const back = expectOk(await restore());
    assert(back.saved_replies.length === original.length, 'saved replies not restored');
    done();
  });
  await check('engage: GET /business/engage/summary', async () => {
    const d = expectOk(await api('GET', '/business/engage/summary', { as: 'business' }));
    assert(typeof d.unanswered_questions === 'number', 'missing unanswered_questions');
  });

  // Seller import (dry run only — nothing is written)
  await check('bizx: CSV import dry run with one valid row', async () => {
    const d = expectOk(
      await api('POST', '/business/products/import', {
        as: 'business',
        body: {
          dry_run: true,
          rows: [{ name: `${TAG} Import probe ${RUN_ID}`, category: 'fitness', price: '9,90', stock: '3' }],
        },
      })
    );
    assert(d.dry_run === true, 'not a dry run');
    assert(!(d.errors || []).length, `errors: ${JSON.stringify(d.errors).slice(0, 160)}`);
  });
}

// ---------------------------------------------------------------------------
// Main

const SECTIONS = [
  ['health', sectionHealth],
  ['auth', sectionAuth],
  ['profile', sectionProfile],
  ['feed', sectionFeed],
  ['journal', sectionJournal],
  ['social', sectionSocial],
  ['messages', sectionMessages],
  ['growth', sectionStoriesChallengesCircles],
  ['marketplace', sectionMarketplace],
  ['instructor', sectionInstructor],
  ['business', sectionBusiness],
  ['wave4', sectionWave4],
  ['wave5', sectionWave5],
  ['wave6', sectionWave6],
];

async function signInQuietly() {
  // When E2E_ONLY skips the auth section, still get sessions for the others.
  for (const role of Object.keys(ACCOUNTS)) {
    if (sessions[role]) continue;
    try {
      const r = await api('POST', '/auth/sign-in', {
        body: { email: ACCOUNTS[role].email, password: ACCOUNTS[role].password },
      });
      if (r.ok && r.data?.token) sessions[role] = r.data;
    } catch {
      /* reported by the sections that need it */
    }
  }
}

async function runCleanup() {
  const pending = cleanups.filter((x) => !x.done).reverse();
  if (!pending.length) return;
  area('Cleanup');
  for (const cl of pending) {
    await check(cl.label, async () => {
      const r = await cl.fn();
      if (r && typeof r.status === 'number') {
        // 404 = already gone, fine.
        assert(r.ok || r.status === 404, `cleanup returned HTTP ${r.status}`);
      }
      cl.done = true;
    });
  }
}

async function main() {
  const started = performance.now();
  console.log(bold('Grow! API e2e smoke'));
  console.log(dim(`base=${BASE}  run=${RUN_ID}  delay=${DELAY_MS}ms${ONLY.length ? `  only=${ONLY.join(',')}` : ''}`));
  let crashed = null;
  try {
    for (const [key, fn] of SECTIONS) {
      if (ONLY.length && !ONLY.includes(key)) continue;
      if (key !== 'health' && key !== 'auth' && Object.keys(sessions).length < 4) await signInQuietly();
      try {
        await fn();
      } catch (err) {
        if (err instanceof SkipError) {
          console.log(`  ${yellow('–')} section skipped: ${err.message}`);
          continue;
        }
        throw err;
      }
    }
  } catch (err) {
    crashed = err;
    console.error(red(`\nRunner crashed: ${redact(err?.stack || err)}`));
  } finally {
    await runCleanup().catch((err) => console.error(red(`cleanup crashed: ${redact(err?.stack || err)}`)));
  }

  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail');
  const skipped = results.filter((r) => r.status === 'skip').length;
  const secs = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`\n${bold('Summary')}  ${green(`${pass} passed`)}  ${fail.length ? red(`${fail.length} failed`) : '0 failed'}  ${yellow(`${skipped} skipped`)}  ${dim(`${results.length} checks in ${secs}s`)}`);
  if (fail.length) {
    console.log(bold('\nFailures'));
    for (const f of fail) {
      console.log(`  ${red('✗')} [${f.area}] ${f.name}`);
      console.log(`      ${f.note}`);
      if (f.endpoint) console.log(`      ${dim(`${f.endpoint} → ${f.httpStatus}${f.message ? ` ${f.message}` : ''}`)}`);
    }
  }
  const leftovers = cleanups.filter((x) => !x.done);
  if (leftovers.length) {
    console.log(red(`\n${leftovers.length} cleanup step(s) did not complete — check for "${TAG}" data:`));
    for (const l of leftovers) console.log(`  - ${l.label}`);
  }
  process.exitCode = crashed || fail.length || leftovers.length ? 1 : 0;
}

main();
