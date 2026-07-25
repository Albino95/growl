import { Env } from '../types';

/**
 * Fixed-window rate limit via KV.
 * Returns true if the request is allowed; false if over limit.
 */
export async function checkRateLimit(
  env: Env,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  if (!env.KV) {
    return { allowed: true, remaining: limit };
  }

  const bucket = `rl:${key}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
  const raw = await env.KV.get(bucket);
  const count = raw ? parseInt(raw, 10) : 0;

  if (count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  await env.KV.put(bucket, String(count + 1), { expirationTtl: windowSeconds + 5 });
  return { allowed: true, remaining: Math.max(0, limit - count - 1) };
}

export function clientIp(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}
