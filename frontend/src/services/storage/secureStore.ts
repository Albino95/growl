import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Web: persist in localStorage so sessions survive tab reloads / backgrounding.
// (sessionStorage was clearing too aggressively and felt like random logouts.)
const isWeb = Platform.OS === 'web';

/**
 * AFTER_FIRST_UNLOCK: items stay readable while the phone is locked after its
 * first unlock (background refresh, notification taps, cold starts behind the
 * lock screen). The default (WHEN_UNLOCKED) made reads throw in exactly those
 * moments and looked like random sign-outs.
 */
const OPTIONS: SecureStore.SecureStoreOptions = (() => {
  try {
    return { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
  } catch {
    return {}; // partial mocks / platforms without the constant
  }
})();

export type SecureReadResult =
  | { ok: true; value: string | null }
  | { ok: false; error: unknown };

/**
 * Write an item. Retries once on failure. Resolves `true` when stored and
 * `false` when both attempts failed (never throws). Callers that must not lose
 * the value (rotated tokens) check the result.
 */
export async function trySetSecureItem(key: string, value: string): Promise<boolean> {
  if (isWeb) {
    try {
      sessionStorage.removeItem(key);
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.warn('[SecureStore] Failed to set item in localStorage:', error);
      return false;
    }
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await SecureStore.setItemAsync(key, value, OPTIONS);
      return true;
    } catch (error) {
      if (attempt === 1) {
        console.warn('[SecureStore] Failed to set item:', error);
        return false;
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  return false;
}

/** Fire-and-forget write (with the same single retry) for preferences. */
export async function setSecureItem(key: string, value: string): Promise<void> {
  await trySetSecureItem(key, value);
}

/**
 * Read an item, telling "missing" (`{ ok: true, value: null }`) apart from
 * "the keychain threw" (`{ ok: false }`). Auth uses this so a locked / busy
 * keychain is never mistaken for "signed out".
 */
export async function readSecureItem(key: string): Promise<SecureReadResult> {
  if (isWeb) {
    try {
      const fromLocal = localStorage.getItem(key);
      if (fromLocal) return { ok: true, value: fromLocal };
      // Migrate any leftover sessionStorage tokens once
      const fromSession = sessionStorage.getItem(key);
      if (fromSession) {
        localStorage.setItem(key, fromSession);
        sessionStorage.removeItem(key);
        return { ok: true, value: fromSession };
      }
      return { ok: true, value: null };
    } catch (error) {
      console.warn('[SecureStore] Failed to get item from localStorage:', error);
      return { ok: false, error };
    }
  }
  try {
    return { ok: true, value: await SecureStore.getItemAsync(key, OPTIONS) };
  } catch (error) {
    console.warn('[SecureStore] Failed to get item:', error);
    return { ok: false, error };
  }
}

/** Lenient read for preferences: missing and failed reads both give `null`. */
export async function getSecureItem(key: string): Promise<string | null> {
  const res = await readSecureItem(key);
  return res.ok ? res.value : null;
}

export async function deleteSecureItem(key: string) {
  if (isWeb) {
    try {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('[SecureStore] Failed to delete item from storage:', error);
    }
  } else {
    try {
      await SecureStore.deleteItemAsync(key, OPTIONS);
    } catch (error) {
      console.warn('[SecureStore] Failed to delete item:', error);
    }
  }
}
