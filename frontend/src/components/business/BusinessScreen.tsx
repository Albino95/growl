import React, { PropsWithChildren, ReactNode } from 'react';
import { View, Text, Pressable, ViewStyle, StyleProp } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import GrowChromeHeader from '../ui/GrowChromeHeader';
import tw from '../../lib/tw';

type Props = PropsWithChildren<{
  title: string;
  subtitle?: string;
  onAnalytics?: () => void;
  onSettings?: () => void;
  onMessages?: () => void;
  headerRight?: ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}>;

function ChromeButton({
  icon,
  onPress,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={17} color="#059669" />
    </Pressable>
  );
}

/** Shared Business hub chrome: green Grow! bar + page title. */
export default function BusinessScreen({
  title,
  subtitle,
  onAnalytics,
  onSettings,
  onMessages,
  headerRight,
  children,
  style,
  edges = ['top'],
}: Props) {
  return (
    <SafeAreaView style={[tw`flex-1 bg-surface-page`, style]} edges={edges}>
      <GrowChromeHeader
        right={
          <>
            {headerRight}
            {onMessages ? (
              <ChromeButton icon="chatbubbles-outline" onPress={onMessages} label="Messages" />
            ) : null}
            {onAnalytics ? (
              <ChromeButton icon="analytics-outline" onPress={onAnalytics} label="Analytics" />
            ) : null}
            {onSettings ? (
              <ChromeButton icon="settings-outline" onPress={onSettings} label="Settings" />
            ) : null}
          </>
        }
      />
      <View style={tw`px-5 pt-3 pb-2`}>
        <Text style={tw`text-lg font-bold text-stone-900`}>{title}</Text>
        {subtitle ? <Text style={tw`text-sm text-stone-500 mt-0.5 leading-5`}>{subtitle}</Text> : null}
      </View>
      {children}
    </SafeAreaView>
  );
}
