import { request, getApiBaseUrl } from './http';

type UploadPurpose = 'post' | 'product' | 'story' | 'avatar';

type UploadMediaResponse = {
  success: boolean;
  data: {
    key: string;
    url: string;
    size: number;
    contentType: string;
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

export async function uploadMediaApi(dataUrl: string, purpose: UploadPurpose): Promise<string> {
  // Returns a backend-served URL (R2-backed when configured).
  const res = await request<UploadMediaResponse>('/media/upload', {
    method: 'POST',
    body: JSON.stringify({ dataUrl, purpose }),
  });
  const url = res.data?.url;
  if (!url) throw new Error('Upload succeeded but no media URL was returned');
  return normalizeUploadedMediaUrl(url, res.data?.key);
}
