/**
 * Regression tests for backend hardening: coaching homework IDOR, D1 bound-parameter
 * limits on the journal circle / feed, single-query request context, profile metadata
 * allow-list + username uniqueness, and generic SSO errors.
 *
 * Uses a scripted mock D1: each prepared statement is routed by SQL substring, and any
 * statement binding more than 100 parameters throws (as D1 does).
 */
import { describe, it, expect } from 'vitest';
import { createMockEnv, parseJsonResponse } from '../utils/test-helpers';
import type { Env } from '../../src/types';
import { assignHomework } from '../../src/routes/coaching';
import { getCircleJournalEntries } from '../../src/routes/journal';
import { getFeed } from '../../src/routes/feed';
import { updateProfile } from '../../src/routes/profile';
import { publicSsoErrorMessage } from '../../src/routes/auth';
import {
  getRequestContext,
  getUserIdFromRequest,
  restrictionFromState,
} from '../../src/utils/auth';

const ME = 'test-user';
const D1_MAX_PARAMS = 100;

type Call = { sql: string; args: unknown[] };
type Route = {
  match: (sql: string) => boolean;
  first?: (args: unknown[]) => unknown;
  all?: (args: unknown[]) => unknown[];
  run?: (args: unknown[]) => unknown;
};

function mockDb(routes: Route[]) {
  const calls: Call[] = [];
  const exec = (sql: string, args: unknown[]) => {
    if (args.length > D1_MAX_PARAMS) {
      throw new Error(`D1_ERROR: too many SQL variables (${args.length})`);
    }
    calls.push({ sql, args });
    return routes.find((r) => r.match(sql));
  };
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...next: unknown[]) => stmt(sql, next),
    first: async () => exec(sql, args)?.first?.(args) ?? null,
    all: async () => ({ results: exec(sql, args)?.all?.(args) ?? [] }),
    run: async () => exec(sql, args)?.run?.(args) ?? { success: true, meta: { changes: 1 } },
  });
  return {
    db: {
      prepare: (sql: string) => stmt(sql),
      batch: async (stmts: any[]) => Promise.all(stmts.map((s) => s.run())),
    },
    calls,
  };
}

const has = (...parts: string[]) => (sql: string) => parts.every((p) => sql.includes(p));

/** Route for getRequestContext's single users ⟕ user_account_states read. */
function meRoute(meta: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): Route {
  return {
    match: has('LEFT JOIN user_account_states'),
    first: () => ({
      id: ME,
      email: 'me@example.com',
      metadata: JSON.stringify(meta),
      points: 0,
      is_instructor: 0,
      is_business: 0,
      acct_status: null,
      acct_suspended_until: null,
      ...extra,
    }),
  };
}

function envWith(db: unknown): Env {
  const env = createMockEnv();
  env.DB = db as any;
  return env;
}

