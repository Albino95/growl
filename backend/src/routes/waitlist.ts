import type { Env } from '../types';
import { json, error } from '../utils/response';
import { generateId } from '../utils/id';
import { checkRateLimit, clientIp } from '../utils/rateLimit';
import { validateRequest, waitlistSignupSchema } from '../utils/validation';

/** Per visitor: 10 signups an hour is plenty for real use (Android + web + a typo fix). */
export const WAITLIST_LIMIT_PER_CLIENT = 10;
/**
 * Per connecting IP: the landing site proxies signups server-side, so every visitor
 * arrives from a handful of Vercel IPs. That cap has to be roomy; it bounds what a
 * caller can do by spoofing the forwarded-client header.
 */
export const WAITLIST_LIMIT_PER_CONNECTION = 300;
const WINDOW_SECONDS = 3600;

const RATE_LIMITED_MESSAGE = 'Too many signups from here. Please try again in a little while.';

/** Visitor IP forwarded by the landing proxy (only used for rate limiting, never stored). */
function forwardedClientIp(request: Request): string | null {
  const raw = request.headers.get('X-Grow-Client-IP')?.trim();
  if (!raw) return null;
  return raw.slice(0, 64).replace(/[^0-9a-fA-F:.]/g, '') || null;
}

/**
 * POST /waitlist — public early-access signup.
 * Always answers { ok: true } for valid input (new or already listed), so the
 * endpoint can't be used to check whether an address is on the list.
 */
export async function joinWaitlist(request: Request, env: Env): Promise<Response> {
  const connection = clientIp(request);
  const visitor = forwardedClientIp(request) ?? connection;

  const perConnection = await checkRateLimit(
    env,
    `waitlist:conn:${connection}`,
    WAITLIST_LIMIT_PER_CONNECTION,
    WINDOW_SECONDS
  );
  if (!perConnection.allowed) return error('RATE_LIMITED', RATE_LIMITED_MESSAGE, 429);

  const perClient = await checkRateLimit(
    env,
    `waitlist:ip:${connection}:${visitor}`,
    WAITLIST_LIMIT_PER_CLIENT,
    WINDOW_SECONDS
  );
  if (!perClient.allowed) return error('RATE_LIMITED', RATE_LIMITED_MESSAGE, 429);

  const validation = await validateRequest(request, waitlistSignupSchema);
  if (!validation.success) return validation.response;
  const { email, platform, source } = validation.data;

  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO waitlist_signups (id, email, platform, source) VALUES (?, ?, ?, ?)`
    )
      .bind(generateId('wl'), email, platform, source || null)
      .run();
  } catch (err) {
    console.error('[waitlist] insert failed', err);
    return error('INTERNAL_ERROR', 'Could not join the waitlist right now. Try again later.', 500);
  }

  return json({ ok: true });
}
