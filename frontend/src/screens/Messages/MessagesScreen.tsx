import React, { useState, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, ScrollView, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../state/useAuthStore';
import { getAvatarUrl } from '../../utils/images';
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

type ChatMessage = {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  message: string;
  timestamp: string;
  isOwn: boolean;
  status: 'sending' | 'sent' | 'delivered' | 'seen';
};

type Conversation = {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  lastMessage: string;
  timestamp: string;
  hasUnread: boolean;
  messages: ChatMessage[];
  type: MessageType;
};

// Mock Stories
const MOCK_STORIES: Story[] = [
  { id: '1', userId: 'u1', username: 'John', avatar: getAvatarUrl('u1', 'John'), hasViewed: false },
  { id: '2', userId: 'u2', username: 'Sarah', avatar: getAvatarUrl('u2', 'Sarah'), hasViewed: true },
  { id: '3', userId: 'u3', username: 'Mike', avatar: getAvatarUrl('u3', 'Mike'), hasViewed: false },
  { id: '4', userId: 'u4', username: 'Emma', avatar: getAvatarUrl('u4', 'Emma'), hasViewed: true },
  { id: '5', userId: 'u5', username: 'Alex', avatar: getAvatarUrl('u5', 'Alex'), hasViewed: false },
];

// Mock Conversations
const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: '1',
    userId: 'u1',
    username: 'John',
    avatar: getAvatarUrl('u1', 'John'),
    lastMessage: 'Great progress on your workout!',
    timestamp: '2h',
    hasUnread: true,
    type: 'Individual',
    messages: [
      { id: 'm1', userId: 'u1', username: 'John', avatar: getAvatarUrl('u1', 'John'), message: 'Hey! How are you doing?', timestamp: '10:30 AM', isOwn: false, status: 'seen' },
      { id: 'm2', userId: 'me', username: 'You', avatar: getAvatarUrl('me', 'You'), message: 'Great! Thanks for asking', timestamp: '10:32 AM', isOwn: true, status: 'seen' },
      { id: 'm3', userId: 'u1', username: 'John', avatar: getAvatarUrl('u1', 'John'), message: 'Great progress on your workout!', timestamp: '10:35 AM', isOwn: false, status: 'seen' },
    ],
  },
  {
    id: '2',
    userId: 's1',
    username: 'Fitness Store',
    avatar: getAvatarUrl('s1', 'Fitness Store'),
    lastMessage: 'Your order has been shipped!',
    timestamp: '5h',
    hasUnread: false,
    type: 'Store',
    messages: [
      { id: 'm4', userId: 's1', username: 'Fitness Store', avatar: getAvatarUrl('s1', 'Fitness Store'), message: 'Your order has been shipped!', timestamp: '9:00 AM', isOwn: false, status: 'seen' },
      { id: 'm5', userId: 'me', username: 'You', avatar: getAvatarUrl('me', 'You'), message: 'Great, thanks!', timestamp: '9:15 AM', isOwn: true, status: 'delivered' },
    ],
  },
  {
    id: '3',
    userId: 'i1',
    username: 'Coach Sarah',
    avatar: getAvatarUrl('i1', 'Coach Sarah'),
    lastMessage: 'Keep up the great work!',
    timestamp: '1d',
    hasUnread: true,
    type: 'Instructor',
    messages: [
      { id: 'm6', userId: 'i1', username: 'Coach Sarah', avatar: getAvatarUrl('i1', 'Coach Sarah'), message: 'Keep up the great work!', timestamp: 'Yesterday', isOwn: false, status: 'seen' },
    ],
  },
  {
    id: '4',
    userId: 'u2',
    username: 'Sarah',
    avatar: getAvatarUrl('u2', 'Sarah'),
    lastMessage: 'See you tomorrow!',
    timestamp: '2d',
    hasUnread: false,
    type: 'Individual',
    messages: [
      { id: 'm7', userId: 'u2', username: 'Sarah', avatar: getAvatarUrl('u2', 'Sarah'), message: 'See you tomorrow!', timestamp: '2 days ago', isOwn: false, status: 'seen' },
    ],
  },
];

