import React, { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import tw, { theme } from '../../lib/tw';
import { spring } from '../../theme/motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';

type Props = {
  filled: number;
  max?: number;
};

function occupancyCopy(filled: number, max: number) {
  if (filled <= 0) return `0 of ${max} seated`;
  if (filled === 1) return `Just you · 1 of ${max}`;
  if (filled >= max) return `Full · ${max} of ${max}`;
  return `${filled} of ${max} seated`;
}

/** Continuous seat fill — never a row of pager dots that look like other circles. */
export default function SeatFill({ filled, max = 10 }: Props) {
  const cap = Math.max(1, max);
  const taken = Math.max(0, Math.min(cap, filled));
  const progress = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();

  useEffect(() => {
    spring(progress, taken / cap, 'gentle', reduced).start();
  }, [taken, cap, progress, reduced]);

  const hot = taken >= 8;
  return (
    <View>
      <Text style={tw`text-caption font-semibold text-ink-3 mb-1.5`}>
        {occupancyCopy(taken, cap)}
      </Text>
      <View style={tw`h-1.5 rounded-full bg-raised overflow-hidden`}>
        <Animated.View
          style={{
            height: 6,
            width: '100%',
            backgroundColor: hot ? theme.colors.energy : theme.colors.brand,
            // Native-driven scaleX anchored left (track's rounded overflow clips the ends).
            transformOrigin: 'left',
            transform: [
              {
                scaleX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.04, 1],
                }),
              },
            ],
          }}
        />
      </View>
    </View>
  );
}
