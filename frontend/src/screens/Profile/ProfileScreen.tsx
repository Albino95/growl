import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, FlatList, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { CommonActions } from '@react-navigation/native';
import { useAuthStore } from '../../state/useAuthStore';
import CATEGORIES from '../../data/categories';
import tw from '../../lib/tw';

type Award = {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
};

type Post = {
  id: string;
  image: string;
  caption: string;
  likes: number;
  comments: number;
  createdAt: string;
  daysUntilDecay: number;
  category: string;
};

type Story = {
  id: string;
  image: string;
  createdAt: string;
  views: number;
};

const AWARDS: Award[] = [
  {
    id: '1',
    name: 'First Steps',
    description: 'Complete your first post',
    icon: '🎯',
    unlocked: true,
    unlockedAt: '2024-01-10',
  },
  {
    id: '2',
    name: 'Week Warrior',
    description: 'Post for 7 consecutive days',
    icon: '🔥',
    unlocked: true,
    unlockedAt: '2024-01-15',
  },
  {
    id: '3',
    name: 'Community Helper',
    description: 'Help 10 other users',
    icon: '🤝',
    unlocked: false,
  },
  {
    id: '4',
    name: 'Instructor Ready',
    description: 'Reach 500 points',
    icon: '🎓',
    unlocked: false,
  },
];

const MOCK_POSTS: Post[] = [
  {
    id: '1',
    image: '🏋️',
    caption: 'Day 15 of my fitness journey!',
    likes: 42,
    comments: 8,
    createdAt: '2024-01-10',
    daysUntilDecay: 5,
    category: 'fitness',
  },
  {
    id: '2',
    image: '🎹',
    caption: 'Practiced piano for 2 hours today',
    likes: 28,
    comments: 5,
    createdAt: '2024-01-12',
    daysUntilDecay: 3,
    category: 'art',
  },
  {
    id: '3',
    image: '🧘',
    caption: 'Morning meditation session',
    likes: 35,
    comments: 12,
    createdAt: '2024-01-14',
    daysUntilDecay: 1,
    category: 'mindset',
  },
];

const MOCK_STORIES: Story[] = [
  { id: '1', image: '🌱', createdAt: '2024-01-15', views: 120 },
  { id: '2', image: '🏃', createdAt: '2024-01-14', views: 89 },
  { id: '3', image: '📚', createdAt: '2024-01-13', views: 156 },
];

