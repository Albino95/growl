import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useAuth } from '../../store/hooks';
import GrowAvatar from '../../components/ui/GrowAvatar';
import {
  getConversations,
  getMessages,
  sendMessage,
  createConversation,
  reactToMessage,
  MESSAGE_MAX_LENGTH,
  type ConversationSummary,
  type ChatMessage,
  type MessageReactionEmoji,
  type MessagesPageCursor,
} from '../../services/api/messages';
import { confirmSentMessage, mergeMessages } from '../../components/messages/mergeMessages';
import HeartBurst from '../../components/feed/HeartBurst';
import {
  ReactionPicker,
  ReactionChips,
  applyReactionLocal,
} from '../../components/messages/MessageReactions';
import {
  acceptCoachingProposal,
  declineCoachingProposal,
  getCoachingThread,
  sendCoachingProposal,
  type CoachingThread,
} from '../../services/api/instructor';
import ProposalComposeSheet from '../../components/instructor/ProposalComposeSheet';
import { COACHING_ACTIVE_STATUS, COACHING_BILLING_NOTE } from '../../constants/coaching';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import tw from '../../lib/tw';
import EmptyState from '../../components/ui/EmptyState';
import GrowChromeHeader from '../../components/ui/GrowChromeHeader';
import PressableScale from '../../components/ui/PressableScale';
import SearchField from '../../components/ui/SearchField';
import SkeletonCard, { SkeletonList } from '../../components/ui/SkeletonCard';
import { feedback } from '../../utils/interactionFeedback';
import { useRefresh } from '../../hooks/useRefresh';
import { isAppActive } from '../../utils/appActive';
import { alertMessage } from '../../utils/confirmDialog';
import {
  KeyboardDoneAccessory,
  formInputAccessoryProps,
} from '../../components/ui/KeyboardDoneAccessory';
import { TAB_SCREEN_BOTTOM_PADDING, verticalScrollProps } from '../../constants/scroll';
import ChatWallpaperSheet from '../../components/messages/ChatWallpaperSheet';
import {
  useChatWallpaperStore,
  wallTheme,
} from '../../state/useChatWallpaperStore';

type InboxTab = 'friends' | 'shop' | 'coaches';

function conversationLane(c: ConversationSummary): InboxTab {
  if (c.coaching) return 'coaches';
  if (c.peer.is_business) return 'shop';
  if (c.peer.is_instructor) return 'coaches';
  return 'friends';
}

type ActiveConversation = ConversationSummary & {
  messages: ChatMessage[];
  peer_last_read_at?: string | null;
  /** Server has messages older than the oldest one loaded. */
  has_older?: boolean;
  older_cursor?: MessagesPageCursor | null;
};

function sameMessageSnapshot(a: ChatMessage[], b: ChatMessage[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    if (left.id !== right.id || left.body !== right.body) return false;
    if ((left.reactions?.mine ?? null) !== (right.reactions?.mine ?? null)) return false;
    const lc = left.reactions?.counts || {};
    const rc = right.reactions?.counts || {};
    const keys = new Set([...Object.keys(lc), ...Object.keys(rc)]);
    for (const key of keys) {
      if ((lc as Record<string, number>)[key] !== (rc as Record<string, number>)[key]) return false;
    }
  }
  return true;
}

function parseMsgTime(iso?: string | null): number {
  if (!iso) return 0;
  const raw = String(iso).trim();
  const normalized = /T/.test(raw)
    ? raw
    : raw.replace(' ', 'T') + (raw.endsWith('Z') ? '' : 'Z');
  const t = new Date(normalized).getTime();
  return Number.isFinite(t) ? t : 0;
}

function messageReceipt(
  msg: ChatMessage,
  peerLastReadAt?: string | null
): 'sending' | 'sent' | 'seen' {
  if (msg.id.startsWith('temp-')) return 'sending';
  const peerRead = parseMsgTime(peerLastReadAt);
  const created = parseMsgTime(msg.created_at);
  if (peerRead > 0 && created > 0 && peerRead >= created) {
    return 'seen';
  }
  return 'sent';
}

function ReceiptTicks({ status }: { status: 'sending' | 'sent' | 'seen' }) {
  if (status === 'sending') {
    return <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.85)" />;
  }
  if (status === 'seen') {
    return <Ionicons name="checkmark-done" size={16} color="#ECFDF5" />;
  }
  return <Ionicons name="checkmark" size={16} color="rgba(255,255,255,0.9)" />;
}

type MessagesRouteParams = {
  Messages: {
    conversationId?: string;
    targetUserId?: string;
    draftText?: string;
  };
};

function formatRelativeTime(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString();
}

