import { Env } from '../types';

const DEFAULT_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const DEFAULT_HEADERS = 'Content-Type, Authorization';

/**
 * Resolve Access-Control-Allow-Origin from CORS_ORIGINS (comma-separated).
 * `*` or empty (non-production) allows any origin. Production should set an allowlist.
 */
export function resolveCorsOrigin(request: Request, env: Env): string {
  const configured = (env.CORS_ORIGINS || '').trim();
  const origin = request.headers.get('Origin');

  if (!configured || configured === '*') {
    if (env.ENVIRONMENT === 'production') {
      // Fail closed for browser clients in production if misconfigured
      if (origin && (origin.endsWith('://growl.app') || origin.endsWith('.growl.app'))) {
        return origin;
      }
      return 'https://growl.app';
    }
    return origin || '*';
  }

  const allowed = configured.split(',').map((s) => s.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) return origin;
  if (allowed.includes('*')) return '*';
  // Non-browser clients (native) often omit Origin — echo first allowlisted origin for preflight compatibility
  return allowed[0] || 'https://growl.app';
}

export function corsHeaders(request: Request, env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': resolveCorsOrigin(request, env),
    'Access-Control-Allow-Methods': DEFAULT_METHODS,
    'Access-Control-Allow-Headers': DEFAULT_HEADERS,
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
