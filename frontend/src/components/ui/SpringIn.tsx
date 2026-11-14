import React, { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { spring } from '../../theme/motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';

type Props = {
  /** Spring in on mount (e.g. a button that just morphed to "Requested"). False = render still. */
  animate?: boolean;
  /** Starting scale (default 0.86). */
  from?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/**
 * Wraps a freshly swapped-in element (state morph) and springs it into place
 * with motion `snappy`. Static under Reduce Motion or when `animate` is false.
 */
export default function SpringIn({ animate = true, from = 0.86, style, children }: Props) {
  const reduced = useReducedMotion();
  const still = !animate || reduced;
  const scale = useRef(new Animated.Value(still ? 1 : from)).current;

  useEffect(() => {
    if (still) {
      scale.setValue(1);
      return;
    }
    const anim = spring(scale, 1, 'snappy');
    anim.start();
    return () => anim.stop();
  }, [still, scale]);

  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}
