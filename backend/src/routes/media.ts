import { Env } from '../types';
import { error, json } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { checkRateLimit } from '../utils/rateLimit';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Accept only explicit image data URLs we trust the frontend to send.
 * Keeping this strict prevents unexpected payload types from being stored.
 */
function parseImageDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array; ext: string } | null {
  const m = dataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const b64 = m[2];
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  return { mime, bytes, ext };
}

function mediaUrlFromRequest(request: Request, env: Env, key: string): string {
  // Always use the Worker origin. APP_PUBLIC_URL is the marketing/app site (e.g. letsgrow.lu)
  // and does not serve /api/v1/media — using it made every uploaded post image blank.
  const base = new URL(request.url).origin;
  const apiPrefix = `/api/${env.API_VERSION || 'v1'}`;
  return `${base}${apiPrefix}/media/${encodeURIComponent(key)}`;
}

/**
 * POST /api/v1/media/upload
 * Body: { dataUrl: string, purpose?: "post" | "product" | "story" | "avatar" }
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

  const { allowed } = await checkRateLimit(
    env,
    `upload:${ctx.userId}`,
    30,
    3600
  );
  if (!allowed) {
    return error('RATE_LIMITED', 'Too many uploads. Try again later.', 429);
  }

  let body: { dataUrl?: string; purpose?: string };
  try {
    body = await request.json();
  } catch {
    return error('INVALID_JSON', 'Invalid JSON in request body', 400);
  }

  const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl : '';
  const parsed = parseImageDataUrl(dataUrl);
  if (!parsed) {
    return error('VALIDATION_ERROR', 'Only base64 data URLs for jpeg/png/webp are supported', 400);
  }
  if (parsed.bytes.byteLength === 0) {
    return error('VALIDATION_ERROR', 'Uploaded image is empty', 400);
  }
  if (parsed.bytes.byteLength > MAX_UPLOAD_BYTES) {
    return error('PAYLOAD_TOO_LARGE', 'Image exceeds 5MB upload limit', 413);
  }

  // Purpose keeps object keys organized so cleanup/reporting is easier later.
  const purpose =
    body.purpose === 'product' ||
    body.purpose === 'story' ||
    body.purpose === 'post' ||
    body.purpose === 'avatar'
      ? body.purpose
      : 'post';
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
  });
}

/**
 * GET /api/v1/media/:key
 */
export async function getMedia(request: Request, env: Env, key: string): Promise<Response> {
  if (!env.R2) {
    return error('MEDIA_NOT_CONFIGURED', 'R2 media storage is not configured', 503);
  }

  // Basic key hardening to avoid path traversal-like access attempts.
  const safeKey = decodeURIComponent(key).replace(/^\/+/, '');
  if (!safeKey || safeKey.includes('..')) {
    return error('VALIDATION_ERROR', 'Invalid media key', 400);
  }

  const obj = await env.R2.get(safeKey);
  if (!obj) {
    return error('NOT_FOUND', 'Media not found', 404);
  }

  const headers = new Headers();
  const contentType = obj.httpMetadata?.contentType || 'application/octet-stream';
  const cacheControl = obj.httpMetadata?.cacheControl || 'public, max-age=86400';
  headers.set('Content-Type', contentType);
  headers.set('Cache-Control', cacheControl);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return new Response(obj.body, { status: 200, headers });
}
