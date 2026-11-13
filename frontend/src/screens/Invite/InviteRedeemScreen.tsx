/**
 * Deep link target for growl://invite/:code and https://letsgrow.lu/i/:code.
 * Signed in → look up the inviter and confirm the friendship.
 * Signed out → keep the code and hand off to sign-up (field prefilled).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CommonActions, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import tw from '../../lib/tw';
import type { RootStackParamList } from '../../app/navigation/RootNavigator';
import { useAppSelector } from '../../store/store';
import { lookupInvite, redeemInvite } from '../../services/api/growth';
import {
  clearPendingInviteCode,
  normalizeInviteCode,
  savePendingInviteCode,
} from '../../services/storage/pendingInvite';
import PrimaryButton from '../../components/ui/PrimaryButton';
import GrowAvatar from '../../components/ui/GrowAvatar';
import GrowLoader from '../../components/ui/GrowLoader';
import FadeInUp from '../../components/ui/FadeInUp';
import { feedback } from '../../utils/interactionFeedback';
import { friendlyInviteError } from './inviteHelpers';

type Route = RouteProp<RootStackParamList, 'InviteRedeem'>;
type Inviter = { username: string; avatar: string | null };
type Phase = 'loading' | 'confirm' | 'redeeming' | 'done' | 'error';

export default function InviteRedeemScreen() {
  const navigation = useNavigation();
  const route = useRoute<Route>();
  const code = normalizeInviteCode(route.params?.code);
  const token = useAppSelector((s) => s.auth.token);

  const [phase, setPhase] = useState<Phase>('loading');
  const [inviter, setInviter] = useState<Inviter | null>(null);
  const [error, setError] = useState<string | null>(null);

  const leave = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else {
      const names: string[] = navigation.getState()?.routeNames ?? [];
      const home = names.includes('Individual') ? 'Individual' : 'Business';
      navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: home }] }));
    }
  }, [navigation]);

  const lookup = useCallback(async () => {
    setPhase('loading');
    setError(null);
    try {
      const res = await lookupInvite(code);
      setInviter(res.inviter);
      setPhase('confirm');
    } catch (e) {
      const msg = e instanceof Error ? e.message.toLowerCase() : '';
      setError(
        msg.includes('not found') || msg.includes('404') || msg.includes('expired')
          ? 'This invite has expired or the code isn’t quite right.'
          : friendlyInviteError(e)
      );
      setPhase('error');
    }
  }, [code]);

  useEffect(() => {
    if (!code) {
      setError('This invite link looks incomplete.');
      setPhase('error');
      return;
    }
    if (!token) {
      // Signed out: remember the code, then go to sign-up where it's prefilled.
      void savePendingInviteCode(code).finally(() => {
        navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Auth' }] }));
      });
      return;
    }
    void lookup();
  }, [code, token, lookup, navigation]);

  const onAccept = async () => {
    setPhase('redeeming');
    try {
      const res = await redeemInvite(code);
      if (res?.inviter) setInviter(res.inviter);
      void clearPendingInviteCode();
      feedback.celebrate();
      setPhase('done');
    } catch (e) {
      feedback.error();
      setError(friendlyInviteError(e));
      setPhase('error');
    }
  };

  const name = inviter?.username || 'your friend';

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`} edges={['top', 'bottom']}>
      <View style={tw`flex-row items-center px-4 pt-2 pb-2`}>
        <Pressable
          onPress={leave}
          style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={18} color="#1C1917" />
        </Pressable>
      </View>

      <View style={tw`flex-1 justify-center px-6 pb-10`}>
        {phase === 'loading' || !token ? (
          <View style={tw`items-center`}>
            <GrowLoader label={token ? 'Opening your invite' : 'Saving your invite'} />
          </View>
        ) : phase === 'error' ? (
          <FadeInUp>
            <View style={tw`items-center`}>
              <View style={tw`w-16 h-16 rounded-full bg-[#EAE4D6] items-center justify-center`}>
                <Ionicons name="leaf-outline" size={28} color="#6B645E" />
              </View>
              <Text style={tw`mt-4 text-xl font-bold text-stone-900 text-center`}>
                This invite didn’t work
              </Text>
              <Text style={tw`mt-2 text-base text-stone-600 text-center leading-6`}>{error}</Text>
              <PrimaryButton label="Try again" variant="soft" style={tw`mt-6 self-stretch`} onPress={() => void lookup()} />
              <Pressable onPress={leave} style={tw`mt-3 py-2`}>
                <Text style={tw`text-sm font-semibold text-stone-500`}>Not now</Text>
              </Pressable>
            </View>
          </FadeInUp>
        ) : phase === 'done' ? (
          <FadeInUp>
            <View style={tw`items-center`}>
              <GrowAvatar username={inviter?.username} uri={inviter?.avatar} size={84} />
              <Text style={tw`mt-5 text-2xl font-bold text-stone-900 text-center`}>
                You and {name} are friends 🌱
              </Text>
              <Text style={tw`mt-2 text-base text-stone-600 text-center leading-6`}>
                Cheer each other on — growing together is the best part.
              </Text>
              <PrimaryButton label="Let’s grow" style={tw`mt-6 self-stretch`} onPress={leave} />
            </View>
          </FadeInUp>
        ) : (
          <FadeInUp>
            <View style={tw`items-center`}>
              <GrowAvatar username={inviter?.username} uri={inviter?.avatar} size={84} />
              <Text style={tw`mt-5 text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
                Invite · {code}
              </Text>
              <Text style={tw`mt-2 text-2xl font-bold text-stone-900 text-center`}>
                Add {name} as a friend?
              </Text>
              <Text style={tw`mt-2 text-base text-stone-600 text-center leading-6`}>
                {name} invited you to grow together on Grow!
              </Text>
              <PrimaryButton
                label="Add friend"
                style={tw`mt-6 self-stretch`}
                onPress={() => void onAccept()}
                loading={phase === 'redeeming'}
                disabled={phase === 'redeeming'}
              />
              <Pressable onPress={leave} style={tw`mt-3 py-2`} disabled={phase === 'redeeming'}>
                <Text style={tw`text-sm font-semibold text-stone-500`}>Not now</Text>
              </Pressable>
            </View>
          </FadeInUp>
        )}
      </View>
    </SafeAreaView>
  );
}
