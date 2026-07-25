import React, { PropsWithChildren, ReactNode } from 'react';
import { View, Text, TouchableOpacity, ViewStyle, StyleProp } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';

type Props = PropsWithChildren<{
  title: string;
  subtitle?: string;
  onAnalytics?: () => void;
  onSettings?: () => void;
  headerRight?: ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}>;

/** Shared Business hub screen chrome: title + optional analytics/settings. */
export default function BusinessScreen({
  title,
  subtitle,
  onAnalytics,
  onSettings,
  headerRight,
  children,
  style,
  edges = ['top'],
}: Props) {
  return (
    <SafeAreaView style={[tw`flex-1 bg-stone-50`, style]} edges={edges}>
      <View style={tw`bg-white px-4 pt-3 pb-3 border-b border-stone-100`}>
        <View style={tw`flex-row items-center justify-between`}>
          <View style={tw`flex-1 pr-2`}>
            <Text style={tw`text-2xl font-bold tracking-tight text-stone-900`}>{title}</Text>
            {subtitle ? <Text style={tw`text-sm text-stone-500 mt-1`}>{subtitle}</Text> : null}
          </View>
          <View style={tw`flex-row items-center`}>
            {headerRight}
            {onAnalytics ? (
              <TouchableOpacity
                onPress={onAnalytics}
                style={tw`w-11 h-11 rounded-full bg-emerald-50 items-center justify-center border border-emerald-100 mr-2`}
              >
                <Ionicons name="analytics-outline" size={22} color="#059669" />
              </TouchableOpacity>
            ) : null}
            {onSettings ? (
              <TouchableOpacity
                onPress={onSettings}
                style={tw`w-11 h-11 rounded-full bg-stone-100 items-center justify-center`}
              >
                <Ionicons name="settings-outline" size={22} color="#57534E" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
      {children}
    </SafeAreaView>
  );
}
