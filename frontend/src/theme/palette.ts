/**
 * Grow! colour palette — the single source of truth for both schemes.
 *
 *   light  "Cream"      — the shipping look (cream page, warm stone inks).
 *   dark   "Night soil" — warm near-black browns, never blue-grey.
 *
 * Two layers:
 *  1. `SEMANTIC` — role names (page, card, ink, line …). New code should use
 *     these: `bg-card`, `text-ink-2`, `border-line` in tw, or
 *     `useThemeColors().card` / `theme.colors.card` in style objects.
 *  2. `DARK_TW_COLORS` — the dark remap of the *existing* Tailwind scales
 *     (stone, emerald, brand, surface …) so today's classes such as
 *     `text-stone-900` or `bg-emerald-50` already resolve to sensible night
 *     values. Remaps keep text roles: stone-900 = ink, stone-600 = ink-2,
 *     stone-500 = ink-3, stone-100 = raised, stone-200 = line.
 *
 * Pure data (no React / RN imports) so tailwind tooling, tests and the tw
 * factory can all read it. `tailwind.config.js` duplicates the LIGHT semantic
 * values (it is plain CommonJS); `palette.test.ts` keeps them in sync.
 */

export type ColorSchemeName = 'light' | 'dark';

/** Role colours. Keys are camelCase; tw class names are in comments. */
export type SemanticColors = {
  /** bg-page — screen background */
  page: string;
  /** bg-card — cards, sheets, dialogs (replaces bg-white / bg-[#FFFcf7]) */
  card: string;
  /** bg-raised — chips, inputs, subtle fills (replaces bg-stone-100 / surface-subtle) */
  raised: string;
  /** text-ink — primary text */
  ink: string;
  /** text-ink-2 — secondary text */
  ink2: string;
  /** text-ink-3 — tertiary / meta text (still AA) */
  ink3: string;
  /** border-line — hairlines, card borders */
  line: string;
  /** Default icon tint (= ink-2) */
  icon: string;
  /** Decorative icons, chevrons, dividers — NOT for text (fails AA by design) */
  iconMuted: string;
  /** Modal / sheet scrim */
  overlay: string;
};

export const SEMANTIC: Record<ColorSchemeName, SemanticColors> = {
  light: {
    page: '#F3EEE4',
    card: '#FFFCF7',
    raised: '#EAE4D6',
    ink: '#1C1917',
    ink2: '#57534E',
    ink3: '#6B645E',
    line: '#E7E5E4',
    icon: '#57534E',
    iconMuted: '#A8A29E',
    overlay: 'rgba(0,0,0,0.45)',
  },
  dark: {
    page: '#141210',
    card: '#1D1A17',
    raised: '#26221E',
    ink: '#F5F1EA',
    ink2: '#C9C1B6',
    ink3: '#A39A8F',
    // ≈ rgba(255,255,255,0.08) over card, flattened to solid hex: twrnc's
    // `/opacity` modifier overwrites an rgba alpha, so `border-line/60` on an
    // rgba token would turn into 60% white.
    line: '#2E2A26',
    icon: '#C9C1B6',
    iconMuted: '#6F675F',
    overlay: 'rgba(0,0,0,0.6)',
  },
};

/**
 * `theme.colors` values per scheme. Same keys as the historical light-only
 * object (brand, brandSoft, textPrimary …) plus the semantic roles.
 */
export type ThemeColorValues = SemanticColors & {
  brand: string;
  brandSoft: string;
  brandMuted: string;
  energy: string;
  energySoft: string;
  accent: string;
  accentSoft: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textSubtle: string;
  placeholder: string;
  leafInk: string;
  bloomInk: string;
  border: string;
  subtle: string;
  danger: string;
  dangerSoft: string;
  warning: string;
};

