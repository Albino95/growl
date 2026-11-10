import { Platform } from 'react-native';
import { request, getApiBaseUrl } from './http';
import { getSecureItem } from '../storage/secureStore';
import { getToken, setToken } from '../storage/tokenManager';
import { messageFromApiError } from './apiErrors';
import { uriToDataUrl as uriToDataUrlUtil } from '../../utils/mediaUri';
import { prepareImageForUpload } from '../../utils/prepareImageUpload';

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

/** Must match the API's per-file caps (backend/src/routes/media.ts). */
export const MAX_VIDEO_UPLOAD_BYTES = 40 * 1024 * 1024;

/** Thrown before uploading when a clip is over the limit (no data wasted). */
export class MediaTooLargeError extends Error {
  constructor(sizeBytes: number) {
    const mb = Math.round(sizeBytes / (1024 * 1024));
    super(`This video is ${mb} MB. The limit is 40 MB — trim it or pick a shorter clip.`);
    this.name = 'MediaTooLargeError';
  }
}

/** Local file size in bytes, or null when it can't be read (web, data URLs). */
async function localFileSize(uri: string): Promise<number | null> {
  if (Platform.OS === 'web' || !uri.startsWith('file:')) return null;
  try {
    const FileSystem = await import('expo-file-system/legacy');
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && typeof info.size === 'number' ? info.size : null;
  } catch {
    return null;
  }
}

/**
 * POST with a timeout and up to `retries` extra attempts on network failures
 * (dropped connection, timeout). HTTP error responses are returned as-is and
 * never retried. `makeInit` builds a fresh body for each attempt.
 */
async function postWithRetry(
  url: string,
  makeInit: () => RequestInit,
  { timeoutMs, retries }: { timeoutMs: number; retries: number }
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...makeInit(), signal: controller.signal });
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  const timedOut = (lastError as { name?: string })?.name === 'AbortError';
  throw new Error(
    timedOut
      ? 'Upload timed out. Check your connection and try again.'
      : 'Upload failed — no connection. Check your connection and try again.'
  );
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
  const prepared = dataUrl.toLowerCase().startsWith('data:video')
    ? dataUrl
    : await prepareImageForUpload(dataUrl, purpose);
  if (!prepared.toLowerCase().startsWith('data:')) {
    const uploaded = await uploadMediaFile(prepared, purpose, {
      mimeType: 'image/jpeg',
      fileName: 'upload.jpg',
    });
    return uploaded.url;
  }
  const res = await request<UploadMediaResponse>('/media/upload', {
    method: 'POST',
    body: JSON.stringify({ dataUrl: prepared, purpose }),
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
  let sourceUri = uri;
  let mimeType = opts?.mimeType || guessMimeFromUri(uri);
  const isVideo = mimeType.startsWith('video/');

  if (!isVideo) {
    sourceUri = await prepareImageForUpload(uri, purpose);
    mimeType = 'image/jpeg';
  } else {
    // Fail fast instead of uploading tens of MB only to get a 413.
    const size = await localFileSize(sourceUri);
    if (size !== null && size > MAX_VIDEO_UPLOAD_BYTES) {
      throw new MediaTooLargeError(size);
    }
  }

  const fileName =
    opts?.fileName ||
    `upload.${
      mimeType.includes('png')
        ? 'png'
        : mimeType.includes('webm')
          ? 'webm'
          : mimeType.includes('quicktime') || sourceUri.toLowerCase().includes('.mov')
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
    const buildForm = async (): Promise<FormData> => {
      const form = new FormData();
      form.append('purpose', purpose);
      if (Platform.OS === 'web') {
        const res = await fetch(sourceUri);
        const blob = await res.blob();
        const typed =
          blob.type && blob.type !== 'application/octet-stream' && blob.type === mimeType
            ? blob
            : new Blob([await blob.arrayBuffer()], { type: mimeType });
        // File gives workers a reliable filename + mime (plain Blob often arrives empty-typed)
        const file =
          typeof File !== 'undefined' ? new File([typed], fileName, { type: mimeType }) : typed;
        form.append('file', file, fileName);
      } else {
        form.append('file', {
          uri: sourceUri,
          name: fileName,
          type: mimeType,
        } as unknown as Blob);
      }
      return form;
    };

    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const form = await buildForm();
    const response = await postWithRetry(
      endpoint,
      // RN re-reads the file from its uri on each attempt; reuse is safe there.
      () => ({ method: 'POST', headers, body: form }),
      { timeoutMs: isVideo ? 180_000 : 60_000, retries: 2 }
    );
    return await parseUploadResponse(response);
  } catch (err) {
    if (err instanceof MediaTooLargeError) throw err;
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
  const dataUrl = await uriToDataUrlUtil(sourceUri, mimeType);
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
  if (u.startsWith('data:video/')) return true;
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(u)) return true;
  // Uploaded reels often use extensionless /api/v1/media/{key} URLs
  if (/\/api\/v\d+\/media\//i.test(u) && !/\.(jpe?g|png|gif|webp|heic)(\?|$)/i.test(u)) {
    // Heuristic: media keys without image extensions — caller should also pass mediaType
    return false;
  }
  return false;
}
