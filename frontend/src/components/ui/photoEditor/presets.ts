import type { FilterCategory, FilterPreset } from './types';

export const FILTER_CATEGORIES: { id: FilterCategory; label: string }[] = [
  { id: 'natural', label: 'Natural' },
  { id: 'portrait', label: 'Portrait' },
  { id: 'film', label: 'Film' },
  { id: 'moody', label: 'Moody' },
  { id: 'bw', label: 'B&W' },
  { id: 'social', label: 'Social' },
];

export const FILTER_PRESETS: FilterPreset[] = [
  { id: 'original', label: 'Original', category: 'natural', deltas: {} },

  // Natural
  { id: 'natural_soft', label: 'Soft', category: 'natural', deltas: { brightness: 8, contrast: -10, saturation: -6, fade: 10, clarity: -10, highlights: 6 } },
  { id: 'natural_clean', label: 'Clean', category: 'natural', deltas: { contrast: 14, saturation: 6, sharpen: 14, clarity: 10, shadows: 8, highlights: -6 } },
  { id: 'natural_crisp', label: 'Crisp', category: 'natural', deltas: { contrast: 22, saturation: 10, sharpen: 22, brightness: 4, clarity: 16, highlights: -4 } },
  { id: 'natural_airy', label: 'Airy', category: 'natural', deltas: { exposure: 14, brightness: 10, contrast: -14, fade: 16, saturation: -8, highlights: 12, shadows: 14 } },
  { id: 'natural_pro', label: 'Print', category: 'natural', deltas: { exposure: 4, contrast: 12, saturation: 6, shadows: 12, highlights: -10, clarity: 12, sharpen: 8 } },
  { id: 'natural_true', label: 'True', category: 'natural', deltas: { contrast: 8, saturation: -4, clarity: 6, shadows: 6, highlights: -4 } },

  // Portrait
  { id: 'portrait_glow', label: 'Glow', category: 'portrait', deltas: { warmth: 14, brightness: 8, contrast: -6, saturation: 6, fade: 6, shadows: 10, clarity: -6 } },
  { id: 'portrait_skin', label: 'Skin Soft', category: 'portrait', deltas: { warmth: 10, brightness: 5, contrast: -10, saturation: -6, sharpen: -8, clarity: -12, highlights: -4 } },
  { id: 'portrait_rosy', label: 'Rosy', category: 'portrait', deltas: { warmth: 18, tint: 8, saturation: 10, contrast: -4, shadows: 6 } },
  { id: 'portrait_golden', label: 'Golden Hour', category: 'portrait', deltas: { warmth: 22, exposure: 8, saturation: 12, contrast: 6, vignette: 12, highlights: -6 } },
  { id: 'portrait_studio', label: 'Studio', category: 'portrait', deltas: { contrast: 12, clarity: 8, shadows: 14, highlights: -10, saturation: -4, sharpen: 8 } },

  // Film
  { id: 'film_portra', label: 'Portra', category: 'film', deltas: { warmth: 16, fade: 12, contrast: -8, saturation: -4, grain: 16, shadows: 10, highlights: -4 } },
  { id: 'film_fuji', label: 'Fuji', category: 'film', deltas: { hue: -12, saturation: 14, contrast: 10, warmth: 8, grain: 12, clarity: 8 } },
  { id: 'film_kodak', label: 'Kodak', category: 'film', deltas: { warmth: 20, contrast: 14, saturation: 16, fade: 6, grain: 18, highlights: -6 } },
  { id: 'film_cine', label: 'Cine', category: 'film', deltas: { contrast: 22, saturation: -12, warmth: 10, vignette: 24, fade: 8, grain: 14, highlights: -14, shadows: 10, cinematic: 18 } },
  { id: 'film_noir', label: 'Noir', category: 'film', deltas: { grayscale: 100, contrast: 30, vignette: 32, fade: 10, grain: 22, highlights: -10 } },
  { id: 'film_superia', label: 'Superia', category: 'film', deltas: { hue: 8, saturation: 12, contrast: 8, warmth: 6, grain: 14, shadows: 8 } },

  // Moody
  { id: 'moody_ember', label: 'Ember', category: 'moody', deltas: { warmth: 24, contrast: 18, saturation: -10, vignette: 20, exposure: -8, highlights: -12 } },
  { id: 'moody_midnight', label: 'Midnight', category: 'moody', deltas: { exposure: -16, contrast: 24, saturation: -20, tint: -12, vignette: 30, shadows: -6 } },
  { id: 'moody_forest', label: 'Forest', category: 'moody', deltas: { hue: -22, saturation: -6, contrast: 16, exposure: -8, vignette: 18, clarity: 10 } },
  { id: 'moody_slate', label: 'Slate', category: 'moody', deltas: { saturation: -26, contrast: 12, brightness: -6, tint: -8, fade: 12, clarity: 8 } },
  { id: 'moody_copper', label: 'Copper', category: 'moody', deltas: { warmth: 28, hue: 10, contrast: 14, saturation: -8, vignette: 16, highlights: -8 } },

  // B&W
  { id: 'bw_classic', label: 'Classic', category: 'bw', deltas: { grayscale: 100, contrast: 8 } },
  { id: 'bw_silver', label: 'Silver', category: 'bw', deltas: { grayscale: 100, contrast: 18, brightness: 6, sharpen: 10, clarity: 8 } },
  { id: 'bw_high', label: 'High Contrast', category: 'bw', deltas: { grayscale: 100, contrast: 32, sharpen: 16, vignette: 10, highlights: -8, shadows: -6 } },
  { id: 'bw_matte', label: 'Matte', category: 'bw', deltas: { grayscale: 100, contrast: -8, fade: 20, brightness: 4, shadows: 10 } },

  // Social
  { id: 'social_pop', label: 'Pop', category: 'social', deltas: { saturation: 28, contrast: 14, sharpen: 14, brightness: 6, clarity: 10 } },
  { id: 'social_punch', label: 'Punch', category: 'social', deltas: { saturation: 35, contrast: 22, exposure: 8, warmth: 8, clarity: 12 } },
  { id: 'social_fade', label: 'Fade', category: 'social', deltas: { fade: 28, saturation: -10, contrast: -8, warmth: 6, highlights: 8 } },
  { id: 'social_retro', label: 'Retro', category: 'social', deltas: { sepia: 35, fade: 18, contrast: 10, grain: 22, vignette: 14 } },
];

export function getPresetById(id: string): FilterPreset | undefined {
  return FILTER_PRESETS.find((p) => p.id === id);
}

export function getPresetsForCategory(category: FilterCategory): FilterPreset[] {
  return FILTER_PRESETS.filter((p) => p.category === category || p.id === 'original');
}
