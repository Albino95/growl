/**
 * Thin, crash-proof access to the App Group shared with the iOS widget
 * (@bacons/apple-targets' ExtensionStorage). Every call is a no-op on
 * Android / web, in Expo Go, and in tests — anywhere the native module is
 * missing. The package's JS touches a global `expo` at import time, so it is
 * required lazily and only on iOS.
 */
import { Platform } from 'react-native';
import { WIDGET_APP_GROUP } from './widgetSnapshot';

type Storage = {
  set: (key: string, value?: string) => void;
  get: (key: string) => string | null;
  remove: (key: string) => void;
};
type StorageModule = {
  ExtensionStorage: { new (group: string): Storage; reloadWidget: (name?: string) => void };
};

let resolved = false;
let mod: StorageModule | null = null;
let storage: Storage | null = null;

function load(): Storage | null {
  if (resolved) return storage;
  resolved = true;
  try {
    if (Platform.OS !== 'ios') return null;
    const g = globalThis as { expo?: { modules?: Record<string, unknown> } };
    if (!g.expo?.modules?.ExtensionStorage) return null; // Expo Go / dev client without it
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require('@bacons/apple-targets') as StorageModule;
    storage = new mod.ExtensionStorage(WIDGET_APP_GROUP);
  } catch {
    mod = null;
    storage = null;
  }
  return storage;
}

export function isWidgetStorageAvailable(): boolean {
  return load() !== null;
}

export function widgetStorageSet(key: string, value: string): boolean {
  const s = load();
  if (!s) return false;
  try {
    s.set(key, value);
    return true;
  } catch {
    return false;
  }
}

export function widgetStorageGet(key: string): string | null {
  const s = load();
  if (!s) return null;
  try {
    const v = s.get(key);
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

export function widgetStorageRemove(key: string): void {
  const s = load();
  if (!s) return;
  try {
    s.remove(key);
  } catch {
    // ignore
  }
}

export function reloadWidgets(): void {
  if (!load() || !mod) return;
  try {
    mod.ExtensionStorage.reloadWidget();
  } catch {
    // ignore
  }
}
