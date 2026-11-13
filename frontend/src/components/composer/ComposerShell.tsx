import React, { PropsWithChildren } from 'react';
import { View, Text, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import PressableScale from '../ui/PressableScale';

type Props = PropsWithChildren<{
  title: string;
  onClose: () => void;
  closeDisabled?: boolean;
  /** Optional element on the right of the header (keeps the title centered). */
  headerRight?: React.ReactNode;
  /** Sticky bottom area (primary CTA in the thumb zone). */
  footer?: React.ReactNode;
  /** Full-screen layers (publishing / success). */
  overlay?: React.ReactNode;
}>;

/**
 * One frame for every create flow: header (close + title), the media stage and
 * details as children, and a sticky footer that rides above the keyboard.
 */
export default function ComposerShell({
  title,
  onClose,
  closeDisabled,
  headerRight,
  footer,
  overlay,
  children,
}: Props) {
  return (
    <SafeAreaView style={tw`flex-1 bg-[#1C1917]`} edges={['top', 'left', 'right']}>
      <View style={tw`flex-row items-center justify-between px-gutter py-2 z-20`}>
        <PressableScale
          pressedScale={0.9}
          onPress={onClose}
          disabled={closeDisabled}
          hitSlop={12}
          style={tw`w-10 h-10 rounded-full bg-white/10 items-center justify-center ${
            closeDisabled ? 'opacity-40' : ''
          }`}
          accessibilityRole="button"
          accessibilityLabel="Close"
          accessibilityState={{ disabled: !!closeDisabled }}
        >
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </PressableScale>
        <Text style={tw`text-white text-base font-bold`} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        <View style={tw`w-10 h-10 items-center justify-center`}>{headerRight}</View>
      </View>
      <KeyboardAvoidingView
        style={tw`flex-1`}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={tw`flex-1`}>{children}</View>
        {footer}
      </KeyboardAvoidingView>
      {overlay}
    </SafeAreaView>
  );
}
