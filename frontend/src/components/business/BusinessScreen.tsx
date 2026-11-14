import React, { PropsWithChildren, ReactNode } from 'react';
import { View, Text, ViewStyle, StyleProp } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import GrowChromeHeader from '../ui/GrowChromeHeader';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';

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
    <PressableScale
      onPress={onPress}
      pressedScale={0.9}
      hitSlop={8}
      accessibilityRole="button"
      style={tw`w-9 h-9 rounded-full bg-raised border border-line/80 items-center justify-center`}
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={17} color={theme.colors.brand} />
    </PressableScale>
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
    <SafeAreaView style={[tw`flex-1 bg-page`, style]} edges={edges}>
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
      <View style={tw`px-gutter-wide pt-3 pb-2`}>
        <Text style={tw`text-lg font-bold text-ink`}>{title}</Text>
        {subtitle ? <Text style={tw`text-sm text-ink-3 mt-0.5 leading-5`}>{subtitle}</Text> : null}
      </View>
      {children}
    </SafeAreaView>
  );
}
