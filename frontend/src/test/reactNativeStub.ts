export const Platform = {
  OS: 'ios' as const,
  select: <T,>(spec: { ios?: T; android?: T; web?: T; default?: T }): T | undefined =>
    spec.ios ?? spec.default,
};

// Appearance / hooks used by src/theme/appearance.ts and twrnc's hooks module.
export const Appearance = {
  getColorScheme: (): 'light' | 'dark' | null => 'light',
  addChangeListener: (_cb: (p: { colorScheme: 'light' | 'dark' | null }) => void) => ({
    remove: () => undefined,
  }),
};
export const useColorScheme = () => 'light' as const;
export const useWindowDimensions = () => ({ width: 390, height: 844, scale: 3, fontScale: 1 });
