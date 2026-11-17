import { Animated, Easing, type EasingFunction } from 'react-native';

/**
 * Grow! motion tokens — the one place durations, easings and springs live.
 *
 * - `duration.*` for timing animations (ms).
 * - `easing.standard` for on-screen movement, `easing.out` for things arriving,
 *   `easing.in` for things leaving, `easing.inOut` for breathing loops.
 * - `spring.snappy` for press / toggles, `spring.gentle` for sheets & layout,
 *   `spring.bouncy` for delight (likes, pops, milestone badges).
 * - `press.scale` for surfaces, `press.icon` for small icon buttons.
 *
 * Every helper defaults to the native driver and accepts a `reduced` flag
 * (from `useReducedMotion()`): reduced motion swaps movement for a short linear
 * timing (≤ `duration.quick`) so state still lands, without travel or bounce.
 */
export const duration = {
  instant: 90,
  quick: 150,
  base: 220,
  gentle: 320,
  slow: 520,
} as const;

export const easing = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  out: Easing.bezier(0.23, 1, 0.32, 1),
  in: Easing.bezier(0.4, 0, 1, 1),
  /** Symmetric sine-like curve for breathing / pulsing loops. */
  inOut: Easing.bezier(0.45, 0, 0.55, 1),
  linear: Easing.linear,
} as const;

export type SpringPreset = 'snappy' | 'gentle' | 'bouncy';

export const springs: Record<SpringPreset, { damping: number; stiffness: number; mass: number }> = {
  snappy: { damping: 20, stiffness: 320, mass: 1 },
  gentle: { damping: 22, stiffness: 180, mass: 1 },
  bouncy: { damping: 11, stiffness: 220, mass: 0.9 },
};

export const press = {
  /** Cards, rows, buttons. */
  scale: 0.96,
  /** Small icon buttons (the icon itself, not the hit area). */
  icon: 0.9,
} as const;

/** Delay between items in a staggered list entrance (ms). */
export const stagger = 40;

/** One full cycle of any ambient loop (shimmer, breathe, pulse) in ms. */
export const loopPeriod = 1600;

export const motion = {
  duration,
  easing,
  spring: springs,
  press,
  stagger,
  loopPeriod,
} as const;

export type TimingOptions = {
  duration?: number;
  easing?: EasingFunction;
  delay?: number;
  /** Defaults to true. Set false only for layout/color props the native driver can't animate. */
  useNativeDriver?: boolean;
};

/** Short linear timing used in place of any movement when reduce motion is on. */
function reducedTiming(
  value: Animated.Value,
  toValue: number,
  useNativeDriver: boolean
): Animated.CompositeAnimation {
  return Animated.timing(value, {
    toValue,
    duration: duration.quick,
    easing: Easing.linear,
    useNativeDriver,
  });
}

/**
 * Tokenised `Animated.timing`. Defaults: `duration.base`, `easing.standard`,
 * native driver. Reduced motion → quick linear timing, no delay.
 */
export function timing(
  value: Animated.Value,
  toValue: number,
  opts: TimingOptions = {},
  reduced = false
): Animated.CompositeAnimation {
  const useNativeDriver = opts.useNativeDriver ?? true;
  if (reduced) return reducedTiming(value, toValue, useNativeDriver);
  return Animated.timing(value, {
    toValue,
    duration: opts.duration ?? duration.base,
    easing: opts.easing ?? easing.standard,
    delay: opts.delay ?? 0,
    useNativeDriver,
  });
}

/**
 * Tokenised `Animated.spring` (`snappy` | `gentle` | `bouncy`), native driver.
 * Reduced motion → quick linear timing (no overshoot).
 */
export function spring(
  value: Animated.Value,
  toValue: number,
  preset: SpringPreset = 'snappy',
  reduced = false,
  opts: { delay?: number; useNativeDriver?: boolean } = {}
): Animated.CompositeAnimation {
  const useNativeDriver = opts.useNativeDriver ?? true;
  if (reduced) return reducedTiming(value, toValue, useNativeDriver);
  return Animated.spring(value, {
    toValue,
    ...springs[preset],
    delay: opts.delay ?? 0,
    useNativeDriver,
  });
}

/**
 * A "pop": quick rise to `peak`, then spring back to 1. Use for like hearts,
 * badges, counters landing. Reduced motion → snaps to 1 (no movement).
 */
export function pop(
  value: Animated.Value,
  peak = 1.12,
  preset: SpringPreset = 'bouncy',
  reduced = false
): Animated.CompositeAnimation {
  if (reduced) {
    return Animated.timing(value, { toValue: 1, duration: 0, useNativeDriver: true });
  }
  return Animated.sequence([
    Animated.timing(value, {
      toValue: peak,
      duration: duration.instant,
      easing: easing.out,
      useNativeDriver: true,
    }),
    Animated.spring(value, { toValue: 1, ...springs[preset], useNativeDriver: true }),
  ]);
}

/**
 * An ambient back-and-forth loop between `from` and `to` over `period` ms
 * (default `loopPeriod`). Pass `iterations` to stop after N cycles.
 * Returns null under reduced motion — callers should hold a static value.
 */
export function breathe(
  value: Animated.Value,
  from: number,
  to: number,
  { period = loopPeriod, iterations = -1 }: { period?: number; iterations?: number } = {},
  reduced = false
): Animated.CompositeAnimation | null {
  if (reduced) return null;
  const half = Math.round(period / 2);
  return Animated.loop(
    Animated.sequence([
      Animated.timing(value, { toValue: to, duration: half, easing: easing.inOut, useNativeDriver: true }),
      Animated.timing(value, { toValue: from, duration: half, easing: easing.inOut, useNativeDriver: true }),
    ]),
    { iterations }
  );
}

export default motion;
