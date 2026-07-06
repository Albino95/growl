import React, { PropsWithChildren } from 'react';
import { ScrollView, View, ViewStyle, StyleProp, ScrollViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tw from '../../lib/tw';

type Props = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  scroll?: boolean;
  scrollProps?: ScrollViewProps;
  edges?: ('top' | 'right' | 'bottom' | 'left')[];
  background?: 'page' | 'card' | 'dark';
}>;

export default function Screen({
  children,
  style,
  scroll = false,
  scrollProps,
  edges = ['top', 'left', 'right'],
  background = 'page',
}: Props) {
  const bgClass =
    background === 'dark' ? 'bg-stone-900' : background === 'card' ? 'bg-white' : 'bg-surface-page';

  const content = scroll ? (
    <ScrollView
      style={tw`flex-1`}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      {...scrollProps}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={tw`flex-1`}>{children}</View>
  );

  return (
    <SafeAreaView style={[tw`flex-1 ${bgClass}`, style]} edges={edges}>
      {content}
    </SafeAreaView>
  );
}
