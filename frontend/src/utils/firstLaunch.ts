import { getSecureItem, setSecureItem } from '../services/storage/secureStore';

/** `first` = very first open on this device (seed sprouts); `daily` = quick wake-up. */
export type BootMode = 'daily' | 'first';

export const FIRST_OPEN_KEY = 'grow.firstOpenSeen';

let rawRead: Promise<string | null> | null = null;

/**
 * Start reading the first-open flag. Safe to call at module scope: it never
 * throws and never blocks anything (auth hydration, Sentry) — it just kicks
 * off the storage read so the splash can pick it up a few ms later.
 */
export function prewarmFirstOpenRead(): void {
  if (!rawRead) {
    rawRead = getSecureItem(FIRST_OPEN_KEY).catch(() => null);
  }
}

/**
 * Resolve the boot mode, capped at `timeoutMs` from the moment of this call.
 * Slow / failed storage falls back to `daily` (the short animation), so a
 * returning user is never held behind the long first-launch intro.
 */
export function resolveBootMode(timeoutMs = 100): Promise<BootMode> {
  prewarmFirstOpenRead();
  const read = rawRead as Promise<string | null>;
  return new Promise<BootMode>((resolve) => {
    const t = setTimeout(() => resolve('daily'), timeoutMs);
    read.then(
      (value) => {
        clearTimeout(t);
        resolve(value ? 'daily' : 'first');
      },
      () => {
        clearTimeout(t);
        resolve('daily');
      }
    );
  });
}

/** Persist that the first-launch animation has been seen. Fire-and-forget. */
export function markFirstOpenSeen(): void {
  rawRead = Promise.resolve('1');
  void setSecureItem(FIRST_OPEN_KEY, '1').catch(() => undefined);
}
