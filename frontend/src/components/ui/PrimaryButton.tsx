import React from 'react';
import { Pressable, Text, ViewStyle, StyleProp, ActivityIndicator, Animated } from 'react-native';
import tw from '../../lib/tw';
import { usePressFeedback } from '../../hooks/usePressFeedback';

type Props = {
  label: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'solid' | 'soft' | 'ghost';
};

function PrimaryButton({
  label,
  onPress,
  style,
  disabled,
  loading,
  variant = 'solid',
}: Props) {
  const isDisabled = !!disabled || !!loading;
  const feedback = usePressFeedback({ onPress, disabled: isDisabled });
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
      onPress={feedback.onPress}
      onPressIn={feedback.onPressIn}
      onPressOut={feedback.onPressOut}
      disabled={isDisabled}
      style={[
        tw`px-4 py-3.5 rounded-2xl items-center justify-center min-h-[50px]`,
        baseVariant,
        isDisabled && tw`opacity-55`,
        style,
      ]}
    >
      <Animated.View style={feedback.animatedStyle}>
        {loading ? (
          <ActivityIndicator size="small" color={variant === 'solid' ? '#FFFFFF' : '#57534E'} />
        ) : (
          <Text style={[tw`font-semibold text-base text-center`, labelVariant]}>{label}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

export default React.memo(PrimaryButton);
