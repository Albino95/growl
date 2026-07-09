import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
import { useAuth } from '../../store/hooks';
import { exportAccountData, deleteAccount } from '../../services/api/privacy';
import { resetNavigationToAuth } from '../../app/navigation/rootNavigation';

function notify(title: string, message?: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}

export default function DeleteAccountScreen() {
  const navigation = useNavigation();
  const { signOut } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await exportAccountData();
      const summary = `Exported ${data.posts.length} posts, ${data.comments.length} comments, ${data.orders.length} orders.`;
      notify('Export ready', `${summary}\n\nA copy has been prepared on the server. Contact privacy@growl.app for a full archive file.`);
    } catch (e: unknown) {
      notify('Export failed', e instanceof Error ? e.message : 'Could not export data');
    } finally {
      setExporting(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete account',
      'This permanently schedules deletion of your account and personal data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete my account',
          style: 'destructive',
          onPress: () => void performDelete(),
        },
      ]
    );
  };

  const performDelete = async () => {
    setDeleting(true);
    try {
      const result = await deleteAccount('DELETE');
      await signOut().unwrap();
      resetNavigationToAuth(navigation);
      notify('Account deleted', result.message);
    } catch (e: unknown) {
      notify('Deletion failed', e instanceof Error ? e.message : 'Could not delete account');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`}>
      <View style={tw`flex-row items-center justify-between px-4 py-3 bg-white border-b border-stone-200`}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={tw`text-lg font-semibold text-stone-900`}>Delete Account</Text>
        <View style={tw`w-6`} />
      </View>

      <ScrollView contentContainerStyle={tw`p-4`}>
        <Text style={tw`text-sm text-stone-600 mb-6`}>
          You can download a copy of your data or permanently delete your account. Deletion removes your profile,
          posts, and personal information subject to legal retention requirements.
        </Text>

        <TouchableOpacity
          onPress={() => void handleExport()}
          disabled={exporting || deleting}
          style={tw`bg-white border border-stone-200 rounded-xl p-4 mb-4 flex-row items-center`}
        >
          <Ionicons name="download-outline" size={22} color="#059669" />
          <View style={tw`ml-3 flex-1`}>
            <Text style={tw`font-semibold text-stone-900`}>Export my data</Text>
            <Text style={tw`text-xs text-stone-500 mt-1`}>Request a copy of your account information</Text>
          </View>
          {exporting ? <ActivityIndicator size="small" color="#059669" /> : null}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={confirmDelete}
          disabled={exporting || deleting}
          style={tw`bg-red-50 border border-red-200 rounded-xl p-4 flex-row items-center`}
        >
          <Ionicons name="trash-outline" size={22} color="#DC2626" />
          <View style={tw`ml-3 flex-1`}>
            <Text style={tw`font-semibold text-red-700`}>Delete my account</Text>
            <Text style={tw`text-xs text-red-600/80 mt-1`}>Permanently remove your account and sign out</Text>
          </View>
          {deleting ? <ActivityIndicator size="small" color="#DC2626" /> : null}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
