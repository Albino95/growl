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

/** Thrown when the caller aborts an upload (publish Cancel). Never retried. */
export class UploadCancelledError extends Error {
  constructor() {
    super('Upload cancelled');
    this.name = 'UploadCancelledError';
  }
}

export function isUploadCancelled(err: unknown): boolean {
  return (
    err instanceof UploadCancelledError ||
    (err as { name?: string } | null)?.name === 'UploadCancelledError'
  );
}

/** Bytes sent / total for one file. `total` is 0 while unknown. */
export type UploadProgressFn = (sentBytes: number, totalBytes: number) => void;

export type UploadControl = {
  onProgress?: UploadProgressFn;
  /** Abort → the in-flight request is cancelled and `UploadCancelledError` is thrown. */
  signal?: AbortSignal;
};

/** One upload attempt may sit this long without sending a byte before it is abandoned. */
export const UPLOAD_ATTEMPT_TIMEOUT_MS = 120_000;
const UPLOAD_RETRIES = 2;

type RawResponse = { status: number; body: string };

type Attempt = (ctx: {
  signal: AbortSignal;
  /** Bytes moved — resets the attempt's stall timer. */
  onProgress: UploadProgressFn;
}) => Promise<RawResponse>;

function waitOrAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadCancelledError());
      return;
    }
    const onAbort = () => {
      clearTimeout(t);
      reject(new UploadCancelledError());
    };
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Run `attempt` with a stall timeout (no progress for `timeoutMs` → abort) and
 * up to `retries` extra attempts on network failures. HTTP error responses are
 * returned as-is and never retried. A caller abort is never retried.
 */
async function sendWithRetry(
  attempt: Attempt,
  { timeoutMs, retries, control }: { timeoutMs: number; retries: number; control?: UploadControl }
): Promise<RawResponse> {
  const outer = control?.signal;
  let lastError: unknown;
  for (let i = 0; i <= retries; i += 1) {
    if (outer?.aborted) throw new UploadCancelledError();
    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
    };
    const onOuterAbort = () => controller.abort();
    outer?.addEventListener('abort', onOuterAbort, { once: true });
    arm();
    try {
      return await attempt({
        signal: controller.signal,
        onProgress: (sent, total) => {
          arm();
          control?.onProgress?.(sent, total);
        },
      });
    } catch (err) {
      if (outer?.aborted) throw new UploadCancelledError();
      lastError = timedOut ? Object.assign(new Error('timeout'), { name: 'AbortError' }) : err;
      if (i < retries) {
        // A fresh attempt starts from zero bytes.
        control?.onProgress?.(0, 0);
        await waitOrAbort(1000 * 2 ** i, outer);
      }
    } finally {
      if (timer) clearTimeout(timer);
      outer?.removeEventListener('abort', onOuterAbort);
    }
  }
  const timedOut = (lastError as { name?: string })?.name === 'AbortError';
  throw new Error(
    timedOut
      ? 'Upload timed out. Check your connection and try again.'
      : 'Upload failed — no connection. Check your connection and try again.'
  );
}

type MultipartSpec = {
  endpoint: string;
  uri: string;
  fileName: string;
  mimeType: string;
  purpose: UploadPurpose;
  headers: Record<string, string>;
};

/**
 * Native file:// uploads: expo-file-system's upload task streams the file from
 * disk (no JS copy) and reports bytes sent. iOS uses a background URLSession so
 * a quick app switch doesn't kill the upload.
 * Resolves null when the native module is unavailable (caller falls back).
 */
async function expoTaskAttempt(
  spec: MultipartSpec,
  ctx: { signal: AbortSignal; onProgress: UploadProgressFn }
): Promise<RawResponse | null> {
  let FileSystem: typeof import('expo-file-system/legacy');
  try {
    FileSystem = await import('expo-file-system/legacy');
  } catch {
    return null;
  }
  if (typeof FileSystem.createUploadTask !== 'function') return null;
  const task = FileSystem.createUploadTask(
    spec.endpoint,
    spec.uri,
    {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      mimeType: spec.mimeType,
      parameters: { purpose: spec.purpose },
      headers: spec.headers,
      sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
    },
    (data) => ctx.onProgress(data.totalBytesSent, Math.max(0, data.totalBytesExpectedToSend))
  );
  const onAbort = () => {
    void task.cancelAsync().catch(() => undefined);
  };
  if (ctx.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
  ctx.signal.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await task.uploadAsync();
    if (ctx.signal.aborted || !res) {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    }
    return { status: res.status, body: res.body };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'ERR_UNAVAILABLE' || (err as { name?: string })?.name === 'UnavailabilityError') {
      return null;
    }
    throw err;
  } finally {
    ctx.signal.removeEventListener('abort', onAbort);
  }
}

