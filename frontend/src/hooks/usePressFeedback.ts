import { useCallback, useRef } from 'react';
import { Animated } from 'react-native';
import { triggerPressFeedback } from '../utils/interactionFeedback';

type UsePressFeedbackOptions = {
  onPress?: () => void;
  disabled?: boolean;
};

export function usePressFeedback({ onPress, disabled }: UsePressFeedbackOptions) {
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
    triggerPressFeedback();
    animateTo(0.98, 90);
  }, [animateTo, disabled]);

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
