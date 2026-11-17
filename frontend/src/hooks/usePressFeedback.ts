import { useCallback, useRef } from 'react';
import { Animated } from 'react-native';
import { triggerFeedback, type FeedbackKind } from '../utils/interactionFeedback';
import { press, spring } from '../theme/motion';
import { useReducedMotion } from './useReducedMotion';

type UsePressFeedbackOptions = {
  onPress?: () => void;
  disabled?: boolean;
  /** Haptic/sound kind fired on press (not press-in). Omit for a silent tap. */
  kind?: FeedbackKind;
  /** Pressed scale (default motion.press.scale). */
  pressedScale?: number;
};

/**
 * Press-in scales down (visual only, so a touch that turns into a scroll stays
 * silent); the haptic fires on `onPress`, i.e. only on a real tap.
 */
export function usePressFeedback({
  onPress,
  disabled,
  kind,
  pressedScale = press.scale,
}: UsePressFeedbackOptions) {
  const scale = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();

  const onPressIn = useCallback(() => {
    if (disabled || reduced) return;
    spring(scale, pressedScale, 'snappy').start();
  }, [disabled, pressedScale, reduced, scale]);

  const onPressOut = useCallback(() => {
    spring(scale, 1, 'snappy', reduced).start();
  }, [reduced, scale]);

  const onPressWithFeedback = useCallback(() => {
    if (disabled) return;
    if (kind) triggerFeedback(kind);
    onPress?.();
  }, [disabled, kind, onPress]);

  return {
    animatedStyle: { transform: [{ scale }] },
    onPressIn,
    onPressOut,
    onPress: onPressWithFeedback,
  };
}
