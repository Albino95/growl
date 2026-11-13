/**
 * Invite friends — your code + link, share/copy, counts, and "Have a code?".
 * Contract: docs/GROWTH_SYSTEM.md § Invites.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Share,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
import { getMyInvite, redeemInvite, type MyInvite } from '../../services/api/growth';
import { normalizeInviteCode } from '../../services/storage/pendingInvite';
import PrimaryButton from '../../components/ui/PrimaryButton';
import GrowAvatar from '../../components/ui/GrowAvatar';
import { SkeletonList } from '../../components/ui/SkeletonCard';
import { feedback } from '../../utils/interactionFeedback';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import { copyText, friendlyInviteError } from './inviteHelpers';

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={tw`flex-1 items-center py-3`}>
      <Text style={tw`text-2xl font-bold text-stone-900`}>{value}</Text>
      <Text style={tw`text-xs text-stone-500 mt-0.5 text-center`}>{label}</Text>
    </View>
  );
}

export default function InviteScreen() {
  const navigation = useNavigation();
  const [invite, setInvite] = useState<MyInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemed, setRedeemed] = useState<{ username: string; avatar: string | null } | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setInvite(await getMyInvite());
    } catch {
      setError('We couldn’t load your invite just now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const onCopy = async () => {
    if (!invite) return;
    feedback.tap();
    const ok = await copyText(invite.url);
    if (ok) {
      feedback.success();
      setCopied(true);
    }
  };

  const onShare = async () => {
    if (!invite) return;
    feedback.open();
    try {
      await Share.share({
        message: `Join me on Grow! ${invite.url} (code ${invite.code})`,
        ...(Platform.OS === 'ios' ? { url: invite.url } : {}),
      });
    } catch {
      // Dismissed or unavailable — nothing to report.
    }
  };

  const onRedeem = async () => {
    const clean = normalizeInviteCode(code);
    if (!clean || redeeming) return;
    if (invite && clean === normalizeInviteCode(invite.code)) {
      feedback.warn();
      setRedeemError('That’s your own code — share it with a friend instead 🌱');
      return;
    }
    setRedeeming(true);
    setRedeemError(null);
    try {
      const res = await redeemInvite(clean);
      setRedeemed(res.inviter);
      setCode('');
      feedback.celebrate();
    } catch (e) {
      feedback.error();
      setRedeemError(friendlyInviteError(e));
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`} edges={['top']}>
      <View style={tw`flex-row items-center px-4 pt-2 pb-2`}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={18} color="#1C1917" />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={tw`flex-1`} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={tw`px-5 pb-16`}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor="#059669"
            />
          }
        >
          <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
            Invite friends
          </Text>
          <Text style={tw`text-2xl font-bold text-stone-900 mt-0.5`}>Grow with friends</Text>
          <Text style={tw`text-base text-stone-600 mt-2 leading-6`}>
            Growing is easier with people cheering you on. When a friend joins with your code, you’re
            connected right away — and once they start growing, you earn the Gardener badge 🌱
          </Text>

          <View style={tw`mt-5 p-5 rounded-3xl bg-[#FFFcf7] border border-stone-200/80`}>
            {loading && !invite ? (
              <SkeletonList variant="inbox" count={1} />
            ) : invite ? (
              <>
                <Text style={tw`text-xs font-semibold text-stone-500 uppercase tracking-widest text-center`}>
                  Your code
                </Text>
                <Text
                  style={tw`mt-2 text-4xl font-bold text-emerald-700 text-center tracking-widest`}
                  selectable
                  accessibilityLabel={`Your invite code ${invite.code.split('').join(' ')}`}
                >
                  {invite.code}
                </Text>
                <Text style={tw`mt-2 text-xs text-stone-500 text-center`} selectable numberOfLines={1}>
                  {invite.url.replace(/^https?:\/\//, '')}
                </Text>
                <View style={tw`flex-row mt-5 gap-3`}>
                  <PrimaryButton
                    label={copied ? 'Copied' : 'Copy link'}
                    variant="soft"
                    style={tw`flex-1`}
                    onPress={() => void onCopy()}
                    success={copied}
                  />
                  <PrimaryButton label="Share" style={tw`flex-1`} onPress={() => void onShare()} />
                </View>
                <View style={tw`flex-row mt-4 border-t border-stone-200/80`}>
                  <Stat value={invite.invited_count} label="joined with your code" />
                  <View style={tw`w-px bg-stone-200/80`} />
                  <Stat value={invite.rewarded_count} label="already growing" />
                </View>
              </>
            ) : (
              <View style={tw`items-center py-2`}>
                <Text style={tw`text-sm text-stone-600 text-center`}>{error}</Text>
                <PrimaryButton
                  label="Try again"
                  variant="soft"
                  style={tw`mt-3 self-stretch`}
                  onPress={() => {
                    setLoading(true);
                    void load();
                  }}
                />
              </View>
            )}
          </View>

          <Text style={tw`mt-8 text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-2`}>
            Have a code?
          </Text>
          <View style={tw`p-5 rounded-3xl bg-[#FFFcf7] border border-stone-200/80`}>
            {redeemed ? (
              <View style={tw`items-center`}>
                <GrowAvatar username={redeemed.username} uri={redeemed.avatar} size={56} />
                <Text style={tw`mt-3 text-base font-bold text-stone-900 text-center`}>
                  You and {redeemed.username} are now friends 🌱
                </Text>
                <Text style={tw`mt-1 text-sm text-stone-600 text-center`}>
                  Say hi, or grow together on a challenge.
                </Text>
                <PrimaryButton
                  label="Explore challenges"
                  variant="soft"
                  style={tw`mt-4 self-stretch`}
                  onPress={() => navigateFromRoot(navigation, 'Individual', { screen: 'Explore' })}
                />
              </View>
            ) : (
              <>
                <Text style={tw`text-sm text-stone-600`}>
                  A friend sent you a code? Enter it to connect with them.
                </Text>
                <TextInput
                  value={code}
                  onChangeText={(v) => {
                    setCode(v.toUpperCase());
                    if (redeemError) setRedeemError(null);
                  }}
                  placeholder="e.g. 7K3Q9M2X"
                  placeholderTextColor="#A8A29E"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={16}
                  returnKeyType="go"
                  onSubmitEditing={() => void onRedeem()}
                  style={tw`mt-3 border ${
                    redeemError ? 'border-red-400' : 'border-stone-200/80'
                  } bg-white rounded-2xl py-3.5 px-4 text-base font-semibold tracking-widest text-stone-900`}
                  accessibilityLabel="Invite code"
                />
                {redeemError ? <Text style={tw`mt-2 text-xs text-red-600`}>{redeemError}</Text> : null}
                <PrimaryButton
                  label="Use code"
                  style={tw`mt-3`}
                  onPress={() => void onRedeem()}
                  loading={redeeming}
                  disabled={redeeming || normalizeInviteCode(code).length < 4}
                />
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
