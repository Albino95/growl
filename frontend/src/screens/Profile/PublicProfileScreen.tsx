import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, FlatList, ActivityIndicator, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useAuth } from '../../store/hooks';
import CATEGORIES from '../../data/categories';
import tw from '../../lib/tw';

type Post = {
  id: string;
  image: string;
  caption: string;
  likes: number;
  comments: number;
  createdAt: string;
  category: string;
};

type Story = {
  id: string;
  image: string;
  createdAt: string;
  views: number;
};

type JournalEntry = {
  id: string;
  date: string;
  content: string;
  isPublic: boolean;
  mood?: string;
  tags?: string[];
};

type PublicUser = {
  id: string;
  username: string;
  avatar: string;
  points: number;
  isInstructor: boolean;
  categories: string[];
  postsCount: number;
  storiesCount: number;
};

type RouteParams = {
  PublicProfile: {
    userId: string;
  };
};

// Mock function - in real app, this would fetch from API
async function fetchPublicProfile(userId: string): Promise<PublicUser> {
  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Mock data based on userId
  const mockUsers: Record<string, PublicUser> = {
    'u1': {
      id: 'u1',
      username: 'John',
      avatar: '👤',
      points: 250,
      isInstructor: false,
      categories: ['fitness', 'mindset'],
      postsCount: 15,
      storiesCount: 8,
    },
    'u2': {
      id: 'u2',
      username: 'Sarah',
      avatar: '👩',
      points: 450,
      isInstructor: true,
      categories: ['art', 'music'],
      postsCount: 32,
      storiesCount: 12,
    },
    'u3': {
      id: 'u3',
      username: 'Mike',
      avatar: '👨',
      points: 180,
      isInstructor: false,
      categories: ['mindset', 'fitness'],
      postsCount: 9,
      storiesCount: 5,
    },
  };
  
  return mockUsers[userId] || {
    id: userId,
    username: 'User',
    avatar: '👤',
    points: 0,
    isInstructor: false,
    categories: [],
    postsCount: 0,
    storiesCount: 0,
  };
}

// Mock function to fetch user posts
async function fetchUserPosts(userId: string): Promise<Post[]> {
  await new Promise(resolve => setTimeout(resolve, 300));
  
  const mockPosts: Record<string, Post[]> = {
    'u1': [
      {
        id: '1',
        image: '🏋️',
        caption: 'Day 15 of my fitness journey!',
        likes: 42,
        comments: 8,
        createdAt: '2024-01-10',
        category: 'fitness',
      },
      {
        id: '2',
        image: '💪',
        caption: 'Feeling stronger every day',
        likes: 28,
        comments: 5,
        createdAt: '2024-01-12',
        category: 'fitness',
      },
    ],
    'u2': [
      {
        id: '3',
        image: '🎹',
        caption: 'Practiced piano for 2 hours today',
        likes: 35,
        comments: 12,
        createdAt: '2024-01-14',
        category: 'art',
      },
    ],
    'u3': [
      {
        id: '4',
        image: '🧘',
        caption: 'Morning meditation session',
        likes: 25,
        comments: 6,
        createdAt: '2024-01-15',
        category: 'mindset',
      },
    ],
  };
  
  return mockPosts[userId] || [];
}

// Mock function to fetch user stories
async function fetchUserStories(userId: string): Promise<Story[]> {
  await new Promise(resolve => setTimeout(resolve, 300));
  
  const mockStories: Record<string, Story[]> = {
    'u1': [
      { id: '1', image: '🌱', createdAt: '2024-01-15', views: 120 },
      { id: '2', image: '🏃', createdAt: '2024-01-14', views: 89 },
    ],
    'u2': [
      { id: '3', image: '📚', createdAt: '2024-01-13', views: 156 },
    ],
    'u3': [],
  };
  
  return mockStories[userId] || [];
}

