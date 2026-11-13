import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('expo-haptics', () => ({
  impactAsync: vi.fn(async () => undefined),
  notificationAsync: vi.fn(async () => undefined),
  selectionAsync: vi.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Soft: 'soft', Rigid: 'rigid' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const Haptics = await import('expo-haptics');
const {
  createHapticGate,
  createOnceRegistry,
  debounceGroupFor,
  playHapticChannel,
  feedbackConfig,
  runWhenReady,
  FEEDBACK_KINDS,
  HAPTIC_DEBOUNCE_MS,
  HAPTIC_MOMENT_KIND,
  PREFS_HYDRATION_WAIT_MS,
  SOUND_KEYS,
  TAP_SOUND_KEYS,
  WEB_SOUND_NOTES,
} = await import('./hapticsCore');
type HapticsModule = import('./hapticsCore').HapticsModule;
const H = Haptics as unknown as HapticsModule;

describe('haptic gate (per-group debounce)', () => {
  it('drops repeats inside the window and allows them after it', () => {
    let t = 1000;
    const gate = createHapticGate(() => t);
    expect(gate.allow('selection')).toBe(true);
    t += HAPTIC_DEBOUNCE_MS.selection - 1;
    expect(gate.allow('selection')).toBe(false);
    t += 1;
    expect(gate.allow('selection')).toBe(true);
  });

  it('keeps groups independent', () => {
    let t = 0;
    const gate = createHapticGate(() => t);
    expect(gate.allow('impactLight')).toBe(true);
    expect(gate.allow('selection')).toBe(true);
    expect(gate.allow('success')).toBe(true);
    expect(gate.allow('impactLight')).toBe(false);
    t = 119;
    expect(gate.allow('impactLight')).toBe(false);
    t = 120;
    expect(gate.allow('impactLight')).toBe(true);
    t = 799;
    expect(gate.allow('error')).toBe(false); // shares the notification group with success
    t = 800;
    expect(gate.allow('error')).toBe(true);
  });

  it('uses the specified windows', () => {
    expect(HAPTIC_DEBOUNCE_MS).toEqual({
      selection: 50,
      light: 120,
      medium: 120,
      notification: 800,
      warning: 800,
      celebrate: 4000,
    });
    let t = 0;
    const gate = createHapticGate(() => t);
    expect(gate.allow('celebrate')).toBe(true);
    t = 3999;
    expect(gate.allow('celebrate')).toBe(false);
    t = 4000;
    expect(gate.allow('celebrate')).toBe(true);
  });

  it('a warning never swallows the success right after it', () => {
    let t = 0;
    const gate = createHapticGate(() => t);
    expect(debounceGroupFor('warning')).toBe('warning');
    expect(gate.allow('warning')).toBe(true);
    t = 10;
    expect(gate.allow('success')).toBe(true);
    t = 20;
    expect(gate.allow('warning')).toBe(false);
    t = 800;
    expect(gate.allow('warning')).toBe(true);
  });

  it('never fires the none channel', () => {
    const gate = createHapticGate(() => 0);
    expect(debounceGroupFor('none')).toBeNull();
    expect(gate.allow('none')).toBe(false);
  });
});

describe('playHapticChannel', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it('maps channels onto expo-haptics', async () => {
    await playHapticChannel(H, 'selection');
    await playHapticChannel(H, 'impactLight');
    await playHapticChannel(H, 'impactMedium');
    await playHapticChannel(H, 'warning');
    await playHapticChannel(H, 'impactHeavy');
    expect(Haptics.impactAsync).toHaveBeenLastCalledWith('heavy');
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenNthCalledWith(1, 'light');
    expect(Haptics.impactAsync).toHaveBeenNthCalledWith(2, 'medium');
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('warning');
  });

  it('celebrate = light, light@80, medium@160, heavy@260, success@420', async () => {
    vi.useFakeTimers();
    await playHapticChannel(H, 'celebrate');
    expect(Haptics.impactAsync).toHaveBeenLastCalledWith('light');
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(79);
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(Haptics.impactAsync).toHaveBeenLastCalledWith('light');
    await vi.advanceTimersByTimeAsync(80);
    expect(Haptics.impactAsync).toHaveBeenLastCalledWith('medium');
    await vi.advanceTimersByTimeAsync(100);
    expect(Haptics.impactAsync).toHaveBeenLastCalledWith('heavy');
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(160);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(4);
  });

  it('reports failure so callers can fall back to Vibration', async () => {
    vi.mocked(Haptics.selectionAsync).mockRejectedValueOnce(new Error('no module'));
    expect(await playHapticChannel(H, 'selection')).toBe(false);
  });
});

describe('celebrate once registry', () => {
  function memoryStorage() {
    const data = new Map<string, string>();
    return {
      data,
      getItem: vi.fn(async (k: string) => data.get(k) ?? null),
      setItem: vi.fn(async (k: string, v: string) => {
        data.set(k, v);
      }),
    };
  }

  it('claims an id once, even across app launches', async () => {
    const storage = memoryStorage();
    const a = createOnceRegistry(storage, 'k');
    expect(await a.claim('streak-7')).toBe(true);
    expect(await a.claim('streak-7')).toBe(false);
    expect(await a.claim('streak-30')).toBe(true);

    const relaunched = createOnceRegistry(storage, 'k');
    expect(await relaunched.claim('streak-7')).toBe(false);
    expect(await relaunched.has('streak-30')).toBe(true);
    expect(await relaunched.claim('first-checkin')).toBe(true);
  });

  it('serialises concurrent claims for the same id', async () => {
    const reg = createOnceRegistry(memoryStorage(), 'k');
    const results = await Promise.all([reg.claim('x'), reg.claim('x'), reg.claim('x')]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('caps the persisted list and survives corrupt storage', async () => {
    const storage = memoryStorage();
    storage.data.set('k', '{not json');
    const reg = createOnceRegistry(storage, 'k', 3);
    for (const id of ['a', 'b', 'c', 'd']) expect(await reg.claim(id)).toBe(true);
    expect(JSON.parse(storage.data.get('k')!)).toEqual(['b', 'c', 'd']);
    expect(await reg.claim('')).toBe(false);
  });
});

describe('feedback kinds → haptic + sound', () => {
  const sounds = (kind: Parameters<typeof feedbackConfig>[0]) => feedbackConfig(kind).sound ?? null;

  it('plays signature sounds for the five signature moments, tap sounds for the tap tier', () => {
    expect(sounds('checkin')).toBe('bloom');
    expect(sounds('celebrate')).toBe('rise');
    expect(sounds('shared')).toBe('seedpop');
    expect(sounds('send')).toBe('send');
    expect(sounds('error')).toBe('softError');
    const withSound = Object.entries(FEEDBACK_KINDS)
      .filter(([, cfg]) => cfg.sound)
      .map(([k]) => k)
      .sort();
    expect(withSound).toEqual(
      [
        'celebrate',
        'checkin',
        'error',
        'send',
        'shared',
        'toggleOn',
        'toggleOff',
        'tab',
        'chip',
        'commit',
        'like',
        'likeDoubleTap',
        'refreshThreshold',
      ].sort()
    );
    expect(sounds('unlike')).toBeNull();
    expect(sounds('refreshDone')).toBeNull();
    expect(sounds('sheetSnap')).toBeNull();
    expect(sounds('destructive')).toBeNull();
    expect(sounds('selection')).toBeNull();
  });

  it('maps the tap tier onto the specified haptics', () => {
    const h = (kind: Parameters<typeof feedbackConfig>[0]) => feedbackConfig(kind).haptic;
    expect(h('toggleOn')).toBe('selection');
    expect(h('toggleOff')).toBe('selection');
    expect(h('chip')).toBe('selection');
    expect(h('tab')).toBe('selection');
    expect(h('commit')).toBe('impactLight');
    expect(h('like')).toBe('soft');
    expect(h('unlike')).toBe('impactLight');
    expect(h('sheetSnap')).toBe('soft');
    expect(h('refreshThreshold')).toBe('rigid');
    expect(h('refreshDone')).toBe('impactLight');
    expect(h('destructive')).toBe('impactHeavy');
    expect(h('longPressIn')).toBe('soft');
    expect(h('peekOpen')).toBe('impactMedium');
    expect(feedbackConfig('checkin').sequence).toBe('checkin');
    expect(feedbackConfig('celebrate').sequence).toBe('celebrate');
    expect(feedbackConfig('likeDoubleTap').sequence).toBe('likeDoubleTap');
  });

  it('keeps plain success calm: success haptic, no sound', () => {
    expect(feedbackConfig('success')).toMatchObject({ haptic: 'success' });
    expect(sounds('success')).toBeNull();
    expect(feedbackConfig('checkin').haptic).toBe('success');
    expect(feedbackConfig('shared').haptic).toBe('success');
  });

  it('maps legacy kinds onto the calm system', () => {
    expect(feedbackConfig('tap').haptic).toBe('none');
    expect(feedbackConfig('close').haptic).toBe('selection');
    expect(feedbackConfig('warn')).toMatchObject({ haptic: 'warning' });
    expect(sounds('warn')).toBeNull();
    expect(feedbackConfig('celebrate').haptic).toBe('celebrate');
    expect(feedbackConfig('error').haptic).toBe('error');
    expect(feedbackConfig('bloom')).toMatchObject({ haptic: 'soft' });
    expect(sounds('bloom')).toBeNull();
    // Unknown kinds fall back to the silent tap.
    expect(feedbackConfig('nope' as never).haptic).toBe('none');
  });

  it('routes the public moments', () => {
    expect(HAPTIC_MOMENT_KIND.checkin).toBe('checkin');
    expect(HAPTIC_MOMENT_KIND.shared).toBe('shared');
    expect(HAPTIC_MOMENT_KIND.success).toBe('success');
    expect(HAPTIC_MOMENT_KIND.warning).toBe('warn');
  });

  it('has a web fallback for every sound', () => {
    for (const key of [...SOUND_KEYS, ...TAP_SOUND_KEYS]) {
      expect(WEB_SOUND_NOTES[key].length).toBeGreaterThan(0);
    }
  });
});

describe('runWhenReady (prefs hydration guard)', () => {
  afterEach(() => vi.useRealTimers());

  function source(ready = false) {
    const listeners = new Set<() => void>();
    let isReady = ready;
    return {
      isReady: () => isReady,
      onReady: (cb: () => void) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      finish() {
        isReady = true;
        for (const l of [...listeners]) l();
      },
      listeners,
    };
  }

  it('fires immediately when prefs are already loaded', () => {
    const cb = vi.fn();
    runWhenReady(source(true), cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('fires once hydration finishes', () => {
    vi.useFakeTimers();
    const src = source();
    const cb = vi.fn();
    runWhenReady(src, cb);
    expect(cb).not.toHaveBeenCalled();
    src.finish();
    expect(cb).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(PREFS_HYDRATION_WAIT_MS * 2);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(src.listeners.size).toBe(0);
  });

  it('fires with defaults after the 400ms timeout instead of dropping', () => {
    vi.useFakeTimers();
    expect(PREFS_HYDRATION_WAIT_MS).toBe(400);
    const src = source();
    const cb = vi.fn();
    runWhenReady(src, cb);
    vi.advanceTimersByTime(399);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(src.listeners.size).toBe(0);
    src.finish();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('handles a source that becomes ready during subscribe', () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    runWhenReady(
      { isReady: () => false, onReady: (fn) => (fn(), () => undefined) },
      cb
    );
    vi.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
