import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import ScreenHeader from '../../components/ui/ScreenHeader';
import PressableScale from '../../components/ui/PressableScale';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import FadeInUp from '../../components/ui/FadeInUp';
import GrowAvatar from '../../components/ui/GrowAvatar';
import { SkeletonList } from '../../components/ui/SkeletonCard';
import BuddyCard from '../../components/buddies/BuddyCard';
import BuddyFriendPicker from '../../components/buddies/BuddyFriendPicker';
import { useBuddyStore, buddySlotsUsed } from '../../state/useBuddyStore';
import type { Buddy, BuddyInvite } from '../../services/api/buddies';
import { buddyName } from '../../components/buddies/buddyCopy';
import { ApiError } from '../../services/api/http';
import { useAuth } from '../../store/hooks';
import { useRefresh } from '../../hooks/useRefresh';
import { toast } from '../../state/useToastStore';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import { haptic } from '../../theme/haptics';
import type { FriendSummary } from '../../services/api/friends';

function errorText(e: unknown): string {
  return e instanceof ApiError && e.message ? e.message : 'Please try again in a moment.';
}

/** Path Buddies: shared streaks with up to 5 friends, invites, and a friend picker. */
export default function BuddiesScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const data = useBuddyStore((s) => s.data);
  const status = useBuddyStore((s) => s.status);
  const load = useBuddyStore((s) => s.load);
  const { invite, accept, decline, end } = useBuddyStore.getState();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busyInvite, setBusyInvite] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void load({ force: true });
    }, [load])
  );
  const refresh = useRefresh(() => load({ force: true }));

  const me = user ? { id: user.id, username: user.username, avatar: user.avatar ?? null } : null;
  const max = data?.max ?? 5;
  const canInvite = buddySlotsUsed(data) < max;

  const openProfile = (u: { id: string; username: string; avatar_url: string | null }) =>
    navigation.navigate('PublicProfile', { userId: u.id });

  const onPick = async (f: FriendSummary) => {
    try {
      await invite(f.id);
      haptic('success');
      setPickerOpen(false);
      toast.success(`Buddy invite sent to ${f.username}`);
    } catch (e) {
      void alertMessage('Couldn’t send that', errorText(e));
    }
  };

  const onAccept = async (i: BuddyInvite) => {
    setBusyInvite(i.id);
    try {
      await accept(i.id);
      haptic('success');
      toast.success(`You and ${buddyName(i.user)} are buddies now`);
    } catch (e) {
      void alertMessage('Couldn’t accept', errorText(e));
    } finally {
      setBusyInvite(null);
    }
  };

  const onDecline = async (i: BuddyInvite) => {
    setBusyInvite(i.id);
    try {
      await decline(i.id);
    } catch (e) {
      void alertMessage('Couldn’t update', errorText(e));
    } finally {
      setBusyInvite(null);
    }
  };

  const onCancel = async (i: BuddyInvite) => {
    setBusyInvite(i.id);
    try {
      await end(i.id);
    } catch (e) {
      void alertMessage('Couldn’t update', errorText(e));
    } finally {
      setBusyInvite(null);
    }
  };

  const onMore = async (b: Buddy) => {
    const name = buddyName(b.user);
    const ok = await confirmAsync(
      `End buddy with ${name}?`,
      'Your shared streak stops here. You can always start again later — no hard feelings.',
      { confirmLabel: 'End buddy', cancelLabel: 'Keep', destructive: true }
    );
    if (!ok) return;
    try {
      await end(b.id);
      toast.info(`You and ${name} are no longer buddies`);
    } catch (e) {
      void alertMessage('Couldn’t update', errorText(e));
    }
  };

  const header = <ScreenHeader title="Path buddies" onBack={() => navigation.goBack()} backIcon="arrow-back" />;

  if (status === 'unavailable') {
    return (
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
        {header}
        <EmptyState
          icon="people-outline"
          title="Buddies are almost here"
          description="Shared streaks with friends are coming in an update soon."
        />
      </SafeAreaView>
    );
  }

  const buddies = data?.buddies ?? [];
  const invitesIn = data?.invites_in ?? [];
  const invitesOut = data?.invites_out ?? [];
  const empty = !!data && !buddies.length && !invitesIn.length && !invitesOut.length;

  return (
    <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
      {header}
      {!data && (status === 'loading' || status === 'idle') ? (
        <View style={tw`px-gutter pt-3`}>
          <SkeletonList variant="inbox" count={3} />
        </View>
      ) : !data ? (
        <ErrorState
          compact
          icon="leaf-outline"
          title="Your buddies are still loading"
          message="We couldn’t reach them just now."
          onRetry={() => void load({ force: true })}
          style={tw`px-8 mt-16`}
        />
      ) : (
        <ScrollView
          contentContainerStyle={tw`px-gutter pt-3 pb-16`}
          refreshControl={<RefreshControl {...refresh} />}
        >
          {invitesIn.length ? (
            <View style={tw`mb-4`}>
              <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-2 px-1`}>
                Invites for you
              </Text>
              <View style={tw`gap-2`}>
                {invitesIn.map((i) => (
                  <FadeInUp key={i.id}>
                    <View style={tw`bg-card border border-emerald-100 rounded-card px-4 py-3`}>
                      <View style={tw`flex-row items-center`}>
                        <GrowAvatar userId={i.user.id} username={i.user.username} uri={i.user.avatar_url} size={36} />
                        <Text style={tw`flex-1 ml-3 text-body text-ink`} numberOfLines={2}>
                          <Text style={tw`font-semibold`}>{buddyName(i.user)}</Text> wants to grow alongside you
                        </Text>
                      </View>
                      <View style={tw`flex-row gap-2 mt-3`}>
                        <PressableScale
                          feedback="commit"
                          disabled={busyInvite === i.id}
                          onPress={() => void onAccept(i)}
                          accessibilityRole="button"
                          accessibilityLabel={`Accept buddy invite from ${buddyName(i.user)}`}
                          style={tw`flex-1 py-2.5 rounded-control bg-emerald-600 items-center ${
                            busyInvite === i.id ? 'opacity-60' : ''
                          }`}
                        >
                          <Text style={tw`text-white font-semibold text-footnote`}>Accept</Text>
                        </PressableScale>
                        <PressableScale
                          feedback={false}
                          disabled={busyInvite === i.id}
                          onPress={() => void onDecline(i)}
                          accessibilityRole="button"
                          accessibilityLabel={`Decline buddy invite from ${buddyName(i.user)}`}
                          style={tw`px-5 py-2.5 rounded-control bg-raised items-center`}
                        >
                          <Text style={tw`text-ink font-semibold text-footnote`}>Not now</Text>
                        </PressableScale>
                      </View>
                    </View>
                  </FadeInUp>
                ))}
              </View>
            </View>
          ) : null}

          {empty ? (
            <EmptyState
              icon="people-outline"
              title="Grow with a friend"
              description="Pick someone from your circle. Each day you both show up — even a rest day — your shared streak grows."
              actionLabel="Pick a buddy"
              onAction={() => setPickerOpen(true)}
            />
          ) : null}

          {buddies.length ? (
            <View style={tw`gap-2.5`}>
              {buddies.map((b, idx) => (
                <FadeInUp key={b.id} delay={Math.min(idx, 5) * 40}>
                  <BuddyCard buddy={b} me={me} onOpenProfile={() => openProfile(b.user)} onMore={() => void onMore(b)} />
                </FadeInUp>
              ))}
            </View>
          ) : null}

          {invitesOut.length ? (
            <View style={tw`mt-5`}>
              <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-2 px-1`}>
                Waiting for a yes
              </Text>
              <View style={tw`bg-card border border-line/80 rounded-card px-4`}>
                {invitesOut.map((i, idx) => (
                  <View
                    key={i.id}
                    style={tw`flex-row items-center py-3 ${idx > 0 ? 'border-t border-line/70' : ''}`}
                  >
                    <GrowAvatar userId={i.user.id} username={i.user.username} uri={i.user.avatar_url} size={30} />
                    <Text style={tw`flex-1 ml-3 text-footnote text-ink`} numberOfLines={1}>
                      {buddyName(i.user)}
                    </Text>
                    <PressableScale
                      feedback={false}
                      disabled={busyInvite === i.id}
                      onPress={() => void onCancel(i)}
                      accessibilityRole="button"
                      accessibilityLabel={`Cancel buddy invite to ${buddyName(i.user)}`}
                      style={tw`px-3 py-1.5 rounded-chip bg-raised`}
                    >
                      <Text style={tw`text-xs font-semibold text-ink-2`}>Cancel</Text>
                    </PressableScale>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {!empty ? (
            canInvite ? (
              <PressableScale
                onPress={() => setPickerOpen(true)}
                feedback={false}
                accessibilityRole="button"
                accessibilityLabel="Invite a buddy"
                style={tw`mt-5 flex-row items-center px-4 py-3.5 bg-emerald-50 border border-emerald-100 rounded-card`}
              >
                <View style={tw`w-9 h-9 rounded-full bg-emerald-600 items-center justify-center mr-3`}>
                  <Ionicons name="person-add-outline" size={17} color="#fff" />
                </View>
                <View style={tw`flex-1`}>
                  <Text style={tw`font-semibold text-ink`}>Invite a buddy</Text>
                  <Text style={tw`text-xs text-ink-3 mt-0.5`}>
                    {buddySlotsUsed(data)} of {max} · pick someone from your circle
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.iconMuted} />
              </PressableScale>
            ) : (
              <Text style={tw`mt-5 text-xs text-ink-3 text-center`}>
                You’re growing with {max} buddies — that’s the most at once.
              </Text>
            )
          ) : null}

          <Text style={tw`mt-6 text-xs text-ink-3 leading-5 px-1`}>
            A shared day counts when you both show up — a post, a journal page, a check-in. Rest days and life mode
            count too, so a pause never breaks it. Milestones: Sprout pair (3), Seedling pair (7), Sapling pair (14),
            Young tree pair (30), Grove pair (60), Old growth pair (100).
          </Text>
        </ScrollView>
      )}

      <BuddyFriendPicker visible={pickerOpen} onClose={() => setPickerOpen(false)} data={data} onPick={onPick} />
    </SafeAreaView>
  );
}