function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return 'Today';
  if (dayKey(iso) === dayKey(yest.toISOString())) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function MessagesScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<MessagesRouteParams, 'Messages'>>();
  const { user } = useAuth();

  const [inboxTab, setInboxTab] = useState<InboxTab>('friends');
  const [selectedConversation, setSelectedConversation] = useState<ActiveConversation | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [listError, setListError] = useState<string | null>(null);
  const [thread, setThread] = useState<CoachingThread | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [inboxQuery, setInboxQuery] = useState('');
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [wallOpen, setWallOpen] = useState(false);
  const [pickerId, setPickerId] = useState<string | null>(null);
  const [burstKey, setBurstKey] = useState(0);
  const [burstMsgId, setBurstMsgId] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const lastTapRef = useRef<{ id: string; at: number } | null>(null);
  const hydrateWalls = useChatWallpaperStore((s) => s.hydrate);
  const setWall = useChatWallpaperStore((s) => s.setWall);
  const wallById = useChatWallpaperStore((s) => s.byId);
  const messageInputRef = useRef<TextInput>(null);
  const threadListRef = useRef<FlatList<ChatMessage>>(null);
  /** Set on first drag in the open thread; gates onStartReached auto-loading. */
  const threadUserScrolledRef = useRef(false);
  useEffect(() => {
    threadUserScrolledRef.current = false;
  }, [selectedConversation?.id]);
  const lastRouteBootKey = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  selectedIdRef.current = selectedConversation?.id ?? null;

  const filteredConversations = useMemo(() => {
    const q = inboxQuery.trim().toLowerCase();
    return conversations.filter((c) => {
      if (conversationLane(c) !== inboxTab) return false;
      if (!q) return true;
      const name = (c.peer.username || '').toLowerCase();
      const last = (c.last_message || '').toLowerCase();
      return name.includes(q) || last.includes(q);
    });
  }, [conversations, inboxTab, inboxQuery]);

  const laneCounts = useMemo(() => {
    const counts = { friends: 0, shop: 0, coaches: 0 };
    const unread = { friends: 0, shop: 0, coaches: 0 };
    for (const c of conversations) {
      const lane = conversationLane(c);
      counts[lane] += 1;
      if (c.unread) unread[lane] += 1;
    }
    return { counts, unread };
  }, [conversations]);

  const loadConversations = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoadingConversations(true);
    try {
      const res = await getConversations();
      setConversations(res.data?.conversations ?? []);
      setListError(null);
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Could not load conversations');
      if (!opts?.silent) setConversations([]);
    } finally {
      setLoadingConversations(false);
    }
  }, []);
  const refresh = useRefresh(() => loadConversations());

  const openConversation = useCallback(async (conversation: ConversationSummary) => {
    feedback.open();
    setLoadingMessages(true);
    setThread(null);
    setSelectedConversation({ ...conversation, messages: [], unread: false });
    try {
      const [res, coaching] = await Promise.all([
        getMessages(conversation.id),
        getCoachingThread(conversation.peer.id).catch(() => null),
      ]);
      setThread(coaching);
      setSelectedConversation({
        ...conversation,
        unread: false,
        coaching: conversation.coaching || !!coaching?.inquiry,
        messages: res.data?.messages ?? [],
        peer_last_read_at: res.data?.peer_last_read_at ?? null,
        has_older: !!res.data?.has_more,
        older_cursor: res.data?.next_before ?? null,
      });
      setConversations((prev) =>
        prev.map((c) => (c.id === conversation.id ? { ...c, unread: false } : c))
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not load messages';
      void alertMessage('Inbox', msg);
      setSelectedConversation({ ...conversation, messages: [] });
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
    void hydrateWalls();
  }, [loadConversations, hydrateWalls]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!isAppActive()) return;
      if (selectedIdRef.current) {
        void getMessages(selectedIdRef.current)
          .then((res) => {
            const serverPage = res.data?.messages ?? [];
            setSelectedConversation((prev) => {
              if (!prev || prev.id !== selectedIdRef.current) return prev;
              // Merge (never replace): keeps older pages plus temp-/failed sends on screen.
              const msgs = mergeMessages(prev.messages, serverPage);
              if (sameMessageSnapshot(prev.messages, msgs) && prev.peer_last_read_at === (res.data?.peer_last_read_at ?? prev.peer_last_read_at)) {
                return prev;
              }
              return {
                ...prev,
                messages: msgs,
                unread: false,
                peer_last_read_at: res.data?.peer_last_read_at ?? prev.peer_last_read_at,
              };
            });
          })
          .catch(() => undefined);
      } else {
        void loadConversations({ silent: true });
      }
    }, 8000);
    return () => clearInterval(id);
  }, [loadConversations]);

  // Deep-link / draft from profile / journal
  useEffect(() => {
    const { conversationId, targetUserId, draftText } = route.params || {};
    const bootKey = `${conversationId || ''}|${targetUserId || ''}|${draftText || ''}`;
    if (!conversationId && !targetUserId) return;
    if (lastRouteBootKey.current === bootKey) return;
    lastRouteBootKey.current = bootKey;

    if (typeof draftText === 'string' && draftText.trim()) {
      setMessageText(draftText);
    }

    void (async () => {
      try {
        if (conversationId) {
          const found = conversations.find((c) => c.id === conversationId);
          if (found) {
            await openConversation(found);
            return;
          }
        }
        if (targetUserId) {
          const existing = conversations.find((c) => c.peer.id === targetUserId);
          if (existing) {
            await openConversation(existing);
            return;
          }
          const created = await createConversation(targetUserId);
          const summary = created.data?.conversation;
          if (summary) {
            setConversations((prev) => {
              if (prev.some((c) => c.id === summary.id)) return prev;
              return [summary, ...prev];
            });
            await openConversation(summary);
          }
        }
      } catch (e) {
        void alertMessage(
          'Inbox',
          e instanceof Error ? e.message : 'Could not open conversation'
        );
      }
    })();
  }, [route.params, conversations, openConversation]);

  const handleSendMessage = async (preset?: string) => {
    const body = (preset ?? messageText).trim();
    if (!body || !selectedConversation || sending) return;
    if (/^(grow!?|🌱|still growing\.?)$/i.test(body)) {
      feedback.celebrate();
    } else {
      feedback.send();
    }
    setSending(true);
    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      conversation_id: selectedConversation.id,
      sender_id: user?.id || '',
      body,
      created_at: new Date().toISOString(),
      is_own: true,
      reactions: { counts: {}, mine: null },
    };
    setSelectedConversation((prev) =>
      prev ? { ...prev, messages: [...prev.messages, optimistic] } : prev
    );
    if (!preset) setMessageText('');
    setFailedIds((prev) => {
      const next = new Set(prev);
      next.delete(tempId);
      return next;
    });
    try {
      const res = await sendMessage(selectedConversation.id, body);
      const saved = res.data;
      setSelectedConversation((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: saved ? confirmSentMessage(prev.messages, tempId, saved) : prev.messages,
          last_message: saved?.body ?? body,
          last_message_at: saved?.created_at ?? optimistic.created_at,
        };
      });
      setConversations((prev) => {
        const next = prev.map((c) =>
          c.id === selectedConversation.id
            ? {
                ...c,
                last_message: saved?.body ?? body,
                last_message_at: saved?.created_at ?? optimistic.created_at,
              }
            : c
        );
        return next.sort(
          (a, b) => parseMsgTime(b.last_message_at) - parseMsgTime(a.last_message_at)
        );
      });
    } catch (e) {
      setFailedIds((prev) => new Set([...prev, tempId]));
      void alertMessage('Send failed', e instanceof Error ? e.message : 'Tap the message to try again.');
    } finally {
      setSending(false);
    }
  };

  const retryFailed = (tempId: string) => {
    const msg = selectedConversation?.messages.find((m) => m.id === tempId);
    if (!msg || sending) return;
    setSelectedConversation((prev) =>
      prev ? { ...prev, messages: prev.messages.filter((m) => m.id !== tempId) } : prev
    );
    setFailedIds((prev) => {
      const next = new Set(prev);
      next.delete(tempId);
      return next;
    });
    void handleSendMessage(msg.body);
  };

  const toggleReact = useCallback(async (messageId: string, emoji: MessageReactionEmoji) => {
    const convId = selectedIdRef.current;
    if (!convId || messageId.startsWith('temp-')) return;
    setSelectedConversation((prev) => {
      if (!prev || prev.id !== convId) return prev;
      return {
        ...prev,
        messages: prev.messages.map((m) =>
          m.id === messageId
            ? { ...m, reactions: applyReactionLocal(m.reactions, emoji) }
            : m
        ),
      };
    });
    const current = selectedConversation?.messages.find((m) => m.id === messageId);
    const adding = current?.reactions?.mine !== emoji;
    if (emoji === 'love' && adding) {
      setBurstMsgId(messageId);
      setBurstKey((k) => k + 1);
    }
    if (emoji === 'seed' && adding) feedback.egg();
    else feedback.like(adding);
    try {
      const next = await reactToMessage(convId, messageId, emoji);
      setSelectedConversation((prev) => {
        if (!prev || prev.id !== convId) return prev;
        return {
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === messageId ? { ...m, reactions: next } : m
          ),
        };
      });
    } catch {
      try {
        const res = await getMessages(convId);
        setSelectedConversation((prev) =>
          prev && prev.id === convId
            ? { ...prev, messages: mergeMessages(prev.messages, res.data?.messages ?? []) }
            : prev
        );
      } catch {
        /* keep optimistic */
      }
    }
  }, [selectedConversation?.messages]);

  // Follow the newest message only; prepending older history must not jump to the bottom.
  const lastMessageId =
    selectedConversation?.messages[selectedConversation.messages.length - 1]?.id ?? null;
  useEffect(() => {
    if (!lastMessageId) return;
    const t = setTimeout(() => {
      threadListRef.current?.scrollToEnd({ animated: true });
    }, 60);
    return () => clearTimeout(t);
  }, [selectedConversation?.id, lastMessageId]);

  const loadOlderMessages = useCallback(async () => {
    const conv = selectedConversation;
    if (!conv || loadingOlder || !conv.has_older || !conv.older_cursor) return;
    const convId = conv.id;
    setLoadingOlder(true);
    try {
      const res = await getMessages(convId, { cursor: conv.older_cursor });
      setSelectedConversation((prev) => {
        if (!prev || prev.id !== convId) return prev;
        return {
          ...prev,
          messages: mergeMessages(prev.messages, res.data?.messages ?? []),
          has_older: !!res.data?.has_more,
          older_cursor: res.data?.next_before ?? null,
        };
      });
    } catch (e) {
      void alertMessage('Inbox', e instanceof Error ? e.message : 'Could not load earlier messages');
    } finally {
      setLoadingOlder(false);
    }
  }, [selectedConversation, loadingOlder]);

  const reloadThread = async (peerId: string) => {
    try {
      setThread(await getCoachingThread(peerId));
    } catch {
      /* keep current */
    }
  };

  const handleAcceptProposal = async () => {
    if (!thread?.proposal || proposalBusy) return;
    setProposalBusy(true);
    try {
      await acceptCoachingProposal(thread.proposal.id);
      feedback.open();
      if (selectedConversation) {
        await openConversation(selectedConversation);
        await reloadThread(selectedConversation.peer.id);
      }
    } catch (e) {
      void alertMessage('Proposal', e instanceof Error ? e.message : 'Could not accept');
    } finally {
      setProposalBusy(false);
    }
  };

  const handleDeclineProposal = async () => {
    if (!thread?.proposal || proposalBusy) return;
    setProposalBusy(true);
    try {
      await declineCoachingProposal(thread.proposal.id);
      if (selectedConversation) await reloadThread(selectedConversation.peer.id);
    } catch (e) {
      void alertMessage('Proposal', e instanceof Error ? e.message : 'Could not decline');
    } finally {
      setProposalBusy(false);
    }
  };

  const handleSendProposal = async (input: {
    weeks: number;
    sessions_per_week: number;
    weekly_fee_eur: number;
    note?: string;
  }) => {
    if (!selectedConversation || proposalBusy) return;
    setProposalBusy(true);
    try {
      await sendCoachingProposal({
        client_id: selectedConversation.peer.id,
        ...input,
      });
      setComposeOpen(false);
      feedback.send();
      await openConversation(selectedConversation);
    } catch (e) {
      void alertMessage('Proposal', e instanceof Error ? e.message : 'Could not send');
    } finally {
      setProposalBusy(false);
    }
  };

  const goBackRoot = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    const parent = navigation.getParent();
    if (parent?.canGoBack()) {
      parent.goBack();
      return;
    }
    try {
      parent?.navigate('Individual' as never);
    } catch {
      /* ignore */
    }
  };

  if (selectedConversation) {
    const canSend = !!messageText.trim() && !sending;
    const wall = wallTheme(wallById[selectedConversation.id]);
    const darkWall = wall.id === 'dusk' || wall.id === 'ink';
    const chrome = darkWall ? '#FFFcf7' : '#1C1917';
    const chromeMuted = darkWall ? '#A8A29E' : '#6B645E';
    return (
      <SafeAreaView style={[tw`flex-1`, { backgroundColor: wall.page }]} edges={['top']}>
        <KeyboardAvoidingView
          style={tw`flex-1`}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <View
            style={[
              tw`px-4 py-2.5 flex-row items-center`,
              { backgroundColor: wall.header, borderBottomColor: darkWall ? 'rgba(255,255,255,0.06)' : 'rgba(28,25,23,0.06)', borderBottomWidth: 1 },
            ]}
          >
            <PressableScale
              onPress={() => setSelectedConversation(null)}
              style={[
                tw`mr-3 w-10 h-10 rounded-full items-center justify-center`,
                { backgroundColor: darkWall ? 'rgba(255,255,255,0.08)' : '#EAE4D6' },
              ]}
            >
              <Ionicons name="arrow-back" size={20} color={chrome} />
            </PressableScale>
            <Pressable
              onPress={() => {
                const root = navigation.getParent() || navigation;
                (root as { navigate: (a: string, b: object) => void }).navigate('PublicProfile', {
                  userId: selectedConversation.peer.id,
                });
              }}
              style={tw`flex-row items-center flex-1`}
            >
              <View style={tw`w-10 h-10 rounded-full overflow-hidden mr-3`}>
                <GrowAvatar
                  userId={selectedConversation.peer.id}
                  username={selectedConversation.peer.username}
                  uri={selectedConversation.peer.avatar}
                  size={40}
                />
              </View>
              <View style={tw`flex-1`}>
                <Text style={{ fontWeight: '700', color: chrome, fontSize: 16 }} numberOfLines={1}>
                  {selectedConversation.peer.username}
                </Text>
                <Text style={{ fontSize: 12, color: chromeMuted, marginTop: 2 }}>
                  {thread?.inquiry
                    ? 'Coaching · tap for profile'
                    : selectedConversation.coaching
                      ? 'Coaching · tap for profile'
                      : 'Friend · tap for profile'}
                </Text>
              </View>
            </Pressable>
            <PressableScale
              onPress={() => {
                feedback.open();
                setWallOpen(true);
              }}
              style={[
                tw`w-10 h-10 rounded-full items-center justify-center`,
                { backgroundColor: darkWall ? 'rgba(255,255,255,0.08)' : '#EAE4D6' },
              ]}
              accessibilityLabel="Change chat background"
            >
              <Ionicons name="color-palette-outline" size={18} color={chrome} />
            </PressableScale>
          </View>

          {thread?.inquiry ? (
            <View style={tw`mx-4 mt-3 px-3.5 py-3 rounded-2xl bg-emerald-50 border border-emerald-100`}>
              {thread.contract?.status === 'active' ? (
                <>
                  <Text style={tw`text-sm font-bold text-stone-900`}>{COACHING_ACTIVE_STATUS}</Text>
                  <Text style={tw`text-xs text-stone-600 mt-0.5`}>{COACHING_BILLING_NOTE}</Text>
                  <Text style={tw`text-xs text-stone-600 mt-0.5`}>
                    {thread.contract.weeks} wk · {thread.contract.sessions_per_week}× · €
                    {thread.contract.weekly_fee_eur}/week
                  </Text>
                  <PressableScale
                    onPress={() =>
                      navigateFromRoot(navigation, 'CoachingContract', {
                        contractId: thread.contract!.id,
                      })
                    }
                    style={tw`mt-2 py-2 rounded-xl bg-emerald-600 items-center`}
                  >
                    <Text style={tw`text-white font-bold text-sm`}>Open plan</Text>
                  </PressableScale>
                </>
              ) : thread.proposal?.status === 'sent' && thread.role === 'client' ? (
                <>
                  <Text style={tw`text-sm font-bold text-stone-900`}>Proposal waiting</Text>
                  <Text style={tw`text-xs text-stone-600 mt-0.5`}>
                    {thread.proposal.weeks} wk · {thread.proposal.sessions_per_week}× · €
                    {thread.proposal.weekly_fee_eur}/week · €{thread.proposal.total_eur} total
                    {thread.proposal.trial_days ? ` · ${thread.proposal.trial_days}-day trial` : ''}
                  </Text>
                  <View style={tw`flex-row gap-2 mt-2`}>
                    <PressableScale
                      onPress={() => void handleAcceptProposal()}
                      disabled={proposalBusy}
                      style={tw`flex-1 py-2 rounded-xl bg-emerald-600 items-center`}
                    >
                      <Text style={tw`text-white font-bold text-sm`}>Accept</Text>
                    </PressableScale>
                    <PressableScale
                      onPress={() => void handleDeclineProposal()}
                      disabled={proposalBusy}
                      style={tw`flex-1 py-2 rounded-xl bg-[#EAE4D6] items-center`}
                    >
                      <Text style={tw`text-stone-800 font-bold text-sm`}>Decline</Text>
                    </PressableScale>
                  </View>
                </>
              ) : thread.proposal?.status === 'sent' && thread.role === 'instructor' ? (
                <Text style={tw`text-sm text-stone-700`}>
                  Proposal sent · waiting for {selectedConversation.peer.username}
                </Text>
              ) : thread.role === 'instructor' ? (
                <PressableScale
                  onPress={() => setComposeOpen(true)}
                  style={tw`py-2 rounded-xl bg-emerald-600 items-center`}
                >
                  <Text style={tw`text-white font-bold text-sm`}>Send a proposal</Text>
                </PressableScale>
              ) : (
                <Text style={tw`text-sm text-stone-700`}>
                  Talk first. Your coach can send a written plan after you discuss.
                </Text>
              )}
            </View>
          ) : null}

          {loadingMessages && selectedConversation.messages.length === 0 ? (
            <View style={tw`flex-1 px-4 pt-4`}>
              <SkeletonCard variant="message" />
              <SkeletonCard variant="message" />
            </View>
          ) : (
            <FlatList
              ref={threadListRef}
              data={selectedConversation.messages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={tw`px-4 py-3 pb-4`}
              {...verticalScrollProps}
              onScrollBeginDrag={() => {
                setPickerId(null);
                threadUserScrolledRef.current = true;
              }}
              // Keeps the visible message in place when older history is prepended.
              maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
              // Auto-load older history near the top — only once the user has dragged,
              // so the initial scroll-to-latest can't trigger it. Button stays as fallback.
              onStartReachedThreshold={0.4}
              onStartReached={() => {
                if (threadUserScrolledRef.current) void loadOlderMessages();
              }}
              ListHeaderComponent={
                selectedConversation.has_older ? (
                  <TouchableOpacity
                    onPress={() => void loadOlderMessages()}
                    disabled={loadingOlder}
                    style={tw`self-center my-2 px-4 py-2 rounded-full ${
                      darkWall ? 'bg-white/10' : 'bg-black/5'
                    }`}
                    accessibilityRole="button"
                    accessibilityLabel="Load earlier messages"
                  >
                    {loadingOlder ? (
                      <ActivityIndicator size="small" color={wall.meta} />
                    ) : (
                      <Text style={[tw`text-[13px] font-semibold`, { color: wall.meta }]}>
                        Load earlier messages
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : null
              }
              renderItem={({ item, index }) => {
                const failed = failedIds.has(item.id);
                const pending = item.id.startsWith('temp-');
                const prev = selectedConversation.messages[index - 1];
                const showDay = !prev || dayKey(prev.created_at) !== dayKey(item.created_at);
                const align = item.is_own ? 'items-end' : 'items-start';
                return (
                  <View style={tw`${align} mb-1.5`}>
                    {showDay ? (
                      <View style={tw`items-center my-3 self-stretch`}>
                        <View
                          style={[
                            tw`px-3 py-1 rounded-full`,
                            { backgroundColor: darkWall ? 'rgba(255,255,255,0.08)' : '#EAE4D6' },
                          ]}
                        >
                          <Text
                            style={{
                              fontSize: 11,
                              fontWeight: '600',
                              color: darkWall ? '#E7E5E4' : '#57534E',
                            }}
                          >
                            {formatDayLabel(item.created_at)}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                    {pickerId === item.id ? (
                      <ReactionPicker
                        mine={item.reactions?.mine ?? null}
                        dark={darkWall}
                        onPick={(emoji) => {
                          setPickerId(null);
                          void toggleReact(item.id, emoji);
                        }}
                      />
                    ) : null}
                    <Pressable
                      onPress={() => {
                        if (failed) {
                          retryFailed(item.id);
                          return;
                        }
                        if (pending) return;
                        const now = Date.now();
                        const last = lastTapRef.current;
                        if (last && last.id === item.id && now - last.at < 320) {
                          lastTapRef.current = null;
                          void toggleReact(item.id, 'love');
                          return;
                        }
                        lastTapRef.current = { id: item.id, at: now };
                        if (pickerId === item.id) setPickerId(null);
                      }}
                      onLongPress={() => {
                        if (failed || pending) return;
                        feedback.select();
                        setPickerId((cur) => (cur === item.id ? null : item.id));
                      }}
                      delayLongPress={360}
                      style={tw`max-w-[78%]`}
                    >
                      <View
                        style={[
                          tw`rounded-[22px] px-3.5 py-2.5`,
                          item.is_own
                            ? {
                                backgroundColor: failed ? '#EF4444' : wall.ownBubble,
                                borderBottomRightRadius: 6,
                              }
                            : {
                                backgroundColor: wall.peerBubble,
                                borderColor: wall.peerBorder,
                                borderWidth: 1,
                                borderBottomLeftRadius: 6,
                              },
                        ]}
                      >
                        {burstMsgId === item.id ? (
                          <HeartBurst triggerKey={burstKey} size={56} />
                        ) : null}
                        <Text
                          style={{
                            fontSize: 15,
                            lineHeight: 21,
                            color: item.is_own ? wall.ownText : wall.peerText,
                          }}
                        >
                          {item.body}
                        </Text>
                        <View style={tw`flex-row items-center justify-end mt-1`}>
                          <Text
                            style={{
                              fontSize: 11,
                              marginRight: 4,
                              color: item.is_own ? 'rgba(255,255,255,0.75)' : wall.meta,
                            }}
                          >
                            {failed ? 'Tap to retry' : formatMessageTime(item.created_at)}
                          </Text>
                          {item.is_own && !failed ? (
                            <ReceiptTicks
                              status={messageReceipt(item, selectedConversation.peer_last_read_at)}
                            />
                          ) : null}
                        </View>
                      </View>
                    </Pressable>
                    <ReactionChips
                      reactions={item.reactions}
                      own={item.is_own}
                      dark={darkWall}
                      onPressChip={(emoji) => void toggleReact(item.id, emoji)}
                    />
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={tw`items-center py-16 px-6`}>
                  <View
                    style={[
                      tw`w-14 h-14 rounded-full items-center justify-center mb-3`,
                      { backgroundColor: darkWall ? 'rgba(255,255,255,0.08)' : '#EAE4D6' },
                    ]}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={24} color="#059669" />
                  </View>
                  <Text style={{ color: chromeMuted, textAlign: 'center', lineHeight: 20 }}>
                    No messages yet. Say hello — keep it kind.{'\n'}
                    Double-tap a note for ❤️ · hold for more.
                  </Text>
                </View>
              }
            />
          )}

          <View
            style={[
              tw`px-4 pt-2 pb-3`,
              {
                backgroundColor: wall.page,
                borderTopColor: darkWall ? 'rgba(255,255,255,0.06)' : 'rgba(28,25,23,0.06)',
                borderTopWidth: 1,
              },
            ]}
          >
            <View style={tw`flex-row items-end gap-2`}>
              <View
                style={[
                  tw`flex-1 flex-row items-end border rounded-3xl px-3.5 py-1 min-h-[48px]`,
                  {
                    backgroundColor: wall.composer,
                    borderColor: darkWall ? 'rgba(255,255,255,0.08)' : 'rgba(28,25,23,0.08)',
                  },
                ]}
              >
                <TextInput
                  ref={messageInputRef}
                  {...formInputAccessoryProps({ multiline: true })}
                  placeholder="Message…"
                  value={messageText}
                  onChangeText={setMessageText}
                  maxLength={MESSAGE_MAX_LENGTH}
                  multiline
                  style={[
                    tw`flex-1 text-[15px] max-h-28 py-2.5`,
                    { color: wall.peerText },
                  ]}
                  placeholderTextColor={wall.meta}
                  textAlignVertical="top"
                />
              </View>
              <TouchableOpacity
                onPress={() => {
                  if (!canSend) return;
                  void handleSendMessage();
                }}
                onLongPress={() => {
                  if (sending || messageText.trim()) return;
                  feedback.egg();
                  void handleSendMessage('🌱');
                }}
                delayLongPress={420}
                disabled={sending}
                style={[
                  tw`w-12 h-12 rounded-full items-center justify-center`,
                  {
                    backgroundColor: canSend ? '#059669' : darkWall ? 'rgba(255,255,255,0.08)' : '#EAE4D6',
                    opacity: sending ? 0.6 : 1,
                  },
                ]}
                accessibilityLabel="Send message"
              >
                {sending ? (
                  <ActivityIndicator color={canSend ? '#fff' : '#6B645E'} />
                ) : (
                  <Ionicons
                    name="send"
                    size={18}
                    color={canSend ? '#FFFFFF' : '#A8A29E'}
                  />
                )}
              </TouchableOpacity>
            </View>
          </View>
          <KeyboardDoneAccessory />
          <ProposalComposeSheet
            visible={composeOpen}
            offering={thread?.offering}
            busy={proposalBusy}
            onClose={() => setComposeOpen(false)}
            onSend={(input) => void handleSendProposal(input)}
          />
          <ChatWallpaperSheet
            visible={wallOpen}
            current={wall.id}
            onClose={() => setWallOpen(false)}
            onPick={(id) => setWall(selectedConversation.id, id)}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`} edges={['top']}>
      <GrowChromeHeader
        leftAccessory={
          <TouchableOpacity
            onPress={goBackRoot}
            style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={18} color="#1C1917" />
          </TouchableOpacity>
        }
      />

      <View style={tw`px-5 pt-3 pb-2`}>
        <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
          Messages
        </Text>
        <Text style={tw`text-2xl font-bold text-stone-900 mt-0.5`}>Inbox</Text>
        <Text style={tw`text-sm text-stone-500 mt-1 mb-3`}>
          Friends, coaches, and shop support — each in its own lane.
        </Text>

        <SearchField
          value={inboxQuery}
          onChangeText={setInboxQuery}
          placeholder="Search a name or last message…"
        />

        <View style={tw`flex-row gap-5 border-b border-stone-200/80`}>
          {(
            [
              { key: 'friends' as const, label: 'Friends' },
              { key: 'coaches' as const, label: 'Coaches' },
              { key: 'shop' as const, label: 'Shop' },
            ] as const
          ).map((tab) => {
            const active = inboxTab === tab.key;
            const unread = laneCounts.unread[tab.key];
            return (
              <Pressable
                key={tab.key}
                onPress={() => {
                  feedback.select();
                  setInboxTab(tab.key);
                }}
                style={tw`pb-2.5 border-b-2 flex-row items-center ${
                  active ? 'border-emerald-600' : 'border-transparent'
                }`}
              >
                <Text
                  style={tw`text-[15px] ${
                    active ? 'text-stone-900 font-bold' : 'text-stone-500 font-medium'
                  }`}
                >
                  {tab.label}
                </Text>
                {unread > 0 ? (
                  <View
                    style={tw`ml-1.5 min-w-[18px] h-[18px] px-1 rounded-full items-center justify-center ${
                      active ? 'bg-emerald-600' : 'bg-[#F97066]'
                    }`}
                  >
                    <Text maxFontSizeMultiplier={1.3} style={tw`text-[11px] font-bold text-white`}>
                      {unread}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      {listError ? (
        <View style={tw`mx-5 mb-2 px-3 py-2 rounded-xl bg-red-50 border border-red-100`}>
          <Text style={tw`text-sm text-red-700`}>{listError}</Text>
        </View>
      ) : null}

      {loadingConversations && conversations.length === 0 ? (
        <View style={tw`flex-1 px-5 pt-2`}>
          <SkeletonList variant="inbox" count={5} />
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[tw`px-5 pt-2`, { paddingBottom: TAB_SCREEN_BOTTOM_PADDING }]}
          refreshControl={
            <RefreshControl {...refresh} />
          }
          renderItem={({ item }) => (
            <PressableScale
              onPress={() => void openConversation(item)}
              style={tw`flex-row items-center py-3.5 border-b border-stone-200/60`}
            >
              <View style={tw`relative`}>
                <View style={tw`w-14 h-14 rounded-full overflow-hidden border border-emerald-100 bg-[#ECFDF5]`}>
                  <GrowAvatar
                    userId={item.peer.id}
                    username={item.peer.username}
                    uri={item.peer.avatar}
                    size={56}
                  />
                </View>
                {item.unread ? (
                  <View style={tw`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#FFFcf7]`} />
                ) : null}
              </View>
              <View style={tw`flex-1 ml-3`}>
                <View style={tw`flex-row items-center justify-between mb-0.5`}>
                  <Text
                    style={tw`font-bold ${item.unread ? 'text-stone-900' : 'text-stone-800'}`}
                    numberOfLines={1}
                  >
                    {item.peer.username}
                  </Text>
                  <Text style={tw`text-xs text-stone-500 ml-2`}>
                    {formatRelativeTime(item.last_message_at)}
                  </Text>
                </View>
                <View style={tw`flex-row items-center`}>
                  {item.coaching || item.peer.is_instructor ? (
                    <View style={tw`mr-1.5 px-1.5 py-0.5 rounded-full bg-emerald-50`}>
                      <Text style={tw`text-[11px] font-bold text-emerald-800`}>Coach</Text>
                    </View>
                  ) : item.peer.is_business ? (
                    <View style={tw`mr-1.5 px-1.5 py-0.5 rounded-full bg-[#EAE4D6]`}>
                      <Text style={tw`text-[11px] font-bold text-stone-700`}>Shop</Text>
                    </View>
                  ) : null}
                  <Text
                    style={tw`flex-1 text-sm ${item.unread ? 'text-stone-800 font-medium' : 'text-stone-500'}`}
                    numberOfLines={1}
                  >
                    {item.last_message
                      ? `${item.last_sender_id && item.last_sender_id === user?.id ? 'You: ' : ''}${item.last_message}`
                      : 'Start a conversation'}
                  </Text>
                </View>
              </View>
            </PressableScale>
          )}
          ListEmptyComponent={
            inboxTab === 'shop' ? (
              <EmptyState
                icon="storefront-outline"
                title="No shop threads yet"
                description="When you message a seller, support chats land here."
                actionLabel="Browse shop"
                onAction={() => {
                  try {
                    (navigation as { navigate: (a: string, b: object) => void }).navigate(
                      'Individual',
                      { screen: 'Marketplace' }
                    );
                  } catch {
                    goBackRoot();
                  }
                }}
              />
            ) : inboxTab === 'coaches' ? (
              <EmptyState
                icon="school-outline"
                title="No coach threads yet"
                description="Reach out from an instructor’s page — coaching chats land here."
                actionLabel="Find instructors"
                onAction={() => navigateFromRoot(navigation, 'Instructors')}
              />
            ) : (
              <EmptyState
                icon="chatbubbles-outline"
                title="No conversations yet"
                description="Message a friend from their profile. Only mutual friends can chat here."
              />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}
