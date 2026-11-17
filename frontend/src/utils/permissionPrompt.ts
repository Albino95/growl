import { Linking, Platform } from 'react-native';
import { alertMessage, confirmAsync } from './confirmDialog';

export type PermissionKind = 'camera' | 'microphone' | 'photos';

const TITLES: Record<PermissionKind, string> = {
  camera: 'Camera access needed',
  microphone: 'Microphone access needed',
  photos: 'Photo library access needed',
};

/**
 * Explain a denied permission. When the OS will no longer show its own prompt
 * (`canAskAgain === false`), offer an "Open Settings" button so the user has a
 * way forward instead of a dead end.
 */
export async function showPermissionDenied(
  kind: PermissionKind,
  options: { canAskAgain?: boolean; message: string }
): Promise<void> {
  const title = TITLES[kind];
  if (options.canAskAgain === false && Platform.OS !== 'web') {
    const open = await confirmAsync(
      title,
      `${options.message}\n\nTurn it on for Grow! in Settings.`,
      { confirmLabel: 'Open Settings', cancelLabel: 'Not now' }
    );
    if (open) {
      try {
        await Linking.openSettings();
      } catch {
        /* settings unavailable — nothing more we can do */
      }
    }
    return;
  }
  await alertMessage(title, options.message);
}
