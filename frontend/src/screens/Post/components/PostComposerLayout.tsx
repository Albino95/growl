import React, { PropsWithChildren } from 'react';
import { View, KeyboardAvoidingView, Platform, ViewStyle, StyleProp } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tw from '../../../lib/tw';

type Props = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  footer?: React.ReactNode;
}>;

export default function PostComposerLayout({ children, footer, style }: Props) {
  return (
    <SafeAreaView style={[tw`flex-1 bg-stone-900`, style]} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={tw`flex-1`}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={tw`flex-1`}>{children}</View>
        {footer}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
