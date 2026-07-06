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
  { id: 'natural_soft', label: 'Soft', category: 'natural', deltas: { brightness: 6, contrast: -8, saturation: -5, fade: 8 } },
  { id: 'natural_clean', label: 'Clean', category: 'natural', deltas: { contrast: 10, saturation: 5, sharpen: 12 } },
  { id: 'natural_crisp', label: 'Crisp', category: 'natural', deltas: { contrast: 18, saturation: 8, sharpen: 20, brightness: 4 } },
  { id: 'natural_airy', label: 'Airy', category: 'natural', deltas: { exposure: 12, brightness: 10, contrast: -12, fade: 14, saturation: -8 } },

  // Portrait
  { id: 'portrait_glow', label: 'Glow', category: 'portrait', deltas: { warmth: 14, brightness: 8, contrast: -6, saturation: 6, fade: 6 } },
  { id: 'portrait_skin', label: 'Skin Soft', category: 'portrait', deltas: { warmth: 10, brightness: 5, contrast: -10, saturation: -6, sharpen: -8 } },
  { id: 'portrait_rosy', label: 'Rosy', category: 'portrait', deltas: { warmth: 18, tint: 8, saturation: 10, contrast: -4 } },
  { id: 'portrait_golden', label: 'Golden Hour', category: 'portrait', deltas: { warmth: 22, exposure: 8, saturation: 12, contrast: 6, vignette: 12 } },

  // Film
  { id: 'film_portra', label: 'Portra', category: 'film', deltas: { warmth: 12, fade: 10, contrast: -6, saturation: -4, grain: 18 } },
  { id: 'film_fuji', label: 'Fuji', category: 'film', deltas: { hue: -8, saturation: 10, contrast: 8, warmth: 6, grain: 14 } },
  { id: 'film_kodak', label: 'Kodak', category: 'film', deltas: { warmth: 16, contrast: 12, saturation: 14, fade: 6, grain: 20 } },
  { id: 'film_cine', label: 'Cinematic', category: 'film', deltas: { contrast: 20, saturation: -10, warmth: 8, vignette: 22, fade: 8, grain: 16 } },
  { id: 'film_noir', label: 'Noir', category: 'film', deltas: { grayscale: 80, contrast: 28, vignette: 30, fade: 12, grain: 24 } },

  // Moody
  { id: 'moody_ember', label: 'Ember', category: 'moody', deltas: { warmth: 20, contrast: 16, saturation: -12, vignette: 18, exposure: -6 } },
  { id: 'moody_midnight', label: 'Midnight', category: 'moody', deltas: { exposure: -14, contrast: 22, saturation: -18, tint: -10, vignette: 28 } },
  { id: 'moody_forest', label: 'Forest', category: 'moody', deltas: { hue: -18, saturation: -8, contrast: 14, exposure: -8, vignette: 16 } },
  { id: 'moody_slate', label: 'Slate', category: 'moody', deltas: { saturation: -22, contrast: 10, brightness: -6, tint: -6, fade: 10 } },

  // B&W
  { id: 'bw_classic', label: 'Classic', category: 'bw', deltas: { grayscale: 100, contrast: 8 } },
  { id: 'bw_silver', label: 'Silver', category: 'bw', deltas: { grayscale: 100, contrast: 18, brightness: 6, sharpen: 10 } },
  { id: 'bw_high', label: 'High Contrast', category: 'bw', deltas: { grayscale: 100, contrast: 32, sharpen: 16, vignette: 10 } },
  { id: 'bw_matte', label: 'Matte', category: 'bw', deltas: { grayscale: 100, contrast: -8, fade: 20, brightness: 4 } },

  // Social
  { id: 'social_pop', label: 'Pop', category: 'social', deltas: { saturation: 28, contrast: 14, sharpen: 14, brightness: 6 } },
  { id: 'social_punch', label: 'Punch', category: 'social', deltas: { saturation: 35, contrast: 22, exposure: 8, warmth: 8 } },
  { id: 'social_fade', label: 'Fade', category: 'social', deltas: { fade: 28, saturation: -10, contrast: -8, warmth: 6 } },
  { id: 'social_retro', label: 'Retro', category: 'social', deltas: { sepia: 35, fade: 18, contrast: 10, grain: 22, vignette: 14 } },
];

export function getPresetById(id: string): FilterPreset | undefined {
  return FILTER_PRESETS.find((p) => p.id === id);
}

export function getPresetsForCategory(category: FilterCategory): FilterPreset[] {
  return FILTER_PRESETS.filter((p) => p.category === category || p.id === 'original');
}
