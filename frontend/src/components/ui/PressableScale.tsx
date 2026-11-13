import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { triggerFeedback, type FeedbackKind } from '../../utils/interactionFeedback';
import { press, spring } from '../../theme/motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = PressableProps & {
  style?: StyleProp<ViewStyle>;
  /** Scale when pressed (default motion.press.scale = 0.96). */
  pressedScale?: number;
  /**
   * Haptic/sound fired on press (never press-in). Default: none — plain
   * navigation taps are silent. Pass a kind for state-changing taps
   * (e.g. 'impactLight', 'selection', 'success'). `true` = legacy 'tap' (silent).
   */
  feedback?: boolean | FeedbackKind;
  /** Optional: a childless PressableScale works as a tap-to-dismiss backdrop. */
  children?: React.ReactNode;
};

/**
 * Soft press scale used across cream surfaces so taps feel alive without flashy motion.
 * Haptics are opt-in via `feedback` and fire on press, not press-in (scroll-safe).
 * Scale is applied on the same node as layout styles so flex-1 / flex-row keep working.
 */
export default function PressableScale({
  style,
  pressedScale = press.scale,
  feedback = false,
  onPressIn,
  onPressOut,
  onPress,
  children,
  ...rest
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();

  return (
    <AnimatedPressable
      {...rest}
      style={[style, { transform: [{ scale }] }]}
      onPressIn={(e) => {
        if (!reduced) spring(scale, pressedScale, 'snappy').start();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        spring(scale, 1, 'snappy', reduced).start();
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
