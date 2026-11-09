import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import tw from '../../lib/tw';

type Props = {
  filled: number;
  max?: number;
  /** Last filled seat gently breathes when the room is live. */
  live?: boolean;
  size?: number;
};

/** Ten chairs around a table — occupancy you can feel, not just “4/10”. */
export default function SeatDots({ filled, max = 10, live = false, size = 8 }: Props) {
  const count = Math.max(1, Math.min(12, max));
  const taken = Math.max(0, Math.min(count, filled));
  const scales = useRef(Array.from({ length: 12 }, () => new Animated.Value(0.45))).current;
  const glow = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anims = scales.slice(0, count).map((s, i) =>
      Animated.spring(s, {
        toValue: i < taken ? 1 : 0.55,
        delay: i * 28,
        friction: 6,
        tension: 140,
        useNativeDriver: true,
      })
    );
    Animated.stagger(18, anims).start();
  }, [taken, count, scales]);

  useEffect(() => {
    if (!live || taken <= 0) {
      glow.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1.35,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [live, taken, glow]);

  return (
    <View style={tw`flex-row items-center`}>
      {Array.from({ length: count }).map((_, i) => {
        const on = i < taken;
        const isLast = on && i === taken - 1;
        return (
          <Animated.View
            key={i}
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              marginRight: 3,
              backgroundColor: on ? (i >= 8 ? '#F97066' : '#059669') : '#E7E5E4',
              transform: [{ scale: isLast && live ? glow : scales[i] }],
            }}
          />
        );
      })}
    </View>
  );
}
