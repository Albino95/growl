import React from 'react';
import { Pressable, Text, ViewStyle, StyleProp, ActivityIndicator } from 'react-native';
import tw from '../../lib/tw';

type Props = {
  label: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'solid' | 'soft' | 'ghost';
};

export default function PrimaryButton({
  label,
  onPress,
  style,
  disabled,
  loading,
  variant = 'solid',
}: Props) {
  const isDisabled = !!disabled || !!loading;
  const baseVariant =
    variant === 'soft'
      ? tw`bg-brand-50 border border-brand-200`
      : variant === 'ghost'
        ? tw`bg-transparent border border-stone-300`
        : tw`bg-brand-600`;
  const labelVariant =
    variant === 'soft' ? tw`text-brand-700` : variant === 'ghost' ? tw`text-stone-700` : tw`text-white`;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={[
        tw`px-4 py-3.5 rounded-2xl items-center justify-center min-h-[50px]`,
        baseVariant,
        isDisabled && tw`opacity-55`,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'solid' ? '#FFFFFF' : '#57534E'} />
      ) : (
        <Text style={[tw`font-semibold text-base text-center`, labelVariant]}>{label}</Text>
      )}
    </Pressable>
  );
}
