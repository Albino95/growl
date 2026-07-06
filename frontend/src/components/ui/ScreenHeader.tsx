import React from 'react';
import { View, Text, Pressable, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';

type Props = {
  title?: string;
  onBack?: () => void;
  backIcon?: 'close' | 'arrow-back';
  rightAction?: React.ReactNode;
  transparent?: boolean;
  light?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function ScreenHeader({
  title,
  onBack,
  backIcon = 'close',
  rightAction,
  transparent = false,
  light = false,
  style,
}: Props) {
  const iconColor = light ? '#FFFFFF' : theme.colors.textMuted;
  const titleColor = light ? 'text-white' : 'text-stone-900';

  return (
    <View
      pointerEvents="box-none"
      style={[
        tw`flex-row items-center justify-between px-4 py-3 ${
          transparent ? '' : 'border-b border-stone-200 bg-white'
        }`,
        style,
      ]}
    >
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          style={tw`w-10 h-10 items-center justify-center -ml-2`}
          accessibilityRole="button"
          accessibilityLabel={backIcon === 'close' ? 'Close' : 'Go back'}
        >
          <Ionicons name={backIcon} size={26} color={iconColor} />
        </Pressable>
      ) : (
        <View style={tw`w-10`} />
      )}
      {title ? (
        <Text style={tw`text-lg font-bold ${titleColor} flex-1 text-center`} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={tw`flex-1`} />
      )}
      {rightAction ?? <View style={tw`w-10`} />}
    </View>
  );
}
