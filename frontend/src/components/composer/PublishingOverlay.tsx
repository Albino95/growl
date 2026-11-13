import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GrowLoader from '../ui/GrowLoader';
import { COMPOSER_COPY } from '../../hooks/composerConfig';
import type { PublishPhase } from '../../hooks/composerMachine';
import tw from '../../lib/tw';

type Props =
  | { variant: 'loading'; label: string }
  | { variant: 'publishing'; phase: PublishPhase | null }
  | {
      variant: 'success';
      title?: string;
      body?: string;
      /** Extra buttons (Reel: View in Reels / Done). */
      actions?: React.ReactNode;
    };

/**
 * The one loading / publishing / success layer for create flows.
 * `loading` and `publishing` sit over the media stage; `success` covers the screen.
 */
export default function PublishingOverlay(props: Props) {
  if (props.variant === 'success') {
    return (
      <View
        style={tw`absolute inset-0 z-50 bg-brand-900/95 items-center justify-center px-8`}
        accessibilityLiveRegion="assertive"
      >
        <View style={tw`w-16 h-16 rounded-full bg-brand-600 items-center justify-center mb-4`}>
          <Ionicons name="checkmark" size={32} color="#fff" />
        </View>
        <Text style={tw`text-white text-2xl font-bold mb-2`} accessibilityRole="header">
          {props.title || COMPOSER_COPY.success}
        </Text>
        {props.body ? (
          <Text style={tw`text-white/70 text-center mb-8`}>{props.body}</Text>
        ) : null}
        {props.actions}
      </View>
    );
  }
  const label =
    props.variant === 'publishing'
      ? COMPOSER_COPY.phase[props.phase || 'preparing']
      : props.label;
  return (
    <View
      style={tw`absolute inset-0 bg-black/55 items-center justify-center z-30`}
      accessibilityLiveRegion="polite"
      accessibilityLabel={label}
    >
      <GrowLoader label={label} />
    </View>
  );
}
