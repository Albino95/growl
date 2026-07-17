import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
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
};

export default function PeriodToggle({ value, onChange }: Props) {
  return (
    <View style={tw`flex-row bg-stone-100 rounded-xl p-1`}>
      {(['today', 'week', 'month'] as const).map((period) => (
        <TouchableOpacity
          key={period}
          onPress={() => onChange(period)}
          style={tw`flex-1 py-2 rounded-lg ${value === period ? 'bg-white' : ''}`}
        >
          <Text
            style={tw`text-center text-sm font-semibold ${
              value === period ? 'text-emerald-700' : 'text-stone-500'
            }`}
          >
            {LABELS[period]}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