// Mock function to fetch public journal entries
async function fetchPublicJournalEntries(userId: string): Promise<JournalEntry[]> {
  await new Promise(resolve => setTimeout(resolve, 300));
  
  const mockJournalEntries: Record<string, JournalEntry[]> = {
    'u1': [
      {
        id: '1',
        date: '2024-01-15',
        content: 'Had a great workout today! Feeling motivated and strong.',
        isPublic: true,
        mood: 'excited',
        tags: ['fitness', 'progress'],
      },
      {
        id: '2',
        date: '2024-01-13',
        content: 'Completed my first week of consistent practice. Proud of the progress!',
        isPublic: true,
        mood: 'proud',
        tags: ['milestone'],
      },
    ],
    'u2': [
      {
        id: '3',
        date: '2024-01-14',
        content: 'Practiced piano for 2 hours. The progress is slow but steady. Every day counts!',
        isPublic: true,
        mood: 'determined',
        tags: ['art', 'music'],
      },
    ],
    'u3': [
      {
        id: '4',
        date: '2024-01-15',
        content: 'Morning meditation session complete. Starting the day with clarity and peace.',
        isPublic: true,
        mood: 'peaceful',
        tags: ['mindset'],
      },
    ],
  };
  
  return mockJournalEntries[userId] || [];
}

