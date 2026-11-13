import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';

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
  const color = trend === 'up' ? theme.colors.brand : trend === 'down' ? theme.colors.danger : theme.colors.ink3;
  const Wrapper = onPress ? PressableScale : View;
  return (
    <Wrapper
      onPress={onPress}
      style={tw`bg-raised/55 rounded-card px-3.5 py-3 flex-1 min-w-[46%]`}
    >
      <View style={tw`flex-row items-center justify-between mb-2`}>
        <Ionicons name={icon} size={18} color={color} />
        {change != null ? (
          <Text
            style={[
              tw`text-caption font-semibold ${
                trend === 'up' ? 'text-emerald-700' : trend === 'down' ? 'text-red-600' : 'text-ink-3'
              }`,
              { fontVariant: ['tabular-nums'] },
            ]}
          >
            {change}
          </Text>
        ) : null}
      </View>
      <Text style={[tw`text-xl font-bold text-ink`, { fontVariant: ['tabular-nums'] }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={tw`text-xs text-ink-3 mt-0.5`}>{label}</Text>
    </Wrapper>
  );
}
