/**
 * Grow! design tokens — spacing, radius, type.
 *
 * Every token has a tw utility (defined in tailwind.config.js, both schemes)
 * and a numeric export below for style objects / Animated values.
 *
 * ── Migration rules (phase 2) ────────────────────────────────────────────
 * Radius
 *   rounded-full                → rounded-chip     (pills, avatars, chips)
 *   rounded-lg / rounded-xl     → rounded-control  (12: buttons, inputs, small tiles)
 *   rounded-2xl                 → rounded-card     (16: cards, list groups)
 *   rounded-3xl                 → rounded-sheet    (24: dialogs, bottom sheets)
 *   rounded-[28px]/[32px]       → rounded-hero     (28: hero / media cards)
 * Spacing
 *   px-4 (screen edge)          → px-gutter        (16)
 *   px-5 (wide/editorial edge)  → px-gutter-wide   (20)
 *   gaps                        → gap-2 / gap-3 / gap-4 / gap-6 (8/12/16/24 — keep stock)
 * Type (size + line height; add the weight shown)
 *   text-[11px] / text-xs meta  → text-caption            (11/14, semibold for labels)
 *   text-xs / text-[13px]       → text-footnote           (13/18, regular)
 *   text-sm / text-[15px]       → text-body               (15/22, regular)
 *   text-base / text-lg         → text-callout            (17/24, semibold)
 *   text-xl / text-2xl titles   → text-title font-bold    (22/28)
 *   text-3xl hero numbers       → text-display font-extrabold (28/34)
 * Colour (see src/theme/palette.ts)
 *   bg-white / bg-[#FFFcf7] / bg-surface-card → bg-card
 *   bg-surface-page / bg-[#F3EEE4]            → bg-page
 *   bg-stone-100 / bg-surface-subtle / bg-[#EAE4D6] → bg-raised
 *   text-stone-900 → text-ink · text-stone-600/700 → text-ink-2 · text-stone-500 → text-ink-3
 *   border-stone-200 / border-surface-border  → border-line
 *   bg-stone-900 + text-white (inverse chips/buttons) → bg-ink + text-page
 *   Keep text-white on emerald fills (bg-emerald-600 / bg-brand-600) and on photo overlays.
 * ─────────────────────────────────────────────────────────────────────────
 */

export const spacing = {
  /** Screen edge padding — px-gutter */
  gutter: 16,
  /** Editorial / wide edge padding — px-gutter-wide */
  gutterWide: 20,
  gap: { xs: 8, sm: 12, md: 16, lg: 24 },
} as const;

export const radius = {
  chip: 9999,
  control: 12,
  card: 16,
  sheet: 24,
  hero: 28,
} as const;

export type TypeStep = 'caption' | 'footnote' | 'body' | 'callout' | 'title' | 'display';

export const type: Record<
  TypeStep,
  { fontSize: number; lineHeight: number; fontWeight: '400' | '600' | '700' | '800' }
> = {
  caption: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  callout: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  display: { fontSize: 28, lineHeight: 34, fontWeight: '800' },
};

/**
 * Tailwind `theme.extend` fragments — consumed by tailwind.config.js via
 * plain values (it is CommonJS and cannot import TS); `tokens.test.ts`
 * asserts the two stay in sync.
 */
export const twExtend = {
  spacing: { gutter: `${spacing.gutter}px`, 'gutter-wide': `${spacing.gutterWide}px` },
  borderRadius: Object.fromEntries(
    Object.entries(radius).map(([k, v]) => [k, `${v}px`]),
  ) as Record<keyof typeof radius, string>,
  fontSize: Object.fromEntries(
    Object.entries(type).map(([k, v]) => [k, [`${v.fontSize}px`, { lineHeight: `${v.lineHeight}px` }]]),
  ) as Record<TypeStep, [string, { lineHeight: string }]>,
};
