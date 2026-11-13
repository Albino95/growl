/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        accent: {
          // Coral energy (unlocks / streaks) — replaces violet brand accent
          500: '#fb8a7f',
          600: '#F97066',
          700: '#e85d55',
        },
        energy: {
          50: '#FFF1F0',
          100: '#ffe4e1',
          500: '#fb8a7f',
          600: '#F97066',
          700: '#e85d55',
        },
        // Accessible text inks for cream surfaces (WCAG AA on page/card/subtle).
        // muted = stone-600 (small text on page), subtle = stone-500 (on cards).
        muted: '#57534E',
        subtle: '#78716C',
        // Leaf (emerald) text on cream — emerald-600 fails AA on #F3EEE4.
        leaf: { ink: '#047857' },
        // Bloom (coral) text — coral fills stay #F97066; text uses this darker ink.
        bloom: { ink: '#C2410C' },
        surface: {
          page: '#F3EEE4',
          card: '#FFFcf7',
          subtle: '#EAE4D6',
          border: '#e7e5e4',
        },
      },
    },
  },
  plugins: [],
};