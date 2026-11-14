/**
 * Challenge detail — progress, day grid, friends leaderboard, join/leave, share.
 * Contract: docs/GROWTH_SYSTEM.md § Challenges.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, View, Text, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import { iconSize } from '../../theme/icons';
import type { RootStackParamList } from '../../app/navigation/RootNavigator';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import {
  getChallenge,
  joinChallenge,
  leaveChallenge,
  type ChallengeDetail,
} from '../../services/api/growth';
import { localDayKey } from '../../services/api/http';
import { useAuth } from '../../store/hooks';
import { getCategoryLabel } from '../../utils/categoryLabels';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import { feedback } from '../../utils/interactionFeedback';
import { celebrateOnce } from '../../theme/haptics';
import { pop } from '../../theme/motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useRefresh } from '../../hooks/useRefresh';
import PrimaryButton from '../../components/ui/PrimaryButton';
import PressableScale from '../../components/ui/PressableScale';
import GrowAvatar from '../../components/ui/GrowAvatar';
import GrowLoader from '../../components/ui/GrowLoader';
import ErrorState from '../../components/ui/ErrorState';
import FadeInUp from '../../components/ui/FadeInUp';
import ShareCardSheet from '../../components/share/ShareCardSheet';
import ChallengeProgressBar from '../../components/challenges/ChallengeProgressBar';
import { challengeSharePayload } from '../../components/challenges/challengeSharePayload';
import { formatDaysLeft, markChallengesDirty } from '../../components/challenges/challengeUtils';

type Route = RouteProp<RootStackParamList, 'ChallengeDetail'>;

function errorText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

function DayGrid({ days, today }: { days: ChallengeDetail['days']; today: string }) {
  if (!days?.length) return null;
  return (
    <View style={tw`flex-row flex-wrap -m-1`}>
      {days.map((d, i) => {
        const isToday = d.day === today;
        const future = d.day > today;
        return (
          <View
            key={d.day}
            style={tw`m-1 w-8 h-8 rounded-control items-center justify-center ${
              d.done ? 'bg-emerald-600' : future ? 'bg-raised/50' : 'bg-raised'
            } ${isToday ? 'border-2 border-emerald-700' : ''}`}
            accessibilityLabel={`Day ${i + 1}${d.done ? ', done' : future ? ', upcoming' : ''}${
              isToday ? ', today' : ''
            }`}
          >
            {d.done ? (
              <Ionicons name="leaf" size={iconSize.xs} color="#FFFFFF" />
            ) : (
              <Text style={tw`text-caption font-semibold ${future ? 'text-ink-3/50' : 'text-ink-3'}`}>
                {i + 1}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

export default function ChallengeDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<Route>();
  const challengeId = route.params?.challengeId;
  const { user } = useAuth();

  const [detail, setDetail] = useState<ChallengeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const celebratedRef = useRef(false);
  const treeScale = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    if (!challengeId) {
      setError('This challenge link looks incomplete.');
      setLoading(false);
      return;
    }
    const seq = ++seqRef.current;
    try {
      setError(null);
      const d = await getChallenge(challengeId);
      if (seq !== seqRef.current) return;
      setDetail(d);
    } catch (e) {
      if (seq !== seqRef.current) return;
      setError(errorText(e, 'We couldn’t load this challenge.'));
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [challengeId]);

  useEffect(() => {
    void load();
  }, [load]);

  // One celebration ever per challenge (persisted): haptic + the tree pops in.
  useEffect(() => {
    if (!detail?.completed || !detail.id || celebratedRef.current) return;
    celebratedRef.current = true;
    let alive = true;
    celebrateOnce(`challenge:${detail.id}`)
      .then((fresh) => {
        if (!alive || !fresh) return;
        treeScale.setValue(reduced ? 1 : 0.6);
        pop(treeScale, 1.18, 'bouncy', reduced).start();
      })
      .catch(() => undefined); // celebration is a nicety; never surface a storage hiccup
    return () => {
      alive = false;
    };
  }, [detail?.completed, detail?.id, reduced, treeScale]);

  const refresh = useRefresh(load);

  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigateFromRoot(navigation, 'Individual');
  };

  const onJoin = async () => {
    if (!detail || busy) return;
    setBusy(true);
    // The Join button's 'commit' (light tap + tone) is the press feedback.
    try {
      const d = await joinChallenge(detail.id);
      setDetail(d);
      markChallengesDirty();
    } catch (e) {
      feedback.error();
      void alertMessage('Couldn’t join just now', errorText(e, 'Please try again in a moment.'));
    } finally {
      setBusy(false);
    }
  };

  const onLeave = async () => {
    if (!detail || busy) return;
    const ok = await confirmAsync(
      'Leave this challenge?',
      'Your progress here will be cleared. You can always join again and start fresh.',
      { confirmLabel: 'Leave', cancelLabel: 'Stay', destructive: true }
    );
    if (!ok) return;
    setBusy(true);
    try {
      await leaveChallenge(detail.id);
      markChallengesDirty();
      feedback.toggle();
      await load();
    } catch (e) {
      feedback.error();
      void alertMessage('Couldn’t leave just now', errorText(e, 'Please try again in a moment.'));
    } finally {
      setBusy(false);
    }
  };

  const today = localDayKey();
  const header = (
    <View style={tw`flex-row items-center justify-between px-gutter pt-2 pb-2`}>
      <PressableScale
        onPress={goBack}
        pressedScale={0.9}
        hitSlop={8}
        style={tw`w-9 h-9 rounded-full bg-raised border border-line/80 items-center justify-center`}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="arrow-back" size={iconSize.sm} color={theme.colors.ink} />
      </PressableScale>
      <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase`}>Challenge</Text>
      {detail?.joined ? (
        <PressableScale
          onPress={() => {
            feedback.open();
            setShareOpen(true);
          }}
          pressedScale={0.9}
          hitSlop={8}
          style={tw`w-9 h-9 rounded-full bg-raised border border-line/80 items-center justify-center`}
          accessibilityRole="button"
          accessibilityLabel="Share challenge"
        >
          <Ionicons name="share-outline" size={iconSize.sm} color={theme.colors.ink} />
        </PressableScale>
      ) : (
        <View style={tw`w-9`} />
      )}
    </View>
  );

  if (loading && !detail) {
    return (
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
        {header}
        <View style={tw`flex-1 items-center justify-center`}>
          <GrowLoader label="Loading challenge" />
        </View>
      </SafeAreaView>
    );
  }

  if (!detail) {
    return (
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
        {header}
        <View style={tw`flex-1 justify-center px-6`}>
          <ErrorState
            icon="leaf-outline"
            title="Challenge unavailable"
            message={error || 'We couldn’t load this challenge.'}
            onRetry={() => {
              setLoading(true);
              void load();
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const c = detail;
  const shown = Math.min(c.progress, c.target_days);
  const left = c.joined ? formatDaysLeft(c.ends_at, today) : null;
  const ended = left === 'Ended';
  const others = c.leaderboard ?? [];

  return (
    <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
      {header}
      <ScrollView
        contentContainerStyle={tw`px-gutter-wide pb-16`}
        refreshControl={<RefreshControl {...refresh} />}
      >
        {error ? (
          <PressableScale
            onPress={() => void refresh.onRefresh()}
            style={tw`mb-3 px-4 py-2.5 rounded-card bg-amber-50 border border-amber-200 flex-row items-center`}
          >
            <Ionicons name="cloud-offline-outline" size={16} color={tw.color("amber-700")} />
            <Text style={tw`ml-2 flex-1 text-xs text-amber-800`}>{error}</Text>
            <Text style={tw`text-xs font-bold text-amber-800`}>Retry</Text>
          </PressableScale>
        ) : null}

        <FadeInUp>
          <View style={tw`items-center pt-2`}>
            <View style={tw`w-20 h-20 rounded-sheet bg-emerald-50 border border-emerald-100 items-center justify-center`}>
              <Text style={tw`text-5xl`}>{c.emoji || '🌱'}</Text>
            </View>
            <Text style={tw`mt-4 text-2xl font-bold text-ink text-center`}>{c.title}</Text>
            <Text style={tw`mt-1 text-xs font-semibold text-emerald-700 uppercase tracking-widest`}>
              {getCategoryLabel(c.path)} · {c.target_days} of {c.duration_days} days
            </Text>
            {c.description ? (
              <Text style={tw`mt-3 text-base text-ink-2 text-center leading-6`}>{c.description}</Text>
            ) : null}
          </View>
        </FadeInUp>

        {c.completed ? (
          <View style={tw`mt-6 p-5 rounded-sheet bg-energy-50 border border-energy-600/30 items-center`}>
            <Animated.Text style={[tw`text-3xl`, { transform: [{ scale: treeScale }] }]}>🌳</Animated.Text>
            <Text style={tw`mt-2 text-lg font-bold text-ink text-center`}>
              You finished {c.title} 🌳
            </Text>
            <Text style={tw`mt-1 text-sm text-ink-2 text-center`}>
              {c.target_days} days of showing up. That’s real growth — be proud of it.
            </Text>
            <PrimaryButton
              label="Share your finish"
              variant="soft"
              style={tw`mt-4 self-stretch`}
              onPress={() => {
                feedback.open();
                setShareOpen(true);
              }}
            />
          </View>
        ) : null}

        {c.joined ? (
          <View style={tw`mt-6 p-5 rounded-sheet bg-card border border-line/80`}>
            <View style={tw`flex-row items-end justify-between`}>
              <View>
                <Text style={tw`text-4xl font-bold text-ink`}>
                  {shown}
                  <Text style={tw`text-lg font-semibold text-ink-3`}> / {c.target_days}</Text>
                </Text>
                <Text style={tw`text-xs text-ink-3 mt-0.5`}>days on this path</Text>
              </View>
              {left ? (
                <View style={tw`px-3 py-1 rounded-full ${ended ? 'bg-raised' : 'bg-emerald-50'}`}>
                  <Text style={tw`text-xs font-bold ${ended ? 'text-ink-3' : 'text-emerald-700'}`}>{left}</Text>
                </View>
              ) : null}
            </View>
            <ChallengeProgressBar
              progress={c.progress}
              target={c.target_days}
              completed={c.completed}
              height={10}
              style={tw`mt-4`}
            />
            {!c.completed ? (
              <Text style={tw`mt-3 text-xs text-ink-3`}>
                Post or check in on {getCategoryLabel(c.path)} to grow a day. Any day counts — no
                need to be perfect.
              </Text>
            ) : null}

            {c.days?.length ? (
              <View style={tw`mt-4`}>
                <DayGrid days={c.days} today={today} />
              </View>
            ) : null}
          </View>
        ) : (
          <View style={tw`mt-6 p-5 rounded-sheet bg-card border border-line/80`}>
            <Text style={tw`text-base font-bold text-ink`}>Ready when you are</Text>
            <Text style={tw`mt-1 text-sm text-ink-2`}>
              Grow on {getCategoryLabel(c.path)} on {c.target_days} days within {c.duration_days}.
              Rest days are fine — every day you show up counts.
            </Text>
            <PrimaryButton label="Join challenge" style={tw`mt-4`} onPress={() => void onJoin()} loading={busy} disabled={busy} />
          </View>
        )}

        {c.joined && others.length > 0 ? (
          <View style={tw`mt-6`}>
            <Text style={tw`text-xs font-semibold tracking-widest text-ink-3 uppercase mb-2`}>
              Friends on this challenge
            </Text>
            <View style={tw`rounded-sheet bg-card border border-line/80 px-4`}>
              {others.map((p, i) => (
                <PressableScale
                  key={p.user_id}
                  disabled={p.is_me}
                  onPress={() => navigateFromRoot(navigation, 'PublicProfile', { userId: p.user_id, preview: { username: p.username, avatarUrl: p.avatar } })}
                  style={tw`flex-row items-center py-3 ${i < others.length - 1 ? 'border-b border-line/70' : ''}`}
                  accessibilityLabel={`${p.is_me ? 'You' : p.username}, ${p.progress} of ${c.target_days} days`}
                >
                  <Text style={tw`w-6 text-xs font-bold text-ink-3`}>{i + 1}</Text>
                  <GrowAvatar userId={p.user_id} username={p.username} uri={p.avatar} size={36} />
                  <View style={tw`flex-1 ml-3`}>
                    <Text
                      style={tw`text-sm font-semibold ${p.is_me ? 'text-emerald-700' : 'text-ink'}`}
                      numberOfLines={1}
                    >
                      {p.is_me ? 'You' : p.username}
                    </Text>
                    <ChallengeProgressBar
                      progress={p.progress}
                      target={c.target_days}
                      completed={p.progress >= c.target_days}
                      height={5}
                      style={tw`mt-1.5`}
                    />
                  </View>
                  <Text style={tw`ml-3 text-xs font-bold ${p.is_me ? 'text-emerald-700' : 'text-ink-2'}`}>
                    {Math.min(p.progress, c.target_days)}/{c.target_days}
                  </Text>
                </PressableScale>
              ))}
            </View>
            {others.length === 1 ? (
              <Text style={tw`mt-2 text-xs text-ink-3`}>
                Invite a friend to grow alongside you.
              </Text>
            ) : null}
          </View>
        ) : null}

        {c.joined ? (
          <View style={tw`mt-8 items-center`}>
            {!c.completed ? (
              <PrimaryButton
                label="Share my progress"
                variant="soft"
                style={tw`self-stretch`}
                onPress={() => {
                  feedback.open();
                  setShareOpen(true);
                }}
              />
            ) : null}
            <PressableScale
              onPress={() => void onLeave()}
              disabled={busy}
              style={tw`mt-4 py-2 px-4`}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator color={theme.colors.ink3} />
              ) : (
                <Text style={tw`text-sm font-semibold text-ink-3`}>Leave challenge</Text>
              )}
            </PressableScale>
          </View>
        ) : null}
      </ScrollView>

      <ShareCardSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        payload={shareOpen ? challengeSharePayload(c, user) : null}
      />
    </SafeAreaView>
  );
}
