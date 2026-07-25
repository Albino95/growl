import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import tw from '../../lib/tw';
import { LEGAL_HUB_ITEMS, SUPPORT_EMAIL } from '../../content/legal';
import type { RootStackParamList } from '../../app/navigation/RootNavigator';

export default function LegalHubScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`}>
      <View style={tw`flex-row items-center justify-between px-4 py-3 bg-white border-b border-stone-200`}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={tw`text-lg font-semibold text-stone-900`}>Legal & Support</Text>
        <View style={tw`w-6`} />
      </View>

      <ScrollView style={tw`flex-1`} contentContainerStyle={tw`p-4`}>
        <Text style={tw`text-sm text-stone-600 mb-4`}>
          Policies, terms, and support resources for the Growl community.
        </Text>

        <View style={tw`bg-white rounded-xl overflow-hidden`}>
          {LEGAL_HUB_ITEMS.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => navigation.navigate('LegalDocument', { documentId: item.id })}
              style={tw`flex-row items-center justify-between px-4 py-4 ${
                index < LEGAL_HUB_ITEMS.length - 1 ? 'border-b border-stone-100' : ''
              }`}
            >
              <View style={tw`flex-row items-center`}>
                <Ionicons name={item.icon} size={20} color="#6B7280" />
                <Text style={tw`text-stone-900 ml-3`}>{item.title}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          ))}
        </View>

        <View style={tw`bg-white rounded-xl overflow-hidden mt-4`}>
          <TouchableOpacity
            onPress={() => navigation.navigate('DeleteAccount')}
            style={tw`flex-row items-center justify-between px-4 py-4 border-b border-stone-100`}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="trash-outline" size={20} color="#DC2626" />
              <Text style={tw`text-red-700 font-semibold ml-3`}>Delete account</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#DC2626" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          style={tw`mt-6 flex-row items-center justify-center py-3`}
        >
          <Ionicons name="mail-outline" size={18} color="#059669" />
          <Text style={tw`text-brand-700 font-semibold ml-2`}>{SUPPORT_EMAIL}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
