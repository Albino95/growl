import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';

type Props = {
  daysLeft: number;
  compact?: boolean;
};

/** Countdown chip for post decay lifespan. */
export default function DecayCountdownChip({ daysLeft, compact }: Props) {
  const decayed = daysLeft <= 0;
  const urgent = daysLeft <= 1 && !decayed;

  const label = decayed
    ? 'Decayed'
    : daysLeft <= 1
      ? 'Decays today'
      : `${daysLeft}d left`;

  const chipBg = decayed ? 'bg-stone-200' : urgent ? 'bg-amber-100' : 'bg-emerald-50';
  const textColor = decayed ? 'text-ink-2' : urgent ? 'text-amber-900' : 'text-emerald-800';
  const iconColor = decayed ? theme.colors.ink3 : urgent ? tw.color('amber-700') : '#059669';

  return (
    <View
      style={tw`flex-row items-center px-2.5 py-1 rounded-chip ${chipBg} ${compact ? '' : ''}`}
      accessibilityLabel={`Post lifespan: ${label}`}
    >
      <Ionicons
        name={decayed ? 'hourglass-outline' : 'timer-outline'}
        size={compact ? 13 : 15}
        color={iconColor}
      />
      <Text style={tw`ml-1 font-semibold ${compact ? 'text-caption' : 'text-xs'} ${textColor}`}>
        {label}
      </Text>
    </View>
  );
}
