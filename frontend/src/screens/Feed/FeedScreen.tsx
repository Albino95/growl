import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, ScrollView, RefreshControl, Modal, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchFeedPosts } from '../../store/slices/feedSlice';
import { horizontalScrollProps, verticalScrollProps, feedListPerformanceProps } from '../../constants/scroll';
import CATEGORIES from '../../data/categories';
import CommentsScreen from '../Comments/CommentsScreen';
import CO2Calculator from '../../components/ui/CO2Calculator';
import { resolveStoryDisplayUri, resolveAvatarUri, getAvatarUrl, getPostImageUrl } from '../../utils/images';
import { toggleFeedPostLike, type FeedPost } from '../../services/api/feed';
import { getStories, viewStory, type StoryItem } from '../../services/api/stories';
import tw from '../../lib/tw';

type Story = {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  /** CDN/device URI from API; resolved again before render */
  image?: string;
  hasViewed: boolean;
};

type ReactionType = 'like' | 'love' | 'laugh' | 'wow' | 'support' | null;

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
  reaction: ReactionType;
};

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// Mock data - in real app, this would come from API
// Each user has multiple stories
const MOCK_STORIES: Story[] = [
  { id: '1', userId: 'u1', username: 'John', avatar: getAvatarUrl('u1', 'John'), hasViewed: false },
  { id: '1-2', userId: 'u1', username: 'John', avatar: getAvatarUrl('u1', 'John'), hasViewed: false },
  { id: '1-3', userId: 'u1', username: 'John', avatar: getAvatarUrl('u1', 'John'), hasViewed: false },
  { id: '2', userId: 'u2', username: 'Sarah', avatar: getAvatarUrl('u2', 'Sarah'), hasViewed: true },
  { id: '2-2', userId: 'u2', username: 'Sarah', avatar: getAvatarUrl('u2', 'Sarah'), hasViewed: true },
  { id: '3', userId: 'u3', username: 'Mike', avatar: getAvatarUrl('u3', 'Mike'), hasViewed: false },
  { id: '3-2', userId: 'u3', username: 'Mike', avatar: getAvatarUrl('u3', 'Mike'), hasViewed: false },
  { id: '4', userId: 'u4', username: 'Emma', avatar: getAvatarUrl('u4', 'Emma'), hasViewed: true },
  { id: '5', userId: 'u5', username: 'Alex', avatar: getAvatarUrl('u5', 'Alex'), hasViewed: false },
  { id: '5-2', userId: 'u5', username: 'Alex', avatar: getAvatarUrl('u5', 'Alex'), hasViewed: false },
  { id: '5-3', userId: 'u5', username: 'Alex', avatar: getAvatarUrl('u5', 'Alex'), hasViewed: false },
];

