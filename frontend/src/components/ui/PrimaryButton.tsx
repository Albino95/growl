import React from 'react';
import { Pressable, Text, ViewStyle, StyleProp } from 'react-native';
import tw from '../../lib/tw';

type Props = { label: string; onPress?: () => void; style?: StyleProp<ViewStyle>; disabled?: boolean; };

export default function PrimaryButton({ label, onPress, style, disabled }: Props) {
  return (
    <Pressable 
      onPress={onPress} 
      disabled={disabled} 
      style={[
        tw`bg-green-600 px-4 py-3 rounded-xl`,
        disabled && tw`bg-gray-300 opacity-50`,
        style
      ]}
    >
      <Text style={tw`text-white font-semibold text-base text-center`}>{label}</Text>
    </Pressable>
  );
}
