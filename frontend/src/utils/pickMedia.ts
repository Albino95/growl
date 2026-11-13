import * as ImagePicker from 'expo-image-picker';
import { alertMessage } from './confirmDialog';
import { showPermissionDenied } from './permissionPrompt';
import { hushNativeAudio } from './interactionFeedback';
import { persistPickerAsset, pickedFromAsset, type PickedMedia } from './pickedMedia';

export type PickSource = 'library' | 'camera';

export type PickMediaOptions = {
  /** expo-image-picker options for this source (FAST_* presets). */
  pickerOptions: ImagePicker.ImagePickerOptions;
  /** What the user is making — used in the permission copy ("a post"). */
  noun: string;
  /** Called once an asset came back, before the (possibly slow) persist copy. */
  onAsset?: () => void;
};

/**
 * Permission → picker/camera → persist (ph:// copies), with one set of copy for
 * every create flow. Resolves the picked media, or null when the user denied
 * access, cancelled, or the picker failed (already explained to the user).
 */
export async function pickMedia(
  source: PickSource,
  { pickerOptions, noun, onAsset }: PickMediaOptions
): Promise<PickedMedia | null> {
  try {
    const perm =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      await showPermissionDenied(source === 'camera' ? 'camera' : 'photos', {
        canAskAgain: perm.canAskAgain,
        message:
          source === 'camera'
            ? `Allow camera access to create ${noun}.`
            : `Allow photo library access to create ${noun}.`,
      });
      return null;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(pickerOptions)
        : await ImagePicker.launchImageLibraryAsync(pickerOptions);
    hushNativeAudio(1800);
    const asset = !result.canceled ? result.assets?.[0] : undefined;
    if (!asset) return null;

    onAsset?.();
    try {
      return await persistPickerAsset(asset);
    } catch {
      // Copy failed — the picker URI still works for this session.
      return pickedFromAsset(asset);
    }
  } catch (err: unknown) {
    const detail = err instanceof Error && err.message ? `${err.message}\n\n` : '';
    if (source === 'camera') {
      await alertMessage('Camera unavailable', `${detail}Use your library instead, or try again.`);
    } else {
      await alertMessage(
        'Could not add media',
        `${detail}Try another photo or clip, or use the camera.`
      );
    }
    return null;
  }
}
