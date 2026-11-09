import { Platform } from 'react-native';

const DOWNLOAD_MS = 22000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('clip download timed out')), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((err) => {
        clearTimeout(t);
        reject(err);
      });
  });
}

export function isLocalClipUri(uri: string): boolean {
  const s = (uri || '').trim().toLowerCase();
  return (
    s.startsWith('file://') ||
    s.startsWith('content://') ||
    s.startsWith('ph://') ||
    s.startsWith('assets-library://') ||
    s.startsWith('data:')
  );
}

export function clipCacheFileName(uri: string): string {
  let h = 0;
  for (let i = 0; i < uri.length; i += 1) {
    h = (Math.imul(h, 31) + uri.charCodeAt(i)) | 0;
  }
  const lower = uri.toLowerCase();
  const ext = lower.includes('.mov')
    ? '.mov'
    : lower.includes('.webm')
      ? '.webm'
      : '.mp4';
  return `clip-${Math.abs(h).toString(16)}${ext}`;
}

/**
 * Native AVPlayer SIGABRTs on many remote /media URLs. Copy the bytes with
 * FileSystem first, then play the local file. Web keeps the original URI.
 * Returns '' when the copy fails — callers must not fall back to streaming.
 */
export async function cacheRemoteClip(uri: string): Promise<string> {
  const src = (uri || '').trim();
  if (!src) return '';
  if (Platform.OS === 'web' || isLocalClipUri(src)) return src;

  try {
    const FileSystem = await import('expo-file-system/legacy');
    const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!dir) return '';
    const dest = `${dir}${clipCacheFileName(src)}`;
    const existing = await FileSystem.getInfoAsync(dest);
    if (existing.exists && (existing.size || 0) > 1024) return dest;

    const result = await withTimeout(FileSystem.downloadAsync(src, dest), DOWNLOAD_MS);
    if (result.status !== 200 && result.status !== 206) return '';
    const written = await FileSystem.getInfoAsync(result.uri || dest);
    if (!written.exists || (written.size || 0) < 1024) return '';
    return result.uri || dest;
  } catch {
    return '';
  }
}
