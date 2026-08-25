import { Env } from '../types';
import { error, json } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { checkRateLimit } from '../utils/rateLimit';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_VIDEO_BYTES = 40 * 1024 * 1024; // 40MB (prefer multipart)

type ParsedMedia = {
  mime: string;
  bytes: Uint8Array;
  ext: string;
  kind: 'image' | 'video';
};

const IMAGE_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const VIDEO_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

function extForMime(mime: string): string | null {
  const m = mime.toLowerCase();
  return IMAGE_MIME[m] || VIDEO_MIME[m] || null;
}

function kindForMime(mime: string): 'image' | 'video' | null {
  const m = mime.toLowerCase();
  if (IMAGE_MIME[m]) return 'image';
  if (VIDEO_MIME[m]) return 'video';
  return null;
}

function guessMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  return '';
}

function normalizePurpose(raw: unknown): string {
  return raw === 'product' ||
    raw === 'story' ||
    raw === 'post' ||
    raw === 'avatar' ||
    raw === 'reel'
    ? raw
    : 'post';
}

/** Accept image/video data URLs from the app. */
function parseMediaDataUrl(dataUrl: string): ParsedMedia | null {
  const m = dataUrl.match(
    /^data:((?:image\/(?:jpeg|jpg|png|webp)|video\/(?:mp4|webm|quicktime)));base64,([A-Za-z0-9+/=]+)$/i
  );
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const kind = kindForMime(mime);
  const ext = extForMime(mime);
  if (!kind || !ext) return null;

  const b64 = m[2];
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { mime, bytes, ext, kind };
}

async function parseMultipart(
  request: Request
): Promise<{ media: ParsedMedia; purpose: string } | null> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return null;
  }

  const purpose = normalizePurpose(form.get('purpose'));
  const file = form.get('file');
  if (!file || typeof file === 'string') return null;

  const blob = file as File;
  const mime =
    (blob.type || '').toLowerCase() || guessMimeFromName((blob as File).name || '');
  const kind = kindForMime(mime);
  const ext = extForMime(mime);
  if (!kind || !ext) return null;

  const buffer = await blob.arrayBuffer();
  return {
    purpose,
    media: { mime, bytes: new Uint8Array(buffer), ext, kind },
  };
}

function mediaUrlFromRequest(request: Request, env: Env, key: string): string {
  const base = new URL(request.url).origin;
  const apiPrefix = `/api/${env.API_VERSION || 'v1'}`;
  return `${base}${apiPrefix}/media/${encodeURIComponent(key)}`;
}

/**
 * POST /api/v1/media/upload
 * JSON: { dataUrl, purpose? } — images (+ short videos)
 * multipart/form-data: file + purpose — preferred for video
 */
export async function uploadMedia(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return error('METHOD_NOT_ALLOWED', 'Use POST', 405);
  }
  if (!env.R2) {
    return error('MEDIA_NOT_CONFIGURED', 'R2 media storage is not configured', 503);
  }

  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  const { allowed } = await checkRateLimit(env, `upload:${ctx.userId}`, 30, 3600);
  if (!allowed) {
    return error('RATE_LIMITED', 'Too many uploads. Try again later.', 429);
  }

  const contentType = (request.headers.get('content-type') || '').toLowerCase();
  let parsed: ParsedMedia | null = null;
  let purpose = 'post';

  if (contentType.includes('multipart/form-data')) {
    const multi = await parseMultipart(request);
    if (!multi) {
      return error(
        'VALIDATION_ERROR',
        'Multipart upload requires a file of type jpeg/png/webp or mp4/webm/mov',
        400
      );
    }
    parsed = multi.media;
    purpose = multi.purpose;
  } else {
    let body: { dataUrl?: string; purpose?: string };
    try {
      body = await request.json();
    } catch {
      return error('INVALID_JSON', 'Invalid JSON in request body', 400);
    }
    purpose = normalizePurpose(body.purpose);
    const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl : '';
    parsed = parseMediaDataUrl(dataUrl);
    if (!parsed) {
      return error(
        'VALIDATION_ERROR',
        'Only base64 data URLs for jpeg/png/webp or mp4/webm/mov are supported (or use multipart file upload)',
        400
      );
    }
  }

  if (parsed.bytes.byteLength === 0) {
    return error('VALIDATION_ERROR', 'Uploaded media is empty', 400);
  }

  const maxBytes = parsed.kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (parsed.bytes.byteLength > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    return error(
      'PAYLOAD_TOO_LARGE',
      `${parsed.kind === 'video' ? 'Video' : 'Image'} exceeds ${mb}MB upload limit`,
      413
    );
  }

  if (purpose === 'post' && parsed.kind === 'video') {
    purpose = 'reel';
  }

  const key = `${purpose}/${ctx.userId}/${Date.now()}-${crypto.randomUUID()}.${parsed.ext}`;

  await env.R2.put(key, parsed.bytes, {
    httpMetadata: {
      contentType: parsed.mime,
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });

  return json({
    key,
    url: mediaUrlFromRequest(request, env, key),
    size: parsed.bytes.byteLength,
    contentType: parsed.mime,
    mediaType: parsed.kind,
  });
}

/**
 * GET /api/v1/media/:key
 */
export async function getMedia(request: Request, env: Env, key: string): Promise<Response> {
  if (!env.R2) {
    return error('MEDIA_NOT_CONFIGURED', 'R2 media storage is not configured', 503);
  }

  const safeKey = decodeURIComponent(key).replace(/^\/+/, '');
  if (!safeKey || safeKey.includes('..')) {
    return error('VALIDATION_ERROR', 'Invalid media key', 400);
  }

  const obj = await env.R2.get(safeKey);
  if (!obj) {
    return error('NOT_FOUND', 'Media not found', 404);
  }

  const headers = new Headers();
  const ct = obj.httpMetadata?.contentType || 'application/octet-stream';
  const cacheControl = obj.httpMetadata?.cacheControl || 'public, max-age=86400';
  headers.set('Content-Type', ct);
  headers.set('Cache-Control', cacheControl);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Accept-Ranges', 'bytes');
  return new Response(obj.body, { status: 200, headers });
}
