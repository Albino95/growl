import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useAuth } from '../../store/hooks';
import CATEGORIES from '../../data/categories';
import tw from '../../lib/tw';
import {
  addFriend,
  removeFriend,
  getFriendshipStatus,
  blockUser,
  unblockUser,
  muteUser,
  unmuteUser,
  reportUser,
} from '../../services/api/friends';
import { getUserPosts, type FeedPost } from '../../services/api/feed';
import { getUserStories, viewStory, type StoryItem } from '../../services/api/stories';
import { resolveAvatarUri, resolveStoryDisplayUri, resolvePostMediaUri } from '../../utils/images';
import { getPublicProfile, type PublicProfileSummary } from '../../services/api/profile';
import { TAB_SCREEN_BOTTOM_PADDING } from '../../constants/scroll';
import EmptyState from '../../components/ui/EmptyState';

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
  userId: string;
  username: string;
  avatar: string | null;
  image: string;
  createdAt: string;
  views: number;
  hasViewed: boolean;
};

type JournalEntry = {
  id: string;
  date: string;
  content: string;
  isPublic: boolean;
  mood?: string;
  tags?: string[];
};

type PublicUser = PublicProfileSummary;

type RouteParams = {
  PublicProfile: {
    userId: string;
  };
};

/** Normalizes backend feed payload into compact UI card model for public profile posts. */
function mapFeedPostToPublicPost(p: FeedPost): Post {
  return {
    id: p.id,
    image: resolvePostMediaUri(p.image_url, p.category, p.id),
    caption: p.caption || '',
    likes: p.metadata?.likes ?? 0,
    comments: p.metadata?.comments ?? 0,
    createdAt: p.created_at,
    category: p.category,
  };
}

/** Converts story API shape into local story model used by this screen. */
function mapStoryItemToStory(s: StoryItem): Story {
  return {
    id: s.id,
    userId: s.userId,
    username: s.username,
    avatar: s.avatar,
    image: s.image,
    createdAt: s.createdAt,
    views: s.views ?? 0,
    hasViewed: !!s.hasViewed,
  };
}

/** Fetches and maps public posts for the selected profile user. */
async function fetchUserPosts(userId: string): Promise<Post[]> {
  const list = await getUserPosts(userId);
  return list.map(mapFeedPostToPublicPost);
}

/** Fetches and maps profile stories for story strip + viewer navigation. */
async function fetchUserStories(userId: string): Promise<Story[]> {
  const list = await getUserStories(userId);
  return list.map(mapStoryItemToStory);
}

