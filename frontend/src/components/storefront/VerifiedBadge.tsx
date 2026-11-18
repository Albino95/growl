import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';

type Props = {
  size?: number;
  /** Show the word "Verified" next to the seal. */
  withLabel?: boolean;
};

/** Seal shown next to a verified business's name (storefront, "Sold by", profile). */
export default function VerifiedBadge({ size = 16, withLabel = false }: Props) {
  return (
    <View
      style={tw`flex-row items-center ml-1`}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Verified business"
    >
      <Ionicons name="checkmark-circle" size={size} color={theme.colors.brand} />
      {withLabel ? <Text style={tw`text-caption font-semibold text-leaf-ink ml-0.5`}>Verified</Text> : null}
    </View>
  );
}
