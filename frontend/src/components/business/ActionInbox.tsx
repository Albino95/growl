import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';

export type ActionInboxItem = {
  id: string;
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: 'amber' | 'red' | 'emerald' | 'blue';
  onPress: () => void;
};

const TONE: Record<NonNullable<ActionInboxItem['tone']>, string> = {
  amber: '#D97706',
  red: '#DC2626',
  emerald: '#059669',
  blue: '#2563EB',
};

type Props = {
  items: ActionInboxItem[];
};

export default function ActionInbox({ items }: Props) {
  if (!items.length) {
    return (
      <View style={tw`py-3`}>
        <Text style={tw`text-sm text-stone-500`}>All clear — nothing needs attention right now.</Text>
      </View>
    );
  }

  return (
    <View>
      {items.map((item, idx) => (
        <TouchableOpacity
          key={item.id}
          onPress={item.onPress}
          style={tw`flex-row items-center py-3 ${
            idx < items.length - 1 ? 'border-b border-stone-200/70' : ''
          }`}
        >
          <View style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] items-center justify-center mr-3`}>
            <Ionicons name={item.icon} size={18} color={TONE[item.tone || 'emerald']} />
          </View>
          <View style={tw`flex-1 pr-2`}>
            <Text style={tw`font-semibold text-stone-900`}>{item.title}</Text>
            {item.subtitle ? (
              <Text style={tw`text-xs text-stone-500 mt-0.5`}>{item.subtitle}</Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color="#A8A29E" />
        </TouchableOpacity>
      ))}
    </View>
  );
}