// Mock function to fetch public journal entries
async function fetchPublicJournalEntries(userId: string): Promise<JournalEntry[]> {
  // Temporary mock until public journal backend endpoint is wired.
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
  const [friendConnected, setFriendConnected] = useState(false);
  const [friendRequestSent, setFriendRequestSent] = useState(false);
  const [friendRequestReceived, setFriendRequestReceived] = useState(false);
  const [friendBusy, setFriendBusy] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);

  const isOwnProfile = currentUser?.id === userId;

  // Reload profile shell when route user changes.
  useEffect(() => {
    loadProfile();
  }, [userId]);

  // Relationship status drives follow button and moderation toggle labels.
  useEffect(() => {
    if (isOwnProfile || !currentUser?.id) {
      setFriendConnected(false);
      setFriendRequestSent(false);
      setFriendRequestReceived(false);
      return;
    }
    let cancelled = false;
    getFriendshipStatus(userId).then((s) => {
      if (!cancelled) {
        setFriendConnected(s.connected);
        setFriendRequestSent(s.requestSent);
        setFriendRequestReceived(s.requestReceived);
        setIsBlocked(s.blocked);
        setIsMuted(s.muted);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId, currentUser?.id, isOwnProfile]);

  /** Handles friend request send/cancel/accept and remove-friend actions. */
  const onToggleFriend = async () => {
    if (friendBusy || isOwnProfile) return;
    if (isBlocked) {
      Alert.alert('Blocked user', 'Unblock this user before connecting.');
      return;
    }
    setFriendBusy(true);
    try {
      if (friendConnected) {
        await removeFriend(userId);
        setFriendConnected(false);
        setFriendRequestSent(false);
        setFriendRequestReceived(false);
        if (Platform.OS === 'web') {
          window.alert('Removed from friends.');
        } else {
          Alert.alert('Removed', 'Friend connection removed.');
        }
      } else if (friendRequestSent) {
        await removeFriend(userId);
        setFriendRequestSent(false);
        if (Platform.OS === 'web') {
          window.alert('Friend request cancelled.');
        } else {
          Alert.alert('Cancelled', 'Friend request cancelled.');
        }
      } else {
        const result = await addFriend(userId);
        setFriendConnected(result.connected);
        setFriendRequestSent(result.requestSent);
        setFriendRequestReceived(false);
        if (Platform.OS === 'web') {
          window.alert(result.connected ? 'Friend request accepted.' : 'Friend request sent.');
        } else {
          Alert.alert(
            result.connected ? 'Friends' : 'Request sent',
            result.connected
              ? 'You are now friends.'
              : `${profileUser?.username ?? 'User'} can accept your friend request.`
          );
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not update connection';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setFriendBusy(false);
    }
  };

  // Lazily load tab-specific content only after profile metadata is available.
  useEffect(() => {
    if (profileUser) {
      loadContent();
    }
  }, [profileUser, activeTab, isBlocked]);

  useEffect(() => {
    if (!isBlocked) return;
    setPosts([]);
    setStories([]);
    setJournalEntries([]);
  }, [isBlocked]);

  /** Loads public profile header/stats metadata. */
  const loadProfile = async () => {
    try {
      setLoading(true);
      const userData = await getPublicProfile(userId);
      setProfileUser(userData);
    } catch (error) {
      console.error('Error loading profile:', error);
      setProfileUser(null);
    } finally {
      setLoading(false);
    }
  };

  /** Loads selected tab content (posts/stories/journal) for current profile user. */
  const loadContent = async () => {
    if (!profileUser) return;
    if (isBlocked) {
      setPosts([]);
      setStories([]);
      setJournalEntries([]);
      return;
    }
    
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

  /** Opens story viewer modal and syncs viewed-state both locally and server-side. */
  const openStoryViewer = (selectedStoryId?: string) => {
    if (!stories.length || !profileUser) return;
    const initialIndex = selectedStoryId
      ? Math.max(0, stories.findIndex((story) => story.id === selectedStoryId))
      : 0;
    const rootNavigation = navigation.getParent() || navigation;
    (rootNavigation as any).navigate('StoryViewer', {
      stories: stories.map((story) => ({
        id: story.id,
        userId: story.userId,
        username: story.username,
        avatar: story.avatar || resolveAvatarUri(story.userId, story.username, story.avatar),
        image: resolveStoryDisplayUri(story.image, story.userId, story.id),
        createdAt: story.createdAt,
        views: story.views,
        hasViewed: story.hasViewed,
      })),
      initialIndex,
      onStoriesUpdate: (updatedStories: Array<{ id: string; hasViewed?: boolean }>) => {
        const viewedIds = updatedStories.filter((s) => s.hasViewed).map((s) => s.id);
        if (viewedIds.length > 0) {
          Promise.all(viewedIds.map((id) => viewStory(id))).catch(() => undefined);
        }
        setStories((prev) =>
          prev.map((story) => {
            const updated = updatedStories.find((s) => s.id === story.id);
            return updated ? { ...story, hasViewed: !!updated.hasViewed } : story;
          })
        );
      },
    });
  };

  const refreshFriendshipState = async () => {
    try {
      const state = await getFriendshipStatus(userId);
      setFriendConnected(state.connected);
      setFriendRequestSent(state.requestSent);
      setFriendRequestReceived(state.requestReceived);
      setIsBlocked(state.blocked);
      setIsMuted(state.muted);
    } catch {
      // Keep current local state when refresh fails.
    }
  };

  const confirmAction = (title: string, message: string, confirmText = 'Confirm') =>
    new Promise<boolean>((resolve) => {
      if (Platform.OS === 'web') {
        resolve(typeof globalThis.confirm === 'function' ? globalThis.confirm(`${title}\n\n${message}`) : true);
        return;
      }
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmText, style: 'destructive', onPress: () => resolve(true) },
      ]);
    });

  const notify = (title: string, message: string) => {
    if (Platform.OS === 'web' && typeof globalThis.alert === 'function') {
      globalThis.alert(`${title}\n\n${message}`);
      return;
    }
    Alert.alert(title, message);
  };

  const handleBlockMenuPress = async () => {
    setShowOptionsMenu(false);
    const username = profileUser?.username || 'this user';
    const approved = await confirmAction(
      isBlocked ? 'Unblock User' : 'Block User',
      isBlocked
        ? `Do you want to unblock ${username}?`
        : `Are you sure you want to block ${username}?`,
      isBlocked ? 'Unblock' : 'Block'
    );
    if (!approved) return;

    try {
      if (isBlocked) {
        await unblockUser(userId);
        notify('Unblocked', `${username} has been unblocked.`);
      } else {
        await blockUser(userId);
        setPosts([]);
        setStories([]);
        setJournalEntries([]);
        notify('Blocked', `${username} has been blocked.`);
      }
      await refreshFriendshipState();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Could not update block status';
      notify('Error', msg);
    }
  };

  const handleReportMenuPress = () => {
    setShowOptionsMenu(false);
    Alert.alert('Report User', `Why are you reporting ${profileUser?.username}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Spam',
        onPress: async () => {
          try {
            await reportUser(userId, 'spam');
            Alert.alert('Reported', 'Thank you for your report. We will review it.');
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Could not submit report';
            Alert.alert('Error', msg);
          }
        },
      },
      {
        text: 'Harassment',
        onPress: async () => {
          try {
            await reportUser(userId, 'harassment');
            Alert.alert('Reported', 'Thank you for your report. We will review it.');
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Could not submit report';
            Alert.alert('Error', msg);
          }
        },
      },
      {
        text: 'Inappropriate Content',
        onPress: async () => {
          try {
            await reportUser(userId, 'inappropriate_content');
            Alert.alert('Reported', 'Thank you for your report. We will review it.');
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Could not submit report';
            Alert.alert('Error', msg);
          }
        },
      },
      {
        text: 'Other',
        onPress: async () => {
          try {
            await reportUser(userId, 'other');
            Alert.alert('Reported', 'Thank you for your report. We will review it.');
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Could not submit report';
            Alert.alert('Error', msg);
          }
        },
      },
    ]);
  };

  const handleMuteMenuPress = () => {
    setShowOptionsMenu(false);
    Alert.alert(isMuted ? 'Unmute User' : 'Mute User', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: isMuted ? 'Unmute' : 'Mute',
        onPress: async () => {
          try {
            if (isMuted) {
              await unmuteUser(userId);
              Alert.alert('Unmuted', `${profileUser?.username} is now visible in your feed.`);
            } else {
              await muteUser(userId);
              Alert.alert('Muted', `You won't see posts from ${profileUser?.username} in your feed.`);
            }
            await refreshFriendshipState();
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Could not update mute status';
            Alert.alert('Error', msg);
          }
        },
      },
    ]);
  };

  const openOptionsMenu = () => {
    setShowOptionsMenu(true);
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
          style={tw`w-11 h-11 items-center justify-center`}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={openOptionsMenu}
        >
          <Ionicons name="ellipsis-horizontal" size={24} color="#6B7280" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={{ paddingBottom: TAB_SCREEN_BOTTOM_PADDING }}
      >
        {/* Profile Header */}
        <View style={tw`px-4 pt-6 pb-6 border-b border-gray-200`}>
          <View style={tw`flex-row items-center mb-4`}>
            <View style={tw`w-20 h-20 rounded-full overflow-hidden mr-4 bg-green-100`}>
              <Image
                source={{ uri: resolveAvatarUri(profileUser.id, profileUser.username, profileUser.avatar) }}
                style={tw`w-full h-full`}
                contentFit="cover"
              />
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

          <View style={tw`flex-row justify-around mb-4 py-2`}>
            <View style={tw`items-center`}>
              <Text style={tw`text-lg font-bold text-gray-900`}>{profileUser.postsCount}</Text>
              <Text style={tw`text-xs text-gray-500`}>Posts</Text>
            </View>
            <View style={tw`items-center`}>
              <Text style={tw`text-lg font-bold text-gray-900`}>{profileUser.storiesCount}</Text>
              <Text style={tw`text-xs text-gray-500`}>Stories</Text>
            </View>
            <View style={tw`items-center`}>
              <Text style={tw`text-lg font-bold text-emerald-600`}>{profileUser.points}</Text>
              <Text style={tw`text-xs text-gray-500`}>Points</Text>
            </View>
          </View>

          {!isOwnProfile && currentUser?.id ? (
            <TouchableOpacity
              onPress={() => void onToggleFriend()}
              disabled={friendBusy}
              style={tw`mb-4 py-3.5 rounded-2xl flex-row items-center justify-center gap-2 ${
                friendConnected || friendRequestSent
                  ? 'bg-stone-100 border border-stone-200'
                  : friendRequestReceived
                    ? 'bg-amber-500'
                    : 'bg-emerald-600'
              } ${friendBusy ? 'opacity-60' : ''}`}
            >
              {friendBusy ? (
                <ActivityIndicator
                  color={friendConnected || friendRequestSent ? '#57534E' : '#fff'}
                />
              ) : (
                <Ionicons
                  name={
                    friendConnected
                      ? 'checkmark-circle'
                      : friendRequestSent
                        ? 'time'
                        : friendRequestReceived
                          ? 'mail-open'
                          : 'person-add'
                  }
                  size={20}
                  color={friendConnected || friendRequestSent ? '#44403C' : '#fff'}
                />
              )}
              <Text
                style={tw`font-semibold text-base ${
                  friendConnected || friendRequestSent ? 'text-stone-800' : 'text-white'
                }`}
              >
                {friendBusy
                  ? 'Updating…'
                  : friendConnected
                    ? 'Friends'
                    : friendRequestSent
                      ? 'Requested'
                      : friendRequestReceived
                        ? 'Accept Request'
                        : 'Add Friend'}
              </Text>
            </TouchableOpacity>
          ) : null}

          <View style={tw`bg-emerald-600 rounded-2xl p-4`}>
            <View style={tw`flex-row items-center justify-between`}>
              <View>
                <Text style={tw`text-white text-sm mb-1 opacity-90`}>Total Points</Text>
                <Text style={tw`text-white text-3xl font-bold`}>{profileUser.points}</Text>
              </View>
              <Ionicons name="trophy" size={40} color="white" />
            </View>
            {!profileUser.isInstructor && (
              <View style={tw`mt-3 pt-3 border-t border-emerald-400/60`}>
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
        {isBlocked ? (
          <View style={tw`p-6 items-center justify-center`}>
            <Ionicons name="ban-outline" size={48} color="#9CA3AF" />
            <Text style={tw`text-gray-700 mt-3 text-center font-semibold`}>You have blocked this user</Text>
            <Text style={tw`text-gray-500 mt-1 text-center`}>
              Unblock them to view their posts, stories, and activity again.
            </Text>
          </View>
        ) : loadingContent ? (
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
                    (rootNavigation as any).navigate('PostDetail', {
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
                    });
                  }}
                >
                  <View style={tw`flex-row items-center justify-between mb-3`}>
                    <View style={tw`flex-row items-center`}>
                      <View style={tw`w-16 h-16 rounded-xl overflow-hidden mr-3 bg-gray-100`}>
                        <Image
                          source={{ uri: post.image }}
                          style={tw`w-full h-full`}
                          contentFit="cover"
                        />
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
              <EmptyState
                icon="images-outline"
                title="No posts yet"
                description="This user has not shared posts yet."
              />
            )}
          </View>
        ) : activeTab === 'stories' ? (
          <View style={tw`p-4`}>
            {stories.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={tw`flex-row gap-3`}>
                  {stories.map((story) => (
                    <TouchableOpacity
                      key={story.id}
                      style={tw`items-center`}
                      onPress={() => openStoryViewer(story.id)}
                    >
                      <View style={tw`w-20 h-20 rounded-xl overflow-hidden mb-2 border-2 border-purple-500 bg-gray-100`}>
                        <Image
                          source={{ uri: resolveStoryDisplayUri(story.image, userId, story.id) }}
                          style={tw`w-full h-full`}
                          contentFit="cover"
                        />
                      </View>
                      <Text style={tw`text-xs text-gray-500`}>
                        {story.views} views
                      </Text>
                      <Text style={tw`text-xs text-gray-400 mt-1`}>
                        {new Date(story.createdAt).toLocaleDateString()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <EmptyState
                icon="images-outline"
                title="No stories yet"
                description="Stories from this user will appear here."
              />
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
              <EmptyState
                icon="book-outline"
                title="No public journal entries"
                description="Public journal updates from this user will show here."
              />
            )}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showOptionsMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOptionsMenu(false)}
      >
        <View style={tw`flex-1 justify-end`}>
          <Pressable
            style={tw`absolute inset-0 bg-black/35`}
            onPress={() => setShowOptionsMenu(false)}
          />
          <View style={tw`bg-white px-4 pt-3 pb-6 rounded-t-3xl`}>
            <View style={tw`w-12 h-1.5 bg-gray-300 rounded-full self-center mb-4`} />

            {!isOwnProfile ? (
              <>
                <Pressable
                  style={tw`py-4 border-b border-gray-100`}
                  onPress={() => void handleBlockMenuPress()}
                >
                  <Text style={tw`text-base font-semibold ${isBlocked ? 'text-gray-900' : 'text-red-600'}`}>
                    {isBlocked ? 'Unblock User' : 'Block User'}
                  </Text>
                </Pressable>

                <Pressable
                  style={tw`py-4 border-b border-gray-100`}
                  onPress={handleReportMenuPress}
                >
                  <Text style={tw`text-base font-semibold text-gray-900`}>Report User</Text>
                </Pressable>

                <Pressable
                  style={tw`py-4 border-b border-gray-100`}
                  onPress={handleMuteMenuPress}
                >
                  <Text style={tw`text-base font-semibold text-gray-900`}>
                    {isMuted ? 'Unmute User' : 'Mute User'}
                  </Text>
                </Pressable>
              </>
            ) : null}

            <Pressable
              style={tw`py-4 border-b border-gray-100`}
              onPress={() => {
                setShowOptionsMenu(false);
                Alert.alert('Share Profile', `Share ${profileUser?.username}'s profile with others.`);
              }}
            >
              <Text style={tw`text-base font-semibold text-gray-900`}>Share Profile</Text>
            </Pressable>

            <Pressable
              style={tw`py-4 mt-2`}
              onPress={() => setShowOptionsMenu(false)}
            >
              <Text style={tw`text-base font-semibold text-center text-gray-500`}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

