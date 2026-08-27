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
import { fetchFeedPosts, patchFeedPostEngagement } from '../../store/slices/feedSlice';
import {
  horizontalScrollProps,
  verticalScrollProps,
  feedListPerformanceProps,
  TAB_SCREEN_BOTTOM_PADDING,
} from '../../constants/scroll';
import CATEGORIES from '../../data/categories';
import CommentsScreen from '../Comments/CommentsScreen';
import CO2Calculator from '../../components/ui/CO2Calculator';
import EmptyState from '../../components/ui/EmptyState';
import SkeletonCard from '../../components/ui/SkeletonCard';
import GrowChromeHeader from '../../components/ui/GrowChromeHeader';
import { CategoryCapsuleRow, type CapsuleItem } from '../../components/ui/CategoryCapsule';
import HeartBurst from '../../components/feed/HeartBurst';
import FeedLikeButton, {
  ReactionPickerBar,
  type FeedReaction,
} from '../../components/feed/FeedLikeButton';
import { resolveStoryDisplayUri, resolveAvatarUri, resolvePostMediaUri } from '../../utils/images';
import { toggleFeedPostLike, getFeedPostLikes, type FeedPost, type FeedLiker } from '../../services/api/feed';
import { getStories, viewStory, type StoryItem } from '../../services/api/stories';
import { blockUser, reportContent } from '../../services/api/friends';
import tw from '../../lib/tw';
import { alertMessage } from '../../utils/confirmDialog';
import { openReelsAtPost, isReelPost } from '../../utils/reelNavigation';
import { triggerPressFeedback } from '../../utils/interactionFeedback';

type Story = {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  /** CDN/device URI from API; resolved again before render */
  image?: string;
  hasViewed: boolean;
};

