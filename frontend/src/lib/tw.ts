import { create } from 'twrnc';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tailwindConfig = require('../../tailwind.config.js');

const tw = create(tailwindConfig);

export const theme = {
  colors: {
    brand: '#059669',
    brandSoft: '#ECFDF5',
    brandMuted: '#D1FAE5',
    accent: '#7C3AED',
    accentSoft: '#EDE9FE',
    textPrimary: '#1C1917',
    textSecondary: '#57534E',
    textMuted: '#78716C',
    textSubtle: '#A8A29E',
    border: '#E7E5E4',
    page: '#F3EEE4',
    card: '#FFFcf7',
    subtle: '#EAE4D6',
    danger: '#DC2626',
    warning: '#F59E0B',
  },
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

export default tw;
