import React from 'react';
import { View, Text } from 'react-native';
import tw from '../../lib/tw';
import PressableScale from '../ui/PressableScale';

type StatProps = {
  label: string;
  value: number | string;
  onPress?: () => void;
};

function Stat({ label, value, onPress }: StatProps) {
  const inner = (
    <>
      <Text style={tw`text-lg font-bold text-ink`}>{value}</Text>
      <Text style={tw`text-xs text-ink-3 mt-0.5`}>{label}</Text>
    </>
  );
  if (onPress) {
    return (
      <PressableScale
        onPress={onPress}
        feedback="open"
        pressedScale={0.96}
        style={tw`flex-1 items-center py-1`}
      >
        {inner}
      </PressableScale>
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
    <View
      style={tw`flex-row border border-line/80 rounded-card bg-card overflow-hidden`}
    >
      <Stat label="Posts" value={postsCount} />
      <View style={tw`w-px bg-line/80 my-2.5`} />
      <Stat label="Following" value={followingCount} onPress={onPressFollowing} />
      <View style={tw`w-px bg-line/80 my-2.5`} />
      <Stat label="Followers" value={followersCount} onPress={onPressFollowers} />
    </View>
  );
}
