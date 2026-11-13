import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import tw from '../../lib/tw';
import { breathe, spring, stagger } from '../../theme/motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';

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
  const reduced = useReducedMotion();

  useEffect(() => {
    const anims = scales
      .slice(0, count)
      .map((s, i) => spring(s, i < taken ? 1 : 0.55, 'bouncy', reduced));
    if (reduced) Animated.parallel(anims).start();
    else Animated.stagger(stagger / 2, anims).start();
  }, [taken, count, reduced, scales]);

  useEffect(() => {
    glow.setValue(1);
    const loop = live && taken > 0 ? breathe(glow, 1, 1.35, {}, reduced) : null;
    if (!loop) return;
    loop.start();
    return () => loop.stop();
  }, [live, taken, reduced, glow]);

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
