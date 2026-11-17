import React, { useCallback, useRef, useState } from 'react';
import { View, Text, FlatList, RefreshControl, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import GrowChromeHeader from '../../components/ui/GrowChromeHeader';
import PressableScale from '../../components/ui/PressableScale';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import QueueClientCard from '../../components/coachq/QueueClientCard';
import ReplyTemplatesSheet from '../../components/coachq/ReplyTemplatesSheet';
import OverrideSheet from '../../components/coachq/OverrideSheet';
import ReviewSwiper from '../../components/coachq/ReviewSwiper';
import {
  SEGMENTS,
  EMPTY_COPY,
  clientsFor,
  defaultSegment,
  displayName,
  formatMinutes,
} from '../../components/coachq/queueFormat';
import {
  getCoachQueue,
  getCoachSettings,
  getReplyTemplates,
  getReviewItems,
  markQueueHandled,
  sendQuickDm,
  setCoachEmailDigest,
  setQueueOverride,
  type CoachQueue,
  type QueueClient,
  type QueueSegment,
  type QueueStatus,
} from '../../services/api/coachq';
import { createConversation } from '../../services/api/messages';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import { TAB_SCREEN_BOTTOM_PADDING } from '../../constants/scroll';
import { feedback } from '../../utils/interactionFeedback';
import { alertMessage } from '../../utils/confirmDialog';
import { toast } from '../../state/useToastStore';

const SEG_ON: Record<QueueSegment, string> = {
  red: 'bg-rose-600 border-rose-600',
  amber: 'bg-amber-500 border-amber-500',
  green: 'bg-emerald-600 border-emerald-600',
  wins: 'bg-violet-600 border-violet-600',
};

/**
 * Coach "Today": who needs you first (red → amber → green, plus wins), with one-tap
 * replies, "Handled" (7-day snooze), status overrides and batch review.
 */
export default function CoachTodayScreen() {
  const navigation = useNavigation();
  const [queue, setQueue] = useState<CoachQueue | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [segment, setSegment] = useState<QueueSegment>('red');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<string[]>([]);
  const [replyFor, setReplyFor] = useState<QueueClient | null>(null);
  const [overrideFor, setOverrideFor] = useState<QueueClient | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewCount, setReviewCount] = useState<number | null>(null);
  const [emailDigest, setEmailDigest] = useState<boolean | null>(null);
  const pickedSegment = useRef(false);

  const load = useCallback(async () => {
    try {
      const [q, review] = await Promise.all([getCoachQueue(), getReviewItems().catch(() => null)]);
      if (!q) {
        setMissing(true);
        return;
      }
      setQueue(q);
      setReviewCount(review ? review.total : null);
      if (!pickedSegment.current) setSegment(defaultSegment(q));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your queue');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      getReplyTemplates().then(setTemplates).catch(() => undefined);
      getCoachSettings()
        .then((s) => setEmailDigest(s ? s.email_digest : null))
        .catch(() => undefined);
    }, [load])
  );

  const onMessage = async (item: QueueClient) => {
    if (busyId) return;
    setBusyId(item.contract_id);
    try {
      const res = await createConversation(item.client.id);
      navigateFromRoot(navigation, 'Messages', {
        conversationId: res.data.conversation.id,
        targetUserId: item.client.id,
      });
    } catch (e) {
      void alertMessage('Could not open chat', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusyId(null);
    }
  };

  const onHandled = async (item: QueueClient) => {
    if (busyId) return;
    setBusyId(item.contract_id);
    try {
      await markQueueHandled(item.contract_id, 7);
      feedback.success();
      toast.show({
        message: item.status === 'green' ? `Seen — ${displayName(item.client)}` : 'Handled for 7 days',
        tone: 'success',
        action: {
          label: 'Undo',
          onPress: () => {
            void markQueueHandled(item.contract_id, 0).then(load);
          },
        },
      });
      await load();
    } catch (e) {
      void alertMessage('Queue', e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusyId(null);
    }
  };

  const onReply = async (text: string) => {
    if (!replyFor) return;
    try {
      await sendQuickDm(replyFor.client.id, text);
      feedback.send();
      toast.success(`Sent to ${displayName(replyFor.client)}`);
      setReplyFor(null);
      void load();
    } catch (e) {
      void alertMessage('Could not send', e instanceof Error ? e.message : 'Try again');
    }
  };

  const onOverride = async (status: QueueStatus | null, reason: string) => {
    if (!overrideFor) return;
    try {
      await setQueueOverride(overrideFor.contract_id, status, reason);
      feedback.success();
      setOverrideFor(null);
      await load();
    } catch (e) {
      void alertMessage('Status', e instanceof Error ? e.message : 'Could not save');
    }
  };

  const toggleDigest = async (on: boolean) => {
    const prev = emailDigest;
    setEmailDigest(on);
    feedback.switch(on);
    try {
      setEmailDigest(await setCoachEmailDigest(on));
    } catch {
      setEmailDigest(prev);
      toast.info('Could not change the email setting');
    }
  };

  const list = clientsFor(queue, segment);
  const counts = queue?.counts;
  const countFor = (s: QueueSegment) => (counts ? counts[s] : 0);

  const header = (
    <View>
      <View style={tw`px-gutter-wide pt-3`}>
        <Text style={tw`text-lg font-bold text-ink`}>Today</Text>
        <Text style={tw`text-sm text-ink-3 mt-0.5 leading-5`}>
          {queue
            ? `Clients: ${queue.active_clients ?? queue.clients.length} active · ${formatMinutes(
                queue.est_weekly_minutes
              )} a week to review`
            : 'Who needs you first.'}
        </Text>
      </View>

      {reviewCount ? (
        <PressableScale
          onPress={() => setReviewOpen(true)}
          feedback="open"
          accessibilityRole="button"
          accessibilityLabel={`Review ${reviewCount} items`}
          style={tw`mx-gutter-wide mt-3 px-4 py-3 rounded-card bg-emerald-600 flex-row items-center`}
        >
          <Ionicons name="albums-outline" size={18} color="#fff" />
          <View style={tw`flex-1 ml-3`}>
            <Text style={tw`text-callout font-bold text-white`}>Review {reviewCount}</Text>
            <Text style={tw`text-footnote text-white/80`}>Finished homework and shared proofs</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#fff" />
        </PressableScale>
      ) : null}

      <View style={tw`flex-row px-gutter-wide mt-3 mb-2`} accessibilityRole="tablist">
        {SEGMENTS.map((s) => {
          const on = segment === s.key;
          return (
            <PressableScale
              key={s.key}
              onPress={() => {
                pickedSegment.current = true;
                setSegment(s.key);
              }}
              feedback={on ? 'selection' : 'chip'}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${s.label}, ${countFor(s.key)}`}
              style={tw`mr-1.5 px-3 py-1.5 rounded-chip border ${on ? SEG_ON[s.key] : 'bg-raised border-line'}`}
            >
              <Text style={tw`text-footnote font-semibold ${on ? 'text-white' : 'text-ink-2'}`}>
                {s.key === 'wins' ? '★ ' : ''}
                {s.label} {countFor(s.key)}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );

  const footer =
    emailDigest === null ? null : (
      <View style={tw`mx-gutter-wide mt-4 px-4 py-3 rounded-card bg-card border border-line/80 flex-row items-center`}>
        <View style={tw`flex-1 pr-3`}>
          <Text style={tw`text-body font-semibold text-ink`}>Monday email</Text>
          <Text style={tw`text-footnote text-ink-3 leading-4 mt-0.5`}>
            Your week summary by email too. It always shows here in the app.
          </Text>
        </View>
        <Switch
          value={emailDigest}
          onValueChange={(v) => void toggleDigest(v)}
          accessibilityLabel="Monday summary email"
          trackColor={{ true: theme.colors.brand, false: theme.colors.line }}
        />
      </View>
    );

  return (
    <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
      <GrowChromeHeader
        leftAccessory={
          <PressableScale
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            style={tw`w-9 h-9 rounded-full bg-raised border border-line/80 items-center justify-center`}
          >
            <Ionicons name="arrow-back" size={18} color={theme.colors.ink} />
          </PressableScale>
        }
      />

      {missing ? (
        <View style={tw`flex-1 justify-center`}>
          <EmptyState
            icon="today-outline"
            title="Today is coming soon"
            description="Update the app to see who needs you first."
          />
        </View>
      ) : loading && !queue ? (
        <View style={tw`px-gutter-wide pt-4`}>
          <Skeleton style={tw`h-6 w-24 rounded-control mb-2`} />
          <Skeleton style={tw`h-4 w-56 rounded-control mb-5`} />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} style={tw`h-36 w-full rounded-card mb-3`} />
          ))}
        </View>
      ) : error && !queue ? (
        <View style={tw`flex-1 items-center justify-center px-8`}>
          <ErrorState
            title="Couldn’t load your queue"
            message={error}
            onRetry={() => {
              setLoading(true);
              void load();
            }}
          />
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(c) => c.contract_id}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          contentContainerStyle={{ paddingBottom: TAB_SCREEN_BOTTOM_PADDING }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor={theme.colors.brand}
            />
          }
          ListEmptyComponent={
            queue && (queue.active_clients ?? queue.clients.length) === 0 ? (
              <EmptyState
                icon="people-outline"
                title="No active clients yet"
                description="When a client accepts your plan, they show up here."
              />
            ) : (
              <EmptyState icon="sunny-outline" title={EMPTY_COPY[segment].title} description={EMPTY_COPY[segment].description} />
            )
          }
          renderItem={({ item }) => (
            <View style={tw`px-gutter-wide`}>
              <QueueClientCard
                item={item}
                busy={busyId === item.contract_id}
                onOpen={(c) => navigateFromRoot(navigation, 'CoachingContract', { contractId: c.contract_id })}
                onMessage={(c) => void onMessage(c)}
                onTemplate={setReplyFor}
                onHandled={(c) => void onHandled(c)}
                onOverride={setOverrideFor}
              />
            </View>
          )}
        />
      )}

      <ReplyTemplatesSheet
        visible={!!replyFor}
        recipient={replyFor ? displayName(replyFor.client) : null}
        initial={templates.length ? templates : null}
        onTemplatesChange={setTemplates}
        onClose={() => setReplyFor(null)}
        onPick={onReply}
      />
      <OverrideSheet item={overrideFor} onClose={() => setOverrideFor(null)} onSave={onOverride} />
      <ReviewSwiper
        visible={reviewOpen}
        templates={templates}
        onTemplatesChange={setTemplates}
        onClose={() => {
          setReviewOpen(false);
          void load();
        }}
      />
    </SafeAreaView>
  );
}
