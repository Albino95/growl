import React, { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

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

/** Soft rise + fade for empty states, sheets, and first-paint blocks. */
export default function FadeInUp({
  children,
  style,
  delay = 0,
  distance = 12,
  disabled = false,
}: Props) {
  const opacity = useRef(new Animated.Value(disabled ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(disabled ? 0 : distance)).current;

  useEffect(() => {
    if (disabled) return;
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
  }, [delay, disabled, opacity, translateY]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}
