import React from 'react';
import { View, Text, ScrollView, Linking } from 'react-native';
import PressableScale from '../../components/ui/PressableScale';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import tw, { theme } from '../../lib/tw';
import { LEGAL_HUB_ITEMS, SUPPORT_EMAIL, LEGAL_WEB_BASE } from '../../content/legal';
import type { RootStackParamList } from '../../app/navigation/RootNavigator';

export default function LegalHubScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <SafeAreaView style={tw`flex-1 bg-page`}>
      <View style={tw`flex-row items-center justify-between px-gutter py-3 bg-card border-b border-line`}>
        <PressableScale onPress={() => navigation.goBack()} pressedScale={0.9} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color={theme.colors.ink} />
        </PressableScale>
        <Text style={tw`text-lg font-semibold text-ink`}>Legal & Support</Text>
        <View style={tw`w-6`} />
      </View>

      <ScrollView style={tw`flex-1`} contentContainerStyle={tw`p-4`}>
        <Text style={tw`text-sm text-ink-2 mb-4`}>
          Policies, terms, and support resources for the Grow! community.
        </Text>

        <View style={tw`bg-card rounded-control overflow-hidden`}>
          {LEGAL_HUB_ITEMS.map((item, index) => (
            <PressableScale
              key={item.id}
              onPress={() => navigation.navigate('LegalDocument', { documentId: item.id })}
              style={tw`flex-row items-center justify-between px-4 py-4 ${
                index < LEGAL_HUB_ITEMS.length - 1 ? 'border-b border-line' : ''
              }`}
            >
              <View style={tw`flex-row items-center`}>
                <Ionicons name={item.icon} size={20} color={theme.colors.ink2} />
                <Text style={tw`text-ink ml-3`}>{item.title}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.iconMuted} />
            </PressableScale>
          ))}
        </View>

        <View style={tw`bg-card rounded-control overflow-hidden mt-4`}>
          <PressableScale
            onPress={() => navigation.navigate('DeleteAccount')}
            style={tw`flex-row items-center justify-between px-4 py-4 border-b border-line`}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
              <Text style={tw`text-red-700 font-semibold ml-3`}>Delete account</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.danger} />
          </PressableScale>
        </View>

        <PressableScale
          onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          style={tw`mt-6 flex-row items-center justify-center py-3`}
        >
          <Ionicons name="mail-outline" size={18} color="#059669" />
          <Text style={tw`text-brand-700 font-semibold ml-2`}>{SUPPORT_EMAIL}</Text>
        </PressableScale>
        <PressableScale
          onPress={() => void Linking.openURL(`${LEGAL_WEB_BASE}/privacy`)}
          style={tw`flex-row items-center justify-center py-2`}
        >
          <Text style={tw`text-ink-3 text-sm`}>Also on the web: letsgrow.lu/privacy</Text>
        </PressableScale>
      </ScrollView>
    </SafeAreaView>
  );
}
