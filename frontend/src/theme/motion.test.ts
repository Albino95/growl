import { describe, it, expect, vi } from 'vitest';

type Cfg = Record<string, unknown>;
type Anim = { type: string; value?: unknown; config?: Cfg; children?: Anim[]; start: () => void; stop: () => void };

vi.mock('react-native', () => {
  const mk = (type: string, extra: Partial<Anim>): Anim => ({ type, start: () => undefined, stop: () => undefined, ...extra });
  const bezier = (...args: number[]) => Object.assign((t: number) => t, { bezier: args });
  return {
    Platform: { OS: 'ios' },
    Easing: { bezier, linear: Object.assign((t: number) => t, { linear: true }) },
    Animated: {
      Value: class {
        constructor(public v: number) {}
      },
      timing: (value: unknown, config: Cfg) => mk('timing', { value, config }),
      spring: (value: unknown, config: Cfg) => mk('spring', { value, config }),
      sequence: (children: Anim[]) => mk('sequence', { children }),
      loop: (child: Anim, config: Cfg) => mk('loop', { children: [child], config }),
    },
  };
});

const { Animated } = await import('react-native');
const m = await import('./motion');

const v = () => new Animated.Value(0);
const asAnim = (a: unknown) => a as Anim;

describe('motion tokens', () => {
  it('has the agreed scale', () => {
    expect(m.duration).toEqual({ instant: 90, quick: 150, base: 220, gentle: 320, slow: 520 });
    expect(m.springs.snappy).toEqual({ damping: 20, stiffness: 320, mass: 1 });
    expect(m.springs.gentle).toEqual({ damping: 22, stiffness: 180, mass: 1 });
    expect(m.springs.bouncy).toEqual({ damping: 11, stiffness: 220, mass: 0.9 });
    expect(m.press).toEqual({ scale: 0.96, icon: 0.9 });
    expect(m.stagger).toBe(40);
    expect(m.loopPeriod).toBe(1600);
    expect((m.easing.out as unknown as { bezier: number[] }).bezier).toEqual([0.23, 1, 0.32, 1]);
    expect((m.easing.standard as unknown as { bezier: number[] }).bezier).toEqual([0.2, 0, 0, 1]);
  });
});

describe('motion helpers', () => {
  it('timing defaults to base duration, standard easing, native driver', () => {
    const a = asAnim(m.timing(v(), 1));
    expect(a.type).toBe('timing');
    expect(a.config).toMatchObject({ toValue: 1, duration: 220, delay: 0, useNativeDriver: true });
    expect(a.config!.easing).toBe(m.easing.standard);
  });

  it('timing honours overrides and the explicit JS-driver opt-out', () => {
    const a = asAnim(m.timing(v(), 0, { duration: 90, easing: m.easing.in, delay: 40, useNativeDriver: false }));
    expect(a.config).toMatchObject({ duration: 90, delay: 40, useNativeDriver: false });
  });

  it('reduced timing / spring become a quick linear native timing', () => {
    for (const a of [asAnim(m.timing(v(), 1, { duration: 520, delay: 200 }, true)), asAnim(m.spring(v(), 1, 'bouncy', true))]) {
      expect(a.type).toBe('timing');
      expect(a.config).toMatchObject({ toValue: 1, duration: 150, useNativeDriver: true });
      expect(a.config!.easing).toBe(m.easing.linear);
      expect(a.config!.delay).toBeUndefined();
    }
  });

  it('spring uses preset physics on the native driver', () => {
    const a = asAnim(m.spring(v(), 0.96, 'snappy'));
    expect(a.type).toBe('spring');
    expect(a.config).toMatchObject({ toValue: 0.96, damping: 20, stiffness: 320, mass: 1, useNativeDriver: true });
  });

  it('pop rises to the peak then springs back to 1, all native', () => {
    const a = asAnim(m.pop(v()));
    expect(a.type).toBe('sequence');
    const [up, back] = a.children!;
    expect(up.config).toMatchObject({ toValue: 1.12, duration: 90, useNativeDriver: true });
    expect(back.type).toBe('spring');
    expect(back.config).toMatchObject({ toValue: 1, damping: 11, stiffness: 220, useNativeDriver: true });
    const reduced = asAnim(m.pop(v(), 1.2, 'snappy', true));
    expect(reduced.config).toMatchObject({ toValue: 1, duration: 0, useNativeDriver: true });
  });

  it('breathe loops over loopPeriod and returns null when reduced', () => {
    const a = asAnim(m.breathe(v(), 1, 1.1, { iterations: 3 }));
    expect(a.type).toBe('loop');
    expect(a.config).toEqual({ iterations: 3 });
    const halves = a.children![0].children!;
    expect(halves.map((h) => h.config!.duration)).toEqual([800, 800]);
    expect(halves.every((h) => h.config!.useNativeDriver === true)).toBe(true);
    expect(m.breathe(v(), 1, 1.1, {}, true)).toBeNull();
  });
});
