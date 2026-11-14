import { Platform } from 'react-native';

/**
 * Small non-secret key/value store (one JSON file per key in the app's
 * document directory; localStorage on web). For data that must survive
 * restarts but has no business in the keychain, e.g. the cached user
 * snapshot. Never throws: reads give `null`, writes give `false`.
 *
 * (AsyncStorage isn't installed; expo-file-system already is.)
 */

const isWeb = Platform.OS === 'web';
const DIR = 'grow-kv/';

type LegacyFs = typeof import('expo-file-system/legacy');

async function fs(): Promise<LegacyFs | null> {
  try {
    return await import('expo-file-system/legacy');
  } catch {
    return null;
  }
}

function safeName(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function fileFor(key: string): Promise<{ FileSystem: LegacyFs; dir: string; path: string } | null> {
  const FileSystem = await fs();
  const base = FileSystem?.documentDirectory;
  if (!FileSystem || !base) return null;
  const dir = `${base}${DIR}`;
  return { FileSystem, dir, path: `${dir}${safeName(key)}.json` };
}

export async function getLocalItem(key: string): Promise<string | null> {
  if (isWeb) {
    try {
      return localStorage.getItem(`local:${key}`);
    } catch {
      return null;
    }
  }
  try {
    const f = await fileFor(key);
    if (!f) return null;
    const info = await f.FileSystem.getInfoAsync(f.path);
    if (!info.exists) return null;
    return await f.FileSystem.readAsStringAsync(f.path);
  } catch {
    return null;
  }
}

export async function setLocalItem(key: string, value: string): Promise<boolean> {
  if (isWeb) {
    try {
      localStorage.setItem(`local:${key}`, value);
      return true;
    } catch {
      return false;
    }
  }
  try {
    const f = await fileFor(key);
    if (!f) return false;
    const dirInfo = await f.FileSystem.getInfoAsync(f.dir);
    if (!dirInfo.exists) {
      await f.FileSystem.makeDirectoryAsync(f.dir, { intermediates: true });
    }
    await f.FileSystem.writeAsStringAsync(f.path, value);
    return true;
  } catch (error) {
    console.warn('[LocalStore] Failed to write item:', error);
    return false;
  }
}

export async function deleteLocalItem(key: string): Promise<void> {
  if (isWeb) {
    try {
      localStorage.removeItem(`local:${key}`);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    const f = await fileFor(key);
    if (!f) return;
    await f.FileSystem.deleteAsync(f.path, { idempotent: true });
  } catch {
    /* ignore */
  }
}
