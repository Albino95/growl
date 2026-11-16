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
/** The native module @bacons/apple-targets ships (ios/ExtensionStorageModule.swift). */
type NativeExtensionStorage = {
  setString: (key: string, value: string, group?: string) => void;
  get: (key: string, group?: string) => string | null;
  remove: (key: string, group?: string) => void;
  reloadWidget: (kind?: string | null) => void;
};

let native: NativeExtensionStorage | null = null;
let storage: Storage | null = null;
/** Why the last attempt failed (shown in Settings → widget status, sent to Sentry once). */
let lastProblem: string | null = null;

/**
 * Resolves the native App Group storage. We talk to the native module through
 * expo-modules-core directly: the package's JS wrapper reads a global `expo`
 * at import time and silently swaps in a no-op stub if that lookup misses,
 * which would drop every widget write without any error.
 * A miss is NOT cached — right after launch the module can still be installing.
 */
function load(): Storage | null {
  if (storage) return storage;
  if (Platform.OS !== 'ios') {
    lastProblem = 'not-ios';
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const core = require('expo-modules-core') as {
      requireOptionalNativeModule: <T>(name: string) => T | null;
    };
    const g = globalThis as { expo?: { modules?: Record<string, unknown> } };
    native =
      core.requireOptionalNativeModule<NativeExtensionStorage>('ExtensionStorage') ??
      ((g.expo?.modules?.ExtensionStorage as NativeExtensionStorage | undefined) || null);
    if (!native || typeof native.setString !== 'function') {
      native = null;
      lastProblem = 'native-module-missing';
      return null;
    }
    const n = native;
    storage = {
      set: (key, value) => (value == null ? n.remove(key, WIDGET_APP_GROUP) : n.setString(key, value, WIDGET_APP_GROUP)),
      get: (key) => n.get(key, WIDGET_APP_GROUP),
      remove: (key) => n.remove(key, WIDGET_APP_GROUP),
    };
    lastProblem = null;
  } catch (e) {
    native = null;
    storage = null;
    lastProblem = e instanceof Error ? e.message : 'load-failed';
  }
  return storage;
}

export function widgetStorageProblem(): string | null {
  load();
  return lastProblem;
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
  if (!load() || !native) return;
  try {
    native.reloadWidget(null);
  } catch {
    // ignore
  }
}