export default function MessagesScreen() {
  const [activeSection, setActiveSection] = useState<MessageType>('Individual');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messageText, setMessageText] = useState('');
  const messageInputRef = useRef<TextInput>(null);
  const { user } = useAuthStore();

  const sections: MessageType[] = ['Individual', 'Store', 'Instructor'];

  const filteredConversations = MOCK_CONVERSATIONS.filter((conv) => conv.type === activeSection);

  const handleSendMessage = () => {
    if (!messageText.trim() || !selectedConversation) return;

    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      userId: 'me',
      username: 'You',
      avatar: '👋',
      message: messageText.trim(),
      timestamp: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
      isOwn: true,
      status: 'sending',
    };

    // In real app, this would update via API
    // For now, just update locally
    setSelectedConversation({
      ...selectedConversation,
      messages: [...selectedConversation.messages, newMessage],
      lastMessage: newMessage.message,
      timestamp: 'now',
    });

    setMessageText('');

    // Simulate message status updates
    setTimeout(() => {
      setSelectedConversation((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map((msg) =>
            msg.id === newMessage.id ? { ...msg, status: 'sent' } : msg
          ),
        };
      });
    }, 500);

    setTimeout(() => {
      setSelectedConversation((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map((msg) =>
            msg.id === newMessage.id ? { ...msg, status: 'delivered' } : msg
          ),
        };
      });
    }, 1500);

    setTimeout(() => {
      setSelectedConversation((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map((msg) =>
            msg.id === newMessage.id ? { ...msg, status: 'seen' } : msg
          ),
        };
      });
    }, 3000);
  };

  if (selectedConversation) {
    // Chat view
    return (
      <SafeAreaView style={tw`flex-1 bg-white`} edges={['top']}>
        <KeyboardAvoidingView
          style={tw`flex-1`}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
        {/* Chat Header */}
        <View style={tw`flex-row items-center justify-between px-4 py-3 border-b border-gray-200 bg-white`}>
          <TouchableOpacity onPress={() => setSelectedConversation(null)} style={tw`mr-3`}>
            <Ionicons name="arrow-back" size={24} color="#374151" />
          </TouchableOpacity>
          <View style={tw`flex-row items-center flex-1`}>
            <View style={tw`w-10 h-10 rounded-full bg-gray-100 items-center justify-center mr-3`}>
              <Image
                source={{ uri: selectedConversation.avatar }}
                style={tw`w-full h-full rounded-full`}
                contentFit="cover"
              />
            </View>
            <View style={tw`flex-1`}>
              <Text style={tw`font-semibold text-gray-900`}>{selectedConversation.username}</Text>
              <Text style={tw`text-xs text-gray-500`}>Active now</Text>
            </View>
          </View>
          <TouchableOpacity>
            <Ionicons name="call-outline" size={22} color="#374151" />
          </TouchableOpacity>
          <TouchableOpacity style={tw`ml-3`}>
            <Ionicons name="videocam-outline" size={24} color="#374151" />
          </TouchableOpacity>
        </View>

        {/* Messages List */}
        <FlatList
          data={selectedConversation.messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={tw`p-4`}
          inverted={false}
          renderItem={({ item }) => (
            <View
              style={tw`mb-2 flex-row ${item.isOwn ? 'justify-end' : 'justify-start'}`}
            >
              <View
                style={tw`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                  item.isOwn
                    ? 'bg-green-500 rounded-tr-sm'
                    : 'bg-gray-100 rounded-tl-sm'
                } shadow-sm`}
              >
                {!item.isOwn && (
                  <Text style={tw`text-xs font-semibold text-gray-700 mb-1`}>
                    {item.username}
                  </Text>
                )}
                <Text
                  style={tw`text-base ${
                    item.isOwn ? 'text-white' : 'text-gray-900'
                  }`}
                >
                  {item.message}
                </Text>
                <View style={tw`flex-row items-center justify-end mt-1`}>
                  <Text
                    style={tw`text-xs ${
                      item.isOwn ? 'text-green-100' : 'text-gray-500'
                    } mr-1`}
                  >
                    {item.timestamp}
                  </Text>
                  {item.isOwn && (
                    <View style={tw`ml-1`}>
                      {item.status === 'sending' && (
                        <Ionicons name="time-outline" size={12} color="#FFFFFF" style={tw`opacity-70`} />
                      )}
                      {item.status === 'sent' && (
                        <Ionicons name="checkmark" size={12} color="#FFFFFF" style={tw`opacity-70`} />
                      )}
                      {item.status === 'delivered' && (
                        <View style={tw`flex-row`}>
                          <Ionicons name="checkmark" size={12} color="#FFFFFF" style={tw`opacity-70`} />
                          <Ionicons name="checkmark" size={12} color="#FFFFFF" style={tw`opacity-70 ml-[-4px]`} />
                        </View>
                      )}
                      {item.status === 'seen' && (
                        <View style={tw`flex-row`}>
                          <Ionicons name="checkmark" size={12} color="#4ADE80" />
                          <Ionicons name="checkmark" size={12} color="#4ADE80" style={tw`ml-[-4px]`} />
                        </View>
                      )}
                    </View>
                  )}
                </View>
              </View>
            </View>
          )}
        />

        {/* Message Input */}
        <View style={tw`border-t border-gray-200 bg-white px-4 py-3`}>
          <View style={tw`flex-row items-end`}>
            <TouchableOpacity style={tw`mr-2 mb-1`}>
              <Ionicons name="add-circle-outline" size={28} color="#10B981" />
            </TouchableOpacity>
            <View style={tw`flex-1 bg-gray-100 rounded-full px-4 py-2.5 max-h-24 mr-2`}>
              <TextInput
                ref={messageInputRef}
                placeholder="Message..."
                value={messageText}
                onChangeText={setMessageText}
                multiline
                style={tw`text-base text-gray-900`}
                placeholderTextColor="#9CA3AF"
                returnKeyType="default"
                blurOnSubmit={false}
              />
            </View>
            {messageText.trim() ? (
              <TouchableOpacity
                onPress={handleSendMessage}
                style={tw`bg-green-500 rounded-full w-10 h-10 items-center justify-center mb-1`}
              >
                <Ionicons name="send" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity style={tw`mr-2 mb-1`}>
                  <Ionicons name="camera-outline" size={28} color="#10B981" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    messageInputRef.current?.blur();
                    Keyboard.dismiss();
                  }}
                  style={tw`px-3 py-1.5 bg-green-100 rounded-full mb-1`}
                >
                  <Text style={tw`text-xs text-green-700 font-semibold`}>Done</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // Messages list view
  return (
    <SafeAreaView style={tw`flex-1 bg-white`}>
      <View style={tw`flex-1`}>
        {/* Header */}
        <View style={tw`px-4 pt-4 pb-3 border-b border-gray-200 bg-white`}>
          <View style={tw`flex-row items-center justify-between mb-4`}>
            <Text style={tw`text-3xl font-bold text-green-600`}>Messages</Text>
            <TouchableOpacity>
              <Ionicons name="create-outline" size={28} color="#10B981" />
            </TouchableOpacity>
          </View>

          {/* Stories Section */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={tw`mb-4`}
            contentContainerStyle={tw`px-2`}
          >
            {MOCK_STORIES.map((story) => (
              <TouchableOpacity
                key={story.id}
                style={tw`items-center mr-4`}
                onPress={() => {
                  // Navigate to story view
                  console.log('Open story:', story.username);
                }}
              >
                <View
                  style={tw`w-16 h-16 rounded-full border-2 ${
                    story.hasViewed ? 'border-gray-300' : 'border-purple-500'
                  } items-center justify-center bg-purple-100 p-0.5`}
                >
                  <View style={tw`w-full h-full rounded-full bg-white items-center justify-center`}>
                    <Image
                      source={{ uri: story.avatar }}
                      style={tw`w-full h-full rounded-full`}
                      contentFit="cover"
                    />
                  </View>
                </View>
                <Text style={tw`text-xs text-gray-600 mt-1 max-w-16`} numberOfLines={1}>
                  {story.username}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={tw`items-center justify-center w-16 h-16 rounded-full border-2 border-dashed border-gray-300`}
            >
              <Ionicons name="add" size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </ScrollView>

          {/* Section Tabs */}
          <View style={tw`flex-row border-b border-gray-200`}>
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
                    activeSection === section ? 'text-green-600' : 'text-gray-500'
                  }`}
                >
                  {section}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Conversations List */}
        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={tw`px-4`}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => setSelectedConversation(item)}
              style={tw`flex-row items-center py-4 border-b border-gray-100`}
            >
              <View style={tw`relative`}>
                <View style={tw`w-14 h-14 rounded-full bg-gray-100 items-center justify-center`}>
                  <Image
                    source={{ uri: item.avatar }}
                    style={tw`w-full h-full rounded-full`}
                    contentFit="cover"
                  />
                </View>
                {item.hasUnread && (
                  <View style={tw`absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-white`} />
                )}
              </View>
              <View style={tw`flex-1 ml-3`}>
                <View style={tw`flex-row items-center justify-between mb-1`}>
                  <Text style={tw`font-semibold text-gray-900`}>{item.username}</Text>
                  <Text style={tw`text-xs text-gray-500`}>{item.timestamp}</Text>
                </View>
                <View style={tw`flex-row items-center`}>
                  <Text
                    style={tw`text-sm text-gray-600 flex-1 ${item.hasUnread ? 'font-semibold' : ''}`}
                    numberOfLines={1}
                  >
                    {item.lastMessage}
                  </Text>
                </View>
              </View>
              <TouchableOpacity style={tw`ml-2`}>
                <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={tw`items-center justify-center py-12`}>
              <Ionicons name="chatbubbles-outline" size={64} color="#D1D5DB" />
              <Text style={tw`text-gray-500 mt-4 text-center`}>
                No {activeSection.toLowerCase()} messages yet
              </Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}

