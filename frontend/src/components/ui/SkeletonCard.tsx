import React from 'react';
import { View } from 'react-native';
import tw from '../../lib/tw';

type Props = {
  /** Card with avatar row + image block */
  variant?: 'post' | 'product';
};

/** Lightweight skeleton placeholder for feed/marketplace loading states. */
export default function SkeletonCard({ variant = 'post' }: Props) {
  if (variant === 'product') {
    return (
      <View style={tw`bg-white mb-3 rounded-2xl border border-stone-200 p-4 flex-row`}>
        <View style={tw`w-24 h-28 rounded-xl bg-stone-200 mr-3`} />
        <View style={tw`flex-1 justify-center`}>
          <View style={tw`h-3 w-3/4 bg-stone-200 rounded mb-2`} />
          <View style={tw`h-3 w-full bg-stone-100 rounded mb-2`} />
          <View style={tw`h-4 w-16 bg-stone-200 rounded`} />
        </View>
      </View>
    );
  }

  return (
    <View style={tw`bg-white mb-4 rounded-2xl border border-stone-200 overflow-hidden`}>
      <View style={tw`flex-row items-center px-4 py-3`}>
        <View style={tw`w-11 h-11 rounded-full bg-stone-200`} />
        <View style={tw`ml-3 flex-1`}>
          <View style={tw`h-3 w-24 bg-stone-200 rounded mb-2`} />
          <View style={tw`h-2 w-16 bg-stone-100 rounded`} />
        </View>
      </View>
      <View style={tw`w-full h-72 bg-stone-100`} />
    </View>
  );
}
