import React from 'react';
import { View } from 'react-native';
import tw from '../../lib/tw';
import Skeleton from '../ui/Skeleton';

/**
 * First-load placeholder for PublicProfileScreen: mirrors the real header
 * (top bar, avatar + name card, stats strip, action buttons) and a 3-column
 * grid so the layout doesn't jump when data lands.
 */
export default function ProfileHeaderSkeleton({ onBack }: { onBack?: React.ReactNode }) {
  return (
    <View
      style={tw`flex-1`}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading profile"
      accessibilityState={{ busy: true }}
    >
      <View style={tw`px-4 py-2.5 flex-row items-center border-b border-stone-200/50`}>
        {onBack ?? <Skeleton style={tw`w-10 h-10 rounded-full mr-3`} />}
        <View style={tw`flex-1`}>
          <Skeleton style={tw`h-2.5 w-14 rounded mb-1.5`} />
          <Skeleton style={tw`h-4 w-32 rounded`} />
        </View>
        <Skeleton style={tw`w-10 h-10 rounded-full`} />
      </View>

      <View style={tw`px-5 pt-4 pb-3`}>
        <View style={tw`bg-[#FFFcf7] border border-stone-200/80 rounded-3xl px-4 pt-5 pb-4`}>
          <View style={tw`flex-row items-center mb-4`}>
            <Skeleton style={tw`w-[84px] h-[84px] rounded-full mr-4`} />
            <View style={tw`flex-1`}>
              <Skeleton style={tw`h-6 w-3/5 rounded-lg mb-2.5`} />
              <Skeleton style={tw`h-5 w-24 rounded-full`} />
            </View>
          </View>
          <Skeleton style={tw`h-3 w-full rounded mb-2`} />
          <Skeleton style={tw`h-3 w-4/5 rounded mb-4`} />
          <Skeleton style={tw`h-[62px] w-full rounded-2xl mb-3.5`} />
          <View style={tw`flex-row gap-2`}>
            <Skeleton style={tw`flex-1 h-11 rounded-2xl`} />
            <Skeleton style={tw`flex-1 h-11 rounded-2xl`} />
          </View>
        </View>
      </View>

      <View style={tw`px-5 flex-row gap-2 mb-3`}>
        <Skeleton style={tw`h-9 w-20 rounded-full`} />
        <Skeleton style={tw`h-9 w-20 rounded-full`} />
        <Skeleton style={tw`h-9 w-20 rounded-full`} />
      </View>
      <View style={tw`px-5 flex-row flex-wrap gap-1`}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} style={[tw`rounded-lg`, { width: '32.6%', aspectRatio: 1 }]} />
        ))}
      </View>
    </View>
  );
}
