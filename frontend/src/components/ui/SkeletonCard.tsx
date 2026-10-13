import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import tw, { theme } from '../../lib/tw';

export type SkeletonVariant =
  | 'post'
  | 'product'
  | 'inbox'
  | 'explore'
  | 'comment'
  | 'message';

type Props = {
  variant?: SkeletonVariant;
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

/** Cream-surface shimmer placeholders for loading states. */
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

  if (variant === 'inbox') {
    return (
      <View style={tw`mb-2 bg-[#FFFcf7] border border-stone-200/80 rounded-2xl px-3 py-3.5 flex-row items-center`}>
        <ShimmerBlock style={tw`w-14 h-14 rounded-full`} />
        <View style={tw`flex-1 ml-3`}>
          <View style={tw`flex-row items-center justify-between mb-2`}>
            <ShimmerBlock style={tw`h-3 w-28 rounded`} />
            <ShimmerBlock style={tw`h-2.5 w-10 rounded`} />
          </View>
          <ShimmerBlock style={tw`h-3 w-4/5 rounded`} />
        </View>
      </View>
    );
  }

  if (variant === 'explore') {
    return (
      <View style={tw`bg-white border border-stone-200/80 rounded-2xl overflow-hidden mb-3`}>
        <ShimmerBlock style={tw`w-full h-52`} />
        <View style={tw`p-3.5`}>
          <View style={tw`flex-row items-center mb-2`}>
            <ShimmerBlock style={tw`w-9 h-9 rounded-full mr-2.5`} />
            <ShimmerBlock style={tw`h-3 w-32 rounded`} />
          </View>
          <ShimmerBlock style={tw`h-3 w-full rounded mb-2`} />
          <ShimmerBlock style={tw`h-3 w-2/3 rounded`} />
        </View>
      </View>
    );
  }

  if (variant === 'comment') {
    return (
      <View style={tw`flex-row items-start mb-4`}>
        <ShimmerBlock style={tw`w-8 h-8 rounded-full mr-3`} />
        <View style={tw`flex-1`}>
          <ShimmerBlock style={tw`h-16 w-full rounded-2xl mb-1.5`} />
          <ShimmerBlock style={tw`h-2.5 w-12 rounded ml-2`} />
        </View>
      </View>
    );
  }

  if (variant === 'message') {
    return (
      <View style={tw`mb-3`}>
        <View style={tw`flex-row justify-start mb-2.5`}>
          <ShimmerBlock style={tw`h-11 w-48 rounded-2xl rounded-tl-md`} />
        </View>
        <View style={tw`flex-row justify-end mb-2.5`}>
          <ShimmerBlock style={tw`h-11 w-40 rounded-2xl rounded-tr-md`} />
        </View>
        <View style={tw`flex-row justify-start`}>
          <ShimmerBlock style={tw`h-14 w-56 rounded-2xl rounded-tl-md`} />
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

/** Stack of skeleton cards for list loading. */
export function SkeletonList({
  variant = 'post',
  count = 3,
}: {
  variant?: SkeletonVariant;
  count?: number;
}) {
  return (
    <View>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={`${variant}-${i}`} variant={variant} />
      ))}
    </View>
  );
}
