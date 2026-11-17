import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import tw from '../../lib/tw';
import { easing, loopPeriod } from '../../theme/motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const STILL = [0.55, 0.85, 0.65, 0.95, 0.5];

type Props = {
  active: boolean;
  color?: string;
  barCount?: number;
};

/** Tiny looping bars used when ambient sound or a live pulse is on. */
export default function EqualizerBars({
  active,
  color = '#6EE7B7',
  barCount = 5,
}: Props) {
  const bars = useRef(
    Array.from({ length: barCount }, () => new Animated.Value(0.35))
  ).current;
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!active || reduced) {
      // Reduced motion: a still, mid-height "on" shape; inactive: low bars.
      bars.forEach((b, i) => b.setValue(active ? STILL[i % STILL.length] : 0.28));
      return;
    }
    // Each bar runs a slightly different period (~loopPeriod/2 ± offset) so they never sync up.
    const quarter = loopPeriod / 4;
    const loops = bars.map((bar, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(bar, {
            toValue: 1,
            duration: quarter + i * 90,
            easing: easing.inOut,
            useNativeDriver: true,
          }),
          Animated.timing(bar, {
            toValue: 0.28,
            duration: quarter - 20 + i * 70,
            easing: easing.inOut,
            useNativeDriver: true,
          }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [active, bars, reduced]);

  return (
    <View style={tw`flex-row items-end h-4 gap-0.5`}>
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={{
            width: 3,
            height: 14,
            borderRadius: 2,
            backgroundColor: color,
            transform: [{ scaleY: bar }],
          }}
        />
      ))}
    </View>
  );
}