function req(path: string, init: { method?: string; body?: unknown } = {}) {
  return new Request(`https://api.test/api/v1${path}`, {
    method: init.method || 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

describe('assignHomework (coaching IDOR)', () => {
  const contract = { id: 'c1', instructor_id: ME, client_id: 'client-1', status: 'active' };

  it('rejects attaching homework to a seed the client does not own', async () => {
    const { db, calls } = mockDb([
      meRoute(),
      { match: has('FROM coaching_contracts WHERE id'), first: () => contract },
      { match: has('SELECT id, title FROM growth_seeds'), first: () => ({ id: 'victim-seed', title: 'x' }) },
      // Client is not an active owner of this seed.
      { match: has('FROM growth_seed_members', "role = 'owner'"), first: () => null },
    ]);
    const res = await assignHomework(
      req('/instructor/contracts/c1/assignments', { method: 'POST', body: { seed_id: 'victim-seed' } }),
      envWith(db),
      'c1'
    );
    expect(res.status).toBe(403);
    expect(calls.some((c) => c.sql.includes('INSERT INTO growth_seed_members'))).toBe(false);
    expect(calls.some((c) => c.sql.includes('INSERT INTO coaching_assignments'))).toBe(false);
  });

  it('allows a seed owned by the client', async () => {
    const { db, calls } = mockDb([
      meRoute(),
      { match: has('FROM coaching_contracts WHERE id'), first: () => contract },
      { match: has('SELECT id, title FROM growth_seeds'), first: () => ({ id: 's1', title: 'Run' }) },
      { match: has('FROM growth_seed_members', "role = 'owner'"), first: () => ({ user_id: 'client-1' }) },
      { match: has('SELECT user_id FROM growth_seed_members'), first: () => null },
      { match: has('FROM coaching_assignments'), all: () => [] },
    ]);
    const res = await assignHomework(
      req('/instructor/contracts/c1/assignments', { method: 'POST', body: { seed_id: 's1' } }),
      envWith(db),
      'c1'
    );
    expect(res.status).toBe(201);
    const memberInserts = calls.filter((c) => c.sql.includes('INSERT INTO growth_seed_members'));
    // Only the coach is added; the client is never (re)inserted as owner.
    expect(memberInserts).toHaveLength(1);
    expect(memberInserts[0].args).toContain(ME);
    expect(memberInserts[0].args).not.toContain('client-1');
  });
});

describe('D1 bound-parameter limit', () => {
  const friendIds = Array.from({ length: 150 }, (_, i) => `friend-${i}`);

  it('journal circle works with 150 friends and 150 muted authors', async () => {
    const muted = Array.from({ length: 150 }, (_, i) => `muted-${i}`);
    const { db, calls } = mockDb([
      meRoute({ mutedJournalUserIds: [...muted, 'friend-1'] }),
      {
        match: has('FROM journal_entries j'),
        all: () => [
          { id: 'j1', user_id: 'friend-0', content: 'hi', is_public: 1, metadata: '{}', tags: '[]', created_at: '2026-01-01', updated_at: '2026-01-01', author_metadata: '{"username":"f0"}', author_email: 'f0@x' },
          // muted beyond the inline cap must still be filtered out
          { id: 'j2', user_id: 'friend-1', content: 'hi', is_public: 1, metadata: '{}', tags: '[]', created_at: '2026-01-01', updated_at: '2026-01-01', author_metadata: '{}', author_email: 'f1@x' },
        ],
      },
    ]);
    const res = await getCircleJournalEntries(req('/journal/circle'), envWith(db));
    expect(res.status).toBe(200);
    const body = await parseJsonResponse(res);
    expect(body.data.entries.map((e: { id: string }) => e.id)).toEqual(['j1']);
    const q = calls.find((c) => c.sql.includes('FROM journal_entries j'))!;
    expect(q.sql).toContain('FROM user_relationships');
    expect(q.args.length).toBeLessThanOrEqual(D1_MAX_PARAMS);
    // getRequestContext already loaded the viewer row — no second users read.
    expect(calls.filter((c) => c.sql.includes('SELECT metadata FROM users')).length).toBe(0);
  });

  it('feed works with 150 relationship blocks and 150 legacy metadata blocks', async () => {
    const legacy = Array.from({ length: 150 }, (_, i) => `legacy-${i}`);
    const { db, calls } = mockDb([
      meRoute({ categories: ['fitness'], blockedUsers: legacy }),
      { match: has('FROM posts p'), all: () => [] },
      { match: has("type = 'friend'", 'UNION'), all: () => friendIds.map((fid) => ({ fid })) },
    ]);
    const res = await getFeed(req('/feed/feed'), envWith(db));
    expect(res.status).toBe(200);
    const q = calls.find((c) => c.sql.includes('FROM posts p'))!;
    expect(q.sql).toContain("type IN ('mute', 'block')");
    expect(q.sql).not.toContain('LEFT JOIN post_engagement');
    expect(q.args.length).toBeLessThanOrEqual(D1_MAX_PARAMS);
  });
});

describe('getRequestContext', () => {
  it('loads user + account state in one query and strips acct_* fields', async () => {
    const { db, calls } = mockDb([meRoute()]);
    const ctx = await getRequestContext(req('/profile'), envWith(db));
    expect(ctx.isAuthenticated).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('LEFT JOIN user_account_states');
    expect(ctx.user).not.toHaveProperty('acct_status');
    expect(ctx.user).not.toHaveProperty('acct_suspended_until');
  });

  it('rejects banned and actively suspended accounts', async () => {
    for (const state of [
      { acct_status: 'banned' },
      { acct_status: 'suspended', acct_suspended_until: new Date(Date.now() + 86_400_000).toISOString() },
    ]) {
      const { db } = mockDb([meRoute({}, state)]);
      const ctx = await getRequestContext(req('/profile'), envWith(db));
      expect(ctx.isAuthenticated).toBe(false);
    }
  });

  it('allows an expired suspension and rejects @growl.invalid accounts', async () => {
    const expired = mockDb([meRoute({}, { acct_status: 'suspended', acct_suspended_until: '2000-01-01T00:00:00Z' })]);
    expect((await getRequestContext(req('/profile'), envWith(expired.db))).isAuthenticated).toBe(true);
    const invalid = mockDb([meRoute({}, { email: 'gone@growl.invalid' })]);
    expect((await getRequestContext(req('/profile'), envWith(invalid.db))).isAuthenticated).toBe(false);
  });

  it('restrictionFromState maps statuses', () => {
    expect(restrictionFromState(null, null)).toBeNull();
    expect(restrictionFromState('active', null)).toBeNull();
    expect(restrictionFromState('deleted_pending', null)?.code).toBe('ACCOUNT_DELETED');
    expect(restrictionFromState('banned', null)?.code).toBe('ACCOUNT_BANNED');
    expect(restrictionFromState('suspended', null)?.code).toBe('ACCOUNT_SUSPENDED');
    expect(restrictionFromState('suspended', '2000-01-01T00:00:00Z')).toBeNull();
  });

  it('caches the verified user id per Request', async () => {
    const env = createMockEnv();
    const request = req('/feed/posts');
    const a = getUserIdFromRequest(request, env);
    const b = getUserIdFromRequest(request, env);
    expect(a).toBe(b);
    expect(await a).toBe(ME);
  });
});

describe('updateProfile metadata allow-list', () => {
  function profileDb(opts: { current?: Record<string, unknown>; taken?: boolean } = {}) {
    return mockDb([
      meRoute(opts.current || {}),
      { match: has('SELECT metadata FROM users WHERE id'), first: () => ({ metadata: JSON.stringify(opts.current || {}) }) },
      { match: has("json_extract(metadata, '$.username')"), first: () => (opts.taken ? { id: 'other' } : null) },
    ]);
  }
  const savedMeta = (calls: Call[]) => {
    const update = calls.find((c) => c.sql.includes('UPDATE users SET metadata'));
    return update ? JSON.parse(String(update.args[0])) : null;
  };

  it('drops unknown and server-owned keys, keeps known ones', async () => {
    const { db, calls } = profileDb({ current: { username: 'me', points: 5 } });
    const res = await updateProfile(
      req('/profile', {
        method: 'PUT',
        body: {
          metadata: {
            bio: 'Hello',
            notifications_prefs: { pushNotifications: false },
            instructor_claimed_at: '2026-01-01',
            points: 99999,
            is_instructor: true,
            avatar: 'javascript:alert(1)',
            whatever: 'x',
          },
        },
      }),
      envWith(db)
    );
    expect(res.status).toBe(200);
    const meta = savedMeta(calls);
    expect(meta.bio).toBe('Hello');
    expect(meta.notifications_prefs).toEqual({ pushNotifications: false });
    expect(meta.points).toBe(5);
    expect(meta).not.toHaveProperty('instructor_claimed_at');
    expect(meta).not.toHaveProperty('is_instructor');
    expect(meta).not.toHaveProperty('whatever');
    expect(meta).not.toHaveProperty('avatar');
  });

  it('rejects an over-long bio and an over-long username', async () => {
    const bio = await updateProfile(
      req('/profile', { method: 'PUT', body: { metadata: { bio: 'x'.repeat(301) } } }),
      envWith(profileDb().db)
    );
    expect(bio.status).toBe(400);
    const name = await updateProfile(
      req('/profile', { method: 'PUT', body: { username: 'x'.repeat(33) } }),
      envWith(profileDb().db)
    );
    expect(name.status).toBe(400);
  });

  it('returns 409 USERNAME_TAKEN for a case-insensitive duplicate', async () => {
    const { db, calls } = profileDb({ current: { username: 'me' }, taken: true });
    const res = await updateProfile(req('/profile', { method: 'PUT', body: { username: 'Alice' } }), envWith(db));
    expect(res.status).toBe(409);
    const body = await parseJsonResponse(res);
    expect(body.error?.code ?? body.code).toBe('USERNAME_TAKEN');
    const check = calls.find((c) => c.sql.includes("json_extract(metadata, '$.username')"))!;
    expect(check.args[0]).toBe('alice');
    expect(savedMeta(calls)).toBeNull();
  });

  it('does not re-check uniqueness when the username is unchanged (case-insensitive)', async () => {
    const { db, calls } = profileDb({ current: { username: 'Mia' }, taken: true });
    const res = await updateProfile(
      req('/profile', { method: 'PUT', body: { username: 'mia', metadata: { bio: 'b' } } }),
      envWith(db)
    );
    expect(res.status).toBe(200);
    expect(calls.some((c) => c.sql.includes("json_extract(metadata, '$.username')"))).toBe(false);
  });
});

describe('SSO error messages', () => {
  it('passes through our own user-facing messages', () => {
    expect(publicSsoErrorMessage(new Error('Google sign-in is not enabled'))).toBe('Google sign-in is not enabled');
    expect(publicSsoErrorMessage(new Error('Facebook account must share email to use Growl'))).toBe(
      'Facebook account must share email to use Growl'
    );
  });

  it('hides provider / database internals', () => {
    expect(publicSsoErrorMessage(new Error('D1_ERROR: UNIQUE constraint failed: users.email'))).toBe(
      'Sign-in failed. Please try again.'
    );
    expect(publicSsoErrorMessage(new Error('Apple token signature invalid'))).toBe('Sign-in failed. Please try again.');
    expect(publicSsoErrorMessage('weird')).toBe('Sign-in failed. Please try again.');
  });
});
