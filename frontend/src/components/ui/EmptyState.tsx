import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export default function EmptyState({ icon, title, description, actionLabel, onAction }: Props) {
  return (
    <View style={tw`items-center justify-center py-12 px-6`}>
      <View style={tw`w-16 h-16 rounded-full bg-stone-100 items-center justify-center mb-4`}>
        <Ionicons name={icon} size={36} color="#A8A29E" />
      </View>
      <Text style={tw`text-stone-900 font-semibold text-lg text-center`}>{title}</Text>
      {description ? (
        <Text style={tw`text-stone-500 mt-2 text-center text-sm leading-5 max-w-sm`}>{description}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <TouchableOpacity
          onPress={onAction}
          style={tw`mt-6 px-6 py-3 bg-emerald-600 rounded-full active:opacity-90`}
        >
          <Text style={tw`text-white font-semibold`}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
