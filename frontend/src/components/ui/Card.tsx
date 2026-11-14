import React, { PropsWithChildren } from 'react';
import { View, Text, ViewStyle, StyleProp } from 'react-native';
import tw from '../../lib/tw';

type Props = PropsWithChildren<{ title?: string; subtitle?: string; style?: StyleProp<ViewStyle>; }>

export default function Card({ title, subtitle, style, children }: Props) {
  return (
    <View style={[tw`bg-card rounded-card border border-line p-4`, style]}>
      {(title || subtitle) && (
        <View style={tw`mb-2`}>
          {title ? <Text style={tw`text-callout font-semibold text-ink`}>{title}</Text> : null}
          {subtitle ? <Text style={tw`text-body text-ink-3`}>{subtitle}</Text> : null}
        </View>
      )}
      {children}
    </View>
  );
}