export const THEME_COLORS: Record<ColorSchemeName, ThemeColorValues> = {
  light: {
    ...SEMANTIC.light,
    /** Emerald fill (buttons with white text, switches, FAB). */
    brand: '#059669',
    brandSoft: '#ECFDF5',
    brandMuted: '#D1FAE5',
    /** Coral — unlocks, streaks, milestones (not violet) */
    energy: '#F97066',
    energySoft: '#FFF1F0',
    /** @deprecated Prefer `energy` for progress; kept for rare tertiary UI */
    accent: '#F97066',
    accentSoft: '#FFF1F0',
    textPrimary: '#1C1917',
    textSecondary: '#57534E',
    textMuted: '#6B645E',
    /** Decorative only (icons, dividers) — fails AA as text on cream. */
    textSubtle: '#A8A29E',
    /** Text inputs placeholder — stone-500, readable on card/page. */
    placeholder: '#6B645E',
    /** Emerald text on cream (emerald-700). */
    leafInk: '#047857',
    /** Coral text on cream; keep `energy` for fills. */
    bloomInk: '#C2410C',
    border: '#E7E5E4',
    subtle: '#EAE4D6',
    danger: '#DC2626',
    dangerSoft: '#FEE2E2',
    warning: '#F59E0B',
  },
  dark: {
    ...SEMANTIC.dark,
    // Fills keep the brand emerald so white button labels stay legible.
    brand: '#059669',
    brandSoft: '#0F2A20',
    brandMuted: '#133526',
    energy: '#FB8A7F',
    energySoft: '#2E1916',
    accent: '#FB8A7F',
    accentSoft: '#2E1916',
    textPrimary: '#F5F1EA',
    textSecondary: '#C9C1B6',
    textMuted: '#A39A8F',
    textSubtle: '#6F675F',
    placeholder: '#A39A8F',
    leafInk: '#34D399',
    bloomInk: '#FDA48F',
    border: '#2E2A26',
    subtle: '#26221E',
    danger: '#F87171',
    dangerSoft: '#3A1A1A',
    warning: '#FBBF24',
  },
};

/**
 * Tailwind colour keys added to BOTH configs (light values live in
 * tailwind.config.js): bg-page, bg-card, bg-raised, text-ink, text-ink-2,
 * text-ink-3, border-line.
 */
export function semanticTwColors(s: SemanticColors) {
  return {
    page: s.page,
    card: s.card,
    raised: s.raised,
    ink: { DEFAULT: s.ink, 2: s.ink2, 3: s.ink3 },
    line: s.line,
  };
}

/** Emerald scale remap for night: tints go dark, inks go light, fills stay. */
const DARK_EMERALD = {
  50: '#0F2A20',
  100: '#133526',
  200: '#1A4A36',
  300: '#237A58',
  400: '#34D399',
  500: '#10B981',
  600: '#059669', // fill — white text stays on it
  700: '#34D399', // text ink (text-emerald-700 is the light-mode emerald ink)
  800: '#6EE7B7',
  900: '#A7F3D0',
  950: '#D1FAE5',
};

/**
 * Dark overrides merged over the light Tailwind config. Anything not listed
 * keeps its light value (white, black, transparent, and stock colours
 * that are rarely used).
 */
export const DARK_TW_COLORS = {
  ...semanticTwColors(SEMANTIC.dark),
  // Stone: inverted around the roles. bg-* low steps → surfaces, 200/300 →
  // borders, 400/500 → tertiary, 600/700 → secondary, 800+ → ink.
  stone: {
    50: '#1D1A17', // ≈ card (lighter than page, like stone-50 on cream)
    100: '#26221E', // raised
    200: '#2E2A26', // line (solid, so /opacity modifiers still work)
    300: '#3D3833', // stronger border / disabled fill
    400: '#8A8178', // decorative / large meta text
    500: '#A39A8F', // ink-3
    600: '#C9C1B6', // ink-2
    700: '#D6CFC5',
    800: '#E6E0D7',
    900: '#F5F1EA', // ink
    950: '#FBF8F3',
  },
  emerald: DARK_EMERALD,
  brand: DARK_EMERALD,
  accent: { 500: '#FB8A7F', 600: '#FB8A7F', 700: '#FDA48F' },
  energy: { 50: '#2E1916', 100: '#3A1F1B', 500: '#FB8A7F', 600: '#F97066', 700: '#FDA48F' },
  red: {
    50: '#2B1414',
    100: '#3A1A1A',
    200: '#5C2424',
    300: '#8F3434',
    400: '#F87171',
    500: '#EF4444',
    600: '#F87171',
    700: '#FCA5A5',
    800: '#FECACA',
    900: '#FEE2E2',
  },
  amber: {
    50: '#2A2210',
    100: '#3A2E12',
    200: '#5A4618',
    300: '#8A6A1E',
    700: '#FBBF24',
    800: '#FCD34D',
    900: '#FDE68A',
  },
  violet: { 50: '#221A33', 100: '#2C2142', 600: '#A78BFA', 700: '#C4B5FD', 800: '#DDD6FE' },
  sky: { 100: '#10293A', 800: '#BAE6FD' },
  rose: { 100: '#3A1822', 600: '#FB7185', 800: '#FECDD3' },
  blue: { 100: '#13233F', 700: '#93C5FD', 800: '#BFDBFE' },
  muted: SEMANTIC.dark.ink2,
  subtle: SEMANTIC.dark.ink3,
  leaf: { ink: '#34D399' },
  bloom: { ink: '#FDA48F' },
  surface: {
    page: SEMANTIC.dark.page,
    card: SEMANTIC.dark.card,
    subtle: SEMANTIC.dark.raised,
    border: '#2E2A26',
  },
};
