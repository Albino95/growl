import { useEffect, useLayoutEffect, useState } from 'react';
import { Appearance } from 'react-native';
import {
  DEFAULT_APPEARANCE,
  useUiPrefsStore,
  type AppearancePref,
} from '../state/useUiPrefsStore';
import { setColorScheme } from '../lib/tw';
import type { ColorSchemeName } from './palette';
import { flushColorSchemeNotify } from './scheme';

/**
 * Dark mode ships OFF until phase 2 has migrated every screen to semantic
 * tokens. While false:
 *  - the Settings → Appearance row is hidden,
 *  - the resolved scheme is always 'light' (a stale persisted 'dark' pref
 *    can't leak a half-migrated UI),
 *  - app.config.ts keeps `userInterfaceStyle: 'light'`.
 * Flip together with DEFAULT_APPEARANCE → 'system' (useUiPrefsStore.ts) and
 * app.config.ts `userInterfaceStyle: 'automatic'`.
 */
export const DARK_MODE_READY = false;

type SystemScheme = 'light' | 'dark' | null | undefined;

/** Pure resolver: user pref + OS scheme → active scheme. */
export function resolveAppearance(
  pref: AppearancePref,
  system: SystemScheme,
  ready: boolean = DARK_MODE_READY,
): ColorSchemeName {
  if (!ready) return 'light';
  if (pref === 'system') return system === 'dark' ? 'dark' : 'light';
  return pref;
}

function readSystemScheme(): SystemScheme {
  try {
    return Appearance.getColorScheme();
  } catch {
    return 'light';
  }
}

// Best first-frame guess before prefs rehydrate (SecureStore is async): the
// default pref against the OS scheme. Always 'light' while !DARK_MODE_READY.
setColorScheme(resolveAppearance(DEFAULT_APPEARANCE, readSystemScheme()));

/**
 * Mount once at the app root. Keeps the active scheme (tw + theme.colors) in
 * step with the persisted preference and the OS setting, and returns it.
 * The scheme is applied synchronously during render so the same render
 * already uses the right tw instance.
 */
export function useAppearanceSync(): ColorSchemeName {
  const pref = useUiPrefsStore((s) => s.appearance);
  const [system, setSystem] = useState<SystemScheme>(readSystemScheme);

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystem(colorScheme));
    // Catch a change between first render and subscribe.
    setSystem(readSystemScheme());
    return () => sub.remove();
  }, []);

  const resolved = resolveAppearance(pref, system);
  // Switch during render so this render (and the keyed subtree it remounts)
  // already uses the new tw instance; subscribers hear about it post-commit.
  setColorScheme(resolved, { deferNotify: true });
  useLayoutEffect(() => {
    flushColorSchemeNotify();
  }, [resolved]);
  return resolved;
}
