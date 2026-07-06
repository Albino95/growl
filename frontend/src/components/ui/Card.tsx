import React, { PropsWithChildren } from 'react';
import { View, Text, ViewStyle, StyleProp } from 'react-native';
import tw from '../../lib/tw';

type Props = PropsWithChildren<{ title?: string; subtitle?: string; style?: StyleProp<ViewStyle>; }>

export default function Card({ title, subtitle, style, children }: Props) {
  return (
    <View style={[tw`bg-white rounded-2xl border border-stone-200 p-4`, style]}>
      {(title || subtitle) && (
        <View style={tw`mb-2`}>
          {title ? <Text style={tw`text-lg font-semibold text-stone-900`}>{title}</Text> : null}
          {subtitle ? <Text style={tw`text-stone-500`}>{subtitle}</Text> : null}
        </View>
      )}
      {children}
    </View>
  );
}
