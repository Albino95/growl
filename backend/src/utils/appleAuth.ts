/**
 * Verify Apple identity tokens using Apple's JWKS (RS256) via WebCrypto.
 */
import { Env } from '../types';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';

type JWK = {
  kid: string;
  kty: string;
  alg?: string;
  n: string;
  e: string;
  use?: string;
};

function base64UrlToUint8Array(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function decodeJwtJson<T>(part: string): T {
  const json = new TextDecoder().decode(base64UrlToUint8Array(part));
  return JSON.parse(json) as T;
}

let cachedKeys: { fetchedAt: number; keys: JWK[] } | null = null;

async function getAppleKeys(): Promise<JWK[]> {
  const now = Date.now();
  if (cachedKeys && now - cachedKeys.fetchedAt < 60 * 60 * 1000) {
    return cachedKeys.keys;
  }
  const res = await fetch(APPLE_JWKS_URL);
  if (!res.ok) throw new Error('Failed to fetch Apple JWKS');
  const data = (await res.json()) as { keys: JWK[] };
  cachedKeys = { fetchedAt: now, keys: data.keys || [] };
  return cachedKeys.keys;
}

export async function verifyAppleIdToken(
  idToken: string,
  env: Env
): Promise<{ email: string; name?: string; sub: string }> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid Apple identity token');

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodeJwtJson<{ kid?: string; alg?: string }>(headerB64);
  const payload = decodeJwtJson<{
    iss?: string;
    aud?: string | string[];
    exp?: number;
    sub?: string;
    email?: string;
  }>(payloadB64);

  if (header.alg !== 'RS256') throw new Error('Unsupported Apple token algorithm');
  if (payload.iss !== APPLE_ISSUER) throw new Error('Apple token issuer mismatch');
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Apple token expired');
  }

  const audience = env.APPLE_CLIENT_ID?.trim() || 'app.growl.mobile';
  const audOk = Array.isArray(payload.aud)
    ? payload.aud.includes(audience)
    : payload.aud === audience;
  if (!audOk) throw new Error('Apple token audience mismatch');
  if (!payload.sub) throw new Error('Apple token missing subject');

  const keys = await getAppleKeys();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Apple signing key not found');

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlToUint8Array(signatureB64);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data);
  if (!valid) throw new Error('Apple token signature invalid');

  const email = payload.email?.toLowerCase() || `${payload.sub}@privaterelay.appleid.com`;
  return { email, sub: payload.sub };
}
