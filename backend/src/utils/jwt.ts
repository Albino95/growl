/**
 * Signed JWT access tokens (HMAC-SHA256). Requires JWT_SECRET in production.
 */

type JwtPayload = {
  userId: string;
  iat: number;
  exp: number;
};

function base64UrlEncode(data: Uint8Array | string): string {
  if (typeof data === 'string') {
    return btoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  let binary = '';
  for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return atob(b64);
}

async function hmacSign(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return base64UrlEncode(new Uint8Array(sig));
}

async function hmacVerify(message: string, signature: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const sigBytes = Uint8Array.from(base64UrlDecode(signature), (c) => c.charCodeAt(0));
  return crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(message));
}

export async function signAccessToken(userId: string, env: { JWT_SECRET?: string }, ttlSeconds = 604800): Promise<string> {
  const secret = env.JWT_SECRET || 'dev-secret-key-change-in-production';
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = { userId, iat: now, exp: now + ttlSeconds };
  const body = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const signature = await hmacSign(signingInput, secret);
  return `${signingInput}.${signature}`;
}

export async function verifyAccessToken(
  token: string,
  env: { JWT_SECRET?: string }
): Promise<{ userId: string } | null> {
  const secret = env.JWT_SECRET || 'dev-secret-key-change-in-production';
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const signingInput = `${header}.${body}`;
  const valid = await hmacVerify(signingInput, signature, secret);
  if (!valid) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(body)) as JwtPayload;
    if (!payload.userId || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}
