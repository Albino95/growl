import React from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import tw from '../../lib/tw';
import Skeleton from '../ui/Skeleton';
import { avatarSource } from '../../utils/images';

/** Data already known at the tap site (route `preview`), shown instantly instead of bones. */
export type ProfileHeaderPreview = {
  /** Username shown in the top bar and name slot (same as the loaded header). */
  name: string;
  /** Avatar URI resolved exactly like the loaded header so expo-image hits its cache. */
  avatarUri?: string | null;
};

/**
 * First-load placeholder for PublicProfileScreen: mirrors the real header
 * (top bar, avatar + name card, stats strip, action buttons) and a 3-column
 * grid so the layout doesn't jump when data lands.
 */
export default function ProfileHeaderSkeleton({
  onBack,
  preview,
}: {
  onBack?: React.ReactNode;
  preview?: ProfileHeaderPreview | null;
}) {
  return (
    <View
      style={tw`flex-1`}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading profile"
      accessibilityState={{ busy: true }}
    >
      <View style={tw`px-gutter py-2.5 flex-row items-center border-b border-line/50`}>
        {onBack ?? <Skeleton style={tw`w-10 h-10 rounded-full mr-3`} />}
        {preview ? (
          <View style={tw`flex-1`}>
            <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase`}>
              Profile
            </Text>
            <Text style={tw`text-callout font-bold text-ink`} numberOfLines={1}>
              {preview.name}
            </Text>
          </View>
        ) : (
          <View style={tw`flex-1`}>
            <Skeleton style={tw`h-2.5 w-14 rounded mb-1.5`} />
            <Skeleton style={tw`h-4 w-32 rounded`} />
          </View>
        )}
        <Skeleton style={tw`w-10 h-10 rounded-full`} />
      </View>

      <View style={tw`px-gutter-wide pt-4 pb-3`}>
        <View style={tw`bg-card border border-line/80 rounded-sheet px-4 pt-5 pb-4`}>
          {preview ? (
            // Mirrors the loaded header's avatar + name row exactly (no jump on swap).
            <View style={tw`flex-row items-center mb-3`}>
              <View
                style={tw`w-[84px] h-[84px] rounded-full overflow-hidden mr-4 border-2 border-emerald-100 bg-emerald-50`}
              >
                <Image
                  source={avatarSource(preview.avatarUri)}
                  style={tw`w-full h-full`}
                  contentFit="cover"
                />
              </View>
              <View style={tw`flex-1`}>
                <Text style={tw`text-2xl font-bold text-ink`} numberOfLines={2}>
                  {preview.name}
                </Text>
              </View>
            </View>
          ) : (
            <View style={tw`flex-row items-center mb-4`}>
              <Skeleton style={tw`w-[84px] h-[84px] rounded-full mr-4`} />
              <View style={tw`flex-1`}>
                <Skeleton style={tw`h-6 w-3/5 rounded-control mb-2.5`} />
                <Skeleton style={tw`h-5 w-24 rounded-full`} />
              </View>
            </View>
          )}
          <Skeleton style={tw`h-3 w-full rounded mb-2`} />
          <Skeleton style={tw`h-3 w-4/5 rounded mb-4`} />
          <Skeleton style={tw`h-[62px] w-full rounded-card mb-3.5`} />
          <View style={tw`flex-row gap-2`}>
            <Skeleton style={tw`flex-1 h-11 rounded-card`} />
            <Skeleton style={tw`flex-1 h-11 rounded-card`} />
          </View>
        </View>
      </View>

      <View style={tw`px-gutter-wide flex-row gap-2 mb-3`}>
        <Skeleton style={tw`h-9 w-20 rounded-full`} />
        <Skeleton style={tw`h-9 w-20 rounded-full`} />
        <Skeleton style={tw`h-9 w-20 rounded-full`} />
      </View>
      <View style={tw`px-gutter-wide flex-row flex-wrap gap-1`}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} style={[tw`rounded-control`, { width: '32.6%', aspectRatio: 1 }]} />
        ))}
      </View>
    </View>
  );
}
