import React from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';
import tw from '../../lib/tw';

type Props = {
  children: string;
  style?: StyleProp<TextStyle>;
  variant?: 'default' | 'caps';
};

export default function SectionLabel({ children, style, variant = 'default' }: Props) {
  return (
    <Text
      style={[
        variant === 'caps'
          ? tw`text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2`
          : tw`text-sm font-semibold text-stone-700 mb-2`,
        style,
      ]}
    >
      {children}
    </Text>
  );
}
