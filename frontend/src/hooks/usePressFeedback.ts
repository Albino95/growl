import { useCallback, useRef } from 'react';
import { Animated } from 'react-native';
import { triggerFeedback, type FeedbackKind } from '../utils/interactionFeedback';

type UsePressFeedbackOptions = {
  onPress?: () => void;
  disabled?: boolean;
  kind?: FeedbackKind;
};

export function usePressFeedback({
  onPress,
  disabled,
  kind = 'tap',
}: UsePressFeedbackOptions) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = useCallback(
    (toValue: number, speed: number, bounciness: number) => {
      Animated.spring(scale, {
        toValue,
        useNativeDriver: true,
        speed,
        bounciness,
      }).start();
    },
    [scale]
  );

  const onPressIn = useCallback(() => {
    if (disabled) return;
    triggerFeedback(kind);
    animateTo(0.94, 42, 0);
  }, [animateTo, disabled, kind]);

  const onPressOut = useCallback(() => {
    animateTo(1, 28, 7);
  }, [animateTo]);

  const onPressWithFeedback = useCallback(() => {
    if (disabled) return;
    onPress?.();
  }, [disabled, onPress]);

  return {
    animatedStyle: { transform: [{ scale }] },
    onPressIn,
    onPressOut,
    onPress: onPressWithFeedback,
  };
}
