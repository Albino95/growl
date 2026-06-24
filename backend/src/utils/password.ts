/**
 * Password hashing (PBKDF2-SHA256). One-way — passwords cannot be "dehashed".
 * Legacy rows may still use bare SHA-256 hex from early MVP; verifyPassword handles both.
 */

/**
 * Cloudflare Workers WebCrypto currently rejects PBKDF2 iterations above 100k.
 * Keep the default at the platform-safe ceiling so sign-up/sign-in never crash in production.
 */
const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function sha256Hex(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Hash secret using plain SHA-256 hex (same format as client-side hash). */
export async function hashClientSecret(secret: string): Promise<string> {
  return sha256Hex(secret);
}

async function pbkdf2Hash(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    KEY_BITS
  );
  return new Uint8Array(bits);
}

/** Store as pbkdf2$iterations$saltB64url$hashB64url */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await pbkdf2Hash(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  if (stored.startsWith('pbkdf2$')) {
    const parts = stored.split('$');
    if (parts.length !== 4) return false;
    const iterations = parseInt(parts[1], 10);
    if (!Number.isFinite(iterations) || iterations <= 0) return false;
    const salt = fromBase64Url(parts[2]);
    const expected = fromBase64Url(parts[3]);
    try {
      const derived = await pbkdf2Hash(password, salt, iterations);
      if (derived.length !== expected.length) return false;
      let diff = 0;
      for (let i = 0; i < derived.length; i++) diff |= derived[i] ^ expected[i];
      return diff === 0;
    } catch (err) {
      // Corrupted/unusable hash parameters should fail closed as invalid credentials, not 500.
      console.error('[verifyPassword] Unsupported PBKDF2 params:', err);
      return false;
    }
  }
  // Legacy SHA-256 hex (demo seed + early accounts)
  const legacy = await sha256Hex(password);
  return legacy === stored;
}

/** 6-digit email verification code */
export function generateVerificationToken(): string {
  return String(100000 + Math.floor(Math.random() * 900000));
}

export async function hashVerificationToken(token: string): Promise<string> {
  return sha256Hex(token);
}
