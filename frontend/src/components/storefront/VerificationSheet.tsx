import React, { useEffect, useState } from 'react';
import { View, Text, Modal, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import PrimaryButton from '../ui/PrimaryButton';
import KeyboardInsetView from '../ui/KeyboardInsetView';
import { haptic } from '../../theme/haptics';
import { toast } from '../../state/useToastStore';
import { alertMessage } from '../../utils/confirmDialog';
import {
  isHttpsLink,
  normalizeLink,
  requestVerification,
  type VerificationState,
} from '../../services/api/storefront';

type Props = {
  visible: boolean;
  onClose: () => void;
  state: VerificationState | null;
  onSubmitted: (next: VerificationState) => void;
};

const COPY: Record<VerificationState['status'], { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }> = {
  none: {
    icon: 'shield-outline',
    title: 'Get a verified badge',
    body: 'Tell us where to find your business. Once we’ve checked it, shoppers see a verified seal on your storefront and products.',
  },
  pending: {
    icon: 'time-outline',
    title: 'We’re checking your details',
    body: 'This usually takes a couple of working days. You’ll get a notification when it’s done. You can update your details meanwhile.',
  },
  verified: {
    icon: 'checkmark-circle',
    title: 'Your business is verified',
    body: 'Shoppers see the verified seal on your storefront, products and profile.',
  },
  rejected: {
    icon: 'alert-circle-outline',
    title: 'We couldn’t verify you yet',
    body: 'Check the note below, update your details and send them again.',
  },
};

/** Request (or re-request) the verified badge: website and/or registration number + note. */
export default function VerificationSheet({ visible, onClose, state, onSubmitted }: Props) {
  const status = state?.status ?? 'none';
  const [website, setWebsite] = useState('');
  const [registration, setRegistration] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setWebsite(state?.website || '');
    setRegistration(state?.registration_number || '');
    setNote(state?.note || '');
  }, [visible, state]);

  const submit = async () => {
    const site = normalizeLink(website);
    if (site && !isHttpsLink(site)) {
      alertMessage('Check the website', 'Use a full address like https://yourshop.lu');
      return;
    }
    if (!site && !registration.trim()) {
      alertMessage('Add a detail', 'Add your website or business registration number so we can check who you are.');
      return;
    }
    setBusy(true);
    try {
      await requestVerification({
        website: site || undefined,
        registration_number: registration.trim() || undefined,
        note: note.trim() || undefined,
      });
      haptic('success');
      toast.success('Request sent');
      onSubmitted({
        status: 'pending',
        website: site || null,
        registration_number: registration.trim() || null,
        note: note.trim() || null,
        reason: null,
      });
      onClose();
    } catch (e) {
      haptic('error');
      alertMessage('Couldn’t send', e instanceof Error ? e.message : 'Try again later.');
    } finally {
      setBusy(false);
    }
  };

  const copy = COPY[status];
  const input = tw`bg-card border border-line rounded-control px-3 py-2.5 text-body text-ink`;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['top', 'bottom']}>
        <KeyboardInsetView>
          <View style={tw`flex-row items-center justify-between px-gutter py-3 border-b border-line`}>
            <View style={tw`w-16`} />
            <Text style={tw`text-callout font-semibold text-ink`} accessibilityRole="header">
              Verification
            </Text>
            <PressableScale
              onPress={onClose}
              hitSlop={12}
              style={tw`w-16 items-end`}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={tw`text-body font-semibold text-leaf-ink`}>Close</Text>
            </PressableScale>
          </View>
          <ScrollView contentContainerStyle={tw`px-gutter pt-5 pb-8`} keyboardShouldPersistTaps="handled">
            <View style={tw`items-center mb-5`}>
              <Ionicons
                name={copy.icon}
                size={40}
                color={status === 'verified' ? theme.colors.brand : status === 'rejected' ? theme.colors.danger : theme.colors.icon}
              />
              <Text style={tw`text-title font-bold text-ink mt-2 text-center`}>{copy.title}</Text>
              <Text style={tw`text-body text-ink-2 mt-1.5 text-center`}>{copy.body}</Text>
            </View>

            {status === 'rejected' && state?.reason ? (
              <View style={tw`bg-raised border border-line rounded-control px-3 py-2.5 mb-4`}>
                <Text style={tw`text-footnote font-semibold text-ink`}>Note from our team</Text>
                <Text style={tw`text-footnote text-ink-2 mt-0.5`}>{state.reason}</Text>
              </View>
            ) : null}

            {status !== 'verified' ? (
              <>
                <Text style={tw`text-footnote font-semibold text-ink-2 mb-1`}>Website</Text>
                <TextInput
                  value={website}
                  onChangeText={setWebsite}
                  onBlur={() => setWebsite((v) => normalizeLink(v))}
                  placeholder="https://yourshop.lu"
                  placeholderTextColor={theme.colors.placeholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  maxLength={300}
                  style={[input, tw`mb-3`]}
                  accessibilityLabel="Website"
                />
                <Text style={tw`text-footnote font-semibold text-ink-2 mb-1`}>Business registration number</Text>
                <TextInput
                  value={registration}
                  onChangeText={setRegistration}
                  placeholder="e.g. RCS B123456"
                  placeholderTextColor={theme.colors.placeholder}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={64}
                  style={[input, tw`mb-3`]}
                  accessibilityLabel="Business registration number"
                />
                <Text style={tw`text-footnote font-semibold text-ink-2 mb-1`}>Anything else? (optional)</Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Where we can find you, who to contact…"
                  placeholderTextColor={theme.colors.placeholder}
                  multiline
                  maxLength={600}
                  textAlignVertical="top"
                  style={[input, tw`min-h-[88px] mb-5`]}
                  accessibilityLabel="Note for our team"
                />
                <PrimaryButton
                  label={status === 'pending' ? 'Update details' : status === 'rejected' ? 'Send again' : 'Request verification'}
                  onPress={() => void submit()}
                  loading={busy}
                  disabled={busy}
                />
              </>
            ) : null}
          </ScrollView>
        </KeyboardInsetView>
      </SafeAreaView>
    </Modal>
  );
}
