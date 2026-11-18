import { parseServerDate } from '../../utils/serverDate';

/** "just now", "5m", "3h", "2d", or a short date. */
export function shortAgo(raw: string | null | undefined, now: number = Date.now()): string {
  const d = parseServerDate(raw);
  if (!d) return '';
  const s = Math.max(0, Math.round((now - d.getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Plain, warm copy for the error codes the engage endpoints return. */
export function engageErrorMessage(e: unknown, fallback: string): string {
  // Duck-typed ApiError (keeps this file free of native imports for unit tests).
  if (e && typeof e === 'object' && 'status' in e) {
    const err = e as { code?: string | null; status?: number };
    switch (err.code) {
      case 'REVIEW_NEEDS_PURCHASE':
        return 'Reviews open after your order of this product is delivered.';
      case 'BLOCKED':
        return 'You can’t do that with this shop.';
      case 'OWN_PRODUCT':
        return 'That’s your own product.';
      case 'RATE_LIMITED':
        return 'That’s a lot in a short time. Try again in a bit.';
      default:
        if (err.status === 0) return 'You seem to be offline. Try again when you’re connected.';
    }
  }
  return fallback;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Normalises "9:5" / "930" style input to HH:MM when possible. */
export function normalizeTime(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) m = s.match(/^(\d{1,2})(\d{2})$/);
  if (!m) {
    const h = s.match(/^(\d{1,2})$/);
    if (h) m = [s, h[1], '0'] as unknown as RegExpMatchArray;
  }
  if (!m) return null;
  const out = `${String(Number(m[1])).padStart(2, '0')}:${String(Number(m[2])).padStart(2, '0')}`;
  return HHMM.test(out) ? out : null;
}
