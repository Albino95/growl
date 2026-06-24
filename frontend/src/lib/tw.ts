import twrnc from 'twrnc';
const tw = twrnc;

export const theme = {
  colors: {
    brand: '#059669',
    brandSoft: '#ECFDF5',
    accent: '#7C3AED',
    textPrimary: '#1C1917',
    textSecondary: '#57534E',
    border: '#E7E5E4',
    page: '#F8FAFC',
    card: '#FFFFFF',
  },
  spacing: {
    pageX: 16,
    cardRadius: 16,
  },
} as const;

export default tw;
