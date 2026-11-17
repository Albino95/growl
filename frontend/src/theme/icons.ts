/**
 * Icon size scale. Prefer these over raw numbers for Ionicons / vector icons.
 * xs: inline meta (chips, captions) · sm: list rows, buttons · md: headers, tab bar · lg: empty/error states.
 */
export const iconSize = {
  xs: 14,
  sm: 18,
  md: 22,
  lg: 28,
} as const;

export type IconSize = keyof typeof iconSize;
