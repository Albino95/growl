import { useSyncExternalStore } from 'react';
import type { ColorSchemeName } from './palette';

/**
 * The app's ACTIVE colour scheme (already resolved from the user's
 * appearance preference + the OS setting — see `appearance.ts`).
 *
 * Plain module state, not React state: `tw` and `theme.colors` read it
 * synchronously at call time, so it must be set before the tree re-renders.
 * App.tsx remounts the navigation tree on change (key = scheme) so every
 * `tw\`...\`` call is re-evaluated.
 */
let current: ColorSchemeName = 'light';
let pendingNotify = false;
const listeners = new Set<() => void>();

export function getColorSchemeName(): ColorSchemeName {
  return current;
}

/**
 * Internal setter — use `setColorScheme` from `lib/tw`.
 * `deferNotify` is for writes made DURING a React render (useAppearanceSync):
 * the value switches immediately (so the rest of that render uses it) but
 * subscribers are only told on `flushColorSchemeNotify()` from a layout
 * effect — notifying mid-render would trip React's "cannot update a component
 * while rendering a different component" warning.
 */
export function setActiveColorScheme(
  next: ColorSchemeName,
  opts?: { deferNotify?: boolean },
): void {
  if (next === current) return;
  current = next;
  if (opts?.deferNotify) {
    pendingNotify = true;
    return;
  }
  notify();
}

export function flushColorSchemeNotify(): void {
  if (!pendingNotify) return;
  notify();
}

function notify(): void {
  pendingNotify = false;
  for (const l of [...listeners]) {
    try {
      l();
    } catch {
      /* ignore */
    }
  }
}

export function subscribeColorScheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 'light' | 'dark' — re-renders the caller when the active scheme changes. */
export function useColorSchemeName(): ColorSchemeName {
  return useSyncExternalStore(subscribeColorScheme, getColorSchemeName, getColorSchemeName);
}
