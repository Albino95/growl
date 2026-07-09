import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useAuth } from '../../store/hooks';
import { getAvatarUrl, getStoryImageUrl } from '../../utils/images';
import { getStories, viewStory, type StoryItem } from '../../services/api/stories';
import {
  getConversations,
  getMessages,
  sendMessage,
  createConversation,
  type ConversationSummary,
  type ChatMessage,
} from '../../services/api/messages';
import tw from '../../lib/tw';

type MessageType = 'Individual' | 'Store' | 'Instructor';

type Story = {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  image?: string;
  hasViewed: boolean;
};

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
  const [activeSection, setActiveSection] = useState<MessageType>('Individual');
  const [selectedConversation, setSelectedConversation] = useState<ActiveConversation | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [messageText, setMessageText] = useState('');
  const messageInputRef = useRef<TextInput>(null);
  const bootedFromRouteRef = useRef(false);
  const { user } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);

  const loadStories = useCallback(async () => {
    try {
      const response = await getStories();
      if (response.success) {
        setStories(
          (response.data.stories || []).map((s: StoryItem) => ({
            id: s.id,
            userId: s.userId,
            username: s.username,
            avatar: s.avatar || getAvatarUrl(s.userId, s.username),
            hasViewed: !!s.hasViewed,
          }))
        );
      }
    } catch {
      setStories([]);
    }
  }, []);

  const loadConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      const res = await getConversations();
      setConversations(res.data?.conversations ?? []);
    } catch {
      setConversations([]);
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  const openConversation = useCallback(
    async (conversation: ConversationSummary) => {
      setLoadingMessages(true);
      try {
        const res = await getMessages(conversation.id);
        setSelectedConversation({
          ...conversation,
          messages: res.data?.messages ?? [],
        });
      } catch {
        setSelectedConversation({ ...conversation, messages: [] });
      } finally {
        setLoadingMessages(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadStories();
    void loadConversations();
  }, [loadStories, loadConversations]);

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
          const conv = created.data.conversation;
          await openConversation(conv);
          void loadConversations();
        } catch {
          // Conversation could not be opened
        }
      }
    };

    void boot();
  }, [route.params, conversations, openConversation, loadConversations]);

  const groupedStories = useMemo(() => {
    const grouped = new Map<string, { user: Story; stories: Story[] }>();
    stories.forEach((story) => {
      if (!grouped.has(story.userId)) {
        grouped.set(story.userId, { user: story, stories: [] });
      }
      grouped.get(story.userId)!.stories.push(story);
    });
    return Array.from(grouped.values());
  }, [stories]);

  const sections: MessageType[] = ['Individual', 'Store', 'Instructor'];

  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedConversation || sending) return;

    const body = messageText.trim();
    setMessageText('');
    setSending(true);

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
      void loadConversations();
    } catch {
      setSelectedConversation((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.filter((m) => m.id !== optimistic.id),
        };
      });
      setMessageText(body);
    } finally {
      setSending(false);
    }
  };

  if (selectedConversation) {
    return (
      <SafeAreaView style={tw`flex-1 bg-white`} edges={['top']}>
        <KeyboardAvoidingView
          style={tw`flex-1`}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <View style={tw`flex-row items-center justify-between px-4 py-3 border-b border-stone-200 bg-white`}>
            <TouchableOpacity onPress={() => setSelectedConversation(null)} style={tw`mr-3`}>
              <Ionicons name="arrow-back" size={24} color="#374151" />
            </TouchableOpacity>
            <View style={tw`flex-row items-center flex-1`}>
              <View style={tw`w-10 h-10 rounded-full bg-stone-100 items-center justify-center mr-3 overflow-hidden`}>
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
                <Text style={tw`font-semibold text-stone-900`}>{selectedConversation.peer.username}</Text>
                <Text style={tw`text-xs text-stone-500`}>Friend</Text>
              </View>
            </View>
          </View>

          {loadingMessages ? (
            <View style={tw`flex-1 items-center justify-center`}>
              <ActivityIndicator color="#10B981" />
            </View>
          ) : (
            <FlatList
              data={selectedConversation.messages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={tw`p-4`}
              renderItem={({ item }) => (
                <View style={tw`mb-2 flex-row ${item.is_own ? 'justify-end' : 'justify-start'}`}>
                  <View
                    style={tw`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                      item.is_own ? 'bg-brand-500 rounded-tr-sm' : 'bg-stone-100 rounded-tl-sm'
                    } shadow-sm`}
                  >
                    <Text style={tw`text-base ${item.is_own ? 'text-white' : 'text-stone-900'}`}>
                      {item.body}
                    </Text>
                    <Text
                      style={tw`text-xs mt-1 text-right ${
                        item.is_own ? 'text-brand-100' : 'text-stone-500'
                      }`}
                    >
                      {formatMessageTime(item.created_at)}
                    </Text>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <View style={tw`items-center py-12`}>
                  <Text style={tw`text-stone-500`}>No messages yet. Say hello!</Text>
                </View>
              }
            />
          )}

          <View style={tw`border-t border-stone-200 bg-white px-4 py-3`}>
            <View style={tw`flex-row items-end`}>
              <View style={tw`flex-1 bg-stone-100 rounded-full px-4 py-2.5 max-h-24 mr-2`}>
                <TextInput
                  ref={messageInputRef}
                  placeholder="Message..."
                  value={messageText}
                  onChangeText={setMessageText}
                  multiline
                  style={tw`text-base text-stone-900`}
                  placeholderTextColor="#9CA3AF"
                  returnKeyType="default"
                  blurOnSubmit={false}
                />
              </View>
              {messageText.trim() ? (
                <TouchableOpacity
                  onPress={() => void handleSendMessage()}
                  disabled={sending}
                  style={tw`bg-brand-500 rounded-full w-10 h-10 items-center justify-center mb-1 ${
                    sending ? 'opacity-60' : ''
                  }`}
                >
                  <Ionicons name="send" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => {
                    messageInputRef.current?.blur();
                    Keyboard.dismiss();
                  }}
                  style={tw`px-3 py-1.5 bg-brand-100 rounded-full mb-1`}
                >
                  <Text style={tw`text-xs text-brand-700 font-semibold`}>Done</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={tw`flex-1 bg-white`}>
      <View style={tw`flex-1`}>
        <View style={tw`px-4 pt-4 pb-3 border-b border-stone-200 bg-white`}>
          <View style={tw`flex-row items-center justify-between mb-4`}>
            <View style={tw`flex-row items-center flex-1`}>
              <TouchableOpacity
                onPress={() => {
                  const rootNavigation = navigation.getParent() || navigation;
                  if (rootNavigation.canGoBack()) {
                    rootNavigation.goBack();
                  } else {
                    rootNavigation.navigate('Individual' as never);
                  }
                }}
                style={tw`mr-3`}
              >
                <Ionicons name="arrow-back" size={24} color="#374151" />
              </TouchableOpacity>
              <Text style={tw`text-3xl font-bold text-brand-600`}>Messages</Text>
            </View>
          </View>

          {groupedStories.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={tw`mb-4`}
              contentContainerStyle={tw`px-2`}
            >
              {groupedStories.map((group) => {
                const { user: storyUser, stories: userStories } = group;
                const allViewed = userStories.every((s) => s.hasViewed);
                const storyCount = userStories.length;

                return (
                  <TouchableOpacity
                    key={storyUser.userId}
                    style={tw`items-center mr-4`}
                    onPress={() => {
                      const rootNavigation = navigation.getParent() || navigation;
                      const fullStories = userStories.map((s, idx) => ({
                        ...s,
                        image: getStoryImageUrl(s.userId, s.id),
                        createdAt: new Date(Date.now() - (userStories.length - idx) * 3600000).toISOString(),
                        views: 0,
                      }));
                      rootNavigation.navigate('StoryViewer' as never, {
                        stories: fullStories,
                        initialIndex: 0,
                        onStoriesUpdate: (updatedStories: typeof fullStories) => {
                          const viewedIds = updatedStories.filter((us) => us.hasViewed).map((us) => us.id);
                          if (viewedIds.length > 0) {
                            Promise.all(viewedIds.map((id) => viewStory(id))).catch(() => undefined);
                          }
                          setStories((prev) =>
                            prev.map((s) => {
                              const updated = updatedStories.find((us) => us.id === s.id);
                              return updated ? { ...s, hasViewed: updated.hasViewed } : s;
                            })
                          );
                        },
                      } as never);
                    }}
                  >
                    <View style={tw`relative`}>
                      <View
                        style={tw`w-16 h-16 rounded-full border-2 ${
                          allViewed ? 'border-stone-300' : 'border-purple-500'
                        } items-center justify-center bg-purple-100 p-0.5`}
                      >
                        <View style={tw`w-full h-full rounded-full bg-white items-center justify-center overflow-hidden`}>
                          <Image
                            source={{ uri: storyUser.avatar }}
                            style={tw`w-full h-full`}
                            contentFit="cover"
                          />
                        </View>
                      </View>
                      {storyCount > 1 ? (
                        <View
                          style={tw`absolute -top-1 -right-1 bg-purple-600 rounded-full w-5 h-5 items-center justify-center border-2 border-white`}
                        >
                          <Text style={tw`text-white text-xs font-bold`}>{storyCount}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={tw`text-xs text-stone-600 mt-1 max-w-16`} numberOfLines={1}>
                      {storyUser.username}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}

          <View style={tw`flex-row border-b border-stone-200`}>
            {sections.map((section) => (
              <TouchableOpacity
                key={section}
                onPress={() => setActiveSection(section)}
                style={tw`flex-1 py-3 items-center border-b-2 ${
                  activeSection === section ? 'border-green-600' : 'border-transparent'
                }`}
              >
                <Text
                  style={tw`text-sm font-medium ${
                    activeSection === section ? 'text-brand-600' : 'text-stone-500'
                  }`}
                >
                  {section}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {activeSection !== 'Individual' ? (
          <View style={tw`flex-1 items-center justify-center px-8`}>
            <Ionicons name="chatbubbles-outline" size={64} color="#D1D5DB" />
            <Text style={tw`text-stone-700 mt-4 text-center font-semibold text-lg`}>
              {activeSection} messaging coming soon
            </Text>
            <Text style={tw`text-stone-500 mt-2 text-center`}>
              Friend-to-friend chat is live under Individual. Store and instructor inboxes will ship in a later sprint.
            </Text>
          </View>
        ) : loadingConversations ? (
          <View style={tw`flex-1 items-center justify-center`}>
            <ActivityIndicator color="#10B981" size="large" />
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.id}
            contentContainerStyle={tw`px-4`}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => void openConversation(item)}
                style={tw`flex-row items-center py-4 border-b border-stone-100`}
              >
                <View style={tw`w-14 h-14 rounded-full bg-stone-100 items-center justify-center overflow-hidden`}>
                  <Image
                    source={{
                      uri: getAvatarUrl(item.peer.id, item.peer.username, item.peer.avatar),
                    }}
                    style={tw`w-full h-full`}
                    contentFit="cover"
                  />
                </View>
                <View style={tw`flex-1 ml-3`}>
                  <View style={tw`flex-row items-center justify-between mb-1`}>
                    <Text style={tw`font-semibold text-stone-900`}>{item.peer.username}</Text>
                    <Text style={tw`text-xs text-stone-500`}>
                      {formatRelativeTime(item.last_message_at)}
                    </Text>
                  </View>
                  <Text style={tw`text-sm text-stone-600`} numberOfLines={1}>
                    {item.last_message || 'Start a conversation'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#D1D5DB" style={tw`ml-2`} />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={tw`items-center justify-center py-12 px-6`}>
                <Ionicons name="chatbubbles-outline" size={64} color="#D1D5DB" />
                <Text style={tw`text-stone-700 mt-4 text-center font-semibold text-lg`}>
                  No conversations yet
                </Text>
                <Text style={tw`text-stone-500 mt-2 text-center`}>
                  Message a friend from their profile. Only mutual friends can chat here.
                </Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}
