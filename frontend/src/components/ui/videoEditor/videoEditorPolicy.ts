/** Native Edit must not create an AVPlayer on open — that SIGABRTs with the preview player. */
export function shouldMountNativePlayer(userPressedPlay: boolean): boolean {
  return userPressedPlay;
}

export function nativeEditorAutoplays(): boolean {
  return false;
}

export function nativeEditorMountsPlayerOnOpen(): boolean {
  return false;
}

export function nativeEditorLoadsAudioOnOpen(): boolean {
  return false;
}

export function editorMayExtractNativeThumbnails(): boolean {
  return false;
}

/**
 * Stills are allowed only in a quiet window: no VideoView mounted,
 * sample via expo-video on a file copy, release, then a player may mount.
 * Never expo-video-thumbnails / AVAssetImageGenerator.
 */
export function nativeMayGenerateThumbnails(): boolean {
  return true;
}

export function nativeUsesAssetImageGenerator(): boolean {
  return false;
}

export function nativeComposerMountsPlayerOnOpen(): boolean {
  return false;
}

export function nativeSampleQuietMs(): number {
  return 900;
}

export function nativeThumbnailReleaseMs(): number {
  return 700;
}

export function nativeComposerArmMs(): number {
  return 200;
}

/** Reels viewer / feed: one player. Neighbors and thumbs must not mount Video. */
export function nativeViewerSinglePlayer(): boolean {
  return true;
}

/** Native Reels must not create a player until the user taps play. */
export function nativeViewerRequiresTap(): boolean {
  return true;
}

export function nativeViewerUsesExpoVideo(): boolean {
  return true;
}

export function nativeViewerPlayerArmMs(): number {
  return 0;
}

export function nativeFeedUnmountsPlayersWhenBlurred(): boolean {
  return true;
}

export function nativeFeedMountsVideoPlayer(): boolean {
  return false;
}

export function nativePlayerSeeksFromStatus(): boolean {
  return false;
}

export function nativePlayerSetsAudioModeOnPlay(): boolean {
  return false;
}

export function nativeEditorOpenMs(): number {
  return 180;
}

export function nativePublishUnloadMs(): number {
  return 80;
}

export function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
