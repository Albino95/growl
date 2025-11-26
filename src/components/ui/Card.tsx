import React, { PropsWithChildren } from 'react';
import { View, Text, ViewStyle, StyleProp } from 'react-native';
import tw from '../../lib/tw';

type Props = PropsWithChildren<{ title?: string; subtitle?: string; style?: StyleProp<ViewStyle>; }>

export default function Card({ title, subtitle, style, children }: Props) {
  return (
    <View style={tw`bg-white rounded-2xl border border-gray-200 p-4`}>
      {(title || subtitle) && (
        <View style={tw`mb-2`}>
          {title ? <Text style={tw`text-lg font-semibold`}>{title}</Text> : null}
          {subtitle ? <Text style={tw`text-gray-500`}>{subtitle}</Text> : null}
        </View>
      )}
      {children}
    </View>
  );
}
