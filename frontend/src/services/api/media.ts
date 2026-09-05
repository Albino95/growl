import { Platform } from 'react-native';
import { request, getApiBaseUrl } from './http';
import { getSecureItem } from '../storage/secureStore';
import { getToken, setToken } from '../storage/tokenManager';
import { messageFromApiError } from './apiErrors';
import { uriToDataUrl as uriToDataUrlUtil } from '../../utils/mediaUri';

export type UploadPurpose = 'post' | 'product' | 'story' | 'avatar' | 'reel';
export type MediaKind = 'image' | 'video';

type UploadMediaResponse = {
  success: boolean;
  data: {
    key: string;
    url: string;
    size: number;
    contentType: string;
    mediaType?: MediaKind;
  };
};

/** Ensure media URLs always hit the API Worker, not the marketing site. */
function normalizeUploadedMediaUrl(url: string, key?: string): string {
  try {
    const api = new URL(getApiBaseUrl());
    if (key) {
      return `${api.origin}/api/v1/media/${encodeURIComponent(key)}`;
    }
    const u = new URL(url);
    if (/\/api\/[^/]+\/media\//i.test(u.pathname)) {
      return `${api.origin}${u.pathname}${u.search}`;
    }
  } catch {
    /* keep original */
  }
  return url;
}

async function readAccessToken(): Promise<string | null> {
  let token: string | null = getToken();
  if (!token) {
    try {
      token = await getSecureItem('auth_token');
      if (token) setToken(token);
    } catch {
      /* ignore */
    }
  }
  return token;
}

export async function uploadMediaApi(dataUrl: string, purpose: UploadPurpose): Promise<string> {
  const res = await request<UploadMediaResponse>('/media/upload', {
    method: 'POST',
    body: JSON.stringify({ dataUrl, purpose }),
  });
  const url = res.data?.url;
  if (!url) throw new Error('Upload succeeded but no media URL was returned');
  return normalizeUploadedMediaUrl(url, res.data?.key);
}

/**
 * Multipart upload — required for video (avoids huge base64 JSON bodies).
 * Images may fall back to JSON dataUrl if multipart fails on older workers.
 */
export async function uploadMediaFile(
  uri: string,
  purpose: UploadPurpose,
  opts?: { mimeType?: string; fileName?: string }
): Promise<{ url: string; mediaType: MediaKind; contentType: string }> {
  const mimeType = opts?.mimeType || guessMimeFromUri(uri);
  const isVideo = mimeType.startsWith('video/');
  const fileName =
    opts?.fileName ||
    `upload.${
      mimeType.includes('png')
        ? 'png'
        : mimeType.includes('webm')
          ? 'webm'
          : mimeType.includes('quicktime') || uri.toLowerCase().includes('.mov')
            ? 'mov'
            : mimeType.startsWith('video/')
              ? 'mp4'
              : 'jpg'
    }`;

  const token = await readAccessToken();
  const endpoint = `${getApiBaseUrl()}/media/upload`;

  const parseUploadResponse = async (response: Response) => {
    let data: UploadMediaResponse | null = null;
    try {
      data = (await response.json()) as UploadMediaResponse;
    } catch {
      throw new Error(messageFromApiError(null, response.status));
    }
    if (!response.ok || !data?.success || !data.data?.url) {
      const err = new Error(messageFromApiError(data, response.status)) as Error & {
        code?: string;
        raw?: unknown;
      };
      err.code = (data as { error?: { code?: string } })?.error?.code;
      err.raw = data;
      throw err;
    }
    const mediaType: MediaKind =
      data.data.mediaType ||
      (data.data.contentType?.startsWith('video/') ? 'video' : 'image');
    return {
      url: normalizeUploadedMediaUrl(data.data.url, data.data.key),
      mediaType,
      contentType: data.data.contentType || mimeType,
    };
  };

  // 1) Multipart (preferred)
  try {
    const form = new FormData();
    form.append('purpose', purpose);

    if (Platform.OS === 'web') {
      const res = await fetch(uri);
      const blob = await res.blob();
      const typed =
        blob.type && blob.type !== 'application/octet-stream' && blob.type === mimeType
          ? blob
          : new Blob([await blob.arrayBuffer()], { type: mimeType });
      // File gives workers a reliable filename + mime (plain Blob often arrives empty-typed)
      const file =
        typeof File !== 'undefined'
          ? new File([typed], fileName, { type: mimeType })
          : typed;
      form.append('file', file, fileName);
    } else {
      form.append('file', {
        uri,
        name: fileName,
        type: mimeType,
      } as unknown as Blob);
    }

    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: form,
    });
    return await parseUploadResponse(response);
  } catch (err) {
    // Videos must stay multipart — JSON base64 hits image-only workers / size limits
    if (isVideo) {
      const msg = err instanceof Error ? err.message : 'Video upload failed';
      if (/jpeg\/png\/webp|base64 data urls|only base64/i.test(msg)) {
        throw new Error(
          'Video upload isn’t supported by this API version yet. Please refresh the app or try again after the latest update.'
        );
      }
      throw err instanceof Error ? err : new Error(msg);
    }

    const msg = err instanceof Error ? err.message : '';
    const code = (err as { code?: string })?.code;
    const canFallback =
      code === 'INVALID_JSON' ||
      code === 'VALIDATION_ERROR' ||
      /invalid json|multipart|data url|file of type|check your email/i.test(msg);
    if (!canFallback) throw err;
  }

  // 2) JSON dataUrl fallback — images only
  const dataUrl = await uriToDataUrlUtil(uri, mimeType);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ dataUrl, purpose }),
  });
  return parseUploadResponse(response);
}

function guessMimeFromUri(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.includes('.png') || lower.startsWith('data:image/png')) return 'image/png';
  if (lower.includes('.webp') || lower.startsWith('data:image/webp')) return 'image/webp';
  if (lower.includes('.webm') || lower.startsWith('data:video/webm')) return 'video/webm';
  if (lower.includes('.mov') || lower.startsWith('data:video/quicktime')) return 'video/quicktime';
  if (
    lower.includes('.mp4') ||
    lower.includes('.m4v') ||
    lower.startsWith('data:video/mp4') ||
    lower.includes('video')
  ) {
    return 'video/mp4';
  }
  return 'image/jpeg';
}

export function isVideoMedia(opts: {
  uri?: string | null;
  mediaType?: string | null;
  contentType?: string | null;
}): boolean {
  if (opts.mediaType === 'video') return true;
  if (opts.contentType?.toLowerCase().startsWith('video/')) return true;
  const u = (opts.uri || '').toLowerCase();
  return (
    u.startsWith('data:video/') ||
    /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u)
  );
}
