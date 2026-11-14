import { readSecureItem, setSecureItem } from './secureStore';

/**
 * "Has anyone signed in on this device before?" Decides whether Auth opens on
 * Sign up (brand-new install) or Sign in (returning). Kept in the keychain so
 * it survives an iOS reinstall, like the tokens themselves.
 */
export const HAS_SIGNED_IN_KEY = 'grow.hasSignedInBefore';

let cached: boolean | null = null;
let pending: Promise<boolean> | null = null;

/** Read once per run (cached); failed reads count as "signed in before". */
export function hasSignedInBefore(): Promise<boolean> {
  if (cached !== null) return Promise.resolve(cached);
  if (!pending) {
    pending = readSecureItem(HAS_SIGNED_IN_KEY)
      .then((r) => (r.ok ? r.value === '1' : true))
      .catch(() => true)
      .then((v) => {
        if (cached === null) cached = v;
        return cached;
      });
  }
  return pending;
}

/** Synchronous peek: `null` until the first read resolves. */
export function peekSignedInBefore(): boolean | null {
  return cached;
}

export function markSignedInBefore(): void {
  cached = true;
  void setSecureItem(HAS_SIGNED_IN_KEY, '1').catch(() => undefined);
}