type ReactionType = FeedReaction;

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
  isReel?: boolean;
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
  /** Client-only reaction emoji (API stores like boolean only). */
  const [reactionsById, setReactionsById] = useState<Record<string, ReactionType>>({});
  const [heartBurst, setHeartBurst] = useState<Record<string, number>>({});
  const lastTapRef = React.useRef<{ id: string; at: number } | null>(null);
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
      isReel: isReelPost(post),
    };
  };

  const openPost = (post: Post) => {
    if (post.isReel) {
      openReelsAtPost(navigation, post.id);
      return;
    }
    setSelectedPost(post);
  };
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
          setStories((prev) => {
            const locallyViewed = new Set(prev.filter((s) => s.hasViewed).map((s) => s.id));
            return storiesArray.map((s: StoryItem) => ({
              id: s.id,
              userId: s.userId,
              username: s.username,
              avatar: resolveAvatarUri(s.userId, s.username, s.avatar),
              image: s.image,
              // Keep optimistic views if a silent refresh races ahead of viewStory
              hasViewed: !!s.hasViewed || locallyViewed.has(s.id),
            }));
          });
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
      void dispatch(fetchFeedPosts());
      void loadStoriesOnly();

      const pollId = setInterval(() => {
        void dispatch(fetchFeedPosts({ force: true, silent: true }));
      }, 60_000);

      return () => clearInterval(pollId);
    }, [dispatch])
  );

  useEffect(() => {
    if (feedStatus !== 'succeeded') return;
    const all = [...feedFollowing, ...feedSuggested];
    const source = all.length > 0 ? all : feedItems;
    setPosts(source.map(toLocalPost));
  }, [feedFollowing, feedSuggested, feedItems, feedStatus, user?.id]);

  const feedSections = useMemo(() => {
    const mapSection = (items: typeof feedFollowing, title: string) => {
      const mapped = items.map((raw) => {
        const post = toLocalPost(raw);
        const reaction = reactionsById[post.id];
        if (reaction === undefined) return post;
        // Explicit null = unliked; any emoji = liked (client reaction overlay).
        return {
          ...post,
          reaction,
          hasLiked: reaction != null,
        };
      });
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
  }, [feedFollowing, feedSuggested, selectedCategory, user?.id, reactionsById]);

  const playHeartBurst = useCallback((postId: string) => {
    setHeartBurst((prev) => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }));
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

  const pathCapsules: CapsuleItem[] = useMemo(() => {
    const keys =
      userCategories.length > 0
        ? userCategories
        : CATEGORIES.slice(0, 8).map((c) => c.key);

    return keys.map((cat) => {
      const parentKey = cat.split(':')[0];
      const category = CATEGORIES.find((c) => c.key === parentKey);
      const subcategory = cat.includes(':')
        ? category?.subcategories.find((s) => s.key === cat.split(':')[1])
        : null;
      const label = String(
        (subcategory ? subcategory.label : category?.label || cat) || ''
      ).trim() || 'Path';
      return {
        key: cat,
        label,
        icon: (category?.icon || 'ellipse-outline') as keyof typeof Ionicons.glyphMap,
      };
    });
  }, [userCategories]);

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

  const toggleLike = async (postId: string, opts?: { fromDoubleTap?: boolean }) => {
    const current =
      feedSections.flatMap((s) => s.data).find((p) => p.id === postId) ||
      posts.find((p) => p.id === postId);
    const wasLiked = !!current?.hasLiked;

    // Optimistic Redux patch so SectionList re-renders with a filled heart.
    if (opts?.fromDoubleTap && wasLiked) {
      playHeartBurst(postId);
      return;
    }

    const nextLiked = !wasLiked;
    const nextLikes = nextLiked
      ? (current?.likes ?? 0) + 1
      : Math.max(0, (current?.likes ?? 0) - 1);

    dispatch(
      patchFeedPostEngagement({
        id: postId,
        has_liked: nextLiked,
        likes: nextLikes,
      })
    );
    setReactionsById((prev) => ({
      ...prev,
      [postId]: nextLiked ? prev[postId] || 'love' : null,
    }));
    if (nextLiked) playHeartBurst(postId);

    try {
      const res = await toggleFeedPostLike(postId);
      const liked = !!res.data?.liked;
      dispatch(
        patchFeedPostEngagement({
          id: postId,
          has_liked: liked,
          likes: liked
            ? wasLiked
              ? current?.likes ?? nextLikes
              : (current?.likes ?? 0) + 1
            : Math.max(0, (current?.likes ?? 1) - (wasLiked ? 1 : 0)),
        })
      );
      setReactionsById((prev) => ({
        ...prev,
        [postId]: liked ? prev[postId] || 'love' : null,
      }));
    } catch {
      // Revert optimistic patch
      dispatch(
        patchFeedPostEngagement({
          id: postId,
          has_liked: wasLiked,
          likes: current?.likes ?? 0,
        })
      );
      setReactionsById((prev) => ({
        ...prev,
        [postId]: wasLiked ? prev[postId] || 'love' : null,
      }));
    }
  };

  const handleMediaPress = (post: Post) => {
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && last.id === post.id && now - last.at < 320) {
      lastTapRef.current = null;
      triggerPressFeedback();
      void toggleLike(post.id, { fromDoubleTap: true });
      return;
    }
    lastTapRef.current = { id: post.id, at: now };

    if (post.isReel) {
      const postId = post.id;
      setTimeout(() => {
        if (lastTapRef.current?.id === postId) {
          openReelsAtPost(navigation, postId);
          lastTapRef.current = null;
        }
      }, 340);
    }
  };

  const setReaction = async (postId: string, reaction: ReactionType) => {
    setShowReactionPicker(null);
    const current =
      feedSections.flatMap((s) => s.data).find((p) => p.id === postId) ||
      posts.find((p) => p.id === postId);

    try {
      if (reaction === null) {
        if (current?.hasLiked) {
          await toggleFeedPostLike(postId);
        }
        dispatch(
          patchFeedPostEngagement({
            id: postId,
            has_liked: false,
            likes: Math.max(0, (current?.likes ?? 0) - (current?.hasLiked ? 1 : 0)),
          })
        );
        setReactionsById((prev) => ({ ...prev, [postId]: null }));
        return;
      }
      if (!current?.hasLiked) {
        await toggleFeedPostLike(postId);
        dispatch(
          patchFeedPostEngagement({
            id: postId,
            has_liked: true,
            likes: (current?.likes ?? 0) + 1,
          })
        );
      } else {
        dispatch(patchFeedPostEngagement({ id: postId, has_liked: true }));
      }
      setReactionsById((prev) => ({ ...prev, [postId]: reaction }));
      if (reaction === 'love') playHeartBurst(postId);
    } catch {
      // Keep optimistic reaction; avoid a hard feed refresh that can reshuffle posts.
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
    } catch (e: unknown) {
      setLikesModal({
        title: 'Likes',
        users: [],
        subtitle: e instanceof Error ? e.message : 'Could not load likes',
      });
    } finally {
      setLikesLoading(false);
    }
  };

  const feedListHeader = (
    <View style={tw`pb-2`}>
      <View style={tw`mx-4 mb-3 px-4 py-3 rounded-2xl bg-[#EAE4D6]/80 border border-stone-200/70`}>
        <Text style={tw`text-[11px] tracking-[2px] uppercase text-stone-500 font-semibold`}>
          Your circle
        </Text>
        <Text style={tw`text-sm text-stone-600 mt-1 leading-5`}>
          Progress from friends — and a few suggestions on your paths.
        </Text>
      </View>

      {/* Stories */}
      <ScrollView
        horizontal
        style={tw`mb-2`}
        contentContainerStyle={tw`px-4 pr-4`}
        {...horizontalScrollProps}
      >
        <TouchableOpacity
          style={tw`items-center mr-4`}
          onPress={() => {
            const rootNavigation = navigation.getParent() || navigation;
            rootNavigation.navigate('CreateStory' as never);
          }}
        >
          <View style={tw`w-14 h-14 rounded-full border-2 border-dashed border-stone-300 items-center justify-center bg-white/60`}>
            <Ionicons name="add" size={22} color="#78716C" />
          </View>
          <Text style={tw`text-[11px] text-stone-600 mt-1`}>Your story</Text>
        </TouchableOpacity>
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
                  image: resolveStoryDisplayUri(s.image, s.userId, s.id),
                  createdAt: new Date(
                    Date.now() - (userStories.length - idx) * 3600000
                  ).toISOString(),
                  views: Math.floor(Math.random() * 100),
                  hasViewed: !!s.hasViewed,
                }));

                const viewedIds = new Set(userStories.map((s) => s.id));
                setStories((prev) =>
                  prev.map((s) => (viewedIds.has(s.id) ? { ...s, hasViewed: true } : s))
                );

                rootNavigation.navigate('StoryViewer' as never, {
                  stories: fullStories,
                  initialIndex: 0,
                  onStoriesUpdate: (updatedStories: typeof fullStories) => {
                    const ids = updatedStories
                      .filter((us) => us.hasViewed)
                      .map((us) => us.id);
                    if (ids.length > 0) {
                      Promise.all(ids.map((id) => viewStory(id))).catch(() => undefined);
                    }
                    setStories((prev) =>
                      prev.map((s) => {
                        const updated = updatedStories.find((us) => us.id === s.id);
                        if (!updated) return s;
                        return { ...s, hasViewed: s.hasViewed || !!updated.hasViewed };
                      })
                    );
                  },
                } as never);
              }}
            >
              <View style={tw`relative`}>
                <View
                  style={tw`w-14 h-14 rounded-full border-2 ${
                    allViewed ? 'border-stone-300' : 'border-emerald-500'
                  } items-center justify-center bg-emerald-50 p-0.5`}
                >
                  <Image
                    source={{
                      uri: resolveAvatarUri(
                        storyUser.userId,
                        storyUser.username,
                        storyUser.avatar
                      ),
                    }}
                    style={tw`w-full h-full rounded-full`}
                    contentFit="cover"
                  />
                </View>
                {storyCount > 1 && (
                  <View
                    style={tw`absolute -top-1 -right-1 bg-emerald-600 rounded-full w-5 h-5 items-center justify-center border-2 border-white`}
                  >
                    <Text style={tw`text-white text-xs font-bold`}>{storyCount}</Text>
                  </View>
                )}
              </View>
              <Text style={tw`text-[11px] text-stone-600 mt-1 max-w-14`} numberOfLines={1}>
                {storyUser.username}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={tw`px-4 mt-1`}>
        <CategoryCapsuleRow
          items={pathCapsules}
          selectedKey={selectedCategory}
          onSelect={setSelectedCategory}
        />
      </View>

      {!hasPostedToday && posts.length > 0 && (
        <View style={tw`mx-4 mt-2 px-3.5 py-2.5 rounded-2xl bg-emerald-50 border border-emerald-100`}>
          <View style={tw`flex-row items-center gap-2`}>
            <Ionicons name="sparkles" size={18} color="#059669" />
            <Text style={tw`text-xs text-emerald-900 flex-1`}>
              Share today’s progress with your circle.
            </Text>
            <TouchableOpacity
              onPress={() => {
                const rootNavigation = navigation.getParent() || navigation;
                rootNavigation.navigate('Post');
              }}
              style={tw`px-3 py-1.5 rounded-full bg-emerald-600`}
            >
              <Text style={tw`text-xs font-semibold text-white`}>Post</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {feedStatus === 'failed' && (
        <View style={tw`mx-4 mt-2 px-3 py-2.5 rounded-xl border border-red-200 bg-red-50`}>
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
    </View>
  );

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`} edges={['top']}>
      <View style={tw`flex-1 bg-surface-page`}>
        <GrowChromeHeader
          right={
            <>
              <Pressable
                onPress={() => {
                  triggerPressFeedback();
                  const rootNavigation = navigation.getParent() || navigation;
                  rootNavigation.navigate('Messages');
                }}
                style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
                accessibilityLabel="Inbox"
              >
                <Ionicons name="chatbubbles-outline" size={17} color="#059669" />
              </Pressable>
              <Pressable
                onPress={() => {
                  triggerPressFeedback();
                  const rootNavigation = navigation.getParent() || navigation;
                  rootNavigation.navigate('Reels');
                }}
                style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
                accessibilityLabel="Reels"
              >
                <Ionicons name="play-circle-outline" size={17} color="#059669" />
              </Pressable>
            </>
          }
        />

        {feedStatus === 'loading' && posts.length === 0 ? (
          <View style={tw`px-5 pt-2`}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : null}

        {/* Posts Feed */}
        <SectionList
          sections={feedSections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={feedListHeader}
          renderSectionHeader={({ section }) => (
            <View style={tw`px-5 pt-3 pb-2`}>
              <Text style={tw`text-xs font-semibold tracking-widest text-stone-500 uppercase`}>
                {section.title}
              </Text>
            </View>
          )}
          contentContainerStyle={[tw`pt-1`, { paddingBottom: TAB_SCREEN_BOTTOM_PADDING }]}
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
              style={tw`mx-5 mb-4 overflow-hidden rounded-2xl bg-[#FFFcf7] border border-stone-200/70`}
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
                      item.isOwn ? 'bg-emerald-100' : 'bg-stone-100'
                    }`}
                  >
                    <Text
                      style={tw`text-[11px] font-semibold ${
                        item.isOwn ? 'text-emerald-800' : 'text-stone-700'
                      }`}
                    >
                      {item.isOwn ? 'Your post' : 'Friend'}
                    </Text>
                  </View>
                </View>
              )}

              {/* Post Image — double-tap to like */}
              <Pressable onPress={() => handleMediaPress(item)} style={tw`relative w-full bg-stone-50`}>
                {item.isReel ? (
                  <View style={tw`absolute top-3 left-3 z-10 flex-row items-center bg-black/55 px-2.5 py-1 rounded-full`}>
                    <Ionicons name="film-outline" size={12} color="#fff" />
                    <Text style={tw`text-white text-[10px] font-bold ml-1`}>Reel</Text>
                  </View>
                ) : null}
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
                <HeartBurst triggerKey={heartBurst[item.id] || 0} />
              </Pressable>

              {/* Post Actions - Modern Style */}
              <View style={tw`px-4 py-3`}>
                <View style={tw`flex-row items-center justify-between mb-3`}>
                  <View style={tw`flex-row items-center`}>
                    <FeedLikeButton
                      hasLiked={item.hasLiked}
                      reaction={item.reaction}
                      onPress={() => {
                        if (showReactionPicker === item.id) {
                          setShowReactionPicker(null);
                          return;
                        }
                        void toggleLike(item.id);
                      }}
                      onLongPress={() =>
                        setShowReactionPicker(showReactionPicker === item.id ? null : item.id)
                      }
                    />
                    <View style={tw`relative mr-3`}>
                      <TouchableOpacity onPress={() => openPost(item)}>
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
                  <Text style={tw`text-xs text-stone-600 mb-2`}>
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
                  <TouchableOpacity onPress={() => openPost(item)}>
                    <Text style={tw`text-stone-500 text-sm mb-1`}>
                      View all {item.comments} {item.comments === 1 ? 'comment' : 'comments'}
                    </Text>
                  </TouchableOpacity>
                )}
                {item.comments === 0 ? (
                  <TouchableOpacity onPress={() => openPost(item)}>
                    <Text style={tw`text-stone-400 text-xs mb-1`}>No comments yet</Text>
                  </TouchableOpacity>
                ) : null}

                {/* Add Comment */}
                <TouchableOpacity
                  onPress={() => openPost(item)}
                  style={tw`mt-2`}
                >
                  <Text style={tw`text-stone-500 text-sm`}>Add a comment...</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={tw`px-5`}>
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
            </View>
          }
        />

        {/* Reaction picker — tap outside to cancel */}
        <Modal
          visible={!!showReactionPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowReactionPicker(null)}
        >
          <View style={tw`flex-1 justify-center items-center`}>
            <Pressable
              style={tw`absolute inset-0 bg-black/30`}
              onPress={() => setShowReactionPicker(null)}
              accessibilityRole="button"
              accessibilityLabel="Dismiss reactions"
            />
            <ReactionPickerBar
              onPick={(r) => {
                if (showReactionPicker) void setReaction(showReactionPicker, r);
              }}
            />
          </View>
        </Modal>

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
                dispatch(
                  patchFeedPostEngagement({
                    id: selectedPost.id,
                    comments: count,
                  })
                );
                setPosts((prev) =>
                  prev.map((post) =>
                    post.id === selectedPost.id ? { ...post, comments: count } : post
                  )
                );
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

