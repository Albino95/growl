import React from 'react';
import { View, Text } from 'react-native';
import tw from '../../lib/tw';

export type StatItem = {
  label: string;
  value: string;
  tone?: 'emerald' | 'amber' | 'stone' | 'blue';
};

const TONE: Record<NonNullable<StatItem['tone']>, { box: string; label: string; value: string }> = {
  emerald: { box: 'bg-emerald-50', label: 'text-emerald-700', value: 'text-emerald-900' },
  amber: { box: 'bg-amber-50', label: 'text-amber-700', value: 'text-amber-900' },
  stone: { box: 'bg-stone-100', label: 'text-stone-600', value: 'text-stone-900' },
  blue: { box: 'bg-blue-50', label: 'text-blue-700', value: 'text-blue-900' },
};

type Props = {
  items: StatItem[];
};

export default function BusinessStatStrip({ items }: Props) {
  return (
    <View style={tw`flex-row gap-3`}>
      {items.map((item) => {
        const t = TONE[item.tone || 'stone'];
        return (
          <View key={item.label} style={tw`flex-1 ${t.box} rounded-xl p-3`}>
            <Text style={tw`text-xs ${t.label} mb-1`}>{item.label}</Text>
            <Text style={tw`text-xl font-bold ${t.value}`} numberOfLines={1}>
              {item.value}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