export default function ProfileScreen() {
  const { user, signOut, updateUser } = useAuthStore();
  const navigation = useNavigation();
  const points = user?.points || 0;
  const isInstructor = user?.isInstructor || false;
  const isBusinessAccount = user?.email === 'business@growl.app';
  
  const [activeTab, setActiveTab] = useState<'posts' | 'stories' | 'shared'>('posts');
  const [showDecaySettings, setShowDecaySettings] = useState(false);
  const [showCategorySettings, setShowCategorySettings] = useState(false);
  const [decayDays, setDecayDays] = useState(user?.decayTimer || 7);
  const [posts] = useState<Post[]>(MOCK_POSTS);
  const [stories] = useState<Story[]>(MOCK_STORIES);

  // If business account, don't show profile - they should only see business screens
  if (isBusinessAccount) {
    return null;
  }

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            navigation.dispatch(
              CommonActions.reset({
                index: 0,
                routes: [{ name: 'Auth' as never }],
              })
            );
          },
        },
      ]
    );
  };

  const navigateToInstructor = () => {
    navigation.navigate('Instructor' as never);
  };

  const handleSaveDecayTimer = () => {
    updateUser({ decayTimer: decayDays });
    setShowDecaySettings(false);
    Alert.alert('Success', `Decay timer set to ${decayDays} days`);
  };

  const handleUpdateCategories = (selectedCategories: string[]) => {
    updateUser({ categories: selectedCategories });
    setShowCategorySettings(false);
    Alert.alert('Success', 'Growth areas updated!');
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-white`}>
      <ScrollView style={tw`flex-1`}>
        {/* Header */}
        <View style={tw`px-4 pt-4 pb-6 border-b border-gray-200`}>
          <View style={tw`flex-row items-center mb-4`}>
            <View style={tw`w-20 h-20 rounded-full bg-green-100 items-center justify-center mr-4`}>
              <Text style={tw`text-4xl`}>👤</Text>
            </View>
            <View style={tw`flex-1`}>
              <Text style={tw`text-2xl font-bold text-gray-900`}>
                {user?.email?.split('@')[0] || 'User'}
              </Text>
              {isInstructor && (
                <View style={tw`flex-row items-center mt-1`}>
                  <Ionicons name="school" size={16} color="#10B981" />
                  <Text style={tw`text-sm text-green-600 ml-1 font-semibold`}>Instructor</Text>
                </View>
              )}
            </View>
            <TouchableOpacity onPress={() => setShowDecaySettings(true)}>
              <Ionicons name="settings-outline" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {/* Stats */}
          <View style={tw`flex-row gap-3 mb-4`}>
            <View style={tw`flex-1 bg-gray-50 rounded-lg p-3`}>
              <Text style={tw`text-xs text-gray-500 mb-1`}>Posts</Text>
              <Text style={tw`text-xl font-bold text-gray-900`}>{posts.length}</Text>
            </View>
            <View style={tw`flex-1 bg-gray-50 rounded-lg p-3`}>
              <Text style={tw`text-xs text-gray-500 mb-1`}>Stories</Text>
              <Text style={tw`text-xl font-bold text-gray-900`}>{stories.length}</Text>
            </View>
            <View style={tw`flex-1 bg-gray-50 rounded-lg p-3`}>
              <Text style={tw`text-xs text-gray-500 mb-1`}>Points</Text>
              <Text style={tw`text-xl font-bold text-gray-900`}>{points}</Text>
            </View>
          </View>

          {/* Points Display */}
          <View style={tw`bg-green-500 rounded-xl p-4 shadow-lg`}>
            <View style={tw`flex-row items-center justify-between`}>
              <View>
                <Text style={tw`text-white text-sm mb-1 opacity-90`}>Total Points</Text>
                <Text style={tw`text-white text-3xl font-bold`}>{points}</Text>
              </View>
              <Ionicons name="trophy" size={40} color="white" />
            </View>
            {!isInstructor && (
              <View style={tw`mt-3 pt-3 border-t border-green-400`}>
                <View style={tw`flex-row items-center justify-between`}>
                  <Text style={tw`text-white text-sm`}>Points to Instructor: {500 - points}</Text>
                  <View style={tw`flex-1 h-2 bg-green-400 rounded-full mx-3 overflow-hidden`}>
                    <View
                      style={[tw`h-full bg-white rounded-full`, { width: `${Math.min((points / 500) * 100, 100)}%` }]}
                    />
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* Instructor Access Card */}
          {isInstructor && (
            <View style={tw`mt-4`}>
              <TouchableOpacity
                onPress={navigateToInstructor}
                style={tw`bg-purple-500 rounded-xl p-4 shadow-md`}
              >
                <View style={tw`flex-row items-center mb-2`}>
                  <Ionicons name="school" size={24} color="#FFFFFF" />
                  <Text style={tw`text-white font-bold text-lg ml-2`}>Instructor</Text>
                </View>
                <Text style={tw`text-white text-xs opacity-90`}>Teach & mentor</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Categories with Edit */}
        <View style={tw`px-4 py-4 border-b border-gray-200`}>
          <View style={tw`flex-row items-center justify-between mb-3`}>
            <Text style={tw`text-lg font-semibold text-gray-900`}>Your Growth Areas</Text>
            <TouchableOpacity onPress={() => setShowCategorySettings(true)}>
              <Ionicons name="create-outline" size={20} color="#10B981" />
            </TouchableOpacity>
          </View>
          {user?.categories && user.categories.length > 0 ? (
            <View style={tw`flex-row flex-wrap`}>
              {user.categories.map((cat, index) => (
                <View
                  key={index}
                  style={tw`bg-green-100 px-3 py-1.5 rounded-full mr-2 mb-2`}
                >
                  <Text style={tw`text-sm text-green-800 font-medium`}>{cat}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={tw`text-gray-500 text-sm`}>No categories selected</Text>
          )}
        </View>

        {/* Decay Timer Info */}
        <View style={tw`px-4 py-3 bg-blue-50 border-b border-gray-200`}>
          <View style={tw`flex-row items-center justify-between`}>
            <View style={tw`flex-row items-center`}>
              <Ionicons name="time-outline" size={20} color="#3B82F6" />
              <Text style={tw`text-sm text-gray-700 ml-2`}>
                Decay Timer: {user?.decayTimer || 7} days
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowDecaySettings(true)}>
              <Text style={tw`text-sm text-blue-600 font-semibold`}>Change</Text>
            </TouchableOpacity>
          </View>
          <Text style={tw`text-xs text-gray-500 mt-1`}>
            Posts will automatically decay after this period to keep your timeline focused
          </Text>
        </View>

        {/* Tabs */}
        <View style={tw`flex-row border-b border-gray-200`}>
          {[
            { key: 'posts', label: 'Posts', icon: 'grid' },
            { key: 'stories', label: 'Stories', icon: 'images' },
            { key: 'shared', label: 'Shared', icon: 'share' },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key as any)}
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
        {activeTab === 'posts' && (
          <View style={tw`p-4`}>
            {posts.map((post) => (
              <TouchableOpacity
                key={post.id}
                style={tw`bg-white border border-gray-200 rounded-xl p-4 mb-3`}
                onPress={() => {
                  const rootNavigation = navigation.getParent() || navigation;
                  rootNavigation.navigate('PostDetail' as never, {
                    post: {
                      id: post.id,
                      userId: user?.id || 'me',
                      username: user?.email?.split('@')[0] || 'User',
                      avatar: '👤',
                      image: post.image,
                      caption: post.caption,
                      category: post.category,
                      likes: post.likes,
                      comments: post.comments,
                      createdAt: post.createdAt,
                      daysUntilDecay: post.daysUntilDecay,
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
                <View style={tw`flex-row items-center justify-between`}>
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
                  <View style={tw`flex-row items-center`}>
                    <Ionicons name="time" size={16} color={post.daysUntilDecay <= 1 ? '#EF4444' : '#F59E0B'} />
                    <Text style={tw`text-sm font-semibold ml-1 ${
                      post.daysUntilDecay <= 1 ? 'text-red-600' : 'text-orange-600'
                    }`}>
                      {post.daysUntilDecay} day{post.daysUntilDecay !== 1 ? 's' : ''} left
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {activeTab === 'stories' && (
          <View style={tw`p-4`}>
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
          </View>
        )}

        {activeTab === 'shared' && (
          <View style={tw`p-4 items-center justify-center min-h-64`}>
            <Ionicons name="share-outline" size={64} color="#D1D5DB" />
            <Text style={tw`text-gray-500 mt-4 text-center`}>
              Content you've shared will appear here
            </Text>
          </View>
        )}

        {/* Awards Section */}
        <View style={tw`px-4 py-4 border-t border-gray-200`}>
          <Text style={tw`text-lg font-semibold text-gray-900 mb-3`}>Awards & Achievements</Text>
          <View style={tw`flex-row flex-wrap`}>
            {AWARDS.map((award) => (
              <View key={award.id} style={tw`w-1/2 mb-4 pr-2`}>
                <View
                  style={tw`bg-white border-2 rounded-xl p-4 items-center ${
                    award.unlocked
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 bg-gray-50 opacity-60'
                  }`}
                >
                  <Text style={tw`text-4xl mb-2`}>{award.icon}</Text>
                  <Text
                    style={tw`font-semibold text-center mb-1 ${
                      award.unlocked ? 'text-gray-900' : 'text-gray-500'
                    }`}
                  >
                    {award.name}
                  </Text>
                  <Text
                    style={tw`text-xs text-center ${
                      award.unlocked ? 'text-gray-600' : 'text-gray-400'
                    }`}
                  >
                    {award.description}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Quick Actions */}
        {isInstructor && (
          <View style={tw`px-4 py-4 border-b border-gray-200`}>
            <Text style={tw`text-lg font-semibold text-gray-900 mb-3`}>Quick Actions</Text>
            <TouchableOpacity
              onPress={navigateToInstructor}
              style={tw`flex-row items-center justify-between py-4 bg-purple-50 rounded-xl px-4 border border-purple-200`}
            >
              <View style={tw`flex-row items-center flex-1`}>
                <View style={tw`w-12 h-12 bg-purple-500 rounded-full items-center justify-center mr-3`}>
                  <Ionicons name="school" size={24} color="#FFFFFF" />
                </View>
                <View style={tw`flex-1`}>
                  <Text style={tw`font-bold text-gray-900 text-base`}>Instructor Hub</Text>
                  <Text style={tw`text-sm text-gray-600`}>Manage students & courses</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#A855F7" />
            </TouchableOpacity>
          </View>
        )}

        {/* Settings */}
        <View style={tw`px-4 py-4`}>
          <Text style={tw`text-lg font-semibold text-gray-900 mb-3`}>Settings</Text>
          <TouchableOpacity
            style={tw`flex-row items-center justify-between py-3 border-b border-gray-200`}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="person-outline" size={20} color="#6B7280" />
              <Text style={tw`text-gray-900 ml-3`}>Edit Profile</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={tw`flex-row items-center justify-between py-3 border-b border-gray-200`}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="notifications-outline" size={20} color="#6B7280" />
              <Text style={tw`text-gray-900 ml-3`}>Notifications</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={tw`flex-row items-center justify-between py-3 border-b border-gray-200`}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="help-circle-outline" size={20} color="#6B7280" />
              <Text style={tw`text-gray-900 ml-3`}>Help & Support</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSignOut}
            style={tw`flex-row items-center justify-between py-3 mt-2`}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="log-out-outline" size={20} color="#EF4444" />
              <Text style={tw`text-red-600 ml-3 font-semibold`}>Sign Out</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Decay Timer Settings Modal */}
      <Modal
        visible={showDecaySettings}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDecaySettings(false)}
      >
        <SafeAreaView style={tw`flex-1 bg-white`}>
          <View style={tw`px-4 pt-4 pb-3 border-b border-gray-200 flex-row items-center justify-between`}>
            <Text style={tw`text-2xl font-bold text-gray-900`}>Decay Timer</Text>
            <TouchableOpacity onPress={() => setShowDecaySettings(false)}>
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView style={tw`flex-1 px-4 pt-6`}>
            <Text style={tw`text-base text-gray-700 mb-4`}>
              Set how many days until your posts automatically decay and are removed from your timeline. 
              This helps you stay focused on current growth areas.
            </Text>
            <View style={tw`bg-gray-50 rounded-xl p-4 mb-4`}>
              <Text style={tw`text-sm text-gray-600 mb-2`}>Days until decay:</Text>
              <TextInput
                value={decayDays.toString()}
                onChangeText={(text) => {
                  const num = parseInt(text) || 0;
                  if (num >= 1 && num <= 365) setDecayDays(num);
                }}
                keyboardType="numeric"
                style={tw`bg-white border border-gray-300 rounded-lg px-4 py-3 text-2xl font-bold text-gray-900`}
              />
              <View style={tw`flex-row gap-2 mt-3`}>
                {[1, 3, 7, 14, 30, 90].map((days) => (
                  <TouchableOpacity
                    key={days}
                    onPress={() => setDecayDays(days)}
                    style={tw`px-3 py-2 rounded-lg ${
                      decayDays === days ? 'bg-green-600' : 'bg-white border border-gray-300'
                    }`}
                  >
                    <Text style={tw`text-sm font-semibold ${
                      decayDays === days ? 'text-white' : 'text-gray-700'
                    }`}>
                      {days}d
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity
              onPress={handleSaveDecayTimer}
              style={tw`bg-green-600 rounded-xl py-4 mb-4`}
            >
              <Text style={tw`text-white text-center font-bold text-base`}>Save Settings</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Category Settings Modal */}
      <Modal
        visible={showCategorySettings}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCategorySettings(false)}
      >
        <CategoryPickerModal
          currentCategories={user?.categories || []}
          onSave={handleUpdateCategories}
          onClose={() => setShowCategorySettings(false)}
        />
      </Modal>
    </SafeAreaView>
  );
}

// Category Picker Modal Component
function CategoryPickerModal({ 
  currentCategories, 
  onSave, 
  onClose 
}: { 
  currentCategories: string[]; 
  onSave: (categories: string[]) => void; 
  onClose: () => void;
}) {
  const [selectedCategories, setSelectedCategories] = useState<string[]>(currentCategories);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const toggleCategory = (categoryKey: string) => {
    setSelectedCategories((prev) => {
      if (prev.includes(categoryKey)) {
        return prev.filter((k) => k !== categoryKey);
      } else if (prev.length < 3) {
        return [...prev, categoryKey];
      } else {
        Alert.alert('Limit Reached', 'You can select a maximum of 3 categories');
        return prev;
      }
    });
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-white`}>
      <View style={tw`px-4 pt-4 pb-3 border-b border-gray-200 flex-row items-center justify-between`}>
        <Text style={tw`text-2xl font-bold text-gray-900`}>Update Growth Areas</Text>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={24} color="#6B7280" />
        </TouchableOpacity>
      </View>
      <ScrollView style={tw`flex-1 px-4 pt-4`}>
        <Text style={tw`text-sm text-gray-600 mb-4`}>
          Select up to 3 categories to focus on. Selected: {selectedCategories.length}/3
        </Text>
        {CATEGORIES.map((category) => {
          const isSelected = selectedCategories.includes(category.key);
          const isExpanded = expandedCategory === category.key;
          return (
            <TouchableOpacity
              key={category.key}
              onPress={() => setExpandedCategory(isExpanded ? null : category.key)}
              style={tw`flex-row items-center justify-between p-4 rounded-xl border-2 mb-3 ${
                isSelected ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'
              }`}
            >
              <View style={tw`flex-row items-center flex-1`}>
                <Ionicons
                  name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                  size={20}
                  color={isSelected ? '#10B981' : '#6B7280'}
                  style={tw`mr-3`}
                />
                <Text style={tw`text-lg font-semibold ${isSelected ? 'text-green-700' : 'text-gray-800'}`}>
                  {category.label}
                </Text>
              </View>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={24} color="#10B981" />
              )}
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          onPress={() => onSave(selectedCategories)}
          style={tw`bg-green-600 rounded-xl py-4 mb-4 mt-4`}
        >
          <Text style={tw`text-white text-center font-bold text-base`}>Save Changes</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
