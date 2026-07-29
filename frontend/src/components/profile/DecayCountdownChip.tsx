import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';

type Props = {
  daysLeft: number;
  compact?: boolean;
};

/** Countdown chip for post soft-hide lifespan. */
export default function DecayCountdownChip({ daysLeft, compact }: Props) {
  const faded = daysLeft <= 0;
  const urgent = daysLeft <= 1 && !faded;

  const label = faded
    ? 'Faded'
    : daysLeft <= 1
      ? 'Fades today'
      : `${daysLeft}d left`;

  const chipBg = faded ? 'bg-stone-200' : urgent ? 'bg-amber-100' : 'bg-emerald-50';
  const textColor = faded ? 'text-stone-600' : urgent ? 'text-amber-900' : 'text-emerald-800';
  const iconColor = faded ? '#78716C' : urgent ? '#B45309' : '#059669';

  return (
    <View
      style={tw`flex-row items-center px-2.5 py-1 rounded-full ${chipBg} ${compact ? '' : ''}`}
      accessibilityLabel={`Post lifespan: ${label}`}
    >
      <Ionicons
        name={faded ? 'leaf-outline' : 'timer-outline'}
        size={compact ? 13 : 15}
        color={iconColor}
      />
      <Text style={tw`ml-1 font-semibold ${compact ? 'text-[11px]' : 'text-xs'} ${textColor}`}>
        {label}
      </Text>
    </View>
  );
}
