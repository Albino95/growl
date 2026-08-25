export type EditorTab = 'looks' | 'adjust' | 'crop' | 'tools' | 'overlay';

export type FilterCategory = 'natural' | 'portrait' | 'film' | 'moody' | 'bw' | 'social';

export type CropAspect = 'free' | '1:1' | '4:5' | '16:9' | '9:16' | '3:2' | '2:3';

export type TextOverlayStyle =
  | 'plain'
  | 'bold'
  | 'outline'
  | 'pill'
  | 'neon'
  | 'shadow'
  | 'banner';

export type TextAlign = 'left' | 'center' | 'right';

export interface TextOverlay {
  id: string;
  text: string;
  /** Normalized center X (0–1). */
  x: number;
  /** Normalized center Y (0–1). */
  y: number;
  color: string;
  style: TextOverlayStyle;
  /** Relative size multiplier (0.7–1.8). */
  scale: number;
  align?: TextAlign;
}

export interface EditAdjustments {
  exposure: number;
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  tint: number;
  fade: number;
  vignette: number;
  sharpen: number;
  grain: number;
  hue: number;
  sepia: number;
  grayscale: number;
  /** Lift bright regions (−40…40). */
  highlights: number;
  /** Lift / crush dark regions (−40…40). */
  shadows: number;
  /** Midtone local contrast (−40…40). */
  clarity: number;
  /** Soft cinematic edge darken for vertical clips (0–50). */
  cinematic: number;
}

export const DEFAULT_ADJUSTMENTS: EditAdjustments = {
  exposure: 0,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  tint: 0,
  fade: 0,
  vignette: 0,
  sharpen: 0,
  grain: 0,
  hue: 0,
  sepia: 0,
  grayscale: 0,
  highlights: 0,
  shadows: 0,
  clarity: 0,
  cinematic: 0,
};

export const TEXT_COLORS = [
  '#FFFFFF',
  '#F8FAFC',
  '#FBBF24',
  '#F59E0B',
  '#34D399',
  '#10B981',
  '#38BDF8',
  '#818CF8',
  '#F472B6',
  '#FB7185',
  '#000000',
  '#1C1917',
] as const;

export const TEXT_QUICK_PHRASES = [
  'GROW',
  'Day 1',
  'Still going',
  'Progress > Perfect',
  'Small wins',
  'Show up',
  'Focus mode',
  'Grateful',
  'One more rep',
  'New chapter',
  'Becoming',
  'Lets grow',
] as const;

export interface FilterPreset {
  id: string;
  label: string;
  category: FilterCategory;
  /** Partial deltas applied on top of defaults (not multipliers). */
  deltas: Partial<EditAdjustments>;
}

export interface PhotoEditorProps {
  imageUri: string;
  onSave: (editedUri: string) => void;
  onCancel: () => void;
  /** Optional title in the header (default: Edit Photo). */
  title?: string;
  /** Prefer a crop aspect when opening the Crop tab (e.g. stories → 9:16). */
  preferredAspect?: CropAspect;
  /** Show text / cinematic overlay tools (default true). */
  enableOverlays?: boolean;
}
