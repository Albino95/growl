import React, { useEffect, useRef } from 'react';
import { Animated, View, type StyleProp, type ViewStyle } from 'react-native';
import { breathe } from '../../theme/motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';

type Props = {
  children: React.ReactNode;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Soft breathe so a chip or seat feels occupied, not static. */
export default function LiveHalo({ children, active = true, style }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();

  useEffect(() => {
    scale.setValue(1);
    const loop = active ? breathe(scale, 1, 1.045, {}, reduced) : null;
    if (!loop) return;
    loop.start();
    return () => loop.stop();
  }, [active, reduced, scale]);

  return (
    <View style={style}>
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </View>
  );
}
