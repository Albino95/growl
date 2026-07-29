import React from 'react';
import { View, Text, Pressable } from 'react-native';
import tw from '../../lib/tw';
import type { BusinessPeriod } from '../../services/api/business';

const LABELS: Record<BusinessPeriod, string> = {
  today: 'Today',
  week: '7d',
  month: '30d',
};

type Props = {
  value: BusinessPeriod;
  onChange: (period: BusinessPeriod) => void;
  disabled?: boolean;
};

export default function PeriodToggle({ value, onChange, disabled }: Props) {
  return (
    <View style={tw`flex-row bg-[#EAE4D6]/80 rounded-full p-1 border border-stone-200/60`}>
      {(['today', 'week', 'month'] as const).map((period) => {
        const selected = value === period;
        return (
          <Pressable
            key={period}
            disabled={disabled || selected}
            onPress={() => onChange(period)}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled: disabled || selected }}
            style={({ pressed }) => [
              tw`flex-1 py-2 rounded-full`,
              selected ? tw`bg-[#FFFcf7]` : null,
              pressed && !selected ? tw`opacity-70` : null,
            ]}
          >
            <Text
              style={tw`text-center text-sm font-semibold ${
                selected ? 'text-emerald-700' : 'text-stone-500'
              }`}
            >
              {LABELS[period]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
