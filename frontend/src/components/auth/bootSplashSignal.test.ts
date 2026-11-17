import { beforeEach, describe, expect, it, vi } from 'vitest';

type Signal = typeof import('./bootSplashSignal');

let sig: Signal;

beforeEach(async () => {
  vi.resetModules();
  sig = await import('./bootSplashSignal');
});

describe('bootSplashSignal', () => {
  it('fires reveal listeners once with the animate flag', () => {
    const fn = vi.fn();
    sig.onBootRevealStart(fn);
    expect(sig.isBootRevealStarted()).toBe(false);
    sig.markBootRevealStart({ animate: true });
    sig.markBootRevealStart({ animate: false });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ animate: true });
    expect(sig.isBootRevealStarted()).toBe(true);
  });

  it('late subscribers get the reveal immediately', () => {
    sig.markBootRevealStart({ animate: false });
    const fn = vi.fn();
    sig.onBootRevealStart(fn);
    expect(fn).toHaveBeenCalledWith({ animate: false });
  });

  it('unsubscribe prevents the call', () => {
    const fn = vi.fn();
    const off = sig.onBootRevealStart(fn);
    off();
    sig.markBootRevealStart();
    expect(fn).not.toHaveBeenCalled();
  });

  it('done implies reveal (never leaves reveal listeners hanging)', () => {
    const reveal = vi.fn();
    const done = vi.fn();
    sig.onBootRevealStart(reveal);
    sig.onBootSplashDone(done);
    sig.markBootSplashDone();
    expect(reveal).toHaveBeenCalledWith({ animate: false });
    expect(done).toHaveBeenCalledTimes(1);
    expect(sig.isBootSplashDone()).toBe(true);
  });
});
