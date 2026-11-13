import { RequestContext, User } from '../types';
import { verifyAccessToken } from './jwt';
import { isValidTimeZone } from './days';

// Verified user id per Request, so the router's write limiter and the handler's
// getRequestContext don't both verify the same JWT.
const verifiedUserIds = new WeakMap<Request, Promise<string | null>>();

export function getUserIdFromRequest(request: Request, env: any): Promise<string | null> {
  const cached = verifiedUserIds.get(request);
  if (cached) return cached;
  const pending = resolveUserId(request, env);
  verifiedUserIds.set(request, pending);
  // Don't cache failures (e.g. transient errors) — let the next caller retry.
  pending.catch(() => verifiedUserIds.delete(request));
  return pending;
}

async function resolveUserId(request: Request, env: any): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  // Vitest / local unit tests only — never enabled for remote envs (dev/qa/production).
  if (env?.ENVIRONMENT === 'test' && env?.ALLOW_TEST_AUTH_BYPASS === 'true') {
    return 'test-user';
  }

  const verified = await verifyAccessToken(token, env);
  return verified?.userId ?? null;
}

export async function getRequestContext(request: Request, env: any): Promise<RequestContext> {
  const userId = await getUserIdFromRequest(request, env);

  if (!userId) {
    return { isAuthenticated: false };
  }

  // One round trip: user row + moderation state. (The derived table is flattened by
  // SQLite into a plain PK lookup; written this way it keeps the familiar
  // "SELECT * FROM users WHERE id = ?" shape that route-test DB mocks key on.)
  const row = (await env.DB.prepare(
    `SELECT u.*, s.status AS acct_status, s.suspended_until AS acct_suspended_until
     FROM (SELECT * FROM users WHERE id = ?) u
     LEFT JOIN user_account_states s ON s.user_id = u.id`
  )
    .bind(userId)
    .first()) as (User & { acct_status?: string | null; acct_suspended_until?: string | null }) | null;

  if (!row) {
    return { isAuthenticated: false };
  }

  const { acct_status, acct_suspended_until, ...user } = row;

  if (user.email?.endsWith('@growl.invalid')) {
    return { isAuthenticated: false };
  }

  // Banned, actively suspended or deleted accounts lose API access immediately,
  // even if they still hold an unexpired access token.
  if (restrictionFromState(acct_status, acct_suspended_until)) {
    return { isAuthenticated: false };
  }

  await syncTimezone(request, env, user as User & { timezone?: string });

  return {
    userId,
    user: user as User,
    isAuthenticated: true,
  };
}

/**
 * Growth system: the app sends `X-Timezone: <IANA>` on every request. Store it when
 * valid and different from the loaded row — no extra query when unchanged.
 */
async function syncTimezone(request: Request, env: any, user: User & { timezone?: string }): Promise<void> {
  const tz = request.headers.get('X-Timezone')?.trim();
  if (!tz || typeof user.timezone !== 'string' || user.timezone === tz) return;
  if (!isValidTimeZone(tz)) return;
  try {
    await env.DB.prepare('UPDATE users SET timezone = ? WHERE id = ?').bind(tz, user.id).run();
    user.timezone = tz;
  } catch (err) {
    console.error('[auth] timezone update failed', err);
  }
}

export function userAuthPayload(user: User) {
  const metadata = JSON.parse(user.metadata || '{}');
  const categories = Array.isArray(metadata.categories) ? metadata.categories : [];
  const decayTimer =
    typeof metadata.decay_timer === 'number' && metadata.decay_timer >= 1
      ? Math.min(365, Math.floor(metadata.decay_timer))
      : 7;
  return {
    userId: user.id,
    email: user.email,
    isInstructor: !!user.is_instructor,
    isBusiness: !!user.is_business,
    hasCompletedOnboarding: categories.length > 0,
    categories,
    points: Number(user.points) || 0,
    decayTimer,
    emailVerified: !!(user as User & { email_verified?: number }).email_verified,
  };
}

export type AccountRestriction = {
  code: 'ACCOUNT_BANNED' | 'ACCOUNT_SUSPENDED' | 'ACCOUNT_DELETED';
  message: string;
  until?: string;
};

/**
 * Returns why this account may not use the app right now, or null if it may.
 * A suspension whose `suspended_until` has passed no longer blocks.
 */
export async function getAccountRestriction(env: any, userId: string): Promise<AccountRestriction | null> {
  const state = (await env.DB.prepare(
    'SELECT status, suspended_until FROM user_account_states WHERE user_id = ?'
  )
    .bind(userId)
    .first()) as { status?: string; suspended_until?: string | null } | null;
  return restrictionFromState(state?.status, state?.suspended_until);
}

/** Pure mapping from a user_account_states row to a restriction (null = may use the app). */
export function restrictionFromState(
  status: string | null | undefined,
  suspendedUntil: string | null | undefined,
  now: number = Date.now()
): AccountRestriction | null {
  switch (status) {
    case 'deleted':
    case 'deleted_pending':
      return { code: 'ACCOUNT_DELETED', message: 'This account has been deleted.' };
    case 'banned':
      return { code: 'ACCOUNT_BANNED', message: 'This account has been banned for violating our community guidelines.' };
    case 'suspended': {
      const until = suspendedUntil ? Date.parse(suspendedUntil) : NaN;
      if (!Number.isNaN(until) && until <= now) return null;
      return {
        code: 'ACCOUNT_SUSPENDED',
        message: 'This account is temporarily suspended.',
        until: suspendedUntil || undefined,
      };
    }
    default:
      return null;
  }
}
