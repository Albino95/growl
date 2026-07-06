import React, { PropsWithChildren } from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import tw from '../../lib/tw';

type Props = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  transparent?: boolean;
}>;

export default function StickyFooter({ children, style, transparent = false }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        tw`px-4 pt-3 border-t ${transparent ? 'border-transparent bg-transparent' : 'border-stone-200 bg-white'}`,
        { paddingBottom: Math.max(insets.bottom, 12) },
        style,
      ]}
    >
      {children}
    </View>
  );
}
