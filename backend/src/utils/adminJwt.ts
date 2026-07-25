type AdminJwtPayload = {
  adminId: string;
  type: 'admin';
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

function requireSecret(env: { JWT_SECRET?: string }): string {
  const secret = env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
}

export async function signAdminToken(
  adminId: string,
  env: { JWT_SECRET?: string },
  ttlSeconds = 28800
): Promise<string> {
  const secret = requireSecret(env);
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload: AdminJwtPayload = { adminId, type: 'admin', iat: now, exp: now + ttlSeconds };
  const body = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const signature = await hmacSign(signingInput, secret);
  return `${signingInput}.${signature}`;
}

export async function verifyAdminToken(
  token: string,
  env: { JWT_SECRET?: string }
): Promise<{ adminId: string } | null> {
  let secret: string;
  try {
    secret = requireSecret(env);
  } catch {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const signingInput = `${header}.${body}`;
  const valid = await hmacVerify(signingInput, signature, secret);
  if (!valid) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(body)) as AdminJwtPayload;
    if (payload.type !== 'admin' || !payload.adminId || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { adminId: payload.adminId };
  } catch {
    return null;
  }
}

export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
