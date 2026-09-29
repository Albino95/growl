import React from 'react';
import { View, Text, Image, StyleProp, ViewStyle } from 'react-native';
import tw from '../../lib/tw';

type Props = {
  /** Actions on the right (inbox, shop, compose, etc.) */
  right?: React.ReactNode;
  /** Optional control before the Grow! mark (e.g. back) */
  leftAccessory?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Compact top chrome shared by Feed and other primary tabs —
 * Grow! mark + wordmark + optional actions.
 */
export default function GrowChromeHeader({ right, leftAccessory, style }: Props) {
  return (
    <View
      style={[
        tw`px-4 py-2.5 flex-row items-center justify-between bg-surface-page border-b border-stone-200/50`,
        style,
      ]}
    >
      <View style={tw`flex-row items-center flex-1 pr-2`}>
        {leftAccessory ? <View style={tw`mr-2`}>{leftAccessory}</View> : null}
        <Image
          source={require('../../../assets/icon.png')}
          style={{ width: 26, height: 26, borderRadius: 7, marginRight: 8 }}
          accessibilityLabel="Grow!"
        />
        <Text style={tw`text-[15px] tracking-[2.5px] uppercase text-emerald-700 font-bold`}>
          Grow!
        </Text>
      </View>
      {right ? <View style={tw`flex-row items-center gap-2`}>{right}</View> : null}
    </View>
  );
}
