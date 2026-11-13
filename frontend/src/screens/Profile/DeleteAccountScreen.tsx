import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import PressableScale from '../../components/ui/PressableScale';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import { useAuth } from '../../store/hooks';
import { exportAccountData, deleteAccount } from '../../services/api/privacy';
import { resetNavigationToAuth } from '../../app/navigation/rootNavigation';
import { alertMessage } from '../../utils/confirmDialog';
import FormTextInput from '../../components/ui/FormTextInput';
import { KeyboardDoneAccessory } from '../../components/ui/KeyboardDoneAccessory';
import PrimaryButton from '../../components/ui/PrimaryButton';

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
    <SafeAreaView style={tw`flex-1 bg-page`}>
      <View style={tw`flex-row items-center justify-between px-gutter py-3 bg-card border-b border-line`}>
        <PressableScale onPress={() => navigation.goBack()} pressedScale={0.9} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color={theme.colors.ink} />
        </PressableScale>
        <Text style={tw`text-lg font-semibold text-ink`}>Delete Account</Text>
        <View style={tw`w-6`} />
      </View>

      <ScrollView contentContainerStyle={tw`p-4`}>
        <Text style={tw`text-sm text-ink-2 mb-6`}>
          You can download a copy of your data or permanently delete your account. Deletion removes your profile,
          posts, and personal information subject to legal retention requirements.
        </Text>

        <PressableScale
          onPress={() => void handleExport()}
          disabled={exporting || deleting}
          style={tw`bg-card border border-line rounded-control p-4 mb-4 flex-row items-center`}
        >
          <Ionicons name="download-outline" size={22} color="#059669" />
          <View style={tw`ml-3 flex-1`}>
            <Text style={tw`font-semibold text-ink`}>Export my data</Text>
            <Text style={tw`text-xs text-ink-3 mt-1`}>Request a copy of your account information</Text>
          </View>
          {exporting ? <ActivityIndicator size="small" color="#059669" /> : null}
        </PressableScale>

        <PressableScale
          onPress={openDeleteConfirm}
          disabled={exporting || deleting}
          style={tw`bg-red-50 border border-red-200 rounded-control p-4 flex-row items-center`}
        >
          <Ionicons name="trash-outline" size={22} color={theme.colors.danger} />
          <View style={tw`ml-3 flex-1`}>
            <Text style={tw`font-semibold text-red-700`}>Delete my account</Text>
            <Text style={tw`text-xs text-red-600/80 mt-1`}>Permanently remove your account and sign out</Text>
          </View>
          {deleting ? <ActivityIndicator size="small" color={theme.colors.danger} /> : null}
        </PressableScale>
      </ScrollView>

      <Modal visible={confirmOpen} transparent animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
        <Pressable style={tw`flex-1 bg-black/40 justify-center px-6`} onPress={() => setConfirmOpen(false)}>
          <Pressable style={tw`bg-card rounded-card p-5`} onPress={(e) => e.stopPropagation()}>
            <Text style={tw`text-lg font-bold text-ink mb-2`}>Delete account?</Text>
            <Text style={tw`text-sm text-ink-2 mb-4`}>
              This permanently schedules deletion of your account and personal data. This cannot be undone.
            </Text>
            <Text style={tw`text-sm font-medium text-stone-800 mb-2`}>
              Type <Text style={tw`font-bold text-red-600`}>DELETE</Text> to confirm
            </Text>
            <FormTextInput
              value={confirmText}
              onChangeText={setConfirmText}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="DELETE"
              style={tw`mb-4 bg-raised rounded-control`}
            />
            <View style={tw`flex-row gap-3`}>
              <View style={tw`flex-1`}>
                <PrimaryButton label="Cancel" variant="ghost" onPress={() => setConfirmOpen(false)} />
              </View>
              <View style={tw`flex-1`}>
                <PrimaryButton
                  label="Delete"
                  onPress={() => void performDelete()}
                  disabled={confirmText.trim() !== 'DELETE' || deleting}
                  loading={deleting}
                  style={{ backgroundColor: theme.colors.danger }}
                />
              </View>
            </View>
            <KeyboardDoneAccessory />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
