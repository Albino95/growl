import React, { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../../hooks/useReducedMotion';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Delay before enter (ms). */
  delay?: number;
  /** Vertical travel distance. */
  distance?: number;
  /** Skip animation (e.g. already mounted content). */
  disabled?: boolean;
};

/**
 * Soft rise + fade for empty states, sheets, and first-paint blocks.
 * With Reduce Motion on: a short opacity fade only, no travel.
 */
export default function FadeInUp({
  children,
  style,
  delay = 0,
  distance = 12,
  disabled = false,
}: Props) {
  const reduceMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(disabled ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(disabled || reduceMotion ? 0 : distance)).current;

  useEffect(() => {
    if (disabled) return;
    if (reduceMotion) {
      translateY.setValue(0);
      const fade = Animated.timing(opacity, {
        toValue: 1,
        duration: 150,
        delay: Math.min(delay, 120),
        useNativeDriver: true,
      });
      fade.start();
      return () => fade.stop();
    }
    const anim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        delay,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        delay,
        useNativeDriver: true,
        speed: 18,
        bounciness: 6,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [delay, disabled, opacity, reduceMotion, translateY]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}
