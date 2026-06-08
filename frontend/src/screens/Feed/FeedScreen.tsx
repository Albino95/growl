import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
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
import { resolveStoryDisplayUri, resolveAvatarUri, resolvePostMediaUri } from '../../utils/images';
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
  /** Friends (of viewer) who liked — from API when available */
  friendLikesCount?: number;
  friendLikers?: string[];
  isFriend?: boolean;
  isOwn?: boolean;
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

export default function FeedScreen({ navigation, route }: any) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const feedItems = useAppSelector((s) => s.feed.items);
  const feedStatus = useAppSelector((s) => s.feed.status);
  const feedError = useAppSelector((s) => s.feed.error);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [retryingFeed, setRetryingFeed] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [failedPostImages, setFailedPostImages] = useState<Record<string, boolean>>({});

  const toLocalPost = (post: FeedPost): Post => {
    const username = post.metadata?.username || 'User';
    const likes = Number(post.metadata?.likes || 0);
    const comments = Number(post.metadata?.comments || 0);
    const friendLikesCount = Number(post.metadata?.friend_likes_count || 0);
    const hasLiked = !!post.metadata?.has_liked;

    const imageUri = resolvePostMediaUri(post.image_url, post.category || 'general', post.id);

    return {
      id: post.id,
      userId: post.user_id,
      username,
      avatar: resolveAvatarUri(post.user_id, username, post.metadata?.avatar),
      image: imageUri,
      caption: post.caption || '',
      category: post.category || 'general',
      subcategory: post.subcategory || undefined,
      likes,
      comments,
      timestamp: formatTimeAgo(post.created_at),
      hasLiked,
      reaction: hasLiked ? 'love' : null,
      friendLikesCount,
      friendLikers: Array.isArray(post.metadata?.friend_likers) ? post.metadata?.friend_likers : [],
      isFriend: !!post.metadata?.is_friend,
      isOwn: post.user_id === user?.id,
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
          setStories([]);
        }
      } else {
        setStories([]);
      }
    } catch (error: unknown) {
      console.error('[FeedScreen] Error loading stories:', error);
      setStories([]);
    }
  };

  useEffect(() => {
    dispatch(fetchFeedPosts());
    loadStoriesOnly();
  }, [dispatch]);

  useFocusEffect(
    useCallback(() => {
      dispatch(fetchFeedPosts());
    }, [dispatch])
  );

  useEffect(() => {
    if (feedStatus !== 'succeeded') return;
    setPosts(feedItems.map(toLocalPost));
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

  const retryFeed = async () => {
    if (retryingFeed) return;
    setRetryingFeed(true);
    try {
      await dispatch(fetchFeedPosts()).unwrap();
    } catch {
      // Keep banner visible; store already captures the latest error.
    } finally {
      setRetryingFeed(false);
    }
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
                likes: liked ? post.likes + (post.hasLiked ? 0 : 1) : Math.max(0, post.likes - (post.hasLiked ? 1 : 0)),
                reaction: liked ? post.reaction || 'love' : null,
              }
            : post
        )
      );
      return;
    } catch {
      // Fallback optimistic toggle
    }
    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? {
              ...post,
              hasLiked: !post.hasLiked,
              likes: post.hasLiked ? Math.max(0, post.likes - 1) : post.likes + 1,
              reaction: post.hasLiked ? null : post.reaction || 'love',
            }
          : post
      )
    );
  };

  const setReaction = async (postId: string, reaction: ReactionType) => {
    setShowReactionPicker(null);
    const current = posts.find((p) => p.id === postId);
    try {
      if (reaction === null) {
        if (current?.hasLiked) {
          await toggleFeedPostLike(postId);
        }
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? {
                  ...p,
                  reaction: null,
                  hasLiked: false,
                  likes: Math.max(0, p.likes - (current?.hasLiked ? 1 : 0)),
                }
              : p
          )
        );
        return;
      }
      if (!current?.hasLiked) {
        await toggleFeedPostLike(postId);
      }
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                reaction,
                hasLiked: true,
                likes: p.likes + (current?.hasLiked ? 0 : 1),
              }
            : p
        )
      );
    } catch {
      void dispatch(fetchFeedPosts());
    }
  };

  const renderReactionIcon = (item: Post) => {
    const active = item.hasLiked || item.reaction != null;
    if (!active) {
      return <Ionicons name="heart-outline" size={26} color="#374151" />;
    }
    const r = item.reaction || 'love';
    switch (r) {
      case 'like':
        return <Text style={tw`text-2xl leading-none`}>👍</Text>;
      case 'love':
        return <Ionicons name="heart" size={26} color="#EF4444" />;
      case 'laugh':
        return <Text style={tw`text-2xl leading-none`}>😂</Text>;
      case 'wow':
        return <Text style={tw`text-2xl leading-none`}>😮</Text>;
      case 'support':
        return <Text style={tw`text-2xl leading-none`}>💪</Text>;
      default:
        return <Ionicons name="heart" size={26} color="#EF4444" />;
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
                const rootNavigation = navigation.getParent() || navigation;
                rootNavigation.navigate('CreateStory' as never);
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

        {feedStatus === 'failed' && (
          <View style={tw`mx-4 mt-3 mb-1 px-3 py-3 rounded-xl border border-red-200 bg-red-50`}>
            <View style={tw`flex-row items-center`}>
              <Ionicons name="alert-circle-outline" size={18} color="#DC2626" />
              <Text style={tw`ml-2 flex-1 text-sm text-red-800`}>
                {feedError || 'Could not load your feed right now.'}
              </Text>
              <TouchableOpacity
                onPress={() => void retryFeed()}
                disabled={retryingFeed}
                style={tw`ml-2 px-3 py-1.5 rounded-full bg-red-600 ${retryingFeed ? 'opacity-70' : ''}`}
              >
                <Text style={tw`text-xs font-semibold text-white`}>
                  {retryingFeed ? 'Retrying...' : 'Retry'}
                </Text>
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
              {(item.isFriend || item.isOwn) && (
                <View style={tw`px-4 pb-2`}>
                  <View
                    style={tw`self-start rounded-full px-2.5 py-1 ${
                      item.isOwn ? 'bg-emerald-100' : 'bg-indigo-100'
                    }`}
                  >
                    <Text
                      style={tw`text-[11px] font-semibold ${
                        item.isOwn ? 'text-emerald-800' : 'text-indigo-800'
                      }`}
                    >
                      {item.isOwn ? 'Your post' : 'Friend'}
                    </Text>
                  </View>
                </View>
              )}

              {/* Post Image - Modern Style */}
              <View style={tw`w-full bg-gray-50`}>
                {item.image && item.image.trim() !== '' ? (
                  <Image
                    source={{
                      uri: failedPostImages[item.id]
                        ? `https://picsum.photos/seed/fallback-post-${encodeURIComponent(item.id)}/1200/1200`
                        : item.image,
                    }}
                    style={tw`w-full h-96`}
                    contentFit="cover"
                    onError={() => {
                      setFailedPostImages((prev) =>
                        prev[item.id] ? prev : { ...prev, [item.id]: true }
                      );
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
                      onPress={() => void toggleLike(item.id)}
                      onLongPress={() => setShowReactionPicker(showReactionPicker === item.id ? null : item.id)}
                      style={tw`mr-3`}
                    >
                      {renderReactionIcon(item)}
                    </TouchableOpacity>
                    <View style={tw`relative mr-3`}>
                      <TouchableOpacity onPress={() => setSelectedPost(item)}>
                        <Ionicons name="chatbubble-outline" size={24} color="#374151" />
                      </TouchableOpacity>
                      <View
                        style={tw`absolute -top-2 -right-2 min-w-[18px] px-1 py-0.5 rounded-full items-center justify-center ${
                          item.comments > 0 ? 'bg-stone-700' : 'bg-stone-300'
                        }`}
                      >
                        <Text style={tw`text-[10px] font-bold ${item.comments > 0 ? 'text-white' : 'text-stone-600'}`}>
                          {item.comments > 99 ? '99+' : item.comments}
                        </Text>
                      </View>
                    </View>
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
                    <TouchableOpacity onPress={() => void setReaction(item.id, 'like')} style={tw`mx-1`}>
                      <Text style={tw`text-2xl`}>👍</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => void setReaction(item.id, 'love')} style={tw`mx-1`}>
                      <Text style={tw`text-2xl`}>❤️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => void setReaction(item.id, 'laugh')} style={tw`mx-1`}>
                      <Text style={tw`text-2xl`}>😂</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => void setReaction(item.id, 'wow')} style={tw`mx-1`}>
                      <Text style={tw`text-2xl`}>😮</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => void setReaction(item.id, 'support')} style={tw`mx-1`}>
                      <Text style={tw`text-2xl`}>💪</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Likes Count */}
                <Text style={tw`font-bold text-gray-900 mb-2 text-base`}>
                  {item.likes} {item.likes === 1 ? 'like' : 'likes'}
                  {(item.friendLikesCount ?? 0) > 0 ? (
                    <Text style={tw`text-emerald-700 font-semibold`}>
                      {' '}
                      · {item.friendLikesCount} from friends
                    </Text>
                  ) : null}
                </Text>
                {(item.friendLikers?.length ?? 0) > 0 ? (
                  <Text style={tw`text-xs text-indigo-700 mb-2`}>
                    Liked by friends: {item.friendLikers?.slice(0, 3).join(', ')}
                    {(item.friendLikers?.length ?? 0) > 3
                      ? ` +${(item.friendLikers?.length ?? 0) - 3} more`
                      : ''}
                  </Text>
                ) : null}

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
                {item.comments === 0 ? (
                  <TouchableOpacity onPress={() => setSelectedPost(item)}>
                    <Text style={tw`text-gray-400 text-xs mb-1`}>No comments yet</Text>
                  </TouchableOpacity>
                ) : null}

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
              onCommentsChanged={(count) => {
                setPosts((prev) =>
                  prev.map((post) =>
                    post.id === selectedPost.id ? { ...post, comments: count } : post
                  )
                );
                void dispatch(fetchFeedPosts());
              }}
            />
          </Modal>
        )}

      </View>
    </SafeAreaView>
  );
}

