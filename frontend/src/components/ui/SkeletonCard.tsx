import React from 'react';
import { View } from 'react-native';
import tw, { theme } from '../../lib/tw';
import Skeleton from './Skeleton';

export type SkeletonVariant =
  | 'post'
  | 'product'
  | 'inbox'
  | 'explore'
  | 'comment'
  | 'message'
  | 'notification'
  | 'journal'
  | 'circle'
  | 'badges'
  | 'stats';

type Props = {
  variant?: SkeletonVariant;
};

function ShimmerBlock({ style }: { style: object }) {
  return <Skeleton style={style} />;
}

/** Cream-surface shimmer placeholders for loading states. */
export default function SkeletonCard({ variant = 'post' }: Props) {
  if (variant === 'product') {
    return (
      <View style={tw`bg-card mb-3 rounded-card border border-line p-4 flex-row`}>
        <ShimmerBlock style={tw`w-24 h-28 rounded-control mr-3`} />
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
      <View style={tw`mb-2 bg-card border border-line rounded-card px-3 py-3.5 flex-row items-center`}>
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
      <View style={tw`bg-card border border-line rounded-card overflow-hidden mb-3`}>
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

  if (variant === 'notification') {
    return (
      <View
        style={tw`mb-3 rounded-sheet border border-line bg-card overflow-hidden flex-row`}
      >
        <View style={{ width: 5, backgroundColor: theme.colors.line }} />
        <View style={tw`flex-1 px-3.5 py-3.5 flex-row items-start`}>
          <ShimmerBlock style={tw`w-12 h-12 rounded-full mr-3`} />
          <View style={tw`flex-1`}>
            <View style={tw`flex-row items-center justify-between mb-2`}>
              <ShimmerBlock style={tw`h-4 w-16 rounded-full`} />
              <ShimmerBlock style={tw`h-2.5 w-8 rounded`} />
            </View>
            <ShimmerBlock style={tw`h-3.5 w-4/5 rounded mb-2`} />
            <ShimmerBlock style={tw`h-3 w-3/5 rounded`} />
          </View>
        </View>
      </View>
    );
  }

  if (variant === 'journal') {
    return (
      <View
        style={[
          tw`mb-3 px-4 py-4 rounded-card bg-card`,
          { borderWidth: 1, borderColor: theme.colors.line },
        ]}
      >
        <View style={tw`flex-row items-center justify-between mb-3`}>
          <ShimmerBlock style={tw`h-3 w-28 rounded`} />
          <ShimmerBlock style={tw`h-3 w-10 rounded`} />
        </View>
        <ShimmerBlock style={tw`h-3.5 w-full rounded mb-2`} />
        <ShimmerBlock style={tw`h-3.5 w-11/12 rounded mb-2`} />
        <ShimmerBlock style={tw`h-3.5 w-1/2 rounded`} />
      </View>
    );
  }

  if (variant === 'circle') {
    return (
      <View
        style={tw`mb-2.5 rounded-sheet border border-line bg-card overflow-hidden`}
      >
        <View style={tw`h-1 bg-line`} />
        <View style={tw`px-3.5 py-3.5 flex-row items-center`}>
          <ShimmerBlock style={tw`w-11 h-11 rounded-card mr-3`} />
          <View style={tw`flex-1`}>
            <ShimmerBlock style={tw`h-3 w-20 rounded-full mb-2`} />
            <ShimmerBlock style={tw`h-3.5 w-3/5 rounded mb-3`} />
            <ShimmerBlock style={tw`h-2 w-2/5 rounded-full`} />
          </View>
          <ShimmerBlock style={tw`h-8 w-16 rounded-full ml-2`} />
        </View>
      </View>
    );
  }

  if (variant === 'badges') {
    return (
      <View style={tw`mb-5`}>
        <ShimmerBlock style={tw`h-3 w-24 rounded mb-3 ml-1`} />
        <View style={tw`flex-row flex-wrap gap-2.5`}>
          {Array.from({ length: 6 }, (_, i) => (
            <ShimmerBlock key={i} style={tw`w-[30%] h-28 rounded-card`} />
          ))}
        </View>
      </View>
    );
  }

  if (variant === 'stats') {
    return (
      <View style={tw`mb-4`}>
        <View style={tw`flex-row gap-3 mb-3`}>
          <ShimmerBlock style={tw`flex-1 h-20 rounded-card`} />
          <ShimmerBlock style={tw`flex-1 h-20 rounded-card`} />
        </View>
        <ShimmerBlock style={tw`h-28 w-full rounded-card`} />
      </View>
    );
  }

  if (variant === 'comment') {
    return (
      <View style={tw`flex-row items-start mb-4`}>
        <ShimmerBlock style={tw`w-8 h-8 rounded-full mr-3`} />
        <View style={tw`flex-1`}>
          <ShimmerBlock style={tw`h-16 w-full rounded-card mb-1.5`} />
          <ShimmerBlock style={tw`h-2.5 w-12 rounded ml-2`} />
        </View>
      </View>
    );
  }

  if (variant === 'message') {
    return (
      <View style={tw`mb-3`}>
        <View style={tw`flex-row justify-start mb-2.5`}>
          <ShimmerBlock style={tw`h-11 w-48 rounded-card rounded-tl-md`} />
        </View>
        <View style={tw`flex-row justify-end mb-2.5`}>
          <ShimmerBlock style={tw`h-11 w-40 rounded-card rounded-tr-md`} />
        </View>
        <View style={tw`flex-row justify-start`}>
          <ShimmerBlock style={tw`h-14 w-56 rounded-card rounded-tl-md`} />
        </View>
      </View>
    );
  }

  return (
    <View style={tw`bg-card mb-4 rounded-card border border-line overflow-hidden`}>
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
