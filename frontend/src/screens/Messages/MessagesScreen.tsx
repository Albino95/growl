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
  Alert,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useAuth } from '../../store/hooks';
import { resolveAvatarUri } from '../../utils/images';
import {
  getConversations,
  getMessages,
  sendMessage,
  createConversation,
  type ConversationSummary,
  type ChatMessage,
} from '../../services/api/messages';
import tw from '../../lib/tw';
import EmptyState from '../../components/ui/EmptyState';
import GrowChromeHeader from '../../components/ui/GrowChromeHeader';
import PressableScale from '../../components/ui/PressableScale';
import SkeletonCard, { SkeletonList } from '../../components/ui/SkeletonCard';
import { feedback, triggerPressFeedback } from '../../utils/interactionFeedback';
import {
  KeyboardDoneAccessory,
  formInputAccessoryProps,
} from '../../components/ui/KeyboardDoneAccessory';
import { TAB_SCREEN_BOTTOM_PADDING } from '../../constants/scroll';

type InboxTab = 'friends' | 'shop' | 'coaches';

function conversationLane(c: ConversationSummary): InboxTab {
  if (c.peer.is_business) return 'shop';
  if (c.peer.is_instructor) return 'coaches';
  return 'friends';
}

type ActiveConversation = ConversationSummary & {
  messages: ChatMessage[];
  peer_last_read_at?: string | null;
};

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

