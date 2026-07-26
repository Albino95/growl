import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
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
import { getAvatarUrl } from '../../utils/images';
import {
  getConversations,
  getMessages,
  sendMessage,
  createConversation,
  type ConversationSummary,
  type ChatMessage,
} from '../../services/api/messages';
import tw from '../../lib/tw';
import { CategoryCapsuleRow } from '../../components/ui/CategoryCapsule';
import EmptyState from '../../components/ui/EmptyState';
import { triggerPressFeedback } from '../../utils/interactionFeedback';

type InboxTab = 'friends' | 'shop' | 'coaches';

type ActiveConversation = ConversationSummary & {
  messages: ChatMessage[];
};

type MessagesRouteParams = {
  Messages: {
    conversationId?: string;
    targetUserId?: string;
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
  const bootedFromRouteRef = useRef(false);
  const selectedIdRef = useRef<string | null>(null);

  selectedIdRef.current = selectedConversation?.id ?? null;

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

  // Poll conversation list while on inbox; poll thread while open.
  useEffect(() => {
    const id = setInterval(() => {
      if (selectedIdRef.current) {
        void getMessages(selectedIdRef.current)
          .then((res) => {
            const msgs = res.data?.messages ?? [];
            setSelectedConversation((prev) =>
              prev && prev.id === selectedIdRef.current
                ? { ...prev, messages: msgs, unread: false }
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

  useEffect(() => {
    const { conversationId, targetUserId } = route.params ?? {};
    if (!conversationId && !targetUserId) return;
    if (bootedFromRouteRef.current) return;
    bootedFromRouteRef.current = true;

    const boot = async () => {
      let list = conversations;
      if (!list.length) {
        try {
          const res = await getConversations();
          list = res.data?.conversations ?? [];
          setConversations(list);
        } catch {
          list = [];
        }
      }

      if (conversationId) {
        const found = list.find((c) => c.id === conversationId);
        if (found) {
          await openConversation(found);
          return;
        }
      }

      if (targetUserId) {
        try {
          const created = await createConversation(targetUserId);
          await openConversation(created.data.conversation);
          void loadConversations({ silent: true });
        } catch (e) {
          Alert.alert(
            'Cannot message',
            e instanceof Error ? e.message : 'You can only message mutual friends.'
          );
        }
      }
    };

    void boot();
  }, [route.params, conversations, openConversation, loadConversations]);

  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedConversation || sending) return;

    const body = messageText.trim();
    setMessageText('');
    setSending(true);
    triggerPressFeedback();

    const optimistic: ChatMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: selectedConversation.id,
      sender_id: user?.id || 'me',
      body,
      created_at: new Date().toISOString(),
      is_own: true,
    };

    setSelectedConversation((prev) =>
      prev
        ? {
            ...prev,
            messages: [...prev.messages, optimistic],
            last_message: body,
            last_message_at: optimistic.created_at,
          }
        : prev
    );

    try {
      const res = await sendMessage(selectedConversation.id, body);
      const saved = res.data;
      setSelectedConversation((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map((m) => (m.id === optimistic.id ? saved : m)),
          last_message: saved.body,
          last_message_at: saved.created_at,
        };
      });
      void loadConversations({ silent: true });
    } catch (e) {
      setSelectedConversation((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.filter((m) => m.id !== optimistic.id),
        };
      });
      setMessageText(body);
      Alert.alert('Send failed', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSending(false);
    }
  };

  const goBackRoot = () => {
    const rootNavigation = navigation.getParent() || navigation;
    if (rootNavigation.canGoBack()) rootNavigation.goBack();
    else rootNavigation.navigate('Individual' as never);
  };

  if (selectedConversation) {
    return (
      <SafeAreaView style={tw`flex-1 bg-[#F3EEE4]`} edges={['top']}>
        <KeyboardAvoidingView
          style={tw`flex-1`}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <View style={tw`flex-row items-center px-4 py-3`}>
            <TouchableOpacity
              onPress={() => setSelectedConversation(null)}
              style={tw`mr-3 w-10 h-10 rounded-full bg-white/80 border border-stone-200 items-center justify-center`}
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
              <View style={tw`w-10 h-10 rounded-full bg-stone-100 overflow-hidden mr-3 border border-stone-200`}>
                <Image
                  source={{
                    uri: getAvatarUrl(
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
                <Text style={tw`font-semibold text-stone-900`}>
                  {selectedConversation.peer.username}
                </Text>
                <Text style={tw`text-xs text-stone-500`}>Friend · tap for profile</Text>
              </View>
            </Pressable>
          </View>

          {loadingMessages && selectedConversation.messages.length === 0 ? (
            <View style={tw`flex-1 items-center justify-center`}>
              <ActivityIndicator color="#059669" />
            </View>
          ) : (
            <FlatList
              data={selectedConversation.messages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={tw`px-4 py-2 pb-4`}
              renderItem={({ item }) => (
                <View style={tw`mb-2.5 flex-row ${item.is_own ? 'justify-end' : 'justify-start'}`}>
                  <View
                    style={[
                      tw`max-w-[78%] rounded-2xl px-4 py-2.5`,
                      item.is_own
                        ? tw`bg-emerald-600 rounded-tr-md`
                        : tw`bg-white border border-stone-200/80 rounded-tl-md`,
                    ]}
                  >
                    <Text
                      style={tw`text-[15px] leading-5 ${
                        item.is_own ? 'text-white' : 'text-stone-900'
                      }`}
                    >
                      {item.body}
                    </Text>
                    <Text
                      style={tw`text-[10px] mt-1 text-right ${
                        item.is_own ? 'text-emerald-100' : 'text-stone-400'
                      }`}
                    >
                      {formatMessageTime(item.created_at)}
                    </Text>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <View style={tw`items-center py-16 px-6`}>
                  <Text style={tw`text-stone-600 text-center`}>
                    No messages yet. Say hello — keep it kind.
                  </Text>
                </View>
              }
            />
          )}

          <View style={tw`px-4 pb-3 pt-2 bg-[#F3EEE4]`}>
            <View style={tw`flex-row items-end bg-white border border-stone-200 rounded-full px-3 py-1.5`}>
              <TextInput
                ref={messageInputRef}
                placeholder="Message..."
                value={messageText}
                onChangeText={setMessageText}
                multiline
                style={tw`flex-1 text-base text-stone-900 max-h-24 py-2 px-1`}
                placeholderTextColor="#A8A29E"
                returnKeyType="default"
                blurOnSubmit={false}
              />
              {messageText.trim() ? (
                <TouchableOpacity
                  onPress={() => void handleSendMessage()}
                  disabled={sending}
                  style={tw`bg-emerald-600 rounded-full w-10 h-10 items-center justify-center mb-0.5 ${
                    sending ? 'opacity-60' : ''
                  }`}
                >
                  <Ionicons name="send" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => {
                    messageInputRef.current?.blur();
                    Keyboard.dismiss();
                  }}
                  style={tw`px-3 py-2 mb-0.5`}
                >
                  <Text style={tw`text-xs text-stone-500 font-semibold`}>Done</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={tw`flex-1 bg-[#F3EEE4]`} edges={['top']}>
      <View style={tw`px-5 pt-3 pb-2`}>
        <View style={tw`flex-row items-center mb-1`}>
          <TouchableOpacity
            onPress={goBackRoot}
            style={tw`mr-3 w-10 h-10 rounded-full bg-white/80 border border-stone-200 items-center justify-center`}
          >
            <Ionicons name="arrow-back" size={20} color="#1C1917" />
          </TouchableOpacity>
          <View style={tw`flex-1`}>
            <Text style={tw`text-[11px] tracking-[3px] uppercase text-stone-500 font-semibold`}>
              Grow!
            </Text>
            <Text style={tw`text-3xl text-stone-900 mt-0.5`}>Inbox</Text>
          </View>
        </View>
        <Text style={tw`text-sm text-stone-500 mb-3 ml-13`}>
          Message friends. Shop and coach threads open when you have a real connection.
        </Text>

        <CategoryCapsuleRow
          items={[
            { key: 'friends', label: 'Friends', icon: 'people-outline' },
            { key: 'shop', label: 'Shop', icon: 'storefront-outline' },
            { key: 'coaches', label: 'Coaches', icon: 'school-outline' },
          ]}
          selectedKey={inboxTab}
          onSelect={(key) => setInboxTab((key as InboxTab) || 'friends')}
          showAll={false}
          allowDeselect={false}
        />
      </View>

      {listError ? (
        <View style={tw`mx-5 mb-2 px-3 py-2 rounded-xl bg-red-50 border border-red-100`}>
          <Text style={tw`text-sm text-red-700`}>{listError}</Text>
        </View>
      ) : null}

      {inboxTab === 'shop' ? (
        <EmptyState
          icon="storefront-outline"
          title="Shop messages"
          description="When you order from a seller, you can message them here about shipping and support."
          actionLabel="Browse shop"
          onAction={() => {
            const root = navigation.getParent() || navigation;
            root.navigate('Individual' as never);
            // Land on Marketplace tab via nested navigate after a tick is fragile; use Marketplace from stack if available
            setTimeout(() => {
              try {
                (navigation as any).navigate('Individual', { screen: 'Marketplace' });
              } catch {
                /* ignore */
              }
            }, 0);
          }}
        />
      ) : inboxTab === 'coaches' ? (
        <EmptyState
          icon="school-outline"
          title="Coach messages"
          description="Once you connect with an instructor, your coaching chats will live here."
          actionLabel="Explore people"
          onAction={() => {
            try {
              (navigation as any).navigate('Individual', { screen: 'Explore' });
            } catch {
              goBackRoot();
            }
          }}
        />
      ) : loadingConversations && conversations.length === 0 ? (
        <View style={tw`flex-1 items-center justify-center`}>
          <ActivityIndicator color="#059669" size="large" />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={tw`px-5 pb-10`}
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
            <TouchableOpacity
              onPress={() => {
                triggerPressFeedback();
                void openConversation(item);
              }}
              style={tw`flex-row items-center py-3.5 mb-1 bg-white/70 border border-stone-200/80 rounded-2xl px-3`}
            >
              <View style={tw`relative`}>
                <View style={tw`w-14 h-14 rounded-full bg-stone-100 overflow-hidden border border-stone-200`}>
                  <Image
                    source={{
                      uri: getAvatarUrl(item.peer.id, item.peer.username, item.peer.avatar),
                    }}
                    style={tw`w-full h-full`}
                    contentFit="cover"
                  />
                </View>
                {item.unread ? (
                  <View style={tw`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white`} />
                ) : null}
              </View>
              <View style={tw`flex-1 ml-3`}>
                <View style={tw`flex-row items-center justify-between mb-0.5`}>
                  <Text
                    style={tw`font-semibold ${item.unread ? 'text-stone-900' : 'text-stone-800'}`}
                  >
                    {item.peer.username}
                  </Text>
                  <Text style={tw`text-xs text-stone-400`}>
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
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="chatbubbles-outline"
              title="No conversations yet"
              description="Message a friend from their profile. Only mutual friends can chat here."
            />
          }
        />
      )}
    </SafeAreaView>
  );
}
