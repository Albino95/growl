import type {
  BottomTabSceneInterpolationProps,
  BottomTabSceneInterpolatedStyle,
  TransitionSpec,
} from '@react-navigation/bottom-tabs';

/** Soft spring — snappy enough to feel intentional, not floaty. */
export const GrowTabTransitionSpec: TransitionSpec = {
  animation: 'spring',
  config: {
    stiffness: 320,
    damping: 36,
    mass: 0.8,
    overshootClamping: true,
    restDisplacementThreshold: 0.01,
    restSpeedThreshold: 0.01,
  },
};

/**
 * Fade + directional shift based on tab index.
 * progress: -1 (left of active) → 0 (active) → 1 (right of active)
 * Keep opacity at rest locked to 1; no scale (scale + detach races look blank).
 */
export function forGrowTabScene({
  current,
}: BottomTabSceneInterpolationProps): BottomTabSceneInterpolatedStyle {
  const opacity = current.progress.interpolate({
    inputRange: [-1, -0.2, 0, 0.2, 1],
    outputRange: [0, 0.85, 1, 0.85, 0],
    extrapolate: 'clamp',
  });

  const translateX = current.progress.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [-14, 0, 14],
    extrapolate: 'clamp',
  });

  return {
    sceneStyle: {
      opacity,
      transform: [{ translateX }],
    },
  };
}