/** XHR multipart (web, content:// / ph:// URIs, or no native upload task) with upload progress. */
function xhrAttempt(
  endpoint: string,
  form: FormData,
  headers: Record<string, string>,
  ctx: { signal: AbortSignal; onProgress: UploadProgressFn }
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    const done = () => ctx.signal.removeEventListener('abort', onAbort);
    xhr.open('POST', endpoint);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    if (xhr.upload) {
      xhr.upload.onprogress = (e) => ctx.onProgress(e.loaded, e.lengthComputable ? e.total : 0);
    }
    xhr.onload = () => {
      done();
      resolve({ status: xhr.status, body: typeof xhr.responseText === 'string' ? xhr.responseText : '' });
    };
    xhr.onerror = () => {
      done();
      reject(new Error('Network request failed'));
    };
    xhr.ontimeout = xhr.onerror;
    xhr.onabort = () => {
      done();
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    };
    if (ctx.signal.aborted) {
      xhr.abort();
      return;
    }
    ctx.signal.addEventListener('abort', onAbort, { once: true });
    xhr.send(form);
  });
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

export async function uploadMediaApi(
  dataUrl: string,
  purpose: UploadPurpose,
  control?: UploadControl
): Promise<string> {
  const prepared = dataUrl.toLowerCase().startsWith('data:video')
    ? dataUrl
    : await prepareImageForUpload(dataUrl, purpose);
  if (!prepared.toLowerCase().startsWith('data:')) {
    const uploaded = await uploadMediaFile(prepared, purpose, {
      mimeType: 'image/jpeg',
      fileName: 'upload.jpg',
      ...control,
    });
    return uploaded.url;
  }
  // JSON body: no byte progress, so report only start and finish.
  if (control?.signal?.aborted) throw new UploadCancelledError();
  control?.onProgress?.(0, 0);
  const res = await request<UploadMediaResponse>('/media/upload', {
    method: 'POST',
    body: JSON.stringify({ dataUrl: prepared, purpose }),
  });
  if (control?.signal?.aborted) throw new UploadCancelledError();
  const url = res.data?.url;
  if (!url) throw new Error('Upload succeeded but no media URL was returned');
  const size = Number(res.data?.size) || 1;
  control?.onProgress?.(size, size);
  return normalizeUploadedMediaUrl(url, res.data?.key);
}

/**
 * Multipart upload — required for video (avoids huge base64 JSON bodies).
 * Images may fall back to JSON dataUrl if multipart fails on older workers.
 */
export async function uploadMediaFile(
  uri: string,
  purpose: UploadPurpose,
  opts?: { mimeType?: string; fileName?: string } & UploadControl
): Promise<{ url: string; mediaType: MediaKind; contentType: string }> {
  const control: UploadControl = { onProgress: opts?.onProgress, signal: opts?.signal };
  if (control.signal?.aborted) throw new UploadCancelledError();
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

  const parseUploadResponse = (response: RawResponse) => {
    let data: UploadMediaResponse | null = null;
    try {
      data = JSON.parse(response.body) as UploadMediaResponse;
    } catch {
      throw new Error(messageFromApiError(null, response.status));
    }
    const ok = response.status >= 200 && response.status < 300;
    if (!ok || !data?.success || !data.data?.url) {
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

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const spec: MultipartSpec = { endpoint, uri: sourceUri, fileName, mimeType, purpose, headers };
    // Native file:// → expo upload task (streams from disk, real progress).
    // Anything else (web blobs, content:// …) → XHR multipart with progress.
    let useTask = Platform.OS !== 'web' && sourceUri.startsWith('file:');
    let form: FormData | null = null;
    const response = await sendWithRetry(
      async (ctx) => {
        if (useTask) {
          const res = await expoTaskAttempt(spec, ctx);
          if (res) return res;
          useTask = false; // native task unavailable (e.g. web build) → XHR from now on
        }
        // RN re-reads the file from its uri on each send; reuse is safe there.
        form = form ?? (await buildForm());
        return xhrAttempt(endpoint, form, headers, ctx);
      },
      { timeoutMs: UPLOAD_ATTEMPT_TIMEOUT_MS, retries: UPLOAD_RETRIES, control }
    );
    return parseUploadResponse(response);
  } catch (err) {
    if (err instanceof MediaTooLargeError || isUploadCancelled(err)) throw err;
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
  if (control.signal?.aborted) throw new UploadCancelledError();
  control.onProgress?.(0, 0);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ dataUrl, purpose }),
    signal: control.signal,
  }).catch((err) => {
    if (control.signal?.aborted) throw new UploadCancelledError();
    throw err;
  });
  const parsed = parseUploadResponse({ status: response.status, body: await response.text() });
  control.onProgress?.(1, 1);
  return parsed;
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
