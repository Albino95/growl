import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import tw, { theme } from '../../lib/tw';

type Props = {
  /** Card with avatar row + image block */
  variant?: 'post' | 'product';
};

function ShimmerBlock({ style }: { style: object }) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  return (
    <Animated.View
      style={[
        style,
        {
          backgroundColor: theme.colors.subtle,
          opacity: shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.95] }),
        },
      ]}
    />
  );
}

/** Lightweight skeleton placeholder for feed/marketplace loading states. */
export default function SkeletonCard({ variant = 'post' }: Props) {
  if (variant === 'product') {
    return (
      <View style={tw`bg-surface-card mb-3 rounded-2xl border border-stone-200/80 p-4 flex-row`}>
        <ShimmerBlock style={tw`w-24 h-28 rounded-xl mr-3`} />
        <View style={tw`flex-1 justify-center`}>
          <ShimmerBlock style={tw`h-3 w-3/4 rounded mb-2`} />
          <ShimmerBlock style={tw`h-3 w-full rounded mb-2`} />
          <ShimmerBlock style={tw`h-4 w-16 rounded`} />
        </View>
      </View>
    );
  }

  return (
    <View style={tw`bg-surface-card mb-4 rounded-2xl border border-stone-200/80 overflow-hidden`}>
      <View style={tw`flex-row items-center px-4 py-3`}>
        <ShimmerBlock style={tw`w-11 h-11 rounded-full`} />
        <View style={tw`ml-3 flex-1`}>
          <ShimmerBlock style={tw`h-3 w-24 rounded mb-2`} />
          <ShimmerBlock style={tw`h-2 w-16 rounded`} />
        </View>
      </View>
      <ShimmerBlock style={tw`w-full h-72`} />
    </View>
  );
}
