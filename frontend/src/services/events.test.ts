import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./api/http', () => {
  class ApiError extends Error {
    status: number;
    constructor(m: string, s: number) {
      super(m);
      this.status = s;
    }
  }
  return { ApiError, request: vi.fn() };
});

import { createEventLogger, FLUSH_AT, FLUSH_INTERVAL_MS } from './events';
import { ApiError } from './api/http';

const view = (id: string) => ({ type: 'product_view' as const, product_id: id });

describe('event logger', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('flushes after 10 s', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const l = createEventLogger(send);
    l.log(view('a'));
    l.log(view('b'));
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(FLUSH_INTERVAL_MS);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].map((e: any) => e.product_id)).toEqual(['a', 'b']);
    expect(l.size).toBe(0);
  });

  it('flushes immediately at 20 events', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const l = createEventLogger(send);
    for (let i = 0; i < FLUSH_AT; i++) l.log(view(`p${i}`));
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toHaveLength(FLUSH_AT);
  });

  it('turns itself off on 404 and drops other failures silently', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new (ApiError as any)('x', 404));
    const l = createEventLogger(send);
    l.log(view('a'));
    await l.flush();
    expect(l.disabled).toBe(false);
    l.log(view('b'));
    await l.flush();
    expect(l.disabled).toBe(true);
    l.log(view('c'));
    await l.flush();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('ignores events without an item', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const l = createEventLogger(send);
    l.log({ type: 'storefront_view' });
    expect(l.size).toBe(0);
  });
});