export default function MessagesScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<MessagesRouteParams, 'Messages'>>();
  const { user } = useAuth();

  const [inboxTab, setInboxTab] = useState<InboxTab>('friends');
  const [selectedConversation, setSelectedConversation] = useState<ActiveConversation | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [listError, setListError] = useState<string | null>(null);
  const messageInputRef = useRef<TextInput>(null);
  const lastRouteBootKey = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  selectedIdRef.current = selectedConversation?.id ?? null;

  const filteredConversations = useMemo(
    () => conversations.filter((c) => conversationLane(c) === inboxTab),
    [conversations, inboxTab]
  );

  const laneCounts = useMemo(() => {
    const counts = { friends: 0, shop: 0, coaches: 0 };
    for (const c of conversations) counts[conversationLane(c)] += 1;
    return counts;
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
      setRefreshing(false);
    }
  }, []);

  const openConversation = useCallback(async (conversation: ConversationSummary) => {
    setLoadingMessages(true);
    setSelectedConversation({ ...conversation, messages: [], unread: false });
    try {
      const res = await getMessages(conversation.id);
      setSelectedConversation({
        ...conversation,
        unread: false,
        messages: res.data?.messages ?? [],
        peer_last_read_at: res.data?.peer_last_read_at ?? null,
      });
      setConversations((prev) =>
        prev.map((c) => (c.id === conversation.id ? { ...c, unread: false } : c))
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not load messages';
      Alert.alert('Inbox', msg);
      setSelectedConversation({ ...conversation, messages: [] });
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const id = setInterval(() => {
      if (selectedIdRef.current) {
        void getMessages(selectedIdRef.current)
          .then((res) => {
            const msgs = res.data?.messages ?? [];
            setSelectedConversation((prev) =>
              prev && prev.id === selectedIdRef.current
                ? {
                    ...prev,
                    messages: msgs,
                    unread: false,
                    peer_last_read_at: res.data?.peer_last_read_at ?? prev.peer_last_read_at,
                  }
                : prev
            );
          })
          .catch(() => undefined);
      } else {
        void loadConversations({ silent: true });
      }
    }, 4000);
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
        Alert.alert(
          'Inbox',
          e instanceof Error ? e.message : 'Could not open conversation'
        );
      }
    })();
  }, [route.params, conversations, openConversation]);

  const handleSendMessage = async () => {
    const body = messageText.trim();
    if (!body || !selectedConversation || sending) return;
    setSending(true);
    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      conversation_id: selectedConversation.id,
      sender_id: user?.id || '',
      body,
      created_at: new Date().toISOString(),
      is_own: true,
    };
    setSelectedConversation((prev) =>
      prev ? { ...prev, messages: [...prev.messages, optimistic] } : prev
    );
    setMessageText('');
    try {
      const res = await sendMessage(selectedConversation.id, body);
      const saved = res.data;
      setSelectedConversation((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === tempId && saved ? { ...saved, is_own: true } : m
          ),
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
      setSelectedConversation((prev) =>
        prev ? { ...prev, messages: prev.messages.filter((m) => m.id !== tempId) } : prev
      );
      setMessageText(body);
      Alert.alert('Send failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSending(false);
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
    return (
      <SafeAreaView style={tw`flex-1 bg-surface-page`} edges={['top']}>
        <KeyboardAvoidingView
          style={tw`flex-1`}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <View style={tw`px-4 py-2.5 flex-row items-center border-b border-stone-200/50`}>
            <TouchableOpacity
              onPress={() => setSelectedConversation(null)}
              style={tw`mr-3 w-10 h-10 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
            >
              <Ionicons name="arrow-back" size={20} color="#1C1917" />
            </TouchableOpacity>
            <Pressable
              onPress={() => {
                const root = navigation.getParent() || navigation;
                (root as { navigate: (a: string, b: object) => void }).navigate('PublicProfile', {
                  userId: selectedConversation.peer.id,
                });
              }}
              style={tw`flex-row items-center flex-1`}
            >
              <View style={tw`w-10 h-10 rounded-full overflow-hidden mr-3 border border-emerald-100 bg-[#ECFDF5]`}>
                <Image
                  source={{
                    uri: resolveAvatarUri(
                      selectedConversation.peer.id,
                      selectedConversation.peer.username,
                      selectedConversation.peer.avatar
                    ),
                  }}
                  style={tw`w-full h-full`}
                  contentFit="cover"
                />
              </View>
              <View style={tw`flex-1`}>
                <Text style={tw`font-bold text-stone-900`} numberOfLines={1}>
                  {selectedConversation.peer.username}
                </Text>
                <Text style={tw`text-xs text-stone-500 mt-0.5`}>Friend · tap for profile</Text>
              </View>
            </Pressable>
          </View>

          {loadingMessages && selectedConversation.messages.length === 0 ? (
            <View style={tw`flex-1 px-4 pt-4`}>
              <SkeletonCard variant="message" />
              <SkeletonCard variant="message" />
            </View>
          ) : (
            <FlatList
              data={selectedConversation.messages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={tw`px-4 py-3 pb-4`}
              renderItem={({ item }) => (
                <View style={tw`mb-2.5 flex-row ${item.is_own ? 'justify-end' : 'justify-start'}`}>
                  <View
                    style={[
                      tw`max-w-[78%] rounded-2xl px-4 py-2.5`,
                      item.is_own
                        ? tw`bg-emerald-600 rounded-tr-md`
                        : tw`bg-[#FFFcf7] border border-stone-200/80 rounded-tl-md`,
                    ]}
                  >
                    <Text
                      style={tw`text-[15px] leading-5 ${
                        item.is_own ? 'text-white' : 'text-stone-900'
                      }`}
                    >
                      {item.body}
                    </Text>
                    <View style={tw`flex-row items-center justify-end mt-1`}>
                      <Text
                        style={tw`text-[10px] mr-1 ${
                          item.is_own ? 'text-emerald-100' : 'text-stone-400'
                        }`}
                      >
                        {formatMessageTime(item.created_at)}
                      </Text>
                      {item.is_own ? (
                        <ReceiptTicks
                          status={messageReceipt(item, selectedConversation.peer_last_read_at)}
                        />
                      ) : null}
                    </View>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <View style={tw`items-center py-16 px-6`}>
                  <View style={tw`w-14 h-14 rounded-full bg-[#EAE4D6] items-center justify-center mb-3`}>
                    <Ionicons name="chatbubble-ellipses-outline" size={24} color="#059669" />
                  </View>
                  <Text style={tw`text-stone-600 text-center leading-5`}>
                    No messages yet. Say hello — keep it kind.
                  </Text>
                </View>
              }
            />
          )}

          {/* Composer — matches FormTextInput / Journal cream surfaces */}
          <View style={tw`px-4 pt-2 pb-3 border-t border-stone-200/50 bg-surface-page`}>
            <View style={tw`flex-row items-end gap-2`}>
              <View
                style={tw`flex-1 flex-row items-end bg-[#FFFcf7] border border-stone-200/80 rounded-2xl px-3.5 py-1 min-h-[48px]`}
              >
                <TextInput
                  ref={messageInputRef}
                  {...formInputAccessoryProps({ multiline: true })}
                  placeholder="Write a message…"
                  value={messageText}
                  onChangeText={setMessageText}
                  multiline
                  style={tw`flex-1 text-[15px] text-stone-900 max-h-28 py-2.5`}
                  placeholderTextColor="#A8A29E"
                  textAlignVertical="top"
                />
              </View>
              <TouchableOpacity
                onPress={() => void handleSendMessage()}
                disabled={!canSend}
                style={tw`w-12 h-12 rounded-2xl items-center justify-center ${
                  canSend ? 'bg-emerald-600' : 'bg-[#EAE4D6]'
                } ${sending ? 'opacity-60' : ''}`}
                accessibilityLabel="Send message"
              >
                {sending ? (
                  <ActivityIndicator color={canSend ? '#fff' : '#78716C'} />
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

        <View style={tw`flex-row gap-5 border-b border-stone-200/80`}>
          {(
            [
              { key: 'friends' as const, label: 'Friends' },
              { key: 'coaches' as const, label: 'Coaches' },
              { key: 'shop' as const, label: 'Shop' },
            ] as const
          ).map((tab) => {
            const active = inboxTab === tab.key;
            const count = laneCounts[tab.key];
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
                    active ? 'text-stone-900 font-bold' : 'text-stone-400 font-medium'
                  }`}
                >
                  {tab.label}
                </Text>
                {count > 0 ? (
                  <View
                    style={tw`ml-1.5 min-w-[18px] h-[18px] px-1 rounded-full items-center justify-center ${
                      active ? 'bg-emerald-600' : 'bg-stone-300'
                    }`}
                  >
                    <Text style={tw`text-[10px] font-bold ${active ? 'text-white' : 'text-stone-700'}`}>
                      {count}
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
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadConversations();
              }}
              tintColor="#059669"
            />
          }
          renderItem={({ item }) => (
            <PressableScale
              onPress={() => void openConversation(item)}
              style={tw`flex-row items-center py-3.5 mb-2 bg-[#FFFcf7] border border-stone-200/80 rounded-2xl px-3`}
            >
              <View style={tw`relative`}>
                <View style={tw`w-14 h-14 rounded-full overflow-hidden border border-emerald-100 bg-[#ECFDF5]`}>
                  <Image
                    source={{
                      uri: resolveAvatarUri(item.peer.id, item.peer.username, item.peer.avatar),
                    }}
                    style={tw`w-full h-full`}
                    contentFit="cover"
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
                  <Text style={tw`text-xs text-stone-400 ml-2`}>
                    {formatRelativeTime(item.last_message_at)}
                  </Text>
                </View>
                <Text
                  style={tw`text-sm ${item.unread ? 'text-stone-800 font-medium' : 'text-stone-500'}`}
                  numberOfLines={1}
                >
                  {item.last_message || 'Start a conversation'}
                </Text>
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
                description="Message an instructor from their profile — coaching chats live here."
                actionLabel="Explore people"
                onAction={() => {
                  try {
                    (navigation as { navigate: (a: string, b: object) => void }).navigate(
                      'Individual',
                      { screen: 'Explore' }
                    );
                  } catch {
                    goBackRoot();
                  }
                }}
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
