/** Convert local/blob media URIs to a data URL for JSON upload fallback. */
export async function uriToDataUrl(uri: string, forceMime?: string): Promise<string> {
  const lower = uri.toLowerCase();
  if (lower.startsWith('data:')) {
    if (forceMime && /^data:[^;]*;base64,/i.test(uri)) {
      return uri.replace(/^data:[^;]*;base64,/i, `data:${forceMime};base64,`);
    }
    return uri;
  }

  const res = await fetch(uri);
  const blob = await res.blob();
  const mime =
    forceMime ||
    (blob.type && blob.type !== 'application/octet-stream'
      ? blob.type
      : lower.includes('.png')
        ? 'image/png'
        : lower.includes('.webp')
          ? 'image/webp'
          : lower.includes('.webm')
            ? 'video/webm'
            : lower.includes('.mov')
              ? 'video/quicktime'
              : lower.includes('.mp4') || lower.includes('video')
                ? 'video/mp4'
                : 'image/jpeg');

  const typed =
    blob.type === mime ? blob : new Blob([blob], { type: mime });

  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read media file'));
      reader.onload = () => {
        const result = String(reader.result || '');
        if (forceMime && /^data:[^;]*;base64,/i.test(result)) {
          resolve(result.replace(/^data:[^;]*;base64,/i, `data:${forceMime};base64,`));
          return;
        }
        resolve(result);
      };
      reader.readAsDataURL(typed);
    });
  }

  const buffer = await typed.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 =
    typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
  return `data:${mime};base64,${base64}`;
}

/** True when the URI is already a hosted http(s) URL. */
export function isRemoteMediaUrl(uri: string): boolean {
  const lower = (uri || '').toLowerCase();
  return lower.startsWith('http://') || lower.startsWith('https://');
}
