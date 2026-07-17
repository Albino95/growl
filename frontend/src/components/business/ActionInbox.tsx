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

const TONE: Record<NonNullable<ActionInboxItem['tone']>, { bg: string; icon: string }> = {
  amber: { bg: 'bg-amber-50', icon: '#D97706' },
  red: { bg: 'bg-red-50', icon: '#DC2626' },
  emerald: { bg: 'bg-emerald-50', icon: '#059669' },
  blue: { bg: 'bg-blue-50', icon: '#2563EB' },
};

type Props = {
  items: ActionInboxItem[];
};

export default function ActionInbox({ items }: Props) {
  if (!items.length) {
    return (
      <View style={tw`bg-white rounded-2xl border border-stone-100 p-4`}>
        <Text style={tw`text-sm text-stone-500`}>All clear — nothing needs your attention right now.</Text>
      </View>
    );
  }

  return (
    <View style={tw`bg-white rounded-2xl border border-stone-100 overflow-hidden`}>
      {items.map((item, idx) => {
        const tone = TONE[item.tone || 'emerald'];
        return (
          <TouchableOpacity
            key={item.id}
            onPress={item.onPress}
            style={tw`flex-row items-center px-4 py-3 ${idx < items.length - 1 ? 'border-b border-stone-100' : ''}`}
          >
            <View style={tw`w-10 h-10 rounded-full ${tone.bg} items-center justify-center mr-3`}>
              <Ionicons name={item.icon} size={20} color={tone.icon} />
            </View>
            <View style={tw`flex-1`}>
              <Text style={tw`font-semibold text-stone-900`}>{item.title}</Text>
              {item.subtitle ? <Text style={tw`text-xs text-stone-500 mt-0.5`}>{item.subtitle}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color="#A8A29E" />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
