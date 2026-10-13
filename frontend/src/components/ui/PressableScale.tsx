import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { triggerFeedback, type FeedbackKind } from '../../utils/interactionFeedback';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = PressableProps & {
  style?: StyleProp<ViewStyle>;
  /** Scale when pressed (default 0.98). */
  pressedScale?: number;
  /** Fire haptics/sound via app feedback helper. */
  feedback?: boolean | FeedbackKind;
  children: React.ReactNode;
};

/**
 * Soft press scale used across cream surfaces so taps feel alive without flashy motion.
 * Scale is applied on the same node as layout styles so flex-1 / flex-row keep working.
 */
export default function PressableScale({
  style,
  pressedScale = 0.98,
  feedback = true,
  onPressIn,
  onPressOut,
  onPress,
  children,
  ...rest
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <AnimatedPressable
      {...rest}
      style={[style, { transform: [{ scale }] }]}
      onPressIn={(e) => {
        Animated.spring(scale, {
          toValue: pressedScale,
          useNativeDriver: true,
          speed: 40,
          bounciness: 0,
        }).start();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 28,
          bounciness: 6,
        }).start();
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (feedback) {
          triggerFeedback(typeof feedback === 'string' ? feedback : 'tap');
        }
        onPress?.(e);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}
