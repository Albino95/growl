import React from 'react';
import { View, Text } from 'react-native';
import tw from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
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
    <View style={tw`flex-row bg-raised/80 rounded-chip p-1 border border-line/60`}>
      {(['today', 'week', 'month'] as const).map((period) => {
        const selected = value === period;
        return (
          <PressableScale
            key={period}
            disabled={disabled || selected}
            onPress={() => onChange(period)}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled: disabled || selected }}
            style={[tw`flex-1 py-2 rounded-chip`, selected ? tw`bg-card` : null]}
          >
            <Text
              style={tw`text-center text-sm font-semibold ${
                selected ? 'text-emerald-700' : 'text-ink-3'
              }`}
            >
              {LABELS[period]}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
