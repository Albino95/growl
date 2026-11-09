import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import tw from '../../lib/tw';

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

  useEffect(() => {
    if (!active) {
      bars.forEach((b) => b.setValue(0.28));
      return;
    }
    const loops = bars.map((bar, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(bar, {
            toValue: 1,
            duration: 420 + i * 90,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(bar, {
            toValue: 0.28,
            duration: 380 + i * 70,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [active, bars]);

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
