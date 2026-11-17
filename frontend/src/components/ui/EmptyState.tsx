import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PrimaryButton from './PrimaryButton';
import FadeInUp from './FadeInUp';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export default function EmptyState({ icon, title, description, actionLabel, onAction }: Props) {
  return (
    <FadeInUp style={tw`items-center justify-center py-12 px-6`}>
      <View
        style={tw`w-16 h-16 rounded-chip bg-raised items-center justify-center mb-4 border border-line`}
      >
        <Ionicons name={icon} size={30} color={theme.colors.iconMuted} />
      </View>
      <Text style={tw`text-ink text-callout font-semibold text-center`}>{title}</Text>
      {description ? (
        <Text style={tw`text-ink-2 mt-2 text-center text-body max-w-sm`}>
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <PrimaryButton label={actionLabel} onPress={onAction} style={tw`mt-6 min-w-[180px]`} />
      ) : null}
    </FadeInUp>
  );
}
