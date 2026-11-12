import { Animated, Easing } from 'react-native';

export const AUTH_EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/** Max duration for any reduced-motion opacity crossfade. */
export const REDUCED_FADE_MS = 150;

/**
 * Horizontal error shake: 0 → -8 → 8 → -6 → 6 → -3 → 0 (6 × 40ms, native driver).
 * Returns null when motion is reduced (callers keep the haptic + red border).
 */
export function runShake(value: Animated.Value, reducedMotion: boolean): Animated.CompositeAnimation | null {
  if (reducedMotion) return null;
  value.setValue(0);
  const steps = [-8, 8, -6, 6, -3, 0];
  const anim = Animated.sequence(
    steps.map((toValue) =>
      Animated.timing(value, {
        toValue,
        duration: 40,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    )
  );
  anim.start();
  return anim;
}
