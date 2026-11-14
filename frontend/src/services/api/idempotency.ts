/**
 * Idempotency keys for create requests (`Idempotency-Key` header). The server
 * returns the stored original response when it sees the same user + key again
 * within 24 h, so a retry of the same item never makes a duplicate.
 *
 * Keep the key stable for one logical item (a draft, a temp message id) and
 * pass it on every manual retry; a fresh key means "this is a new item".
 */

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c && typeof c.getRandomValues === 'function') {
    try {
      c.getRandomValues(bytes);
      return bytes;
    } catch {
      /* fall through to Math.random */
    }
  }
  for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

/** RFC 4122 v4 UUID without any package. */
export function uuidV4(): string {
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** What the server accepts (anything else is a 400 INVALID_IDEMPOTENCY_KEY). */
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_\-:.]{8,128}$/;

export function isValidIdempotencyKey(key: unknown): key is string {
  return typeof key === 'string' && IDEMPOTENCY_KEY_PATTERN.test(key);
}

export function newIdempotencyKey(): string {
  return uuidV4();
}

/**
 * Request option fragment: `request(path, { method: 'POST', ...withIdempotency(key) })`.
 * Uses the caller's stable key when given (and server-valid), otherwise a fresh one
 * — a malformed key would only earn a 400 and block the create entirely.
 */
export function withIdempotency(key?: string | null): { idempotencyKey: string } {
  const k = typeof key === 'string' ? key.trim() : '';
  return { idempotencyKey: isValidIdempotencyKey(k) ? k : newIdempotencyKey() };
}
