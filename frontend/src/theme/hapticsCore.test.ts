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
  HAPTIC_DEBOUNCE_MS,
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
    expect(HAPTIC_DEBOUNCE_MS).toEqual({ selection: 50, light: 120, medium: 120, notification: 800, celebrate: 4000 });
    let t = 0;
    const gate = createHapticGate(() => t);
    expect(gate.allow('celebrate')).toBe(true);
    t = 3999;
    expect(gate.allow('celebrate')).toBe(false);
    t = 4000;
    expect(gate.allow('celebrate')).toBe(true);
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
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenNthCalledWith(1, 'light');
    expect(Haptics.impactAsync).toHaveBeenNthCalledWith(2, 'medium');
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('warning');
  });

  it('celebrate = success, rigid at +140ms, soft at +280ms', async () => {
    vi.useFakeTimers();
    await playHapticChannel(H, 'celebrate');
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(139);
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(Haptics.impactAsync).toHaveBeenLastCalledWith('rigid');
    await vi.advanceTimersByTimeAsync(140);
    expect(Haptics.impactAsync).toHaveBeenLastCalledWith('soft');
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(2);
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
