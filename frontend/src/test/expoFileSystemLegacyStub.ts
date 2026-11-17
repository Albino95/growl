export const cacheDirectory = 'file:///cache/';
export const documentDirectory = 'file:///docs/';

export async function getInfoAsync() {
  return { exists: false, size: 0 };
}

export async function downloadAsync() {
  return { status: 404, uri: '' };
}

export async function copyAsync({ to }: { from?: string; to?: string } = {}) {
  return to || 'file:///cache/grow-thumbs.mp4';
}

export async function deleteAsync() {
  return undefined;
}

export const EncodingType = { Base64: 'base64' };
