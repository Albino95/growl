import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
import { useAuth } from '../../store/hooks';
import { exportAccountData, deleteAccount } from '../../services/api/privacy';
import { resetNavigationToAuth } from '../../app/navigation/rootNavigation';
import { alertMessage } from '../../utils/confirmDialog';

export default function DeleteAccountScreen() {
  const navigation = useNavigation();
  const { signOut } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await exportAccountData();
      const summary = `Exported ${data.posts.length} posts, ${data.comments.length} comments, ${data.orders.length} orders.`;
      alertMessage(
        'Export ready',
        `${summary}\n\nA copy has been prepared on the server. Contact privacy@letsgrow.lu for a full archive file.`
      );
    } catch (e: unknown) {
      alertMessage('Export failed', e instanceof Error ? e.message : 'Could not export data');
    } finally {
      setExporting(false);
    }
  };

  const openDeleteConfirm = () => {
    setConfirmText('');
    setConfirmOpen(true);
  };

  const performDelete = async () => {
    if (confirmText.trim() !== 'DELETE') {
      alertMessage('Confirmation required', 'Type DELETE in capital letters to confirm.');
      return;
    }
    setConfirmOpen(false);
    setDeleting(true);
    try {
      const result = await deleteAccount('DELETE');
      await signOut().unwrap();
      resetNavigationToAuth(navigation);
      alertMessage('Account deleted', result.message);
    } catch (e: unknown) {
      alertMessage('Deletion failed', e instanceof Error ? e.message : 'Could not delete account');
    } finally {
      setDeleting(false);
      setConfirmText('');
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
          onPress={openDeleteConfirm}
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

      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
        <Pressable style={tw`flex-1 bg-black/40 justify-center px-6`} onPress={() => setConfirmOpen(false)}>
          <Pressable style={tw`bg-white rounded-2xl p-5`} onPress={(e) => e.stopPropagation()}>
            <Text style={tw`text-lg font-bold text-stone-900 mb-2`}>Delete account?</Text>
            <Text style={tw`text-sm text-stone-600 mb-4`}>
              This permanently schedules deletion of your account and personal data. This cannot be undone.
            </Text>
            <Text style={tw`text-sm font-medium text-stone-800 mb-2`}>
              Type <Text style={tw`font-bold text-red-600`}>DELETE</Text> to confirm
            </Text>
            <TextInput
              value={confirmText}
              onChangeText={setConfirmText}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="DELETE"
              placeholderTextColor="#A8A29E"
              style={tw`border border-stone-200 rounded-xl px-3 py-3 text-base text-stone-900 bg-stone-50 mb-4`}
            />
            <View style={tw`flex-row gap-3`}>
              <TouchableOpacity
                onPress={() => setConfirmOpen(false)}
                style={tw`flex-1 py-3 rounded-xl bg-stone-100 items-center`}
              >
                <Text style={tw`font-semibold text-stone-700`}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void performDelete()}
                disabled={confirmText.trim() !== 'DELETE' || deleting}
                style={tw`flex-1 py-3 rounded-xl bg-red-600 items-center ${
                  confirmText.trim() !== 'DELETE' || deleting ? 'opacity-50' : ''
                }`}
              >
                <Text style={tw`font-semibold text-white`}>Delete</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
