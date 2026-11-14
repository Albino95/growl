import { THEME_COLORS, type ThemeColorValues } from './palette';
import { getColorSchemeName, useColorSchemeName } from './scheme';

/**
 * `theme.colors` — scheme-aware. Every key is a getter that resolves against
 * the active scheme *at access time*, so `theme.colors.card` read inside a
 * render is always right.
 *
 * GOTCHA: reading it at module scope (e.g. in `StyleSheet.create({...})` or a
 * `const X = theme.colors.brand` outside a component) captures the value at
 * import time and will NOT follow a scheme change. Read inside render, or use
 * `useThemeColors()`.
 */
export const themeColors: Readonly<ThemeColorValues> = (() => {
  const obj = {} as ThemeColorValues;
  for (const key of Object.keys(THEME_COLORS.light) as (keyof ThemeColorValues)[]) {
    Object.defineProperty(obj, key, {
      enumerable: true,
      get: () => THEME_COLORS[getColorSchemeName()][key],
    });
  }
  return Object.freeze(obj);
})();

/** Plain snapshot object for the active scheme; re-renders on scheme change. */
export function useThemeColors(): Readonly<ThemeColorValues> {
  return THEME_COLORS[useColorSchemeName()];
}

/** Non-hook snapshot (for event handlers / imperative code). */
export function getThemeColors(): Readonly<ThemeColorValues> {
  return THEME_COLORS[getColorSchemeName()];
}
