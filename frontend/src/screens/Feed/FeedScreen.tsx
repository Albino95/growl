import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  FlatList,
  SectionList,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Modal,
  Platform,
  Alert,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchFeedPosts } from '../../store/slices/feedSlice';
import {
  horizontalScrollProps,
  verticalScrollProps,
  feedListPerformanceProps,
  TAB_SCREEN_BOTTOM_PADDING,
} from '../../constants/scroll';
import CATEGORIES from '../../data/categories';
import CommentsScreen from '../Comments/CommentsScreen';
import CO2Calculator from '../../components/ui/CO2Calculator';
import Chip from '../../components/ui/Chip';
import EmptyState from '../../components/ui/EmptyState';
import PrimaryButton from '../../components/ui/PrimaryButton';
import SkeletonCard from '../../components/ui/SkeletonCard';
import { resolveStoryDisplayUri, resolveAvatarUri, resolvePostMediaUri } from '../../utils/images';
import { toggleFeedPostLike, getFeedPostLikes, type FeedPost, type FeedLiker } from '../../services/api/feed';
import { getStories, viewStory, type StoryItem } from '../../services/api/stories';
import { blockUser, reportContent } from '../../services/api/friends';
import tw from '../../lib/tw';
import { alertMessage } from '../../utils/confirmDialog';

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
  audioUrl?: string;
  audioTitle?: string;
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
  const feedFollowing = useAppSelector((s) => s.feed.following);
  const feedSuggested = useAppSelector((s) => s.feed.suggested);
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
  const [likesModal, setLikesModal] = useState<{
    title: string;
    users: FeedLiker[];
    subtitle?: string;
  } | null>(null);
  const [likesLoading, setLikesLoading] = useState(false);
  const [postMenuPost, setPostMenuPost] = useState<Post | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

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
      audioUrl:
        typeof post.metadata?.audio_url === 'string' ? post.metadata.audio_url : undefined,
      audioTitle:
        typeof post.metadata?.audio_title === 'string' ? post.metadata.audio_title : undefined,
    };
  };

  const togglePostAudio = (post: Post) => {
    if (!post.audioUrl) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (playingAudioId === post.id) {
        audioRef.current?.pause();
        setPlayingAudioId(null);
        return;
      }
      if (!audioRef.current) {
        audioRef.current = new window.Audio();
      }
      audioRef.current.src = post.audioUrl;
      void audioRef.current.play();
      setPlayingAudioId(post.id);
      audioRef.current.onended = () => setPlayingAudioId(null);
      return;
    }
    alertMessage('Music preview', `Now playing: ${post.audioTitle || 'Soundtrack'}`);
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

  useFocusEffect(
    useCallback(() => {
      // First paint may need a loading state; polling stays silent.
      void dispatch(fetchFeedPosts());
      void loadStoriesOnly();

      // Lightweight live refresh while the Feed tab is focused (WebSocket-like freshness without DOs).
      const pollId = setInterval(() => {
        void dispatch(fetchFeedPosts({ force: true, silent: true }));
      }, 25_000);

      return () => clearInterval(pollId);
    }, [dispatch])
  );

  useEffect(() => {
    // Stories warm-up; feed is owned by focus effect to avoid duplicate fetches.
    void loadStoriesOnly();
  }, []);

  useEffect(() => {
    if (feedStatus !== 'succeeded') return;
    const all = [...feedFollowing, ...feedSuggested];
    const source = all.length > 0 ? all : feedItems;
    setPosts(source.map(toLocalPost));
  }, [feedFollowing, feedSuggested, feedItems, feedStatus, user?.id]);

  const feedSections = useMemo(() => {
    const mapSection = (items: typeof feedFollowing, title: string) => {
      const mapped = items.map(toLocalPost);
      const filtered = selectedCategory
        ? mapped.filter((post) => {
            if (selectedCategory.includes(':')) {
              const [cat, sub] = selectedCategory.split(':');
              return post.category === cat && post.subcategory === sub;
            }
            return post.category === selectedCategory;
          })
        : mapped;
      return filtered.length > 0 ? { title, data: filtered } : null;
    };
    const following = mapSection(feedFollowing, 'From your circle');
    const suggested = mapSection(feedSuggested, 'Suggested for you');
    return [following, suggested].filter(Boolean) as { title: string; data: Post[] }[];
  }, [feedFollowing, feedSuggested, selectedCategory, user?.id]);

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
    return result;
  }, [stories]);

  // Check if viewer has posted today to avoid stale nudges.
  const hasPostedToday = useMemo(() => {
    if (!user?.id) return true;
    const today = new Date().toDateString();
    return feedItems.some(
      (p) => p.user_id === user.id && new Date(p.created_at).toDateString() === today
    );
  }, [feedItems, user?.id]);

  const userCategories = useMemo(() => {
    const list = Array.isArray(user?.categories) ? user.categories : [];
    return list
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter((x) => x.length > 0);
  }, [user?.categories]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await dispatch(fetchFeedPosts({ force: true })).unwrap();
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
      await dispatch(fetchFeedPosts({ force: true })).unwrap();
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
      void dispatch(fetchFeedPosts({ force: true, silent: true }));
    }
  };

  const openLikesModal = async (post: Post, mode: 'all' | 'friends') => {
    setLikesLoading(true);
    try {
      const likes = await getFeedPostLikes(post.id);
      const users = mode === 'friends' ? likes.friendLikers : likes.likers;
      setLikesModal({
        title: mode === 'friends' ? 'Friends who liked' : 'Liked by',
        users,
        subtitle:
          mode === 'friends'
            ? `${likes.friendLikesCount} friends liked this`
            : `${likes.likes} total likes`,
      });
    } catch (e) {
      setLikesModal({
        title: 'Liked by',
        users: [],
        subtitle: e instanceof Error ? e.message : 'Could not load likes',
      });
    } finally {
      setLikesLoading(false);
    }
  };

  const blockPostUser = async (post: Post) => {
    try {
      await blockUser(post.userId);
      setPosts((prev) => prev.filter((p) => p.userId !== post.userId));
      setPostMenuPost(null);
      if (Platform.OS === 'web') {
        alert(`${post.username} has been blocked.`);
      } else {
        Alert.alert('Blocked', `${post.username} has been blocked.`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not block user';
      if (Platform.OS === 'web') {
        alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
    }
  };

  const reportPost = (post: Post) => {
    setPostMenuPost(null);
    Alert.alert('Report post', 'Why are you reporting this post?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Spam',
        onPress: () => {
          void reportContent(post.id, 'post', 'spam')
            .then(() => Alert.alert('Reported', 'Thank you. We will review this post.'))
            .catch((e: unknown) =>
              Alert.alert('Error', e instanceof Error ? e.message : 'Could not submit report')
            );
        },
      },
      {
        text: 'Harassment',
        onPress: () => {
          void reportContent(post.id, 'post', 'harassment')
            .then(() => Alert.alert('Reported', 'Thank you. We will review this post.'))
            .catch((e: unknown) =>
              Alert.alert('Error', e instanceof Error ? e.message : 'Could not submit report')
            );
        },
      },
      {
        text: 'Inappropriate',
        onPress: () => {
          void reportContent(post.id, 'post', 'inappropriate_content')
            .then(() => Alert.alert('Reported', 'Thank you. We will review this post.'))
            .catch((e: unknown) =>
              Alert.alert('Error', e instanceof Error ? e.message : 'Could not submit report')
            );
        },
      },
      {
        text: 'Other',
        onPress: () => {
          void reportContent(post.id, 'post', 'other')
            .then(() => Alert.alert('Reported', 'Thank you. We will review this post.'))
            .catch((e: unknown) =>
              Alert.alert('Error', e instanceof Error ? e.message : 'Could not submit report')
            );
        },
      },
    ]);
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
    <SafeAreaView style={tw`flex-1 bg-surface-page`} edges={['top']}>
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
            <Text style={tw`text-2xl font-bold text-brand-600`}>Growl</Text>
          </View>

          {/* Messages/Stories Section (Instagram-style) */}
          <ScrollView
            horizontal
            style={tw`mb-3`}
            contentContainerStyle={tw`px-2`}
            {...horizontalScrollProps}
          >
            <TouchableOpacity
              style={tw`items-center justify-center w-16 h-16 rounded-full bg-brand-50 border-2 border-brand-200 mr-4`}
              onPress={() => {
                // Navigate to messages screen
                const rootNavigation = navigation.getParent() || navigation;
                rootNavigation.navigate('Messages');
              }}
            >
              <Ionicons name="chatbubbles" size={24} color="#059669" />
              <Text style={tw`text-[10px] text-stone-600 mt-1`}>Inbox</Text>
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
              <Text style={tw`text-[10px] text-stone-600 mt-1`}>Reels</Text>
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
                        allViewed ? 'border-stone-300' : 'border-accent-600'
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
                  <Text style={tw`text-xs text-stone-600 mt-1 max-w-16`} numberOfLines={1}>
                    {user.username}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={tw`items-center justify-center w-16 h-16 rounded-full border-2 border-dashed border-stone-300`}
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
              <Chip selected={selectedCategory === null} onPress={() => setSelectedCategory(null)}>
                All
              </Chip>
              {userCategories.map((cat) => {
                const category = CATEGORIES.find((c) => c.key === cat || c.key === cat.split(':')[0]);
                const subcategory = cat.includes(':')
                  ? category?.subcategories.find((s) => s.key === cat.split(':')[1])
                  : null;
                const labelCandidate = subcategory ? subcategory.label : category?.label || cat;
                const label = String(labelCandidate || '').trim() || 'Untitled';

                return (
                  <Chip key={cat} selected={selectedCategory === cat} onPress={() => setSelectedCategory(cat)}>
                    {label}
                  </Chip>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* Daily Post Reminder */}
        {!hasPostedToday && posts.length > 0 && (
          <View style={tw`bg-brand-50 border-b border-brand-200 px-4 py-3`}>
            <View style={tw`flex-row items-center gap-3`}>
              <Ionicons name="sparkles" size={20} color="#059669" />
              <Text style={tw`text-sm text-brand-800 flex-1`}>
                Share your progress today to stay connected with your community.
              </Text>
              <View style={tw`w-24`}>
                <PrimaryButton
                  label="Post"
                  variant="soft"
                  onPress={() => {
                    const rootNavigation = navigation.getParent() || navigation;
                    rootNavigation.navigate('Post');
                  }}
                />
              </View>
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

        {feedStatus === 'loading' && posts.length === 0 ? (
          <View style={tw`px-4 pt-2`}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : null}

        {/* Posts Feed */}
        <SectionList
          sections={feedSections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={tw`px-4 pt-4 pb-2`}>
              <Text style={tw`text-lg font-bold text-stone-900`}>{section.title}</Text>
            </View>
          )}
          contentContainerStyle={[tw`px-4 pt-2`, { paddingBottom: TAB_SCREEN_BOTTOM_PADDING }]}
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
                tw`bg-white mb-4 overflow-hidden rounded-2xl border border-stone-200`,
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
                    <Text style={tw`font-bold text-stone-900 text-base`}>{item.username}</Text>
                    <View style={tw`flex-row items-center flex-wrap gap-1 mt-0.5`}>
                      <Text style={tw`text-xs text-stone-500`}>{item.timestamp}</Text>
                      <View style={tw`px-2 py-0.5 rounded-full bg-brand-50`}>
                        <Text style={tw`text-[10px] font-semibold text-brand-800`}>
                          {item.subcategory
                            ? `${item.category} · ${item.subcategory}`
                            : item.category}
                        </Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={tw`p-1`} onPress={() => setPostMenuPost(item)}>
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
              <View style={tw`w-full bg-stone-50`}>
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
                  </View>
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
                <TouchableOpacity onPress={() => void openLikesModal(item, 'all')}>
                  <Text style={tw`font-bold text-stone-900 mb-2 text-base`}>
                    {item.likes} {item.likes === 1 ? 'like' : 'likes'}
                  </Text>
                </TouchableOpacity>
                {(item.friendLikesCount ?? 0) > 0 ? (
                  <TouchableOpacity onPress={() => void openLikesModal(item, 'friends')}>
                    <Text style={tw`text-emerald-700 font-semibold mb-2`}>
                      {item.friendLikesCount} from friends
                    </Text>
                  </TouchableOpacity>
                ) : null}
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
                    <Text style={tw`font-bold text-stone-900 text-base`}>{item.username}</Text>
                  </TouchableOpacity>
                  <Text style={tw`text-stone-900 text-base`}> {item.caption}</Text>
                </View>

                {item.audioTitle ? (
                  <Pressable
                    onPress={() => togglePostAudio(item)}
                    style={tw`flex-row items-center self-start bg-brand-50 border border-brand-200 rounded-full px-3 py-1.5 mb-2`}
                  >
                    <Ionicons
                      name={playingAudioId === item.id ? 'pause' : 'musical-notes'}
                      size={14}
                      color="#059669"
                    />
                    <Text style={tw`text-brand-800 text-xs font-semibold ml-1.5`}>
                      {item.audioTitle}
                    </Text>
                  </Pressable>
                ) : null}

                {/* CO2 Calculator */}
                <CO2Calculator category={item.category} activityType="post" />

                {/* Comments */}
                {item.comments > 0 && (
                  <TouchableOpacity onPress={() => setSelectedPost(item)}>
                    <Text style={tw`text-stone-500 text-sm mb-1`}>
                      View all {item.comments} {item.comments === 1 ? 'comment' : 'comments'}
                    </Text>
                  </TouchableOpacity>
                )}
                {item.comments === 0 ? (
                  <TouchableOpacity onPress={() => setSelectedPost(item)}>
                    <Text style={tw`text-stone-400 text-xs mb-1`}>No comments yet</Text>
                  </TouchableOpacity>
                ) : null}

                {/* Add Comment */}
                <TouchableOpacity
                  onPress={() => setSelectedPost(item)}
                  style={tw`mt-2`}
                >
                  <Text style={tw`text-stone-500 text-sm`}>Add a comment...</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="images-outline"
              title={selectedCategory ? 'No posts in this category yet' : 'Your feed is quiet'}
              description={
                selectedCategory
                  ? 'Try a different category or clear filters to discover more posts.'
                  : feedStatus === 'failed'
                    ? 'Could not load posts. Pull down to retry.'
                    : 'Explore people in your growth areas or share your first post.'
              }
              actionLabel="Explore"
              onAction={() => navigation.navigate('Explore')}
            />
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
                void dispatch(fetchFeedPosts({ force: true, silent: true }));
              }}
            />
          </Modal>
        )}

        {likesModal && (
          <Modal
            visible={!!likesModal}
            transparent
            animationType="slide"
            onRequestClose={() => setLikesModal(null)}
          >
            <View style={tw`flex-1 bg-black/40 justify-end`}>
              <View style={tw`bg-white rounded-t-3xl p-4 max-h-[70%]`}>
                <View style={tw`flex-row items-center justify-between mb-2`}>
                  <Text style={tw`text-lg font-bold text-stone-900`}>{likesModal.title}</Text>
                  <TouchableOpacity onPress={() => setLikesModal(null)}>
                    <Ionicons name="close" size={22} color="#6B7280" />
                  </TouchableOpacity>
                </View>
                {likesModal.subtitle ? (
                  <Text style={tw`text-sm text-stone-500 mb-3`}>{likesModal.subtitle}</Text>
                ) : null}
                {likesLoading ? (
                  <View style={tw`py-10 items-center`}>
                    <Text style={tw`text-stone-500`}>Loading likes...</Text>
                  </View>
                ) : (
                  <FlatList
                    data={likesModal.users}
                    keyExtractor={(u) => u.id}
                    renderItem={({ item }) => (
                      <View style={tw`flex-row items-center py-2.5 border-b border-stone-100`}>
                        <Image
                          source={{ uri: resolveAvatarUri(item.id, item.username, item.avatar || null) }}
                          style={tw`w-9 h-9 rounded-full bg-stone-100 mr-3`}
                          contentFit="cover"
                        />
                        <View style={tw`flex-1`}>
                          <Text style={tw`font-semibold text-stone-900`}>{item.username}</Text>
                          {item.isFriend ? (
                            <Text style={tw`text-xs text-emerald-600`}>Friend</Text>
                          ) : null}
                        </View>
                      </View>
                    )}
                    ListEmptyComponent={
                      <View style={tw`py-8 items-center`}>
                        <Text style={tw`text-stone-500`}>No likes to show.</Text>
                      </View>
                    }
                  />
                )}
              </View>
            </View>
          </Modal>
        )}

        {postMenuPost && (
          <Modal
            visible={!!postMenuPost}
            transparent
            animationType="fade"
            onRequestClose={() => setPostMenuPost(null)}
          >
            <View style={tw`flex-1 justify-end`}>
              <Pressable style={tw`absolute inset-0 bg-black/40`} onPress={() => setPostMenuPost(null)} />
              <View style={tw`bg-white rounded-t-3xl p-4`}>
                <TouchableOpacity
                  style={tw`flex-row items-center py-4 border-b border-stone-200`}
                  onPress={() => {
                    const target = postMenuPost;
                    if (!target || target.isOwn) return;
                    reportPost(target);
                  }}
                >
                  <Ionicons name="flag-outline" size={22} color="#D97706" />
                  <Text style={tw`ml-3 text-base text-stone-900`}>Report post</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={tw`flex-row items-center py-4 border-b border-stone-200`}
                  onPress={() => {
                    const target = postMenuPost;
                    if (!target) return;
                    setPostMenuPost(null);
                    if (target.isOwn) return;
                    Alert.alert('Block User', `Block ${target.username}?`, [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Block',
                        style: 'destructive',
                        onPress: () => {
                          void blockPostUser(target);
                        },
                      },
                    ]);
                  }}
                >
                  <Ionicons name="ban-outline" size={22} color="#DC2626" />
                  <Text style={tw`ml-3 text-base text-stone-900`}>Block user</Text>
                </TouchableOpacity>
                <TouchableOpacity style={tw`flex-row items-center py-4`} onPress={() => setPostMenuPost(null)}>
                  <Ionicons name="close-outline" size={22} color="#6B7280" />
                  <Text style={tw`ml-3 text-base text-stone-900`}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}

      </View>
    </SafeAreaView>
  );
}