const MOCK_POSTS: Post[] = [
  {
    id: '1',
    userId: 'u1',
    username: 'John',
    avatar: getAvatarUrl('u1', 'John'),
    image: getPostImageUrl('fitness', '1'),
    caption: 'Day 15 of my fitness journey! Feeling stronger every day 💪',
    category: 'fitness',
    subcategory: 'losing-weight',
    likes: 42,
    comments: 8,
    timestamp: '2h ago',
    hasLiked: false,
    reaction: null,
  },
  {
    id: '2',
    userId: 'u2',
    username: 'Sarah',
    avatar: getAvatarUrl('u2', 'Sarah'),
    image: getPostImageUrl('art', '2'),
    caption: 'Practiced piano for 2 hours today. Progress is slow but steady 🎵',
    category: 'art',
    subcategory: 'piano',
    likes: 28,
    comments: 5,
    timestamp: '4h ago',
    hasLiked: true,
    reaction: 'like',
  },
  {
    id: '3',
    userId: 'u3',
    username: 'Mike',
    avatar: getAvatarUrl('u3', 'Mike'),
    image: getPostImageUrl('mindset', '3'),
    caption: 'Morning meditation session complete. Starting the day with clarity ✨',
    category: 'mindset',
    subcategory: 'meditation',
    likes: 35,
    comments: 12,
    timestamp: '6h ago',
    hasLiked: false,
    reaction: 'love',
  },
  {
    id: '4',
    userId: 'u4',
    username: 'Emma',
    avatar: getAvatarUrl('u4', 'Emma'),
    image: getPostImageUrl('cooking', '4'),
    caption: 'Homemade pasta from scratch! Nothing beats fresh ingredients 🍝',
    category: 'cooking',
    subcategory: 'baking',
    likes: 56,
    comments: 15,
    timestamp: '8h ago',
    hasLiked: true,
    reaction: 'wow',
  },
  {
    id: '5',
    userId: 'u5',
    username: 'Alex',
    avatar: getAvatarUrl('u5', 'Alex'),
    image: getPostImageUrl('reading', '5'),
    caption: 'Just finished "Atomic Habits" - game changer! 📚',
    category: 'reading',
    likes: 31,
    comments: 7,
    timestamp: '10h ago',
    hasLiked: false,
    reaction: null,
  },
  {
    id: '6',
    userId: 'u1',
    username: 'John',
    avatar: getAvatarUrl('u1', 'John'),
    image: getPostImageUrl('fitness', '6'),
    caption: 'New PR in deadlift! 225lbs 🏋️',
    category: 'fitness',
    subcategory: 'weight-training',
    likes: 67,
    comments: 22,
    timestamp: '12h ago',
    hasLiked: true,
    reaction: 'support',
  },
  {
    id: '7',
    userId: 'u2',
    username: 'Sarah',
    avatar: getAvatarUrl('u2', 'Sarah'),
    image: getPostImageUrl('art', '7'),
    caption: 'Working on a new painting. Acrylics are so vibrant! 🎨',
    category: 'art',
    subcategory: 'painting',
    likes: 44,
    comments: 9,
    timestamp: '14h ago',
    hasLiked: false,
    reaction: 'love',
  },
  {
    id: '8',
    userId: 'u3',
    username: 'Mike',
    avatar: getAvatarUrl('u3', 'Mike'),
    image: getPostImageUrl('yoga', '8'),
    caption: 'Sunrise yoga session. Perfect way to start the day 🌅',
    category: 'yoga',
    likes: 52,
    comments: 18,
    timestamp: '1d ago',
    hasLiked: true,
    reaction: 'like',
  },
];

