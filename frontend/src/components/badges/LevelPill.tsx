import React from 'react';
import { View, Text } from 'react-native';
import tw from '../../lib/tw';
import type { GrowthLevel } from '../../services/api/growth';
import { levelEmoji } from './LevelProgressCard';

/** Compact "🪴 Sapling · 180 pts" pill. */
export default function LevelPill({ level }: { level: Pick<GrowthLevel, 'n' | 'name' | 'points'> }) {
  return (
    <View
      style={tw`flex-row items-center self-start px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200`}
      accessible
      accessibilityLabel={`Growth level ${level.name}, ${level.points} points`}
    >
      <Text style={tw`text-xs mr-1`}>{levelEmoji(level.n)}</Text>
      <Text style={tw`text-xs text-emerald-800 font-semibold`}>
        {level.name} · {level.points} pts
      </Text>
    </View>
  );
}
