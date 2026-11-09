import { Image as RNImage, Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

type ImageUploadPurpose = 'post' | 'product' | 'story' | 'avatar' | 'reel';

/** Long-edge caps. Feed/stories stay sharp on a phone; avatars can be smaller. */
const MAX_EDGE: Record<ImageUploadPurpose, number> = {
  avatar: 720,
  story: 1440,
  post: 1600,
  product: 1400,
  reel: 1600,
};

const COMPRESS: Record<ImageUploadPurpose, number> = {
  avatar: 0.72,
  story: 0.74,
  post: 0.74,
  product: 0.76,
  reel: 0.74,
};

/**
 * iOS stacked modals + UIImagePicker page-sheet = parent composer dismissed
 * when the picker closes. Present the picker over the current context instead.
 */
function iosPickerChrome(
  representation: 'current' | 'automatic' = 'automatic'
): Partial<ImagePicker.ImagePickerOptions> {
  if (Platform.OS !== 'ios') return {};
  const Style = ImagePicker.UIImagePickerPresentationStyle;
  const Mode = ImagePicker.UIImagePickerPreferredAssetRepresentationMode;
  const presentationStyle =
    Style?.OVER_FULL_SCREEN ?? Style?.FULL_SCREEN ?? undefined;
  const preferredAssetRepresentationMode =
    representation === 'current'
      ? Mode?.Current ?? Mode?.Automatic
      : Mode?.Automatic ?? Mode?.Compatible;
  return {
    ...(preferredAssetRepresentationMode != null
      ? { preferredAssetRepresentationMode }
      : {}),
    ...(presentationStyle != null ? { presentationStyle } : {}),
  };
}

export const FAST_IMAGE_PICKER: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: false,
  quality: 0.72,
  allowsMultipleSelection: false,
  exif: false,
  base64: false,
  ...iosPickerChrome('current'),
};

/**
 * Library pickers must not set videoMaxDuration — that switches iOS to
 * UIImagePickerController, which dismisses the composer and returns canceled.
 * Trim long clips in VideoEditor instead.
 * Automatic representation so videos actually export (Current can hang on HEVC).
 */
export const FAST_STORY_PICKER: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images', 'videos'],
  allowsEditing: false,
  quality: 0.72,
  allowsMultipleSelection: false,
  exif: false,
  base64: false,
  ...iosPickerChrome('automatic'),
};

export const FAST_REEL_PICKER: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images', 'videos'],
  allowsEditing: false,
  quality: 0.72,
  allowsMultipleSelection: false,
  exif: false,
  base64: false,
  ...iosPickerChrome('automatic'),
};

export const FAST_CAMERA: ImagePicker.ImagePickerOptions = {
  allowsEditing: false,
  quality: 0.72,
  exif: false,
  base64: false,
  ...iosPickerChrome('current'),
};

export const FAST_STORY_CAMERA: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images', 'videos'],
  allowsEditing: false,
  quality: 0.72,
  videoMaxDuration: 30,
  exif: false,
  base64: false,
  ...iosPickerChrome('automatic'),
};

function probeSize(uri: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    RNImage.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve(null)
    );
  });
}

/**
 * Resize + JPEG-encode before upload. A 12MP iPhone still is ~4–8MB;
 * this lands around 200–450KB so the Worker/R2 hop is seconds, not tens.
 */
export async function prepareImageForUpload(
  uri: string,
  purpose: ImageUploadPurpose = 'post'
): Promise<string> {
  if (!uri || uri.startsWith('http://') || uri.startsWith('https://')) return uri;

  const maxEdge = MAX_EDGE[purpose] || 1600;
  const compress = COMPRESS[purpose] || 0.74;
  const size = await probeSize(uri);
  const actions: ImageManipulator.Action[] = [];

  if (size) {
    const longEdge = Math.max(size.width, size.height);
    if (longEdge > maxEdge) {
      const scale = maxEdge / longEdge;
      actions.push({
        resize: {
          width: Math.max(1, Math.round(size.width * scale)),
          height: Math.max(1, Math.round(size.height * scale)),
        },
      });
    }
  }

  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return result.uri;
}
