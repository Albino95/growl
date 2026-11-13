import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import PrimaryButton from './PrimaryButton';
import FadeInUp from './FadeInUp';
import { iconSize } from '../../theme/icons';

type Props = {
  title?: string;
  message?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onRetry?: () => void;
  retryLabel?: string;
  /** `compact` = inline card-sized block (sections, tabs); default = full empty-area block. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Load-failure state that mirrors EmptyState: icon, title, one-line message and a
 * "Try again" button. Use instead of ad-hoc "Couldn't load" + retry blocks.
 */
export default function ErrorState({
  title = 'Couldn’t load this',
  message = 'Check your connection and try again.',
  icon = 'cloud-offline-outline',
  onRetry,
  retryLabel = 'Try again',
  compact = false,
  style,
}: Props) {
  if (compact) {
    return (
      <View
        style={[tw`items-center py-6 px-4`, style]}
        accessibilityRole="alert"
      >
        <Ionicons name={icon} size={iconSize.lg} color="#A8A29E" />
        <Text style={tw`text-stone-900 font-semibold text-base text-center mt-2`}>{title}</Text>
        {message ? (
          <Text style={tw`text-muted mt-1 text-center text-sm leading-5`} numberOfLines={2}>
            {message}
          </Text>
        ) : null}
        {onRetry ? (
          <PrimaryButton
            label={retryLabel}
            variant="soft"
            onPress={onRetry}
            feedback="refresh"
            style={tw`mt-4 min-w-[140px]`}
          />
        ) : null}
      </View>
    );
  }
  return (
    <FadeInUp style={[tw`items-center justify-center py-12 px-6`, style]}>
      <View
        style={tw`w-16 h-16 rounded-full bg-stone-100 items-center justify-center mb-4 border border-stone-200`}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Ionicons name={icon} size={30} color="#A8A29E" />
      </View>
      <Text style={tw`text-stone-900 font-semibold text-lg text-center`} accessibilityRole="alert">
        {title}
      </Text>
      {message ? (
        <Text style={tw`text-muted mt-2 text-center text-sm leading-5 max-w-sm`}>{message}</Text>
      ) : null}
      {onRetry ? (
        <PrimaryButton
          label={retryLabel}
          onPress={onRetry}
          feedback="refresh"
          style={tw`mt-6 min-w-[180px]`}
        />
      ) : null}
    </FadeInUp>
  );
}
