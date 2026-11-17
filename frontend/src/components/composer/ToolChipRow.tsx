import React from 'react';
import { ScrollView, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import PressableScale from '../ui/PressableScale';

export type ToolChip = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
};

/** Horizontal row of media tools under the stage (Edit, Music, Replace, Remove). */
export default function ToolChipRow({ chips }: { chips: ToolChip[] }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={tw`px-gutter py-3 items-center`}
      style={tw`flex-grow-0 flex-shrink-0`}
      keyboardShouldPersistTaps="handled"
    >
      {chips.map((chip) => (
        <PressableScale
          key={chip.key}
          onPress={chip.onPress}
          disabled={chip.disabled}
          accessibilityRole="button"
          accessibilityLabel={chip.accessibilityLabel ?? chip.label}
          accessibilityState={{ selected: !!chip.active, disabled: !!chip.disabled }}
          style={tw`flex-row items-center rounded-chip px-3.5 py-2.5 mr-2 flex-shrink-0 ${
            chip.disabled ? 'opacity-40 ' : ''
          }${
            chip.danger
              ? 'bg-red-500/80 border border-red-400/40'
              : chip.active
                ? 'bg-brand-600'
                : 'bg-white/15 border border-white/20'
          }`}
          hitSlop={6}
        >
          <Ionicons name={chip.icon} size={16} color="#FFFFFF" />
          <Text style={tw`text-white text-xs font-semibold ml-1.5`}>{chip.label}</Text>
        </PressableScale>
      ))}
    </ScrollView>
  );
}
