import React, { useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../state/useAuthStore';
import CATEGORIES from '../../data/categories';
import tw from '../../lib/tw';

type Message = {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  hasUnread: boolean;
  lastMessage?: string;
  timestamp: string;
};

type Post = {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  image: string;
  caption: string;
  category: string;
  subcategory?: string;
  likes: number;
  comments: number;
  timestamp: string;
  hasLiked: boolean;
};

// Mock data - in real app, this would come from API
const MOCK_MESSAGES: Message[] = [
  { id: '1', userId: 'u1', username: 'John', avatar: '👤', hasUnread: true, lastMessage: 'Great progress!', timestamp: '2h' },
  { id: '2', userId: 'u2', username: 'Sarah', avatar: '👩', hasUnread: false, lastMessage: 'Keep it up!', timestamp: '5h' },
  { id: '3', userId: 'u3', username: 'Mike', avatar: '👨', hasUnread: true, lastMessage: 'Nice work!', timestamp: '1d' },
];

const MOCK_POSTS: Post[] = [
  {
    id: '1',
    userId: 'u1',
    username: 'John',
    avatar: '👤',
    image: '🏋️',
    caption: 'Day 15 of my fitness journey! Feeling stronger every day 💪',
    category: 'fitness',
    subcategory: 'losing-weight',
    likes: 42,
    comments: 8,
    timestamp: '2h ago',
    hasLiked: false,
  },
  {
    id: '2',
    userId: 'u2',
    username: 'Sarah',
    avatar: '👩',
    image: '🎹',
    caption: 'Practiced piano for 2 hours today. Progress is slow but steady 🎵',
    category: 'art',
    subcategory: 'piano',
    likes: 28,
    comments: 5,
    timestamp: '4h ago',
    hasLiked: true,
  },
  {
    id: '3',
    userId: 'u3',
    username: 'Mike',
    avatar: '👨',
    image: '🧘',
    caption: 'Morning meditation session complete. Starting the day with clarity ✨',
    category: 'mindset',
    subcategory: 'meditation',
    likes: 35,
    comments: 12,
    timestamp: '6h ago',
    hasLiked: false,
  },
];

export default function FeedScreen({ navigation, route }: any) {
  const { user } = useAuthStore();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [posts, setPosts] = useState<Post[]>(MOCK_POSTS);

  // Check if user posted today
  const hasPostedToday = useMemo(() => {
    // In real app, check against API
    return false; // Mock: user hasn't posted today
  }, []);

  const filteredPosts = useMemo(() => {
    if (!selectedCategory) return posts;
    return posts.filter((post) => {
      if (selectedCategory.includes(':')) {
        const [cat, sub] = selectedCategory.split(':');
        return post.category === cat && post.subcategory === sub;
      }
      return post.category === selectedCategory;
    });
  }, [posts, selectedCategory]);

  const userCategories = useMemo(() => {
    return user?.categories || [];
  }, [user?.categories]);

  const onRefresh = async () => {
    setRefreshing(true);
    // In real app, fetch new posts from API
    setTimeout(() => setRefreshing(false), 1000);
  };

  const toggleLike = (postId: string) => {
    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? { ...post, hasLiked: !post.hasLiked, likes: post.hasLiked ? post.likes - 1 : post.likes + 1 }
          : post
      )
    );
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-white`}>
      <View style={tw`flex-1`}>
        {/* Header with Category Selector */}
        <View style={tw`px-4 pt-2 pb-3 border-b border-gray-200 bg-white`}>
          <View style={tw`flex-row items-center justify-between mb-3`}>
            <Text style={tw`text-2xl font-bold text-green-600`}>Grow!</Text>
            <TouchableOpacity onPress={() => {
              // Navigate to Post screen in root navigator
              const rootNavigation = navigation.getParent() || navigation;
              rootNavigation.navigate('Post');
            }}>
              <Ionicons name="add-circle-outline" size={28} color="#10B981" />
            </TouchableOpacity>
          </View>

          {/* Messages Section (Instagram-style) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={tw`mb-3`}
            contentContainerStyle={tw`px-2`}
          >
            {MOCK_MESSAGES.map((msg) => (
              <TouchableOpacity
                key={msg.id}
                style={tw`items-center mr-4`}
                onPress={() => {
                  // Navigate to messages
                  alert(`Open chat with ${msg.username}`);
                }}
              >
                <View
                  style={tw`w-16 h-16 rounded-full border-2 ${
                    msg.hasUnread ? 'border-green-500' : 'border-gray-300'
                  } items-center justify-center bg-gray-100`}
                >
                  <Text style={tw`text-3xl`}>{msg.avatar}</Text>
                  {msg.hasUnread && (
                    <View style={tw`absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white`} />
                  )}
                </View>
                <Text style={tw`text-xs text-gray-600 mt-1 max-w-16`} numberOfLines={1}>
                  {msg.username}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={tw`items-center justify-center w-16 h-16 rounded-full border-2 border-dashed border-gray-300`}
              onPress={() => {
                // Navigate to all messages
                alert('Open all messages');
              }}
            >
              <Ionicons name="add" size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </ScrollView>

          {/* Category Selector */}
          {userCategories.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={tw`px-2`}
            >
              <TouchableOpacity
                onPress={() => setSelectedCategory(null)}
                style={tw`px-4 py-2 rounded-full mr-2 ${
                  selectedCategory === null ? 'bg-green-600' : 'bg-gray-100'
                }`}
              >
                <Text
                  style={tw`text-sm font-medium ${
                    selectedCategory === null ? 'text-white' : 'text-gray-700'
                  }`}
                >
                  All
                </Text>
              </TouchableOpacity>
              {userCategories.map((cat) => {
                const category = CATEGORIES.find((c) => c.key === cat || c.key === cat.split(':')[0]);
                const subcategory = cat.includes(':')
                  ? category?.subcategories.find((s) => s.key === cat.split(':')[1])
                  : null;
                const label = subcategory ? subcategory.label : category?.label || cat;

                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setSelectedCategory(cat)}
                    style={tw`px-4 py-2 rounded-full mr-2 ${
                      selectedCategory === cat ? 'bg-green-600' : 'bg-gray-100'
                    }`}
                  >
                    <Text
                      style={tw`text-sm font-medium ${
                        selectedCategory === cat ? 'text-white' : 'text-gray-700'
                      }`}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* Daily Post Reminder */}
        {!hasPostedToday && (
          <View style={tw`bg-yellow-50 border-b border-yellow-200 px-4 py-3`}>
            <View style={tw`flex-row items-center`}>
              <Ionicons name="information-circle" size={20} color="#F59E0B" />
              <Text style={tw`text-sm text-yellow-800 ml-2 flex-1`}>
                Post at least once today to see what others are doing!
              </Text>
              <TouchableOpacity onPress={() => {
                const rootNavigation = navigation.getParent() || navigation;
                rootNavigation.navigate('Post');
              }}>
                <Text style={tw`text-sm font-semibold text-yellow-900`}>Post Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Posts Feed */}
        <FlatList
          data={filteredPosts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={tw`p-4`}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <View style={tw`bg-white border border-gray-200 rounded-xl mb-4 overflow-hidden shadow-sm`}>
              {/* Post Header */}
              <View style={tw`flex-row items-center justify-between p-3 border-b border-gray-100`}>
                <View style={tw`flex-row items-center`}>
                  <View style={tw`w-10 h-10 rounded-full bg-gray-100 items-center justify-center mr-3`}>
                    <Text style={tw`text-xl`}>{item.avatar}</Text>
                  </View>
                  <View>
                    <Text style={tw`font-semibold text-gray-900`}>{item.username}</Text>
                    <Text style={tw`text-xs text-gray-500`}>{item.timestamp}</Text>
                  </View>
                </View>
                <TouchableOpacity>
                  <Ionicons name="ellipsis-horizontal" size={20} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {/* Post Image */}
              <View style={tw`w-full h-64 bg-gray-100 items-center justify-center`}>
                <Text style={tw`text-6xl`}>{item.image}</Text>
              </View>

              {/* Post Actions */}
              <View style={tw`p-3`}>
                <View style={tw`flex-row items-center mb-2`}>
                  <TouchableOpacity onPress={() => toggleLike(item.id)} style={tw`mr-4`}>
                    <Ionicons
                      name={item.hasLiked ? 'heart' : 'heart-outline'}
                      size={24}
                      color={item.hasLiked ? '#EF4444' : '#6B7280'}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity style={tw`mr-4`}>
                    <Ionicons name="chatbubble-outline" size={24} color="#6B7280" />
                  </TouchableOpacity>
                  <TouchableOpacity>
                    <Ionicons name="share-outline" size={24} color="#6B7280" />
                  </TouchableOpacity>
                </View>

                <Text style={tw`font-semibold text-gray-900 mb-1`}>{item.likes} likes</Text>
                <Text style={tw`text-gray-900 mb-1`}>
                  <Text style={tw`font-semibold`}>{item.username}</Text> {item.caption}
                </Text>
                {item.comments > 0 && (
                  <TouchableOpacity>
                    <Text style={tw`text-gray-500 text-sm`}>View all {item.comments} comments</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={tw`items-center justify-center py-12`}>
              <Ionicons name="images-outline" size={64} color="#D1D5DB" />
              <Text style={tw`text-gray-500 mt-4 text-center`}>
                No posts yet. Be the first to post in this category!
              </Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}

