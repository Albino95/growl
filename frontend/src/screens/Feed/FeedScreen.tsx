import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, ScrollView, RefreshControl, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../store/hooks';
import CATEGORIES from '../../data/categories';
import CommentsScreen from '../Comments/CommentsScreen';
import CO2Calculator from '../../components/ui/CO2Calculator';
import { getAvatarUrl, getStoryImageUrl, getCategoryImageUrl, getPostImageUrl } from '../../utils/images';
import { getFeedPosts, toggleFeedPostLike, type FeedPost } from '../../services/api/feed';
import { getStories, viewStory, type StoryItem } from '../../services/api/stories';
import tw from '../../lib/tw';

type Story = {
  id: string;
  userId: string;
  username: string;
  avatar: string;
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
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  const [stories, setStories] = useState<Story[]>([]);

  const toLocalPost = (post: FeedPost): Post => {
    const username = post.metadata?.username || 'User';
    const likes = Number(post.metadata?.likes || 0);
    const comments = Number(post.metadata?.comments || 0);
    return {
      id: post.id,
      userId: post.user_id,
      username,
      avatar: post.metadata?.avatar || getAvatarUrl(post.user_id, username),
      image: post.image_url || getPostImageUrl(post.category || 'default', post.id),
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

  const loadFeedAndStories = async () => {
    try {
      const [feedRes, storiesRes] = await Promise.all([getFeedPosts(), getStories()]);
      if (feedRes.success) {
        setPosts(feedRes.data.length ? feedRes.data.map(toLocalPost) : MOCK_POSTS);
      }
      if (storiesRes.success) {
        setStories(
          (storiesRes.data.stories || []).map((s: StoryItem) => ({
            id: s.id,
            userId: s.userId,
            username: s.username,
            avatar: s.avatar || getAvatarUrl(s.userId, s.username),
            hasViewed: !!s.hasViewed,
          }))
        );
      }
    } catch (error) {
      // Keep UI functional by falling back to local demo content
      setPosts(MOCK_POSTS);
      setStories(MOCK_STORIES);
    }
  };

  useEffect(() => {
    loadFeedAndStories();
  }, []);

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
    
    return Array.from(grouped.values());
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
    await loadFeedAndStories();
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
    <SafeAreaView style={tw`flex-1 bg-white`}>
      <View style={tw`flex-1`}>
        {/* Header with Messages/Stories */}
        <View style={tw`px-4 pt-2 pb-3 border-b border-gray-200 bg-white`}>
          <View style={tw`flex-row items-center justify-between mb-3`}>
            <Text style={tw`text-2xl font-bold text-green-600`}>Grow!</Text>
          </View>

          {/* Messages/Stories Section (Instagram-style) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={tw`mb-3`}
            contentContainerStyle={tw`px-2`}
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
                      image: getStoryImageUrl(s.userId, s.id), // Generate story image based on user and story ID
                      createdAt: new Date(Date.now() - (userStories.length - idx) * 3600000).toISOString(), // Stagger times
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
                        source={{ uri: user.avatar }}
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
            <View style={tw`bg-white mb-3 overflow-hidden`}>
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
                <Image
                  source={{ uri: item.image }}
                  style={tw`w-full h-96`}
                  contentFit="cover"
                />
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
            <View style={tw`items-center justify-center py-12`}>
              <Ionicons name="images-outline" size={64} color="#D1D5DB" />
              <Text style={tw`text-gray-500 mt-4 text-center`}>
                No posts yet. Be the first to post in this category!
              </Text>
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

