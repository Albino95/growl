import React from 'react';
import { View, Text } from 'react-native';
import tw from '../../lib/tw';

export type StatItem = {
  label: string;
  value: string;
  tone?: 'emerald' | 'amber' | 'stone' | 'blue';
};

const VALUE: Record<NonNullable<StatItem['tone']>, string> = {
  emerald: 'text-emerald-700',
  amber: 'text-amber-700',
  stone: 'text-stone-900',
  blue: 'text-blue-700',
};

type Props = {
  items: StatItem[];
};

/** Flat metric strip — divider layout, no boxed cards. */
export default function BusinessStatStrip({ items }: Props) {
  return (
    <View style={tw`flex-row items-stretch`}>
      {items.map((item, idx) => (
        <View
          key={item.label}
          style={tw`flex-1 py-1 ${idx > 0 ? 'border-l border-stone-200/80 pl-3' : 'pr-3'}`}
        >
          <Text style={tw`text-[11px] text-stone-500 mb-0.5`}>{item.label}</Text>
          <Text style={tw`text-lg font-bold ${VALUE[item.tone || 'stone']}`} numberOfLines={1}>
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}
