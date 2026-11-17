import { describe, expect, it, vi } from 'vitest';
import type { ImagePickerAsset } from 'expo-image-picker';

vi.mock('../services/api/media', () => ({
  isVideoMedia: ({ uri, contentType }: { uri?: string; contentType?: string }) =>
    (contentType || '').startsWith('video/') || /\.(mp4|mov|m4v|webm)/i.test(uri || ''),
}));

import { kindFromPickerAsset, normalizeMediaDurationMs, pickedFromAsset } from './pickedMedia';

function asset(partial: Partial<ImagePickerAsset>): ImagePickerAsset {
  return {
    uri: 'file://clip.mp4',
    width: 1080,
    height: 1920,
    ...partial,
  } as ImagePickerAsset;
}

describe('pickedMedia', () => {
  it('treats duration as video even when type says image', () => {
    expect(kindFromPickerAsset(asset({ type: 'image', duration: 12 }))).toBe('video');
  });

  it('normalizes iOS seconds vs millisecond durations', () => {
    expect(normalizeMediaDurationMs(12)).toBe(12000);
    expect(normalizeMediaDurationMs(12.4)).toBe(12400);
    expect(normalizeMediaDurationMs(180)).toBe(180000);
    expect(normalizeMediaDurationMs(181)).toBe(181);
    expect(normalizeMediaDurationMs(45000)).toBe(45000);
    expect(normalizeMediaDurationMs(0)).toBe(0);
  });

  it('carries duration through pickedFromAsset', () => {
    const picked = pickedFromAsset(asset({ type: 'video', duration: 8.5, mimeType: 'video/mp4' }));
    expect(picked.kind).toBe('video');
    expect(picked.durationMs).toBe(8500);
    expect(picked.mimeType).toBe('video/mp4');
  });

  it('keeps photos as photos when duration is missing', () => {
    const picked = pickedFromAsset(asset({ uri: 'file://shot.jpg', type: 'image', duration: undefined }));
    expect(picked.kind).toBe('image');
    expect(picked.durationMs).toBe(0);
  });
});
