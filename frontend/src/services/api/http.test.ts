import { describe, it, expect, vi, beforeEach } from 'vitest';

(globalThis as { __DEV__?: boolean }).__DEV__ = false;
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));
const kv = vi.hoisted(() => new Map<string, string>());
vi.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
  getItemAsync: async (k: string) => kv.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void kv.set(k, v),
  deleteItemAsync: async (k: string) => void kv.delete(k),
}));

const http = await import('./http');
const { createFeedPost } = await import('./feed');
const { clearToken } = await import('../storage/tokenManager');

const fetchMock = vi.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
function headersOf(call: unknown[]): Record<string, string> {
  return ((call[1] as RequestInit).headers ?? {}) as Record<string, string>;
}

beforeEach(() => {
  fetchMock.mockReset();
  kv.clear();
  clearToken();
});

describe('http request', () => {
  it('throws a typed ApiError carrying the HTTP status', async () => {
    fetchMock.mockResolvedValueOnce(json(500, { success: false, error: { code: 'DATABASE_ERROR' } }));
    const err = await http.request<never>('/x').catch((e: unknown) => e as InstanceType<typeof http.ApiError>);
    expect(err).toBeInstanceOf(http.ApiError);
    expect(err.status).toBe(500);
    expect(err.code).toBe('DATABASE_ERROR');
    expect(err.isTransient).toBe(true);
  });

  it('does not auto-retry a POST after a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const err = await http.request<never>('/feed/posts', { method: 'POST', body: '{}' }).catch((e: unknown) => e as InstanceType<typeof http.ApiError>);
    expect(err).toBeInstanceOf(http.ApiError);
    expect(err.status).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still retries a GET once after a network error', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(json(200, { success: true, data: 1 }));
    await expect(http.request('/y')).resolves.toEqual({ success: true, data: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sends the caller’s Idempotency-Key, unchanged across manual retries', async () => {
    fetchMock.mockImplementation(async () => json(200, { success: true, data: { id: 'p' } }));
    const payload = { image_url: 'https://x/y.jpg', category: 'fitness' };
    await createFeedPost(payload, { idempotencyKey: 'draft-123' });
    await createFeedPost(payload, { idempotencyKey: 'draft-123' });
    expect(headersOf(fetchMock.mock.calls[0])['Idempotency-Key']).toBe('draft-123');
    expect(headersOf(fetchMock.mock.calls[1])['Idempotency-Key']).toBe('draft-123');
  });

  it('generates a v4 UUID key when none is passed', async () => {
    fetchMock.mockImplementation(async () => json(200, { success: true, data: { id: 'p' } }));
    await createFeedPost({ image_url: 'https://x/y.jpg', category: 'fitness' });
    expect(headersOf(fetchMock.mock.calls[0])['Idempotency-Key']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it('replaces a key the server would reject with a fresh UUID', async () => {
    fetchMock.mockImplementation(async () => json(200, { success: true, data: { id: 'p' } }));
    await http.request('/x', { method: 'POST', body: '{}', ...http.withIdempotency('bad key!') });
    expect(headersOf(fetchMock.mock.calls[0])['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('keeps the same key on the resend after a token refresh', async () => {
    kv.set('auth_token', 'old');
    kv.set('auth_refresh_token', 'r1');
    fetchMock
      .mockResolvedValueOnce(json(401, { success: false }))
      .mockResolvedValueOnce(json(200, { success: true, data: { token: 'new', refreshToken: 'r2' } }))
      .mockResolvedValueOnce(json(200, { success: true, data: { id: 'c' } }));
    await http.request('/feed/posts', { method: 'POST', body: '{}', ...http.withIdempotency('key-k9-01') });
    expect(headersOf(fetchMock.mock.calls[0])['Idempotency-Key']).toBe('key-k9-01');
    expect(headersOf(fetchMock.mock.calls[2])['Idempotency-Key']).toBe('key-k9-01');
    expect(headersOf(fetchMock.mock.calls[2]).Authorization).toBe('Bearer new');
    expect(kv.get('auth_refresh_token')).toBe('r2');
  });

  it('resends a keyed request once after 409 IDEMPOTENCY_IN_PROGRESS', async () => {
    vi.useFakeTimers();
    try {
      const busy = { success: false, error: { code: 'IDEMPOTENCY_IN_PROGRESS' } };
      fetchMock
        .mockResolvedValueOnce(json(409, busy))
        .mockResolvedValueOnce(json(200, { success: true, data: { id: 'p' } }));
      const p = http.request('/feed/posts', { method: 'POST', body: '{}', ...http.withIdempotency('k-busy-1') });
      await vi.advanceTimersByTimeAsync(1000);
      await expect(p).resolves.toEqual({ success: true, data: { id: 'p' } });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(headersOf(fetchMock.mock.calls[1])['Idempotency-Key']).toBe('k-busy-1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up after one in-progress retry and never retries unkeyed 409s', async () => {
    vi.useFakeTimers();
    try {
      const busy = { success: false, error: { code: 'IDEMPOTENCY_IN_PROGRESS' } };
      fetchMock.mockImplementation(async () => json(409, busy));
      const p = http
        .request<never>('/feed/posts', { method: 'POST', body: '{}', ...http.withIdempotency('k-busy-2') })
        .catch((e: unknown) => e as InstanceType<typeof http.ApiError>);
      await vi.advanceTimersByTimeAsync(1000);
      const err = await p;
      expect(err.status).toBe(409);
      expect(err.code).toBe('IDEMPOTENCY_IN_PROGRESS');
      expect(fetchMock).toHaveBeenCalledTimes(2);

      fetchMock.mockClear();
      await http.request('/x', { method: 'POST', body: '{}' }).catch(() => undefined);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shares one refresh between concurrent callers', async () => {
    kv.set('auth_refresh_token', 'r1');
    fetchMock.mockResolvedValue(json(200, { success: true, data: { token: 't', refreshToken: 'r2' } }));
    const [a, b] = await Promise.all([http.refreshSession(), http.refreshSession('r1')]);
    expect(a).toBe(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