export default function PublicProfileScreen() {
  const { user: currentUser } = useAuth();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'PublicProfile'>>();
  const { userId } = route.params;
  
  const [loading, setLoading] = useState(true);
  const [profileUser, setProfileUser] = useState<PublicUser | null>(null);
  const [activeTab, setActiveTab] = useState<'posts' | 'stories' | 'journal'>('posts');
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [loadingContent, setLoadingContent] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  
  const isOwnProfile = currentUser?.id === userId;

  useEffect(() => {
    loadProfile();
  }, [userId]);

  useEffect(() => {
    if (profileUser) {
      loadContent();
    }
  }, [profileUser, activeTab]);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const userData = await fetchPublicProfile(userId);
      setProfileUser(userData);
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadContent = async () => {
    if (!profileUser) return;
    
    try {
      setLoadingContent(true);
      if (activeTab === 'posts') {
        const userPosts = await fetchUserPosts(userId);
        setPosts(userPosts);
      } else if (activeTab === 'stories') {
        const userStories = await fetchUserStories(userId);
        setStories(userStories);
      } else if (activeTab === 'journal') {
        const entries = await fetchPublicJournalEntries(userId);
        setJournalEntries(entries);
      }
    } catch (error) {
      console.error('Error loading content:', error);
    } finally {
      setLoadingContent(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={tw`flex-1 bg-white`}>
        <View style={tw`flex-1 items-center justify-center`}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={tw`text-gray-500 mt-4`}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!profileUser) {
    return (
      <SafeAreaView style={tw`flex-1 bg-white`}>
        <View style={tw`flex-1 items-center justify-center px-4`}>
          <Ionicons name="person-outline" size={64} color="#D1D5DB" />
          <Text style={tw`text-gray-500 mt-4 text-center text-lg`}>User not found</Text>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={tw`mt-4 bg-green-600 px-6 py-3 rounded-xl`}
          >
            <Text style={tw`text-white font-semibold`}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={tw`flex-1 bg-white`}>
      {/* Header with Back Button */}
      <View style={tw`px-4 pt-2 pb-3 border-b border-gray-200 bg-white flex-row items-center`}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={tw`mr-3`}
        >
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={tw`text-lg font-semibold text-gray-900 flex-1`}>
          {profileUser.username}
        </Text>
        <TouchableOpacity 
          style={tw`p-1`}
          onPress={() => setShowOptionsMenu(true)}
        >
          <Ionicons name="ellipsis-horizontal" size={24} color="#6B7280" />
        </TouchableOpacity>
      </View>

      <ScrollView style={tw`flex-1`}>
        {/* Profile Header */}
        <View style={tw`px-4 pt-6 pb-6 border-b border-gray-200`}>
          <View style={tw`flex-row items-center mb-4`}>
            <View style={tw`w-20 h-20 rounded-full bg-green-100 items-center justify-center mr-4`}>
              <Text style={tw`text-4xl`}>{profileUser.avatar}</Text>
            </View>
            <View style={tw`flex-1`}>
              <Text style={tw`text-2xl font-bold text-gray-900`}>
                {profileUser.username}
              </Text>
              {profileUser.isInstructor && (
                <View style={tw`flex-row items-center mt-1`}>
                  <Ionicons name="school" size={16} color="#10B981" />
                  <Text style={tw`text-sm text-green-600 ml-1 font-semibold`}>Instructor</Text>
                </View>
              )}
            </View>
          </View>

          {/* Stats */}
          <View style={tw`flex-row gap-3 mb-4`}>
            <View style={tw`flex-1 bg-gray-50 rounded-lg p-3`}>
              <Text style={tw`text-xs text-gray-500 mb-1`}>Posts</Text>
              <Text style={tw`text-xl font-bold text-gray-900`}>{profileUser.postsCount}</Text>
            </View>
            <View style={tw`flex-1 bg-gray-50 rounded-lg p-3`}>
              <Text style={tw`text-xs text-gray-500 mb-1`}>Stories</Text>
              <Text style={tw`text-xl font-bold text-gray-900`}>{profileUser.storiesCount}</Text>
            </View>
            <View style={tw`flex-1 bg-gray-50 rounded-lg p-3`}>
              <Text style={tw`text-xs text-gray-500 mb-1`}>Points</Text>
              <Text style={tw`text-xl font-bold text-gray-900`}>{profileUser.points}</Text>
            </View>
          </View>

          {/* Points Display */}
          <View style={tw`bg-green-500 rounded-xl p-4 shadow-lg`}>
            <View style={tw`flex-row items-center justify-between`}>
              <View>
                <Text style={tw`text-white text-sm mb-1 opacity-90`}>Total Points</Text>
                <Text style={tw`text-white text-3xl font-bold`}>{profileUser.points}</Text>
              </View>
              <Ionicons name="trophy" size={40} color="white" />
            </View>
            {!profileUser.isInstructor && (
              <View style={tw`mt-3 pt-3 border-t border-green-400`}>
                <View style={tw`flex-row items-center justify-between`}>
                  <Text style={tw`text-white text-sm`}>Points to Instructor: {500 - profileUser.points}</Text>
                  <View style={tw`flex-1 h-2 bg-green-400 rounded-full mx-3 overflow-hidden`}>
                    <View
                      style={[tw`h-full bg-white rounded-full`, { width: `${Math.min((profileUser.points / 500) * 100, 100)}%` }]}
                    />
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Categories */}
        {profileUser.categories && profileUser.categories.length > 0 && (
          <View style={tw`px-4 py-4 border-b border-gray-200`}>
            <Text style={tw`text-lg font-semibold text-gray-900 mb-3`}>Growth Areas</Text>
            <View style={tw`flex-row flex-wrap`}>
              {profileUser.categories.map((cat, index) => {
                const category = CATEGORIES.find((c) => c.key === cat || c.key === cat.split(':')[0]);
                const subcategory = cat.includes(':')
                  ? category?.subcategories.find((s) => s.key === cat.split(':')[1])
                  : null;
                const label = subcategory ? subcategory.label : category?.label || cat;
                
                return (
                  <View
                    key={index}
                    style={tw`bg-green-100 px-3 py-1.5 rounded-full mr-2 mb-2`}
                  >
                    <Text style={tw`text-sm text-green-800 font-medium`}>{label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Tabs */}
        <View style={tw`flex-row border-b border-gray-200`}>
          {[
            { key: 'posts', label: 'Posts', icon: 'grid' },
            { key: 'stories', label: 'Stories', icon: 'images' },
            { key: 'journal', label: 'Journal', icon: 'book' },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key as 'posts' | 'stories' | 'journal')}
              style={tw`flex-1 py-3 items-center border-b-2 ${
                activeTab === tab.key ? 'border-green-600' : 'border-transparent'
              }`}
            >
              <Ionicons
                name={tab.icon as any}
                size={20}
                color={activeTab === tab.key ? '#10B981' : '#9CA3AF'}
              />
              <Text
                style={tw`text-xs mt-1 ${
                  activeTab === tab.key ? 'text-green-600 font-semibold' : 'text-gray-500'
                }`}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        {loadingContent ? (
          <View style={tw`p-8 items-center justify-center`}>
            <ActivityIndicator size="large" color="#10B981" />
          </View>
        ) : activeTab === 'posts' ? (
          <View style={tw`p-4`}>
            {posts.length > 0 ? (
              posts.map((post) => (
                <TouchableOpacity
                  key={post.id}
                  style={tw`bg-white border border-gray-200 rounded-xl p-4 mb-3`}
                  onPress={() => {
                    if (!profileUser) return;
                    const rootNavigation = navigation.getParent() || navigation;
                    rootNavigation.navigate('PostDetail' as never, {
                      post: {
                        id: post.id,
                        userId: profileUser.id,
                        username: profileUser.username,
                        avatar: profileUser.avatar,
                        image: post.image,
                        caption: post.caption,
                        category: post.category,
                        likes: post.likes,
                        comments: post.comments,
                        createdAt: post.createdAt,
                        hasLiked: false,
                        reaction: null,
                      },
                    } as never);
                  }}
                >
                  <View style={tw`flex-row items-center justify-between mb-3`}>
                    <View style={tw`flex-row items-center`}>
                      <View style={tw`w-16 h-16 bg-gray-100 rounded-xl items-center justify-center mr-3`}>
                        <Text style={tw`text-3xl`}>{post.image}</Text>
                      </View>
                      <View style={tw`flex-1`}>
                        <Text style={tw`font-semibold text-gray-900`} numberOfLines={2}>
                          {post.caption}
                        </Text>
                        <Text style={tw`text-xs text-gray-500 mt-1`}>
                          {new Date(post.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={tw`flex-row items-center gap-4`}>
                    <View style={tw`flex-row items-center`}>
                      <Ionicons name="heart" size={16} color="#EF4444" />
                      <Text style={tw`text-sm text-gray-600 ml-1`}>{post.likes}</Text>
                    </View>
                    <View style={tw`flex-row items-center`}>
                      <Ionicons name="chatbubble" size={16} color="#6B7280" />
                      <Text style={tw`text-sm text-gray-600 ml-1`}>{post.comments}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              <View style={tw`items-center justify-center py-12`}>
                <Ionicons name="images-outline" size={64} color="#D1D5DB" />
                <Text style={tw`text-gray-500 mt-4 text-center`}>
                  No posts yet
                </Text>
              </View>
            )}
          </View>
        ) : activeTab === 'stories' ? (
          <View style={tw`p-4`}>
            {stories.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={tw`flex-row gap-3`}>
                  {stories.map((story) => (
                    <View key={story.id} style={tw`items-center`}>
                      <View style={tw`w-20 h-20 rounded-xl bg-gray-100 items-center justify-center mb-2 border-2 border-purple-500`}>
                        <Text style={tw`text-4xl`}>{story.image}</Text>
                      </View>
                      <Text style={tw`text-xs text-gray-500`}>
                        {story.views} views
                      </Text>
                      <Text style={tw`text-xs text-gray-400 mt-1`}>
                        {new Date(story.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <View style={tw`items-center justify-center py-12`}>
                <Ionicons name="images-outline" size={64} color="#D1D5DB" />
                <Text style={tw`text-gray-500 mt-4 text-center`}>
                  No stories yet
                </Text>
              </View>
            )}
          </View>
        ) : (
          <View style={tw`p-4`}>
            {journalEntries.length > 0 ? (
              journalEntries.map((entry) => (
                <View key={entry.id} style={tw`bg-white border border-gray-200 rounded-xl p-4 mb-3`}>
                  <View style={tw`flex-row items-center justify-between mb-2`}>
                    <Text style={tw`text-sm font-semibold text-gray-500`}>
                      {new Date(entry.date).toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </Text>
                    <View style={tw`flex-row items-center`}>
                      <Ionicons name="globe" size={16} color="#10B981" />
                      <Text style={tw`text-xs text-gray-500 ml-1`}>Public</Text>
                    </View>
                  </View>
                  <Text style={tw`text-gray-900 leading-6`}>{entry.content}</Text>
                  {entry.mood && (
                    <View style={tw`mt-2 flex-row items-center`}>
                      <Ionicons name="happy-outline" size={16} color="#6B7280" />
                      <Text style={tw`text-xs text-gray-500 ml-1`}>Mood: {entry.mood}</Text>
                    </View>
                  )}
                  {entry.tags && entry.tags.length > 0 && (
                    <View style={tw`flex-row flex-wrap mt-2`}>
                      {entry.tags.map((tag, index) => (
                        <View key={index} style={tw`bg-green-100 px-2 py-1 rounded-full mr-2 mb-1`}>
                          <Text style={tw`text-xs text-green-800`}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))
            ) : (
              <View style={tw`items-center justify-center py-12`}>
                <Ionicons name="book-outline" size={64} color="#D1D5DB" />
                <Text style={tw`text-gray-500 mt-4 text-center`}>
                  No public journal entries yet
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Options Menu Modal */}
      <Modal
        visible={showOptionsMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowOptionsMenu(false)}
      >
        <TouchableOpacity
          style={tw`flex-1 bg-black bg-opacity-50 justify-end`}
          activeOpacity={1}
          onPress={() => setShowOptionsMenu(false)}
        >
          <View style={tw`bg-white rounded-t-3xl p-4`}>
            <View style={tw`items-center mb-4`}>
              <View style={tw`w-12 h-1 bg-gray-300 rounded-full`} />
            </View>
            
            {!isOwnProfile && (
              <>
                <TouchableOpacity
                  style={tw`flex-row items-center py-4 border-b border-gray-200`}
                  onPress={() => {
                    setShowOptionsMenu(false);
                    Alert.alert(
                      'Block User',
                      `Are you sure you want to block ${profileUser?.username}? You won't be able to see their posts, stories, or journal entries.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Block',
                          style: 'destructive',
                          onPress: () => {
                            Alert.alert('User Blocked', `${profileUser?.username} has been blocked.`);
                          },
                        },
                      ]
                    );
                  }}
                >
                  <Ionicons name="ban-outline" size={24} color="#EF4444" />
                  <Text style={tw`text-base text-gray-900 ml-3`}>Block User</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={tw`flex-row items-center py-4 border-b border-gray-200`}
                  onPress={() => {
                    setShowOptionsMenu(false);
                    Alert.alert(
                      'Report User',
                      `Why are you reporting ${profileUser?.username}?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Spam',
                          onPress: () => Alert.alert('Reported', 'Thank you for your report. We will review it.'),
                        },
                        {
                          text: 'Harassment',
                          onPress: () => Alert.alert('Reported', 'Thank you for your report. We will review it.'),
                        },
                        {
                          text: 'Inappropriate Content',
                          onPress: () => Alert.alert('Reported', 'Thank you for your report. We will review it.'),
                        },
                        {
                          text: 'Other',
                          onPress: () => Alert.alert('Reported', 'Thank you for your report. We will review it.'),
                        },
                      ]
                    );
                  }}
                >
                  <Ionicons name="flag-outline" size={24} color="#F59E0B" />
                  <Text style={tw`text-base text-gray-900 ml-3`}>Report User</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={tw`flex-row items-center py-4 border-b border-gray-200`}
                  onPress={() => {
                    setShowOptionsMenu(false);
                    Alert.alert('Muted', `You won't see posts from ${profileUser?.username} in your feed.`);
                  }}
                >
                  <Ionicons name="notifications-off-outline" size={24} color="#6B7280" />
                  <Text style={tw`text-base text-gray-900 ml-3`}>Mute User</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={tw`flex-row items-center py-4 border-b border-gray-200`}
              onPress={() => {
                setShowOptionsMenu(false);
                Alert.alert('Share Profile', `Share ${profileUser?.username}'s profile with others.`);
              }}
            >
              <Ionicons name="share-outline" size={24} color="#6B7280" />
              <Text style={tw`text-base text-gray-900 ml-3`}>Share Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={tw`flex-row items-center py-4`}
              onPress={() => setShowOptionsMenu(false)}
            >
              <Ionicons name="close-outline" size={24} color="#6B7280" />
              <Text style={tw`text-base text-gray-900 ml-3`}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

