import React from 'react';
import { View, Text } from 'react-native';
import tw from '../../lib/tw';
import type { GrowthLevel } from '../../services/api/growth';
import { levelProgress, pointsToNext } from './badgeMeta';
import CountUpText from '../ui/CountUpText';

const LEVEL_EMOJI = ['🌰', '🌱', '🪴', '🌸', '🌳', '🌲'];

export function levelEmoji(n: number): string {
  return LEVEL_EMOJI[Math.max(0, Math.min(LEVEL_EMOJI.length - 1, n - 1))];
}

/** Growth Level header: name, points, bar to the next level. */
export default function LevelProgressCard({ level }: { level: GrowthLevel }) {
  const frac = levelProgress(level);
  const toNext = pointsToNext(level);
  return (
    <View
      style={tw`bg-emerald-50 border border-emerald-100 rounded-sheet px-4 py-4`}
      accessible
      accessibilityLabel={`Growth level ${level.name}, ${level.points} points${
        toNext != null ? `, ${toNext} to the next level` : ''
      }`}
    >
      <View style={tw`flex-row items-center`}>
        <View style={tw`w-12 h-12 rounded-full bg-card items-center justify-center mr-3`}>
          <Text style={tw`text-2xl`}>{levelEmoji(level.n)}</Text>
        </View>
        <View style={tw`flex-1`}>
          <Text style={tw`text-caption font-semibold tracking-widest text-emerald-700 uppercase`}>
            Growth level {level.n}
          </Text>
          <Text style={tw`text-xl font-bold text-ink`}>{level.name}</Text>
        </View>
        <CountUpText style={tw`text-base font-bold text-ink`} value={level.points} suffix=" pts" />
      </View>
      <View style={tw`h-2 bg-card rounded-full overflow-hidden mt-3`}>
        <View style={[tw`h-full rounded-full bg-emerald-600`, { width: `${Math.max(3, frac * 100)}%` }]} />
      </View>
      <Text style={tw`text-xs text-ink-2 mt-1.5`}>
        {toNext != null
          ? `${toNext} pts to the next level`
          : 'Top of the ladder — a whole grove. 🌲'}
      </Text>
    </View>
  );
}
