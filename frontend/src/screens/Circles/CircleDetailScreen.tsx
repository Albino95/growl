import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import tw from '../../lib/tw';
import GrowChromeHeader from '../../components/ui/GrowChromeHeader';
import PressableScale from '../../components/ui/PressableScale';
import FadeInUp from '../../components/ui/FadeInUp';
import PulseHereButton from '../../components/circles/PulseHereButton';
import SeatFill from '../../components/circles/SeatFill';
import {
  getGroup,
  joinGroup,
  leaveGroup,
  placeGroup,
  pulseGroup,
  signalCallInterest,
  type GroupMember,
  type GroupPulse,
  type GrowthGroup,
} from '../../services/api/groups';
import { avatarSource, resolveAvatarUri } from '../../utils/images';
import { getCategoryLabel } from '../../utils/categoryLabels';
import { feedback } from '../../utils/interactionFeedback';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import type { RootStackParamList } from '../../app/navigation/RootNavigator';

function timeAgo(iso: string): string {
  const t = Date.parse(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(t)) return '';
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function CircleDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'CircleDetail'>>();
  const groupId = route.params?.groupId;
  const [group, setGroup] = useState<GrowthGroup | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [pulses, setPulses] = useState<GroupPulse[]>([]);
  const [interest, setInterest] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pulsing, setPulsing] = useState(false);

  const load = useCallback(async () => {
    if (!groupId) return;
    try {
      const res = await getGroup(groupId);
      setGroup(res.group);
      setMembers(res.members);
      setPulses(res.pulses);
      setInterest(res.my_call_interest);
    } catch {
      setGroup(null);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const onJoin = async () => {
    if (!groupId) return;
    setBusy(true);
    try {
      const res = await joinGroup(groupId);
      feedback.success();
      if (res.placed && res.group?.id && res.group.id !== groupId) {
        navigateFromRoot(navigation, 'CircleDetail', { groupId: res.group.id });
        return;
      }
      await load();
    } catch (e) {
      feedback.error();
      alertMessage('Could not join', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const onFindAnother = async () => {
    if (!group?.path_key) return;
    setBusy(true);
    try {
      const res = await placeGroup(group.path_key);
      feedback.success();
      navigateFromRoot(navigation, 'CircleDetail', { groupId: res.group.id });
    } catch (e) {
      feedback.error();
      alertMessage('Could not find a circle', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const onLeave = async () => {
    if (!groupId || !group) return;
    const last = group.member_count <= 1;
    const closes = last && group.kind !== 'starting';
    if (last) {
      const ok = await confirmAsync(
        'Free your seat?',
        closes
          ? 'This seat goes back to the path. We’ll put the chairs away so Circles stay full of people — not empty rooms.'
          : 'This circle goes quiet until someone else sits down. You’re freeing a chair, not abandoning a group.'
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await leaveGroup(groupId);
      feedback.close();
      if (res.closed) {
        navigation.goBack();
        return;
      }
      await load();
    } catch (e) {
      feedback.error();
      alertMessage('Could not leave', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const onPulse = async () => {
    if (!groupId) return;
    setPulsing(true);
    try {
      await pulseGroup(groupId);
      feedback.success();
      await load();
    } catch (e) {
      feedback.error();
      alertMessage('Pulse later', e instanceof Error ? e.message : 'Try again in a few minutes');
    } finally {
      setPulsing(false);
    }
  };

  const onCall = async (kind: 'voice' | 'video') => {
    if (!groupId) return;
    try {
      await signalCallInterest(groupId, kind);
      feedback.success();
      setInterest((prev) => (prev.includes(kind) ? prev : [...prev, kind]));
      await load();
    } catch (e) {
      feedback.error();
      alertMessage('Could not save', e instanceof Error ? e.message : 'Join first, then tap again');
    }
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`} edges={['top']}>
      <GrowChromeHeader
        leftAccessory={
          <PressableScale
            onPress={() => navigation.goBack()}
            feedback="close"
            style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
          >
            <Ionicons name="arrow-back" size={18} color="#1C1917" />
          </PressableScale>
        }
      />

      {loading ? (
        <View style={tw`flex-1 items-center justify-center`}>
          <ActivityIndicator color="#059669" />
        </View>
      ) : !group ? (
        <View style={tw`px-5 pt-10`}>
          <Text style={tw`text-lg font-bold text-stone-900`}>Circle not found</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={tw`px-5 pb-16`}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={() => void load()} tintColor="#059669" />
          }
        >
          <FadeInUp>
            <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-700 uppercase`}>
              {group.kind === 'starting' ? 'Starting circle' : group.kind === 'cohort' ? 'Path circle' : 'Circle'}
            </Text>
            <Text style={tw`text-[28px] font-bold text-stone-900 mt-0.5 leading-8`}>{group.name}</Text>
            <Text style={tw`text-sm text-stone-500 mt-1.5 leading-5`}>
              {group.path_key === 'grove' ? 'All paths' : getCategoryLabel(group.path_key)}
              {group.city || group.country
                ? ` · ${[group.city, group.country].filter(Boolean).join(', ')}`
                : ''}
            </Text>
            <View style={tw`mt-3`}>
              <SeatFill filled={group.member_count} max={group.max_members || 10} />
            </View>
            {group.description ? (
              <Text style={tw`text-sm text-stone-600 mt-3 leading-5`}>{group.description}</Text>
            ) : null}
          </FadeInUp>

          <View style={tw`flex-row gap-2 mt-5`}>
            {group.joined ? (
              <>
                <PulseHereButton onPress={() => void onPulse()} busy={pulsing} />
                <PressableScale
                  onPress={() => void onLeave()}
                  disabled={busy}
                  feedback="close"
                  style={tw`px-4 py-3.5 rounded-2xl bg-white border border-stone-200 items-center`}
                >
                  <Text style={tw`text-stone-700 font-semibold`}>Leave</Text>
                </PressableScale>
              </>
            ) : group.is_full ? (
              <PressableScale
                onPress={() => void onFindAnother()}
                disabled={busy}
                feedback="success"
                style={tw`flex-1 py-3.5 rounded-2xl bg-emerald-600 items-center`}
              >
                <Text style={tw`text-white font-bold`}>Find another</Text>
              </PressableScale>
            ) : (
              <PressableScale
                onPress={() => void onJoin()}
                disabled={busy}
                feedback="success"
                style={tw`flex-1 py-3.5 rounded-2xl bg-emerald-600 items-center`}
              >
                <Text style={tw`text-white font-bold`}>Take a seat</Text>
              </PressableScale>
            )}
          </View>

          <Text style={tw`text-xs font-semibold tracking-widest text-stone-500 uppercase mt-7 mb-3`}>
            Live sits — coming
          </Text>
          <View style={tw`rounded-[22px] border border-stone-200/80 bg-[#FFFcf7] overflow-hidden mb-2.5`}>
            <View style={tw`h-1 bg-emerald-600`} />
            <View style={tw`px-3.5 py-3.5 flex-row items-center`}>
              <View style={tw`w-11 h-11 rounded-2xl bg-emerald-50 items-center justify-center mr-3`}>
                <Ionicons name="call-outline" size={20} color="#059669" />
              </View>
              <View style={tw`flex-1`}>
                <Text style={tw`text-sm font-bold text-stone-900`}>Voice room</Text>
                <Text style={tw`text-xs text-stone-500 mt-0.5`}>
                  {group.calls.voice_waitlist} waiting · LiveKit rooms after waitlist
                </Text>
              </View>
              <PressableScale
                onPress={() => void onCall('voice')}
                disabled={!group.joined || interest.includes('voice')}
                feedback="select"
                style={tw`px-3 py-2 rounded-xl ${
                  interest.includes('voice') ? 'bg-emerald-50' : 'bg-emerald-600'
                }`}
              >
                <Text
                  style={tw`text-xs font-bold ${
                    interest.includes('voice') ? 'text-emerald-800' : 'text-white'
                  }`}
                >
                  {interest.includes('voice') ? 'On list' : 'Notify me'}
                </Text>
              </PressableScale>
            </View>
          </View>
          <View style={tw`rounded-[22px] border border-stone-200/80 bg-[#FFFcf7] overflow-hidden`}>
            <View style={tw`px-3.5 py-3.5 flex-row items-center`}>
              <View style={tw`w-11 h-11 rounded-2xl bg-[#FFF1F0] items-center justify-center mr-3`}>
                <Ionicons name="videocam-outline" size={20} color="#E11D48" />
              </View>
              <View style={tw`flex-1`}>
                <Text style={tw`text-sm font-bold text-stone-900`}>Video sit</Text>
                <Text style={tw`text-xs text-stone-500 mt-0.5`}>
                  {group.calls.video_waitlist} waiting · cameras later, same circle
                </Text>
              </View>
              <PressableScale
                onPress={() => void onCall('video')}
                disabled={!group.joined || interest.includes('video')}
                feedback="select"
                style={tw`px-3 py-2 rounded-xl ${
                  interest.includes('video') ? 'bg-[#FFF1F0]' : 'bg-stone-900'
                }`}
              >
                <Text
                  style={tw`text-xs font-bold ${
                    interest.includes('video') ? 'text-[#E11D48]' : 'text-white'
                  }`}
                >
                  {interest.includes('video') ? 'On list' : 'Notify me'}
                </Text>
              </PressableScale>
            </View>
          </View>

          <Text style={tw`text-xs font-semibold tracking-widest text-stone-500 uppercase mt-7 mb-3`}>
            In this room
          </Text>
          {members.length === 0 ? (
            <Text style={tw`text-sm text-stone-500 mb-2`}>No one seated yet.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`mb-2`}>
              {members.map((m) => {
                const uri = resolveAvatarUri(m.user_id, m.username, m.avatar);
                return (
                  <PressableScale
                    key={m.user_id}
                    onPress={() => navigateFromRoot(navigation, 'PublicProfile', { userId: m.user_id })}
                    feedback="open"
                    style={tw`mr-3 items-center w-[64px]`}
                  >
                    <Image
                      source={avatarSource(uri)}
                      style={tw`w-14 h-14 rounded-full bg-[#EAE4D6]`}
                      contentFit="cover"
                    />
                    <Text style={tw`text-[11px] font-semibold text-stone-800 mt-1.5`} numberOfLines={1}>
                      {m.username}
                    </Text>
                  </PressableScale>
                );
              })}
            </ScrollView>
          )}
          {!group.is_full ? (
            <Text style={tw`text-xs text-stone-400 mb-2`}>
              {Math.max(0, (group.max_members || 10) - group.member_count)} open chair
              {(group.max_members || 10) - group.member_count === 1 ? '' : 's'} in this room — not other circles.
            </Text>
          ) : null}

          <Text style={tw`text-xs font-semibold tracking-widest text-stone-500 uppercase mt-5 mb-3`}>
            Recent pulses
          </Text>
          {pulses.length === 0 ? (
            <Text style={tw`text-sm text-stone-500`}>No check-ins yet. Be the first to say you’re here.</Text>
          ) : (
            pulses.map((p, i) => (
              <FadeInUp
                key={p.id}
                delay={i * 40}
                style={tw`mb-2 px-3.5 py-3 rounded-2xl bg-[#FFFcf7] border border-stone-200/80 flex-row items-center`}
              >
                <Image
                  source={avatarSource(resolveAvatarUri(p.user_id, p.username, p.avatar))}
                  style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] mr-3`}
                  contentFit="cover"
                />
                <View style={tw`flex-1`}>
                  <Text style={tw`text-sm font-semibold text-stone-900`}>{p.username}</Text>
                  <Text style={tw`text-xs text-stone-500`}>
                    {p.note || 'Showed up'} · {timeAgo(p.created_at)}
                  </Text>
                </View>
              </FadeInUp>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
