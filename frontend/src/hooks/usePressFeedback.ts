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
    (toValue: number, duration: number) => {
      Animated.timing(scale, {
        toValue,
        duration,
        useNativeDriver: true,
      }).start();
    },
    [scale]
  );

  const onPressIn = useCallback(() => {
    if (disabled) return;
    triggerFeedback(kind);
    animateTo(0.98, 90);
  }, [animateTo, disabled, kind]);

  const onPressOut = useCallback(() => {
    animateTo(1, 110);
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
