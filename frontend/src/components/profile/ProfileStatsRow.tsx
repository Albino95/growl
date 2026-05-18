import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import tw from '../../lib/tw';

type StatProps = {
  label: string;
  value: number | string;
  onPress?: () => void;
};

function Stat({ label, value, onPress }: StatProps) {
  const inner = (
    <>
      <Text style={tw`text-lg font-bold text-stone-900`}>{value}</Text>
      <Text style={tw`text-xs text-stone-500 mt-0.5`}>{label}</Text>
    </>
  );
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} style={tw`flex-1 items-center py-1`} activeOpacity={0.7}>
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={tw`flex-1 items-center py-1`}>{inner}</View>;
}

type Props = {
  postsCount: number;
  followingCount: number;
  followersCount: number;
  onPressFollowing?: () => void;
  onPressFollowers?: () => void;
};

export default function ProfileStatsRow({
  postsCount,
  followingCount,
  followersCount,
  onPressFollowing,
  onPressFollowers,
}: Props) {
  return (
    <View style={tw`flex-row border border-stone-100 rounded-2xl bg-stone-50/80 overflow-hidden`}>
      <Stat label="Posts" value={postsCount} />
      <View style={tw`w-px bg-stone-200 my-2`} />
      <Stat label="Following" value={followingCount} onPress={onPressFollowing} />
      <View style={tw`w-px bg-stone-200 my-2`} />
      <Stat label="Followers" value={followersCount} onPress={onPressFollowers} />
    </View>
  );
}
