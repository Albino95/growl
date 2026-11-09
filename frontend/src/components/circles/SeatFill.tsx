import React, { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import tw from '../../lib/tw';

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

  useEffect(() => {
    Animated.spring(progress, {
      toValue: taken / cap,
      friction: 8,
      tension: 70,
      useNativeDriver: false,
    }).start();
  }, [taken, cap, progress]);

  const hot = taken >= 8;
  return (
    <View>
      <Text style={tw`text-[11px] font-semibold text-stone-500 mb-1.5`}>
        {occupancyCopy(taken, cap)}
      </Text>
      <View style={tw`h-1.5 rounded-full bg-[#EAE4D6] overflow-hidden`}>
        <Animated.View
          style={{
            height: 6,
            borderRadius: 99,
            backgroundColor: hot ? '#F97066' : '#059669',
            width: progress.interpolate({
              inputRange: [0, 1],
              outputRange: ['4%', '100%'],
            }),
          }}
        />
      </View>
    </View>
  );
}
