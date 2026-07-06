export type EditorTab = 'presets' | 'adjust' | 'crop' | 'transform';

export type FilterCategory = 'natural' | 'portrait' | 'film' | 'moody' | 'bw' | 'social';

export type CropAspect = 'free' | '1:1' | '4:5' | '16:9' | '9:16';

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
};

export interface FilterPreset {
  id: string;
  label: string;
  category: FilterCategory;
  /** Partial deltas applied on top of defaults (not multipliers). */
  deltas: Partial<EditAdjustments>;
}

export interface EffectiveEdit {
  adjustments: EditAdjustments;
  presetId: string | null;
}

export interface PhotoEditorProps {
  imageUri: string;
  onSave: (editedUri: string) => void;
  onCancel: () => void;
}
