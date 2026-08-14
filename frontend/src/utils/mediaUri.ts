import { Platform } from 'react-native';

/** Convert local/blob image URIs to a data URL for media upload. */
export async function uriToDataUrl(uri: string): Promise<string> {
  const lower = uri.toLowerCase();
  if (lower.startsWith('data:')) return uri;

  const res = await fetch(uri);
  const blob = await res.blob();

  if (Platform.OS === 'web' && typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read image'));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(blob);
    });
  }

  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read image'));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(blob);
    });
  }

  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 =
    typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
  const mime = blob.type || (lower.includes('.png') ? 'image/png' : 'image/jpeg');
  return `data:${mime};base64,${base64}`;
}

/** True when the URI is already a hosted http(s) URL. */
export function isRemoteMediaUrl(uri: string): boolean {
  const lower = (uri || '').toLowerCase();
  return lower.startsWith('http://') || lower.startsWith('https://');
}
