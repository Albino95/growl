import { create, type TwConfig } from 'twrnc';
import { DARK_TW_COLORS, type ColorSchemeName } from '../theme/palette';
import { themeColors } from '../theme/colors';
import { getColorSchemeName, setActiveColorScheme, subscribeColorScheme } from '../theme/scheme';

/**
 * Scheme-aware twrnc.
 *
 * Two twrnc instances are built once: LIGHT from tailwind.config.js and DARK
 * from the same config with colours remapped (src/theme/palette.ts →
 * DARK_TW_COLORS). The default export `tw` is a thin function object that
 * forwards every call (`tw\`...\``, `tw.style()`, `tw.color()`, …) to the
 * instance of the ACTIVE scheme, so the ~160 existing `import tw from` sites
 * need no change.
 *
 * Switch with `setColorScheme('dark')`. Styles are computed at call time, so
 * components must re-render to pick up the new scheme — App.tsx keys the
 * navigation tree on the scheme to force that. Anything that captured a style
 * or colour at module scope (StyleSheet.create, top-level `const s = tw\`...\``)
 * keeps the old value: move it into render.
 *
 * `dark:` prefixes also work (each instance's own colour scheme is kept in
 * sync), but prefer semantic tokens (bg-card, text-ink) over `dark:` variants.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const lightConfig: TwConfig = require('../../tailwind.config.js');

function buildDarkConfig(base: TwConfig): TwConfig {
  const theme = base.theme ?? {};
  const extend = (theme.extend ?? {}) as Record<string, unknown>;
  const baseColors = (extend.colors ?? {}) as Record<string, unknown>;
  const colors: Record<string, unknown> = { ...baseColors };
  for (const [key, value] of Object.entries(DARK_TW_COLORS)) {
    const prev = baseColors[key];
    colors[key] =
      value && typeof value === 'object' && prev && typeof prev === 'object'
        ? { ...(prev as object), ...(value as object) }
        : value;
  }
  return { ...base, theme: { ...theme, extend: { ...extend, colors } } } as TwConfig;
}

const instances: Record<ColorSchemeName, ReturnType<typeof create>> = {
  light: create(lightConfig),
  dark: create(buildDarkConfig(lightConfig)),
};
instances.light.setColorScheme('light');
instances.dark.setColorScheme('dark');

type Tw = ReturnType<typeof create>;
const active = (): Tw => instances[getColorSchemeName()];

const twProxy = function tw(strings: TemplateStringsArray, ...values: (string | number)[]) {
  return active()(strings, ...values);
} as Tw;

twProxy.style = (...inputs) => active().style(...inputs);
twProxy.color = (color) => active().color(color);
twProxy.prefixMatch = (...prefixes) => active().prefixMatch(...prefixes);
// Device context goes to BOTH instances so a switch never sees stale metrics.
twProxy.setWindowDimensions = (d) => {
  instances.light.setWindowDimensions(d);
  return instances.dark.setWindowDimensions(d);
};
twProxy.setFontScale = (s) => {
  instances.light.setFontScale(s);
  return instances.dark.setFontScale(s);
};
twProxy.setPixelDensity = (d) => {
  instances.light.setPixelDensity(d);
  return instances.dark.setPixelDensity(d);
};
/** Same as the named `setColorScheme`; null/undefined → light. */
twProxy.setColorScheme = (scheme) => {
  setColorScheme(scheme === 'dark' ? 'dark' : 'light');
};

/**
 * Switch the active scheme for `tw` and `theme.colors`. App code normally
 * doesn't call this — `useAppearanceSync()` (src/theme/appearance.ts) does.
 */
export function setColorScheme(
  scheme: ColorSchemeName,
  opts?: { deferNotify?: boolean },
): void {
  setActiveColorScheme(scheme, opts);
}

// Defensive: keep twrnc's own `dark:` state right even if someone calls
// setActiveColorScheme directly.
subscribeColorScheme(() => {
  instances.light.setColorScheme('light');
  instances.dark.setColorScheme('dark');
});

export { getColorSchemeName, useColorSchemeName } from '../theme/scheme';
export { useThemeColors, getThemeColors } from '../theme/colors';

export const theme = {
  /** Scheme-aware getters — read inside render (see src/theme/colors.ts). */
  colors: themeColors,
  spacing: {
    pageX: 16,
    cardRadius: 16,
    tabBarHeight: 56,
  },
  shadows: {
    fab: {
      shadowColor: '#047857',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 6,
    },
  },
} as const;

const tw: Tw = twProxy;
export default tw;
