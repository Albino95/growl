import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';

export type ActionInboxItem = {
  id: string;
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: 'amber' | 'red' | 'emerald' | 'blue';
  onPress: () => void;
};

/** Icon tints — tw.color() resolves per scheme, so call at render. */
const TONE: Record<NonNullable<ActionInboxItem['tone']>, string> = {
  amber: 'amber-600',
  red: 'red-600',
  emerald: 'emerald-600',
  blue: 'blue-600',
};

type Props = {
  items: ActionInboxItem[];
};

export default function ActionInbox({ items }: Props) {
  if (!items.length) {
    return (
      <View style={tw`py-3`}>
        <Text style={tw`text-sm text-ink-3`}>All clear — nothing needs attention right now.</Text>
      </View>
    );
  }

  return (
    <View>
      {items.map((item, idx) => (
        <PressableScale
          key={item.id}
          onPress={item.onPress}
          style={tw`flex-row items-center py-3 ${
            idx < items.length - 1 ? 'border-b border-line/70' : ''
          }`}
        >
          <View style={tw`w-9 h-9 rounded-full bg-raised items-center justify-center mr-3`}>
            <Ionicons name={item.icon} size={18} color={tw.color(TONE[item.tone || 'emerald'])} />
          </View>
          <View style={tw`flex-1 pr-2`}>
            <Text style={tw`font-semibold text-ink`}>{item.title}</Text>
            {item.subtitle ? (
              <Text style={tw`text-xs text-ink-3 mt-0.5`}>{item.subtitle}</Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.iconMuted} />
        </PressableScale>
      ))}
    </View>
  );
}
