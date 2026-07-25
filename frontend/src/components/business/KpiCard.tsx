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

export default function KpiCard({ label, value, change, trend = 'neutral', icon, onPress }: Props) {
  const color = trend === 'up' ? '#059669' : trend === 'down' ? '#EF4444' : '#78716C';
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      onPress={onPress}
      style={tw`bg-white rounded-2xl p-4 border border-stone-100 flex-1 min-w-[46%]`}
      activeOpacity={0.85}
    >
      <View style={tw`flex-row items-center justify-between mb-2`}>
        <Ionicons name={icon} size={22} color={color} />
        {change != null ? (
          <View
            style={tw`px-2 py-0.5 rounded-full ${
              trend === 'up' ? 'bg-emerald-50' : trend === 'down' ? 'bg-red-100' : 'bg-stone-100'
            }`}
          >
            <Text
              style={tw`text-xs font-semibold ${
                trend === 'up' ? 'text-emerald-800' : trend === 'down' ? 'text-red-700' : 'text-stone-600'
              }`}
            >
              {change}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={tw`text-2xl font-bold text-stone-900 mb-0.5`} numberOfLines={1}>
        {value}
      </Text>
      <Text style={tw`text-sm text-stone-500`}>{label}</Text>
    </Wrapper>
  );
}
