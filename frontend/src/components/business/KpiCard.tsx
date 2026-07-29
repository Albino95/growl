import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';

type Props = {
  label: string;
  value: string;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
};

/** Flat metric tile — no heavy card chrome. */
export default function KpiCard({ label, value, change, trend = 'neutral', icon, onPress }: Props) {
  const color = trend === 'up' ? '#059669' : trend === 'down' ? '#DC2626' : '#78716C';
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      onPress={onPress}
      style={tw`bg-[#EAE4D6]/55 rounded-2xl px-3.5 py-3 flex-1 min-w-[46%]`}
      activeOpacity={0.85}
    >
      <View style={tw`flex-row items-center justify-between mb-2`}>
        <Ionicons name={icon} size={18} color={color} />
        {change != null ? (
          <Text
            style={tw`text-[11px] font-semibold ${
              trend === 'up' ? 'text-emerald-700' : trend === 'down' ? 'text-red-600' : 'text-stone-500'
            }`}
          >
            {change}
          </Text>
        ) : null}
      </View>
      <Text style={tw`text-xl font-bold text-stone-900`} numberOfLines={1}>
        {value}
      </Text>
      <Text style={tw`text-xs text-stone-500 mt-0.5`}>{label}</Text>
    </Wrapper>
  );
}
