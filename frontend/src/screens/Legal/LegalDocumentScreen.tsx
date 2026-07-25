import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import tw from '../../lib/tw';
import { LEGAL_DOCUMENTS, type LegalDocumentId } from '../../content/legal';
import type { RootStackParamList } from '../../app/navigation/RootNavigator';

type LegalDocRoute = RouteProp<RootStackParamList, 'LegalDocument'>;

export default function LegalDocumentScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<LegalDocRoute>();
  const doc = LEGAL_DOCUMENTS[route.params.documentId as LegalDocumentId];

  if (!doc) {
    return (
      <SafeAreaView style={tw`flex-1 bg-surface-page items-center justify-center`}>
        <Text style={tw`text-stone-600`}>Document not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`}>
      <View style={tw`flex-row items-center justify-between px-4 py-3 bg-white border-b border-stone-200`}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={tw`text-lg font-semibold text-stone-900 flex-1 text-center mx-2`} numberOfLines={1}>
          {doc.title}
        </Text>
        <View style={tw`w-6`} />
      </View>

      <ScrollView contentContainerStyle={tw`p-5 pb-10`}>
        <Text style={tw`text-xs text-stone-500 mb-4`}>Last updated {doc.updatedAt}</Text>
        {doc.sections.map((section) => (
          <View key={section.heading} style={tw`mb-6`}>
            <Text style={tw`text-base font-bold text-stone-900 mb-2`}>{section.heading}</Text>
            <Text style={tw`text-sm text-stone-700 leading-6`}>{section.body}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
