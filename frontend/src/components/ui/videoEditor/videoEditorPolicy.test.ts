import { describe, expect, it } from 'vitest';
import {
  editorMayExtractNativeThumbnails,
  nativeComposerArmMs,
  nativeComposerMountsPlayerOnOpen,
  nativeFeedMountsVideoPlayer,
  nativeFeedUnmountsPlayersWhenBlurred,
  nativePlayerSeeksFromStatus,
  nativePlayerSetsAudioModeOnPlay,
  nativeViewerPlayerArmMs,
  nativeViewerRequiresTap,
  nativeViewerSinglePlayer,
  nativeViewerUsesExpoVideo,
  nativeEditorAutoplays,
  nativeEditorLoadsAudioOnOpen,
  nativeEditorMountsPlayerOnOpen,
  nativeEditorOpenMs,
  nativeMayGenerateThumbnails,
  nativeUsesAssetImageGenerator,
  nativePublishUnloadMs,
  nativeSampleQuietMs,
  nativeThumbnailReleaseMs,
  shouldMountNativePlayer,
} from './videoEditorPolicy';
import { VIDEO_LOOKS, normalizeVideoEdit } from './types';

describe('native Edit playback policy', () => {
  it('does not mount the expo-video player until the user taps Play', () => {
    expect(nativeEditorMountsPlayerOnOpen()).toBe(false);
    expect(shouldMountNativePlayer(false)).toBe(false);
    expect(shouldMountNativePlayer(true)).toBe(true);
  });

  it('does not autoplay when Edit opens', () => {
    expect(nativeEditorAutoplays()).toBe(false);
  });

  it('does not create a soundtrack AVPlayer on open', () => {
    expect(nativeEditorLoadsAudioOnOpen()).toBe(false);
  });

  it('never samples AVAssetImageGenerator thumbnails inside the editor', () => {
    expect(editorMayExtractNativeThumbnails()).toBe(false);
  });

  it('samples stills only in a quiet window, never inside the editor', () => {
    expect(nativeMayGenerateThumbnails()).toBe(true);
    expect(nativeUsesAssetImageGenerator()).toBe(false);
    expect(editorMayExtractNativeThumbnails()).toBe(false);
    expect(nativeSampleQuietMs()).toBeGreaterThanOrEqual(700);
    expect(nativeThumbnailReleaseMs()).toBeGreaterThanOrEqual(500);
  });

  it('does not auto-mount a composer player; unloads before edit/publish', () => {
    expect(nativeComposerMountsPlayerOnOpen()).toBe(false);
    expect(nativeComposerArmMs()).toBeGreaterThanOrEqual(150);
    expect(nativeEditorOpenMs()).toBeGreaterThanOrEqual(0);
    expect(nativePublishUnloadMs()).toBeGreaterThanOrEqual(0);
  });

  it('keeps a single expo-video player in Reels and waits for a tap before loading', () => {
    expect(nativeViewerSinglePlayer()).toBe(true);
    expect(nativeViewerUsesExpoVideo()).toBe(true);
    expect(nativeViewerRequiresTap()).toBe(true);
    expect(nativeFeedUnmountsPlayersWhenBlurred()).toBe(true);
    expect(nativeFeedMountsVideoPlayer()).toBe(false);
    expect(nativePlayerSeeksFromStatus()).toBe(false);
    expect(nativePlayerSetsAudioModeOnPlay()).toBe(false);
    expect(nativeViewerPlayerArmMs()).toBe(0);
  });
});

describe('normalizeVideoEdit keeps trim and looks', () => {
  it('keeps trimEnd 0 as full-clip', () => {
    const edit = normalizeVideoEdit({ trimStartMs: 0, trimEndMs: 0 });
    expect(edit.trimStartMs).toBe(0);
    expect(edit.trimEndMs).toBe(0);
  });

  it('preserves trim window, cover, speed, and look', () => {
    const edit = normalizeVideoEdit({
      trimStartMs: 800,
      trimEndMs: 5200,
      coverMs: 1200,
      speed: 1.5,
      lookId: 'cinema',
      filterPresetId: 'film',
    });
    expect(edit.trimStartMs).toBe(800);
    expect(edit.trimEndMs).toBe(5200);
    expect(edit.coverMs).toBe(1200);
    expect(edit.speed).toBe(1.5);
    expect(edit.lookId).toBe('cinema');
    expect(edit.filterPresetId).toBe('film');
  });

  it('exposes cinematic grades for the Looks tab', () => {
    const ids = VIDEO_LOOKS.map((l) => l.id);
    expect(ids).toEqual(
      expect.arrayContaining(['none', 'golden', 'cinema', 'noir', 'vivid'])
    );
    expect(VIDEO_LOOKS.every((l) => l.label && l.swatch)).toBe(true);
  });
});
