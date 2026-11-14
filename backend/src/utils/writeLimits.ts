import type { Env } from '../types';
import { checkRateLimit, clientIp } from './rateLimit';
import { getUserIdFromRequest } from './auth';
import { error } from './response';

/**
 * Per-account limits on social writes, so one account (or script) can't flood
 * other people with messages, comments, friend requests, reports or likes.
 * Generous for real use; checked in the router before the handler runs.
 * Paths are relative to the API prefix (e.g. /api/v1).
 */
type WriteLimit = {
  name: string;
  pattern: RegExp;
  limit: number;
  windowSeconds: number;
  /** Methods this rule applies to (default POST only). */
  methods?: string[];
};

export const WRITE_LIMITS: WriteLimit[] = [
  { name: 'message', pattern: /^\/messages\/conversations(\/[^/]+\/messages(\/[^/]+\/reaction)?)?$/, limit: 60, windowSeconds: 300 },
  { name: 'comment', pattern: /^\/feed\/posts\/[^/]+\/comments$/, limit: 30, windowSeconds: 600 },
  { name: 'like', pattern: /^\/feed\/posts\/[^/]+\/like$/, limit: 120, windowSeconds: 600 },
  { name: 'post', pattern: /^\/feed\/posts$/, limit: 20, windowSeconds: 3600 },
  { name: 'story', pattern: /^\/stories$/, limit: 30, windowSeconds: 3600 },
  { name: 'friend-request', pattern: /^\/social\/friends$/, limit: 40, windowSeconds: 3600 },
  { name: 'report', pattern: /^\/social\/report$/, limit: 20, windowSeconds: 3600 },
  { name: 'block', pattern: /^\/social\/(block|mute)$/, limit: 40, windowSeconds: 3600 },
  { name: 'journal', pattern: /^\/journal\/entries$/, limit: 30, windowSeconds: 3600 },
  { name: 'journal-reply', pattern: /^\/journal\/entries\/[^/]+\/(replies|feel)$/, limit: 60, windowSeconds: 3600 },
  {
    name: 'coaching',
    pattern: /^\/instructor\/(inquiries|proposals|reviews|candidates\/[^/]+\/request-endorsement)$/,
    limit: 20,
    windowSeconds: 3600,
  },
  { name: 'seed-invite', pattern: /^\/seeds\/[^/]+\/invite$/, limit: 30, windowSeconds: 3600 },
  { name: 'app-review-reply', pattern: /^\/app-reviews\/[^/]+\/reply$/, limit: 30, windowSeconds: 3600 },
  // Growth system
  { name: 'checkin', pattern: /^\/me\/today$/, limit: 30, windowSeconds: 3600, methods: ['PUT'] },
  { name: 'invite-redeem', pattern: /^\/me\/invite\/redeem$/, limit: 10, windowSeconds: 3600 },
  {
    name: 'challenge-join',
    pattern: /^\/challenges\/[^/]+\/join$/,
    limit: 30,
    windowSeconds: 3600,
    methods: ['POST', 'DELETE'],
  },
  { name: 'badges-seen', pattern: /^\/me\/badges\/seen$/, limit: 60, windowSeconds: 3600 },
];

export function matchWriteLimit(method: string, relativePath: string): WriteLimit | null {
  return (
    WRITE_LIMITS.find(
      (l) => (l.methods ?? ['POST']).includes(method) && l.pattern.test(relativePath)
    ) ?? null
  );
}

/** Returns a 429 response when the caller is over the limit for this route, else null. */
export async function enforceWriteLimit(
  request: Request,
  env: Env,
  relativePath: string
): Promise<Response | null> {
  const rule = matchWriteLimit(request.method, relativePath);
  if (!rule) return null;
  const userId = await getUserIdFromRequest(request, env).catch(() => null);
  const who = userId ? `u:${userId}` : `ip:${clientIp(request)}`;
  const { allowed } = await checkRateLimit(env, `write:${rule.name}:${who}`, rule.limit, rule.windowSeconds);
  if (allowed) return null;
  return error('RATE_LIMITED', 'You’re doing that too often. Please wait a few minutes and try again.', 429);
}
