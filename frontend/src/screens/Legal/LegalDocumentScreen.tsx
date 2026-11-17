import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import PressableScale from '../../components/ui/PressableScale';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import tw, { theme } from '../../lib/tw';
import { LEGAL_DOCUMENTS, type LegalDocumentId } from '../../content/legal';
import type { RootStackParamList } from '../../app/navigation/RootNavigator';

type LegalDocRoute = RouteProp<RootStackParamList, 'LegalDocument'>;

export default function LegalDocumentScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<LegalDocRoute>();
  const doc = LEGAL_DOCUMENTS[route.params.documentId as LegalDocumentId];

  if (!doc) {
    return (
      <SafeAreaView style={tw`flex-1 bg-page items-center justify-center`}>
        <Text style={tw`text-ink-2`}>Document not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={tw`flex-1 bg-page`}>
      <View style={tw`flex-row items-center justify-between px-gutter py-3 bg-card border-b border-line`}>
        <PressableScale onPress={() => navigation.goBack()} pressedScale={0.9} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color={theme.colors.ink} />
        </PressableScale>
        <Text style={tw`text-lg font-semibold text-ink flex-1 text-center mx-2`} numberOfLines={1}>
          {doc.title}
        </Text>
        <View style={tw`w-6`} />
      </View>

      <ScrollView contentContainerStyle={tw`p-5 pb-10`}>
        <Text style={tw`text-xs text-ink-3 mb-4`}>Last updated {doc.updatedAt}</Text>
        {doc.sections.map((section) => (
          <View key={section.heading} style={tw`mb-6`}>
            <Text style={tw`text-base font-bold text-ink mb-2`}>{section.heading}</Text>
            <Text style={tw`text-sm text-ink-2 leading-6`}>{section.body}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
