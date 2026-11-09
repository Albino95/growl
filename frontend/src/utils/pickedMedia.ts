import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { isVideoMedia } from '../services/api/media';

export type PickedKind = 'image' | 'video';

export type PickedMedia = {
  uri: string;
  kind: PickedKind;
  mimeType?: string;
  durationMs: number;
};

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(fallback);
      }
    }, ms);
    promise
      .then((v) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(v);
        }
      })
      .catch(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(fallback);
        }
      });
  });
}

/** iOS PHPicker video URIs often have no extension and no mime — duration is the signal. */
export function kindFromPickerAsset(asset: ImagePicker.ImagePickerAsset): PickedKind {
  if (typeof asset.duration === 'number' && asset.duration > 0) return 'video';
  const type = (asset.type || '').toLowerCase();
  if (type === 'video' || type === 'pairedVideo') return 'video';
  const mime = (asset.mimeType || '').toLowerCase();
  if (mime.startsWith('video/')) return 'video';
  const name = `${asset.fileName || ''} ${asset.uri || ''}`.toLowerCase();
  if (/\.(mp4|mov|m4v|webm)(\?|$)/i.test(name)) return 'video';
  if (isVideoMedia({ uri: asset.uri, contentType: mime })) return 'video';
  if (type === 'image' || type === 'livePhoto') return 'image';
  return 'image';
}

/** ImagePicker duration is seconds on some iOS builds and milliseconds on others. */
export function normalizeMediaDurationMs(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  if (raw <= 180) return Math.round(raw * 1000);
  return Math.round(raw);
}

export function pickedFromAsset(asset: ImagePicker.ImagePickerAsset): PickedMedia {
  return {
    uri: asset.uri,
    kind: kindFromPickerAsset(asset),
    mimeType: asset.mimeType || undefined,
    durationMs:
      typeof asset.duration === 'number' && asset.duration > 0
        ? normalizeMediaDurationMs(asset.duration)
        : 0,
  };
}

function extFor(kind: PickedKind, uri: string, mime?: string): string {
  const lower = `${uri} ${mime || ''}`.toLowerCase();
  if (kind === 'video') {
    if (lower.includes('webm')) return 'webm';
    if (lower.includes('quicktime') || lower.includes('.mov')) return 'mov';
    return 'mp4';
  }
  if (lower.includes('png')) return 'png';
  return 'jpg';
}

function needsCopy(uri: string): boolean {
  const u = (uri || '').toLowerCase();
  if (!u) return false;
  if (u.startsWith('ph://') || u.startsWith('ph-upload://')) return true;
  if (u.startsWith('assets-library://') || u.startsWith('content://')) return true;
  return false;
}

/**
 * Copy picker URIs that vanish after PHPicker closes (ph://).
 * Never copy file:// videos — a 100MB copy with no UI looks like “nothing happened”.
 */
export async function persistPickerAsset(
  asset: ImagePicker.ImagePickerAsset
): Promise<PickedMedia> {
  const picked = pickedFromAsset(asset);
  let uri = picked.uri;

  if (
    uri &&
    Platform.OS !== 'web' &&
    needsCopy(uri)
  ) {
    try {
      const FileSystem = await import('expo-file-system/legacy');
      const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      if (dir) {
        const dest = `${dir}grow-pick-${Date.now()}.${extFor(picked.kind, uri, picked.mimeType)}`;
        const copied = await withTimeout(
          FileSystem.copyAsync({ from: uri, to: dest }).then(() => dest),
          8000,
          uri
        );
        uri = copied;
      }
    } catch {
      /* keep picker URI */
    }
  }

  return { ...picked, uri };
}
