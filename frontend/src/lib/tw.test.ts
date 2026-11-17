import { afterEach, describe, expect, it, vi } from 'vitest';
import tw, { setColorScheme, theme, getColorSchemeName } from './tw';
import { subscribeColorScheme } from '../theme/scheme';
import { SEMANTIC, THEME_COLORS } from '../theme/palette';

vi.mock('../services/storage/secureStore', () => ({
  getSecureItem: vi.fn(async () => null),
  setSecureItem: vi.fn(async () => undefined),
  deleteSecureItem: vi.fn(async () => undefined),
}));
const { resolveAppearance } = await import('../theme/appearance');

afterEach(() => setColorScheme('light'));

describe('scheme-aware tw', () => {
  it('starts light and resolves semantic tokens', () => {
    expect(getColorSchemeName()).toBe('light');
    expect(tw`bg-card`).toEqual({ backgroundColor: '#FFFCF7' });
    expect(tw`text-ink-2`).toEqual({ color: '#57534E' });
    expect(tw`bg-surface-page`).toEqual({ backgroundColor: '#F3EEE4' });
  });

  it('switches the active instance for template tag, style() and color()', () => {
    setColorScheme('dark');
    expect(tw`bg-card`).toEqual({ backgroundColor: '#1D1A17' });
    expect(tw.style('bg-page', 'text-ink')).toEqual({ backgroundColor: '#141210', color: '#F5F1EA' });
    expect(tw.color('stone-900')).toBe('#F5F1EA');
    expect(tw`text-stone-500`).toEqual({ color: '#A39A8F' });
    expect(tw`bg-emerald-50`).toEqual({ backgroundColor: '#0F2A20' });
    // Fills, white and black are unchanged.
    expect(tw`bg-emerald-600 text-white`).toEqual({ backgroundColor: '#059669', color: '#fff' });
    setColorScheme('light');
    expect(tw.color('stone-900')).toBe('#1c1917');
    expect(tw`bg-card`).toEqual({ backgroundColor: '#FFFCF7' });
  });

  it('keeps opacity modifiers working on remapped colours', () => {
    setColorScheme('dark');
    expect(tw`border-stone-200/80`).toEqual({ borderColor: 'rgba(46, 42, 38, 0.8)' });
  });

  it('exposes token utilities', () => {
    expect(tw`rounded-card`).toEqual({ borderRadius: 16 });
    expect(tw`rounded-control`).toEqual({ borderRadius: 12 });
    expect(tw`px-gutter`).toEqual({ paddingLeft: 16, paddingRight: 16 });
    expect(tw`text-body`).toEqual({ fontSize: 15, lineHeight: 22 });
    expect(tw`text-display`).toEqual({ fontSize: 28, lineHeight: 34 });
  });

  it('supports dark: variants via the instance colour scheme', () => {
    expect(tw`text-ink dark:text-white`).toEqual({ color: '#1C1917' });
    setColorScheme('dark');
    expect(tw`text-ink dark:text-white`).toEqual({ color: '#fff' });
  });

  it('notifies subscribers once per actual change', () => {
    let n = 0;
    const off = subscribeColorScheme(() => n++);
    setColorScheme('dark');
    setColorScheme('dark');
    setColorScheme('light');
    off();
    expect(n).toBe(2);
  });
});

describe('theme.colors', () => {
  it('resolves getters at access time', () => {
    expect(theme.colors.card).toBe('#FFFCF7');
    expect(theme.colors.textPrimary).toBe('#1C1917');
    setColorScheme('dark');
    expect(theme.colors.card).toBe('#1D1A17');
    expect(theme.colors.textPrimary).toBe('#F5F1EA');
    expect(theme.colors.brand).toBe('#059669');
    expect({ ...theme.colors }).toEqual(THEME_COLORS.dark);
  });

  it('has identical keys in both schemes', () => {
    expect(Object.keys(THEME_COLORS.dark).sort()).toEqual(Object.keys(THEME_COLORS.light).sort());
  });
});

describe('palette sync', () => {
  it('tailwind.config.js light semantic values match SEMANTIC.light', () => {
    setColorScheme('light');
    const s = SEMANTIC.light;
    expect(tw.color('page')).toBe(s.page);
    expect(tw.color('card')).toBe(s.card);
    expect(tw.color('raised')).toBe(s.raised);
    expect(tw.color('ink')).toBe(s.ink);
    expect(tw.color('ink-2')).toBe(s.ink2);
    expect(tw.color('ink-3')).toBe(s.ink3);
    expect(tw.color('line')).toBe(s.line);
  });
});

describe('resolveAppearance', () => {
  it('is always light until dark mode is ready', () => {
    expect(resolveAppearance('dark', 'dark', false)).toBe('light');
    expect(resolveAppearance('system', 'dark', false)).toBe('light');
  });
  it('follows pref / system when ready', () => {
    expect(resolveAppearance('system', 'dark', true)).toBe('dark');
    expect(resolveAppearance('system', null, true)).toBe('light');
    expect(resolveAppearance('light', 'dark', true)).toBe('light');
    expect(resolveAppearance('dark', 'light', true)).toBe('dark');
  });
});