export default function FeedScreen({ navigation, route }: any) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const feedItems = useAppSelector((s) => s.feed.items);
  const feedStatus = useAppSelector((s) => s.feed.status);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [posts, setPosts] = useState<Post[]>(MOCK_POSTS); // Initialize with mock posts as fallback
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  const [stories, setStories] = useState<Story[]>(MOCK_STORIES); // Initialize with mock stories

  const toLocalPost = (post: FeedPost): Post => {
    const username = post.metadata?.username || 'User';
    const likes = Number(post.metadata?.likes || 0);
    const comments = Number(post.metadata?.comments || 0);
    
    // Ensure we always have a valid image URL
    let imageUrl = post.image_url;
    if (!imageUrl || imageUrl.trim() === '') {
      // Use category-based placeholder image if no image_url provided
      imageUrl = getPostImageUrl(post.category || 'default', post.id);
    }
    
    return {
      id: post.id,
      userId: post.user_id,
      username,
      avatar: post.metadata?.avatar || getAvatarUrl(post.user_id, username),
      image: imageUrl,
      caption: post.caption || '',
      category: post.category || 'general',
      subcategory: post.subcategory || undefined,
      likes,
      comments,
      timestamp: formatTimeAgo(post.created_at),
      hasLiked: false,
      reaction: null,
    };
  };

  const loadStoriesOnly = async () => {
    try {
      console.log('[FeedScreen] Loading stories...');
      const storiesRes = await getStories();

      if (storiesRes.success && storiesRes.data) {
        const storiesArray = storiesRes.data.stories || [];
        console.log('[FeedScreen] Stories response:', {
          success: storiesRes.success,
          storiesCount: storiesArray.length,
          firstStory: storiesArray[0] ? {
            id: storiesArray[0].id,
            userId: storiesArray[0].userId,
            username: storiesArray[0].username,
          } : 'none',
        });
        if (storiesArray.length > 0) {
          setStories(
            storiesArray.map((s: StoryItem) => ({
              id: s.id,
              userId: s.userId,
              username: s.username,
              avatar: resolveAvatarUri(s.userId, s.username, s.avatar),
              image: s.image,
              hasViewed: !!s.hasViewed,
            }))
          );
        } else {
          console.log('[FeedScreen] No API stories, using mock stories');
          setStories(MOCK_STORIES);
        }
      } else {
        console.log('[FeedScreen] Stories response not successful, using mock stories');
        setStories(MOCK_STORIES);
      }
    } catch (error: unknown) {
      console.error('[FeedScreen] Error loading stories:', error);
      setStories(MOCK_STORIES);
    }
  };

  useEffect(() => {
    dispatch(fetchFeedPosts());
    loadStoriesOnly();
  }, [dispatch]);

  /** Merge Redux feed with curated mock posts once the API request settles. */
  useEffect(() => {
    if (feedStatus !== 'succeeded') return;
    if (feedItems.length > 0) {
      const apiPosts = feedItems.map(toLocalPost);
      const apiPostIds = new Set(apiPosts.map((p) => p.id));
      const uniqueMockPosts = MOCK_POSTS.filter((p) => !apiPostIds.has(p.id));
      setPosts([...apiPosts, ...uniqueMockPosts]);
    } else {
      setPosts(MOCK_POSTS);
    }
  }, [feedItems, feedStatus]);

  // Group stories by user - show each person only once
  const groupedStories = useMemo(() => {
    const grouped = new Map<string, { user: Story; stories: Story[] }>();
    
    stories.forEach((story) => {
      if (!grouped.has(story.userId)) {
        grouped.set(story.userId, {
          user: story,
          stories: [],
        });
      }
      grouped.get(story.userId)!.stories.push(story);
    });
    
    const result = Array.from(grouped.values());
    console.log('[FeedScreen] Grouped stories:', {
      totalStories: stories.length,
      groupedCount: result.length,
      groupedUsers: result.map(g => ({ userId: g.user.userId, username: g.user.username, count: g.stories.length })),
    });
    
    return result;
  }, [stories]);

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
    try {
      await dispatch(fetchFeedPosts()).unwrap();
    } catch {
      // Keep existing posts; Redux records error state.
    }
    await loadStoriesOnly();
    setRefreshing(false);
  };

  const toggleLike = async (postId: string) => {
    try {
      const res = await toggleFeedPostLike(postId);
      const liked = !!res.data?.liked;
      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? {
                ...post,
                hasLiked: liked,
                likes: liked ? post.likes + (post.hasLiked ? 0 : 1) : post.likes - (post.hasLiked ? 1 : 0),
                reaction: liked ? post.reaction || 'like' : null,
              }
            : post
        )
      );
      return;
    } catch (error) {
      // Fallback to local optimistic toggle if API call fails.
    }
    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? { ...post, hasLiked: !post.hasLiked, likes: post.hasLiked ? post.likes - 1 : post.likes + 1, reaction: post.hasLiked ? null : 'like' }
          : post
      )
    );
  };

  const setReaction = (postId: string, reaction: ReactionType) => {
    setPosts((prev) =>
      prev.map((post) => {
        if (post.id === postId) {
          const wasLiked = post.hasLiked || post.reaction !== null;
          const willBeLiked = reaction !== null;
          return {
            ...post,
            reaction,
            hasLiked: willBeLiked,
            likes: wasLiked && !willBeLiked ? post.likes - 1 : !wasLiked && willBeLiked ? post.likes + 1 : post.likes,
          };
        }
        return post;
      })
    );
    setShowReactionPicker(null);
  };

  const getReactionIcon = (reaction: ReactionType) => {
    switch (reaction) {
      case 'like':
        return '👍';
      case 'love':
        return '❤️';
      case 'laugh':
        return '😂';
      case 'wow':
        return '😮';
      case 'support':
        return '💪';
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-stone-50`} edges={['top']}>
      <View style={tw`flex-1`}>
        {/* Header with Messages/Stories */}
        <View
          style={[
            tw`px-4 pt-2 pb-3 bg-white border-b border-stone-100`,
            Platform.OS === 'ios'
              ? {
                  shadowColor: '#0f172a',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.07,
                  shadowRadius: 10,
                }
              : { elevation: 3 },
          ]}
        >
          <View style={tw`flex-row items-center justify-between mb-3`}>
            <Text style={tw`text-2xl font-bold text-green-600`}>Grow!</Text>
          </View>

          {/* Messages/Stories Section (Instagram-style) */}
          <ScrollView
            horizontal
            style={tw`mb-3`}
            contentContainerStyle={tw`px-2`}
            {...horizontalScrollProps}
          >
            <TouchableOpacity
              style={tw`items-center justify-center w-16 h-16 rounded-full bg-green-50 border-2 border-green-200 mr-4`}
              onPress={() => {
                // Navigate to messages screen
                const rootNavigation = navigation.getParent() || navigation;
                rootNavigation.navigate('Messages');
              }}
            >
              <Ionicons name="chatbubbles" size={24} color="#10B981" />
            </TouchableOpacity>
            <TouchableOpacity
              style={tw`items-center justify-center w-16 h-16 rounded-full bg-purple-50 border-2 border-purple-200 mr-4`}
              onPress={() => {
                // Navigate to reels screen
                const rootNavigation = navigation.getParent() || navigation;
                rootNavigation.navigate('Reels');
              }}
            >
              <Ionicons name="videocam" size={24} color="#A855F7" />
            </TouchableOpacity>
            {groupedStories.map((group) => {
              const { user, stories: userStories } = group;
              // Check if all stories from this user have been viewed
              const allViewed = userStories.every((s) => s.hasViewed);
              const storyCount = userStories.length;
              
              return (
                <TouchableOpacity
                  key={user.userId}
                  style={tw`items-center mr-4`}
                  onPress={() => {
                    // Navigate to story viewer when clicking on story
                    const rootNavigation = navigation.getParent() || navigation;
                    
                    // Create full story objects with images for the viewer
                    const fullStories = userStories.map((s, idx) => ({
                      ...s,
                      image: resolveStoryDisplayUri(s.image, s.userId, s.id),
                      createdAt: new Date(Date.now() - (userStories.length - idx) * 3600000).toISOString(),
                      views: Math.floor(Math.random() * 100),
                    }));
                    
                    rootNavigation.navigate('StoryViewer' as never, {
                      stories: fullStories,
                      initialIndex: 0, // Always start from first story
                      onStoriesUpdate: (updatedStories: typeof fullStories) => {
                        // Update the main stories array with viewed status
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
                        allViewed ? 'border-gray-300' : 'border-purple-500'
                      } items-center justify-center bg-purple-100 p-0.5`}
                    >
                      <Image
                        source={{ uri: resolveAvatarUri(user.userId, user.username, user.avatar) }}
                        style={tw`w-full h-full rounded-full`}
                        contentFit="cover"
                      />
                    </View>
                    {/* Story count badge */}
                    {storyCount > 1 && (
                      <View
                        style={tw`absolute -top-1 -right-1 bg-purple-600 rounded-full w-5 h-5 items-center justify-center border-2 border-white`}
                      >
                        <Text style={tw`text-white text-xs font-bold`}>{storyCount}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={tw`text-xs text-gray-600 mt-1 max-w-16`} numberOfLines={1}>
                    {user.username}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={tw`items-center justify-center w-16 h-16 rounded-full border-2 border-dashed border-gray-300`}
              onPress={() => {
                // Navigate to post screen to create story
                const rootNavigation = navigation.getParent() || navigation;
                rootNavigation.navigate('Post' as never);
              }}
            >
              <Ionicons name="add" size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </ScrollView>

          {/* Category Selector */}
          {userCategories.length > 0 && (
            <ScrollView horizontal contentContainerStyle={tw`px-2`} {...horizontalScrollProps}>
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
          contentContainerStyle={tw`px-4 pt-2 pb-28`}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#059669"
              colors={['#059669']}
            />
          }
          {...feedListPerformanceProps}
          {...verticalScrollProps}
          renderItem={({ item }) => (
            <View
              style={[
                tw`bg-white mb-4 overflow-hidden rounded-2xl border border-stone-100`,
                Platform.OS === 'ios'
                  ? {
                      shadowColor: '#0f172a',
                      shadowOffset: { width: 0, height: 8 },
                      shadowOpacity: 0.08,
                      shadowRadius: 16,
                    }
                  : { elevation: 2 },
              ]}
            >
              {/* Post Header - Modern Style */}
              <View style={tw`flex-row items-center justify-between px-4 py-3`}>
                <TouchableOpacity
                  style={tw`flex-row items-center flex-1`}
                  onPress={() => {
                    const rootNavigation = navigation.getParent() || navigation;
                    rootNavigation.navigate('PublicProfile' as never, { userId: item.userId } as never);
                  }}
                >
                  <Image
                    source={{ uri: item.avatar }}
                    style={tw`w-11 h-11 rounded-full mr-3 shadow-sm`}
                    contentFit="cover"
                  />
                  <View style={tw`flex-1`}>
                    <Text style={tw`font-bold text-gray-900 text-base`}>{item.username}</Text>
                    <Text style={tw`text-xs text-gray-500`}>{item.timestamp}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={tw`p-1`}>
                  <Ionicons name="ellipsis-horizontal" size={22} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {/* Post Image - Modern Style */}
              <View style={tw`w-full bg-gray-50`}>
                {item.image && item.image.trim() !== '' ? (
                  <Image
                    source={{ uri: item.image }}
                    style={tw`w-full h-96`}
                    contentFit="cover"
                    onError={(error) => {
                      console.error('[FeedScreen] Image load error for post:', item.id, 'URL:', item.image, error);
                    }}
                    placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
                    transition={200}
                  />
                ) : (
                  <View style={tw`w-full h-96 bg-gradient-to-br from-gray-100 to-gray-200 items-center justify-center`}>
                    <Ionicons name="image-outline" size={64} color="#9CA3AF" />
                    <Text style={tw`text-gray-400 mt-2 text-sm`}>No image available</Text>
                  </View>
                )}
              </View>

              {/* Post Actions - Modern Style */}
              <View style={tw`px-4 py-3`}>
                <View style={tw`flex-row items-center justify-between mb-3`}>
                  <View style={tw`flex-row items-center`}>
                    <TouchableOpacity
                      onPress={() => toggleLike(item.id)}
                      onLongPress={() => setShowReactionPicker(showReactionPicker === item.id ? null : item.id)}
                      style={tw`mr-3`}
                    >
                      {item.reaction ? (
                        <View style={tw`flex-row items-center`}>
                          <Text style={tw`text-2xl mr-1`}>{getReactionIcon(item.reaction)}</Text>
                          <Ionicons name="heart" size={26} color="#EF4444" />
                        </View>
                      ) : (
                        <Ionicons
                          name={item.hasLiked ? 'heart' : 'heart-outline'}
                          size={26}
                          color={item.hasLiked ? '#EF4444' : '#374151'}
                        />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setSelectedPost(item)}
                      style={tw`mr-3`}
                    >
                      <Ionicons name="chatbubble-outline" size={24} color="#374151" />
                    </TouchableOpacity>
                    <TouchableOpacity>
                      <Ionicons name="paper-plane-outline" size={24} color="#374151" />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity>
                    <Ionicons name="bookmark-outline" size={24} color="#374151" />
                  </TouchableOpacity>
                </View>

                {/* Reaction Picker */}
                {showReactionPicker === item.id && (
                  <View style={tw`absolute left-4 top-12 bg-white rounded-full px-3 py-2 flex-row items-center shadow-lg border border-gray-200 z-10`}>
                    <TouchableOpacity onPress={() => setReaction(item.id, 'like')} style={tw`mx-1`}>
                      <Text style={tw`text-2xl`}>👍</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setReaction(item.id, 'love')} style={tw`mx-1`}>
                      <Text style={tw`text-2xl`}>❤️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setReaction(item.id, 'laugh')} style={tw`mx-1`}>
                      <Text style={tw`text-2xl`}>😂</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setReaction(item.id, 'wow')} style={tw`mx-1`}>
                      <Text style={tw`text-2xl`}>😮</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setReaction(item.id, 'support')} style={tw`mx-1`}>
                      <Text style={tw`text-2xl`}>💪</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Likes Count */}
                <Text style={tw`font-bold text-gray-900 mb-2 text-base`}>
                  {item.likes} {item.likes === 1 ? 'like' : 'likes'}
                  {item.reaction && item.reaction !== 'like' && (
                    <Text style={tw`text-gray-600 font-normal`}> • {getReactionIcon(item.reaction)}</Text>
                  )}
                </Text>

                {/* Caption */}
                <View style={tw`mb-2 flex-row flex-wrap`}>
                  <TouchableOpacity
                    onPress={() => {
                      const rootNavigation = navigation.getParent() || navigation;
                      rootNavigation.navigate('PublicProfile' as never, { userId: item.userId } as never);
                    }}
                  >
                    <Text style={tw`font-bold text-gray-900 text-base`}>{item.username}</Text>
                  </TouchableOpacity>
                  <Text style={tw`text-gray-900 text-base`}> {item.caption}</Text>
                </View>

                {/* CO2 Calculator */}
                <CO2Calculator category={item.category} activityType="post" />

                {/* Comments */}
                {item.comments > 0 && (
                  <TouchableOpacity onPress={() => setSelectedPost(item)}>
                    <Text style={tw`text-gray-500 text-sm mb-1`}>
                      View all {item.comments} {item.comments === 1 ? 'comment' : 'comments'}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Add Comment */}
                <TouchableOpacity
                  onPress={() => setSelectedPost(item)}
                  style={tw`mt-2`}
                >
                  <Text style={tw`text-gray-500 text-sm`}>Add a comment...</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={tw`items-center justify-center py-12 px-4`}>
              <Ionicons name="images-outline" size={64} color="#D1D5DB" />
              <Text style={tw`text-gray-500 mt-4 text-center text-base font-medium`}>
                {selectedCategory 
                  ? 'No posts in this category yet. Be the first to post!'
                  : 'No posts yet. Be the first to share your journey!'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  const rootNavigation = navigation.getParent() || navigation;
                  rootNavigation.navigate('Post' as never);
                }}
                style={tw`mt-6 bg-green-600 px-6 py-3 rounded-full`}
              >
                <Text style={tw`text-white font-semibold`}>Create Your First Post</Text>
              </TouchableOpacity>
            </View>
          }
        />

        {/* Comments Modal */}
        {selectedPost && (
          <Modal
            visible={!!selectedPost}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setSelectedPost(null)}
          >
            <CommentsScreen
              postId={selectedPost.id}
              postUsername={selectedPost.username}
              postCaption={selectedPost.caption}
              onClose={() => setSelectedPost(null)}
            />
          </Modal>
        )}

      </View>
    </SafeAreaView>
  );
}

