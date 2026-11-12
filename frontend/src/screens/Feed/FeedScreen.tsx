import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
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
import { useHomeTabStore } from '../../state/useHomeTabStore';
import {
  horizontalScrollProps,
  verticalScrollProps,
  feedListPerformanceProps,
  TAB_SCREEN_BOTTOM_PADDING,
} from '../../constants/scroll';
import CATEGORIES from '../../data/categories';
import CommentsScreen from '../Comments/CommentsScreen';
import { SkeletonList } from '../../components/ui/SkeletonCard';
import AnimatedBottomSheet from '../../components/ui/AnimatedBottomSheet';
import GrowChromeHeader from '../../components/ui/GrowChromeHeader';
import { CategoryCapsuleRow, type CapsuleItem } from '../../components/ui/CategoryCapsule';
import { ReactionPickerBar, type FeedReaction } from '../../components/feed/FeedLikeButton';
import { resolveStoryDisplayUri, resolveAvatarUri, resolvePostMediaUri, avatarSource } from '../../utils/images';
import { toggleFeedPostLike, getFeedPostLikes, type FeedPost, type FeedLiker } from '../../services/api/feed';
import { getStories, type StoryItem } from '../../services/api/stories';
import { blockUser, reportContent } from '../../services/api/friends';
import tw from '../../lib/tw';
import { alertMessage } from '../../utils/confirmDialog';
import { openReelsAtPost, openReelsFeed, isReelPost } from '../../utils/reelNavigation';
import { postMatchesCategoryFilter } from '../../utils/categoryFilter';
import { reelPlaybackSettingsFromMetadata, reelSoundtrackFromEdit } from '../../utils/reelMedia';
import { feedback, triggerPressFeedback } from '../../utils/interactionFeedback';
import InstructorDiscoveryStrip from '../../components/instructor/InstructorDiscoveryStrip';
import { getCategoryLabel } from '../../utils/categoryLabels';
import { openCoachingReachOut } from '../../utils/coachingReachOut';
import NotificationBellButton from '../../components/navigation/NotificationBellButton';
import MessagesInboxButton from '../../components/navigation/MessagesInboxButton';
import ShareCardSheet, { type ShareCardPayload } from '../../components/share/ShareCardSheet';
import { copyToClipboard } from '../../utils/csvDownload';
import PressableScale from '../../components/ui/PressableScale';
import LiveHalo from '../../components/circles/LiveHalo';
import { isAppActive } from '../../utils/appActive';
import HomeEmptyCanvas from '../../components/feed/HomeEmptyCanvas';
import HomeSitCue from '../../components/feed/HomeSitCue';
import { useActivationStore } from '../../state/useActivationStore';
import { getJournalEntries } from '../../services/api/journal';
import { localDateKey } from '../../components/journal/journalMeta';
import FeedPostCard, { type FeedCardPost } from './components/FeedPostCard';
import { useStableCallback } from '../../hooks/useStableCallback';

type Story = {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  /** CDN/device URI from API; resolved again before render */
  image?: string;
  createdAt?: string;
  views?: number;
  hasViewed: boolean;
};

type ReactionType = FeedReaction;

type Post = FeedCardPost;

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

function toLocalPost(post: FeedPost, viewerId?: string): Post {
  const username = post.metadata?.username || 'User';
  const likes = Number(post.metadata?.likes || 0);
  const comments = Number(post.metadata?.comments || 0);
  const friendLikesCount = Number(post.metadata?.friend_likes_count || 0);
  const hasLiked = !!post.metadata?.has_liked;

  const imageUri = resolvePostMediaUri(post.image_url, post.category || 'general', post.id);
  const videoEdit = reelPlaybackSettingsFromMetadata(post.metadata ?? undefined);
  const soundtrack = reelSoundtrackFromEdit(videoEdit);
  const audioUrl =
    typeof post.metadata?.audio_url === 'string'
      ? post.metadata.audio_url
      : soundtrack.audioUrl;
  const audioTitle =
    typeof post.metadata?.audio_title === 'string'
      ? post.metadata.audio_title
      : soundtrack.audioTitle || videoEdit?.audioTitle || undefined;

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
    isOwn: String(post.user_id) === String(viewerId || ''),
    audioUrl,
    audioTitle,
    isReel: isReelPost(post),
    isInstructor: !!(post.metadata as { isInstructor?: boolean } | undefined)?.isInstructor,
    mediaType:
      typeof post.metadata?.media_type === 'string' ? post.metadata.media_type : undefined,
    contentType:
      typeof post.metadata?.content_type === 'string' ? post.metadata.content_type : undefined,
    videoEdit,
  };
}

export default function FeedScreen({ navigation, route }: any) {
  const feedFocused = useIsFocused();
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const feedItems = useAppSelector((s) => s.feed.items);
  const feedFollowing = useAppSelector((s) => s.feed.following);
  const feedSuggested = useAppSelector((s) => s.feed.suggested);
  const feedStatus = useAppSelector((s) => s.feed.status);
  const feedError = useAppSelector((s) => s.feed.error);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const feedListRef = React.useRef<SectionList<Post>>(null);
  const homePulse = useHomeTabStore((s) => s.pulse);
  const lastJournalDateKey = useActivationStore((s) => s.lastJournalDateKey);
  const journaledToday = lastJournalDateKey === localDateKey();
  const sundaySit = useActivationStore((s) => s.showSundaySit());
  const [retryingFeed, setRetryingFeed] = useState(false);
  const [hiddenUserIds, setHiddenUserIds] = useState<Set<string>>(() => new Set());
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
  const [sharePayload, setSharePayload] = useState<ShareCardPayload | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [primaryVisiblePostId, setPrimaryVisiblePostId] = useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const viewabilityConfig = React.useRef({ itemVisiblePercentThreshold: 55 }).current;
  const onViewableItemsChanged = React.useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: Post; isViewable: boolean }> }) => {
      const first = viewableItems.find((v) => v.isViewable && v.item?.id)?.item?.id ?? null;
      setPrimaryVisiblePostId(first);
    }
  ).current;

  const findFeedPost = (postId: string): FeedPost | undefined =>
    feedFollowing.find((p) => p.id === postId) ||
    feedSuggested.find((p) => p.id === postId) ||
    feedItems.find((p) => p.id === postId);

  const openPost = (post: Post) => {
    if (post.isReel) {
      openReelsAtPost(navigation, post.id, findFeedPost(post.id));
      return;
    }
    setSelectedPost(post);
  };

  const openComments = (post: Post) => {
    setSelectedPost(post);
  };

  const openTodayJournal = useCallback(() => {
    feedback.open();
    navigation.navigate('Journal', { openCompose: true });
  }, [navigation]);

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
      const storiesRes = await getStories();

      if (storiesRes.success && storiesRes.data) {
        const storiesArray = storiesRes.data.stories || [];
        if (storiesArray.length > 0) {
          setStories((prev) => {
            const locallyViewed = new Set(prev.filter((s) => s.hasViewed).map((s) => s.id));
            return storiesArray.map((s: StoryItem) => ({
              id: s.id,
              userId: s.userId,
              username: s.username,
              avatar: resolveAvatarUri(s.userId, s.username, s.avatar),
              image: resolveStoryDisplayUri(s.image, s.userId, s.id),
              createdAt: s.createdAt,
              views: s.views ?? 0,
              hasViewed: !!s.hasViewed || locallyViewed.has(s.id),
            }));
          });
        } else {
          setStories([]);
        }
      }
      // Keep last-good stories on empty/unsuccessful payload (transient API blips)
    } catch (error: unknown) {
      console.error('[FeedScreen] Error loading stories:', error);
      // Do not clear the tray on network failure
    }
  };

  useFocusEffect(
    useCallback(() => {
      void dispatch(fetchFeedPosts({ silent: true }));
      void loadStoriesOnly();
      void useActivationStore.getState().hydrate();

      const pollId = setInterval(() => {
        if (!isAppActive()) return;
        void dispatch(fetchFeedPosts({ silent: true }));
      }, 90_000);

      return () => clearInterval(pollId);
    }, [dispatch])
  );

  useEffect(() => {
    let cancelled = false;
    void getJournalEntries({ scope: 'mine', limit: 8 })
      .then((res) => {
        if (cancelled) return;
        const today = localDateKey();
        const hit = res.data?.entries?.find(
          (e) => localDateKey(new Date(e.created_at)) === today
        );
        if (hit) useActivationStore.getState().markJournaled(hit.created_at);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const feedSections = useMemo(() => {
    const mapSection = (items: typeof feedFollowing, title: string) => {
      const mapped = items
        .filter((raw) => typeof raw.image_url === 'string' && /^https:\/\//i.test(raw.image_url.trim()))
        .map((raw) => {
        const post = toLocalPost(raw, user?.id);
        const reaction = reactionsById[post.id];
        // Overlay only when user acted this session. Never let a stale null wipe API has_liked.
        if (reaction === undefined) return post;
        if (reaction == null) {
          return { ...post, reaction: null, hasLiked: false };
        }
        return { ...post, reaction, hasLiked: true };
      })
        .filter((post) => Boolean(post.image?.trim()))
        .filter((post) => !hiddenUserIds.has(post.userId));
      const filtered = selectedCategory
        ? mapped.filter((post) =>
            postMatchesCategoryFilter(
              { category: post.category, subcategory: post.subcategory },
              selectedCategory
            )
          )
        : mapped;
      return filtered.length > 0 ? { title, data: filtered } : null;
    };
    const following = mapSection(feedFollowing, 'From your circle');
    const suggested = mapSection(feedSuggested, 'Suggested for you');
    return [following, suggested].filter(Boolean) as { title: string; data: Post[] }[];
  }, [feedFollowing, feedSuggested, selectedCategory, user?.id, reactionsById, hiddenUserIds]);

  const posts = useMemo(() => feedSections.flatMap((s) => s.data), [feedSections]);

  useEffect(() => {
    const uris = posts
      .slice(0, 6)
      .map((p) => p.image)
      .filter((uri) => typeof uri === 'string' && uri.startsWith('https://'));
    uris.forEach((uri) => {
      void Image.prefetch(uri);
    });
  }, [posts]);

  const playHeartBurst = useCallback((postId: string) => {
    setHeartBurst((prev) => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }));
  }, []);

  // Group stories by user - show each person only once
  const groupedStories = useMemo(() => {
    const grouped = new Map<string, { user: Story; stories: Story[] }>();

    stories.forEach((story) => {
      if (user?.id && story.userId === user.id) return;
      if (!grouped.has(story.userId)) {
        grouped.set(story.userId, {
          user: story,
          stories: [],
        });
      }
      grouped.get(story.userId)!.stories.push(story);
    });

    return Array.from(grouped.values());
  }, [stories, user?.id]);

  const myStories = useMemo(
    () => (user?.id ? stories.filter((s) => s.userId === user.id) : []),
    [stories, user?.id]
  );

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
    feedback.refresh();
    setRefreshing(true);
    try {
      await dispatch(fetchFeedPosts({ force: true })).unwrap();
    } catch {
      // Keep existing posts; Redux records error state.
    }
    await loadStoriesOnly();
    setRefreshing(false);
  };

  useEffect(() => {
    if (homePulse < 1) return;
    const list = feedListRef.current as unknown as {
      scrollToOffset?: (opts: { offset: number; animated: boolean }) => void;
    };
    list?.scrollToOffset?.({ offset: 0, animated: true });
    void onRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pulse is the trigger
  }, [homePulse]);

  const retryFeed = useStableCallback(async () => {
    if (retryingFeed) return;
    setRetryingFeed(true);
    try {
      await dispatch(fetchFeedPosts({ force: true })).unwrap();
    } catch {
      // Keep banner visible; store already captures the latest error.
    } finally {
      setRetryingFeed(false);
    }
  });

  /** Post ids with a like toggle in flight; taps on those posts are ignored until it settles. */
  const pendingLikeIdsRef = useRef<Set<string>>(new Set());

  const toggleLike = async (postId: string, opts?: { fromDoubleTap?: boolean }) => {
    const current =
      feedSections.flatMap((s) => s.data).find((p) => p.id === postId) ||
      posts.find((p) => p.id === postId);
    const wasLiked = !!current?.hasLiked;

    // Optimistic Redux patch so SectionList re-renders with a filled heart.
    if (opts?.fromDoubleTap && wasLiked) {
      feedback.like(true);
      playHeartBurst(postId);
      return;
    }

    // In-flight guard: rapid taps would fire several toggles and desync heart/count.
    if (pendingLikeIdsRef.current.has(postId)) return;
    pendingLikeIdsRef.current.add(postId);

    const nextLiked = !wasLiked;
    const nextLikes = nextLiked
      ? (current?.likes ?? 0) + 1
      : Math.max(0, (current?.likes ?? 0) - 1);

    feedback.like(nextLiked);

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
    } finally {
      pendingLikeIdsRef.current.delete(postId);
    }
  };

  const handleMediaPress = (post: Post) => {
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && last.id === post.id && now - last.at < 320) {
      lastTapRef.current = null;
      void toggleLike(post.id, { fromDoubleTap: true });
      return;
    }
    lastTapRef.current = { id: post.id, at: now };

    if (post.isReel) {
      const postId = post.id;
      setTimeout(() => {
        if (lastTapRef.current?.id === postId) {
          openReelsAtPost(navigation, postId, findFeedPost(postId));
          lastTapRef.current = null;
        }
      }, 340);
    }
  };

  const setReaction = async (postId: string, reaction: ReactionType) => {
    setShowReactionPicker(null);
    if (pendingLikeIdsRef.current.has(postId)) return;
    const current =
      feedSections.flatMap((s) => s.data).find((p) => p.id === postId) ||
      posts.find((p) => p.id === postId);

    pendingLikeIdsRef.current.add(postId);
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
    } finally {
      pendingLikeIdsRef.current.delete(postId);
    }
  };

  const blockPostUser = async (post: Post) => {
    try {
      await blockUser(post.userId);
      setHiddenUserIds((prev) => new Set(prev).add(post.userId));
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

  /** Bumped on every open/close so a late response can't refill (or reopen) the sheet. */
  const likesRequestRef = useRef(0);
  const likesLoadingRef = useRef(false);

  const closeLikesModal = () => {
    likesRequestRef.current += 1;
    likesLoadingRef.current = false;
    setLikesLoading(false);
    setLikesModal(null);
  };

  const openLikesModal = async (post: Post, mode: 'all' | 'friends') => {
    // Ignore repeat taps while a likes list is loading.
    if (likesLoadingRef.current) return;
    likesLoadingRef.current = true;
    const requestId = ++likesRequestRef.current;
    // Open the sheet right away with the loading skeleton, then fill it.
    setLikesLoading(true);
    setLikesModal({ title: mode === 'friends' ? 'Friends who liked' : 'Liked by', users: [] });
    try {
      const likes = await getFeedPostLikes(post.id);
      if (requestId !== likesRequestRef.current) return;
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
      if (requestId !== likesRequestRef.current) return;
      setLikesModal({
        title: 'Likes',
        users: [],
        subtitle: e instanceof Error ? e.message : 'Could not load likes',
      });
    } finally {
      if (requestId === likesRequestRef.current) {
        likesLoadingRef.current = false;
        setLikesLoading(false);
      }
    }
  };

  // Stable, id-keyed handlers for the memoized FeedPostCard. useStableCallback always
  // calls the latest closure, so behaviour matches the previous inline handlers.
  const onCardOpenProfile = useStableCallback((userId: string) => {
    const rootNavigation = navigation.getParent() || navigation;
    rootNavigation.navigate('PublicProfile' as never, { userId } as never);
  });
  const onCardOpenMenu = useStableCallback((post: Post) => {
    feedback.open();
    setPostMenuPost(post);
  });
  const onCardMediaPress = useStableCallback((post: Post) => handleMediaPress(post));
  const onCardMediaError = useCallback((postId: string) => {
    setFailedPostImages((prev) => (prev[postId] ? prev : { ...prev, [postId]: true }));
  }, []);
  const onCardMediaRetry = useCallback((postId: string) => {
    setFailedPostImages((prev) => {
      if (!prev[postId]) return prev;
      const next = { ...prev };
      delete next[postId];
      return next;
    });
  }, []);
  const onCardLikePress = useStableCallback((postId: string) => {
    if (showReactionPicker === postId) {
      setShowReactionPicker(null);
      return;
    }
    void toggleLike(postId);
  });
  const onCardLikeLongPress = useStableCallback((postId: string) => {
    setShowReactionPicker(showReactionPicker === postId ? null : postId);
  });
  const onCardOpenComments = useStableCallback((post: Post) => openComments(post));
  const onCardShare = useStableCallback((item: Post) => {
    setSharePayload({
      kind: 'post',
      postId: item.id,
      userId: item.userId,
      username: item.username,
      avatar: item.isOwn ? user?.avatar || item.avatar : item.avatar,
      caption: item.caption,
      imageUrl: item.image,
      category: item.category,
      subcategory: item.subcategory,
      isInstructor: item.isInstructor,
      mediaType: item.mediaType,
      isReel: item.isReel,
    });
  });
  const onCardOpenLikes = useStableCallback((post: Post, mode: 'all' | 'friends') => {
    void openLikesModal(post, mode);
  });
  const onCardToggleAudio = useStableCallback((post: Post) => togglePostAudio(post));
  const onCardOpenPost = useStableCallback((post: Post) => openPost(post));

  const renderPostItem = useCallback(
    ({ item }: { item: Post }) => (
      <FeedPostCard
        item={item}
        isActive={feedFocused && item.id === primaryVisiblePostId}
        mediaFailed={!!failedPostImages[item.id]}
        heartBurstKey={heartBurst[item.id] || 0}
        isAudioPlaying={playingAudioId === item.id}
        onOpenProfile={onCardOpenProfile}
        onOpenMenu={onCardOpenMenu}
        onMediaPress={onCardMediaPress}
        onMediaError={onCardMediaError}
        onMediaRetry={onCardMediaRetry}
        onLikePress={onCardLikePress}
        onLikeLongPress={onCardLikeLongPress}
        onOpenComments={onCardOpenComments}
        onShare={onCardShare}
        onOpenLikes={onCardOpenLikes}
        onToggleAudio={onCardToggleAudio}
        onOpenPost={onCardOpenPost}
      />
    ),
    // Handlers are stable; only per-card display state invalidates renderItem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feedFocused, primaryVisiblePostId, failedPostImages, heartBurst, playingAudioId]
  );

  const keyExtractor = useCallback((item: Post) => item.id, []);

  const hasPosts = posts.length > 0;
  // Memoized so scroll-driven state (primaryVisiblePostId) doesn't rebuild the header.
  const feedListHeader = useMemo(() => (
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
        <PressableScale
          style={tw`items-center mr-4`}
          feedback="open"
          onPress={() => {
            const rootNavigation = navigation.getParent() || navigation;
            if (myStories.length > 0) {
              const fullStories = myStories.map((s) => ({
                ...s,
                image: resolveStoryDisplayUri(s.image, s.userId, s.id),
                createdAt: s.createdAt || new Date().toISOString(),
                views: typeof s.views === 'number' ? s.views : 0,
                hasViewed: true,
              }));
              rootNavigation.navigate('StoryViewer' as never, {
                stories: fullStories,
                initialIndex: 0,
              } as never);
              return;
            }
            rootNavigation.navigate('CreateStory' as never);
          }}
          onLongPress={() => {
            const rootNavigation = navigation.getParent() || navigation;
            rootNavigation.navigate('CreateStory' as never);
          }}
          delayLongPress={400}
        >
          <View style={tw`relative`}>
            <View
              style={tw`w-14 h-14 rounded-full border-2 ${
                myStories.length > 0 ? 'border-emerald-500' : 'border-dashed border-stone-300'
              } overflow-hidden items-center justify-center bg-white/60`}
            >
              {myStories.length > 0 ? (
                <Image
                  source={{
                    uri: resolveStoryDisplayUri(
                      myStories[myStories.length - 1]?.image,
                      user?.id || 'me',
                      myStories[myStories.length - 1]?.id
                    ),
                  }}
                  style={tw`w-full h-full`}
                  contentFit="cover"
                />
              ) : (
                <Ionicons name="add" size={22} color="#78716C" />
              )}
            </View>
            {myStories.length > 0 ? (
              <View
                style={tw`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-emerald-600 border-2 border-[#FFFcf7] items-center justify-center`}
              >
                <Ionicons name="add" size={12} color="#fff" />
              </View>
            ) : null}
          </View>
          <Text style={tw`text-[11px] text-stone-600 mt-1`}>Your story</Text>
        </PressableScale>
        {groupedStories.map((group) => {
          const { user: storyUser, stories: userStories } = group;
          const allViewed = userStories.every((s) => s.hasViewed);
          const storyCount = userStories.length;

          return (
            <PressableScale
              key={storyUser.userId}
              style={tw`items-center mr-4`}
              feedback="open"
              onPress={() => {
                const rootNavigation = navigation.getParent() || navigation;
                const fullStories = userStories.map((s) => ({
                  ...s,
                  image: resolveStoryDisplayUri(s.image, s.userId, s.id),
                  createdAt: s.createdAt || new Date().toISOString(),
                  views: typeof s.views === 'number' ? s.views : 0,
                  hasViewed: !!s.hasViewed,
                }));

                rootNavigation.navigate('StoryViewer' as never, {
                  stories: fullStories,
                  initialIndex: 0,
                  // StoryViewer records each view once; this only updates the ring.
                  onStoriesUpdate: (updatedStories: typeof fullStories) => {
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
              <LiveHalo active={!allViewed}>
              <View style={tw`relative`}>
                <View
                  style={tw`w-14 h-14 rounded-full border-2 ${
                    allViewed ? 'border-stone-300' : 'border-emerald-500'
                  } overflow-hidden bg-stone-200`}
                >
                  <Image
                    source={{
                      uri: resolveStoryDisplayUri(
                        userStories[userStories.length - 1]?.image,
                        storyUser.userId,
                        userStories[userStories.length - 1]?.id
                      ),
                    }}
                    style={tw`w-full h-full`}
                    contentFit="cover"
                  />
                </View>
                <View
                  style={tw`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full border-2 border-[#FFFcf7] overflow-hidden bg-emerald-100`}
                >
                  <Image
                    source={avatarSource(
                      resolveAvatarUri(
                        storyUser.userId,
                        storyUser.username,
                        storyUser.avatar
                      )
                    )}
                    style={tw`w-full h-full`}
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
              </LiveHalo>
            </PressableScale>
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

      {selectedCategory ? (
        <View style={tw`mx-4 mt-2 px-4 py-3.5 rounded-2xl bg-[#FFFcf7] border border-emerald-200/80`}>
          <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-700 uppercase`}>
            Path home
          </Text>
          <Text style={tw`text-lg font-bold text-stone-900 mt-0.5`}>
            {getCategoryLabel(selectedCategory)}
          </Text>
          <Text style={tw`text-sm text-stone-500 mt-1 leading-5`}>
            Posts, peers, and instructors on this path. Clear the filter to see everything.
          </Text>
          <View style={tw`flex-row mt-3 gap-2`}>
            <TouchableOpacity
              onPress={() => {
                feedback.open();
                const root = navigation.getParent() || navigation;
                root.navigate('Post' as never, { category: selectedCategory } as never);
              }}
              style={tw`flex-1 py-2.5 rounded-xl bg-emerald-600 items-center`}
            >
              <Text style={tw`text-white font-bold text-sm`}>Post on path</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                feedback.select();
                setSelectedCategory(null);
              }}
              style={tw`px-3.5 py-2.5 rounded-xl border border-stone-200 bg-white/70 items-center justify-center`}
            >
              <Text style={tw`text-stone-700 font-semibold text-sm`}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <View style={tw`px-4 mt-3`}>
        <InstructorDiscoveryStrip
          forPaths
          category={selectedCategory}
          title={
            selectedCategory
              ? `Instructors · ${getCategoryLabel(selectedCategory)}`
              : 'Instructors on your paths'
          }
          onSeeAll={() => {
            feedback.open();
            const root = navigation.getParent() || navigation;
            root.navigate('Instructors' as never);
          }}
          onOpenProfile={(userId) => {
            const root = navigation.getParent() || navigation;
            root.navigate('PublicProfile' as never, { userId } as never);
          }}
          onMessage={(person) => {
            void (async () => {
              try {
                await openCoachingReachOut(
                  navigation,
                  person.id,
                  `Hi ${person.username} — I’d love guidance on ${
                    person.shared_categories[0]
                      ? getCategoryLabel(person.shared_categories[0])
                      : 'my growth path'
                  }.`
                );
                feedback.send();
              } catch (e) {
                Alert.alert(
                  'Cannot reach out',
                  e instanceof Error ? e.message : 'Try again in a moment.'
                );
              }
            })();
          }}
        />
      </View>

      {(!user?.categories || user.categories.length === 0) && (
        <View style={tw`mx-4 mt-2 px-3.5 py-3 rounded-2xl bg-[#FFFcf7] border border-stone-200/80`}>
          <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
            Start here
          </Text>
          <Text style={tw`text-[15px] font-bold text-stone-900 mt-1`}>Pick your growth paths</Text>
          <Text style={tw`text-sm text-stone-500 mt-1 leading-5`}>
            One or two paths is enough. Home fills with people growing the same thing.
          </Text>
          <TouchableOpacity
            onPress={() => {
              triggerPressFeedback();
              navigation.navigate('Profile');
            }}
            style={tw`mt-3 py-2.5 rounded-2xl bg-emerald-600 items-center`}
          >
            <Text style={tw`text-white font-bold text-sm`}>Choose paths</Text>
          </TouchableOpacity>
        </View>
      )}

      {user?.categories && user.categories.length > 0 && hasPosts ? (
        <View style={tw`mx-4 mt-2`}>
          <Text style={tw`text-xs text-stone-500 leading-4`}>
            Suggested faces share a path with you — open a profile to see overlap.
          </Text>
        </View>
      ) : null}

      {!journaledToday && hasPosts ? (
        <HomeSitCue
          sunday={sundaySit}
          onWrite={openTodayJournal}
          onDismiss={sundaySit ? () => useActivationStore.getState().dismissSunday() : undefined}
        />
      ) : !hasPostedToday && hasPosts && journaledToday ? (
        <View style={tw`mx-4 mt-2 px-3.5 py-2.5 rounded-2xl bg-emerald-50 border border-emerald-100`}>
          <View style={tw`flex-row items-center gap-2`}>
            <Ionicons name="book-outline" size={18} color="#059669" />
            <Text style={tw`text-xs text-emerald-900 flex-1`}>
              Share today’s progress with people on your path.
            </Text>
            <TouchableOpacity
              onPress={() => {
                triggerPressFeedback();
                const rootNavigation = navigation.getParent() || navigation;
                rootNavigation.navigate('Post');
              }}
              style={tw`px-3 py-1.5 rounded-full bg-emerald-600`}
            >
              <Text style={tw`text-xs font-semibold text-white`}>Post</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

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
  ), [
    navigation,
    myStories,
    user?.id,
    user?.categories,
    groupedStories,
    pathCapsules,
    selectedCategory,
    hasPosts,
    journaledToday,
    sundaySit,
    openTodayJournal,
    hasPostedToday,
    feedStatus,
    feedError,
    retryingFeed,
    retryFeed,
  ]);

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`} edges={['top']}>
      <View style={tw`flex-1 bg-surface-page`}>
        <GrowChromeHeader
          right={
            <>
              <NotificationBellButton />
              <MessagesInboxButton />
              <Pressable
                onPress={() => {
                  triggerPressFeedback();
                  openReelsFeed(navigation, 'home');
                }}
                style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
                accessibilityRole="button"
                accessibilityLabel="Reels"
              >
                <Ionicons name="play-circle-outline" size={17} color="#059669" />
              </Pressable>
            </>
          }
        />

        <SectionList
          ref={feedListRef}
          sections={feedSections}
          keyExtractor={keyExtractor}
          stickySectionHeadersEnabled={false}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
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
          renderItem={renderPostItem}
          ListEmptyComponent={
            feedStatus === 'loading' ? (
              <View style={tw`px-5 pt-4`}>
                <SkeletonList variant="post" count={3} />
              </View>
            ) : (
              <HomeEmptyCanvas
                filtered={!!selectedCategory}
                categoryLabel={selectedCategory ? getCategoryLabel(selectedCategory) : undefined}
                failed={feedStatus === 'failed'}
                hasPaths={userCategories.length > 0}
                onExplore={() => navigation.navigate('Explore')}
                onJournal={openTodayJournal}
                onClearFilter={() => setSelectedCategory(null)}
                onChoosePaths={() => navigation.navigate('Profile')}
                onOpenProfile={(userId) => {
                  const root = navigation.getParent() || navigation;
                  root.navigate('PublicProfile' as never, { userId } as never);
                }}
                onInstructors={() => {
                  const root = navigation.getParent() || navigation;
                  root.navigate('Instructors' as never);
                }}
              />
            )
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
              postUserId={selectedPost.userId}
              postCaption={selectedPost.caption}
              onClose={() => setSelectedPost(null)}
              onCommentsChanged={(count) => {
                dispatch(
                  patchFeedPostEngagement({
                    id: selectedPost.id,
                    comments: count,
                  })
                );
              }}
            />
          </Modal>
        )}

        <AnimatedBottomSheet
          visible={!!likesModal}
          onClose={closeLikesModal}
          maxHeightRatio={0.7}
        >
          {({ close }) => (
            <View style={tw`px-4 pb-2`}>
              <View style={tw`flex-row items-center justify-between mb-2`}>
                <Text style={tw`text-lg font-bold text-stone-900`}>
                  {likesModal?.title || 'Likes'}
                </Text>
                <TouchableOpacity
                  onPress={close}
                  accessibilityRole="button"
                  accessibilityLabel="Close likes"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={22} color="#78716C" />
                </TouchableOpacity>
              </View>
              {likesModal?.subtitle ? (
                <Text style={tw`text-sm text-stone-500 mb-3`}>{likesModal.subtitle}</Text>
              ) : null}
              {likesLoading ? (
                <SkeletonList variant="inbox" count={4} />
              ) : (
                <FlatList
                  data={likesModal?.users || []}
                  keyExtractor={(u) => u.id}
                  style={{ maxHeight: 360 }}
                  renderItem={({ item }) => (
                    <View style={tw`flex-row items-center py-2.5 border-b border-stone-100`}>
                      <Image
                        source={avatarSource(
                          resolveAvatarUri(item.id, item.username, item.avatar || null)
                        )}
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
          )}
        </AnimatedBottomSheet>

        <AnimatedBottomSheet
          visible={!!postMenuPost}
          onClose={() => setPostMenuPost(null)}
          maxHeightRatio={0.55}
        >
          {({ close }) => {
            const target = postMenuPost;
            if (!target) return null;
            const openShare = () => {
              close();
              setTimeout(() => {
                setSharePayload({
                  kind: 'post',
                  postId: target.id,
                  userId: target.userId,
                  username: target.username,
                  avatar: target.isOwn ? user?.avatar || target.avatar : target.avatar,
                  caption: target.caption,
                  imageUrl: target.image,
                  category: target.category,
                  subcategory: target.subcategory,
                  isInstructor: target.isInstructor,
                  mediaType: target.mediaType,
                  isReel: target.isReel,
                });
              }, 220);
            };
            const postLink = `https://letsgrow.lu/p/${encodeURIComponent(target.id)}`;

            return (
              <View style={tw`px-5 pb-2`}>
                <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-700 uppercase`}>
                  Post
                </Text>
                <Text style={tw`text-xl font-bold text-stone-900 mt-0.5 mb-1`} numberOfLines={1}>
                  {target.isOwn ? 'Your post' : `@${target.username}`}
                </Text>
                <Text style={tw`text-sm text-stone-500 mb-4`} numberOfLines={2}>
                  {(target.caption || '').trim() || 'Growth moment on Grow!'}
                </Text>

                <PressableScale
                  onPress={openShare}
                  feedback={false}
                  style={tw`flex-row items-center py-3.5 px-3.5 mb-2 rounded-2xl bg-emerald-50 border border-emerald-100`}
                >
                  <View style={tw`w-10 h-10 rounded-xl bg-emerald-600 items-center justify-center mr-3`}>
                    <Ionicons name="share-outline" size={20} color="#fff" />
                  </View>
                  <View style={tw`flex-1`}>
                    <Text style={tw`text-base font-bold text-stone-900`}>Share post card</Text>
                    <Text style={tw`text-xs text-stone-500 mt-0.5`}>
                      Instagram-ready image or link
                    </Text>
                  </View>
                </PressableScale>

                <PressableScale
                  onPress={() => {
                    void copyToClipboard(postLink, 'Link copied');
                    close();
                  }}
                  feedback={false}
                  style={tw`flex-row items-center py-3.5 px-3.5 mb-2 rounded-2xl bg-[#FFFcf7] border border-stone-200/80`}
                >
                  <View style={tw`w-10 h-10 rounded-xl bg-[#EAE4D6] items-center justify-center mr-3`}>
                    <Ionicons name="link-outline" size={20} color="#1C1917" />
                  </View>
                  <Text style={tw`text-base font-semibold text-stone-900`}>Copy link</Text>
                </PressableScale>

                {!target.isOwn ? (
                  <>
                    <PressableScale
                      onPress={() => {
                        close();
                        setTimeout(() => reportPost(target), 220);
                      }}
                      feedback={false}
                      style={tw`flex-row items-center py-3.5 px-3.5 mb-2 rounded-2xl bg-[#FFFcf7] border border-stone-200/80`}
                    >
                      <View style={tw`w-10 h-10 rounded-xl bg-amber-50 items-center justify-center mr-3`}>
                        <Ionicons name="flag-outline" size={20} color="#D97706" />
                      </View>
                      <Text style={tw`text-base font-semibold text-stone-900`}>Report post</Text>
                    </PressableScale>
                    <PressableScale
                      onPress={() => {
                        close();
                        setTimeout(() => {
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
                        }, 220);
                      }}
                      feedback={false}
                      style={tw`flex-row items-center py-3.5 px-3.5 mb-2 rounded-2xl bg-[#FFFcf7] border border-stone-200/80`}
                    >
                      <View style={tw`w-10 h-10 rounded-xl bg-red-50 items-center justify-center mr-3`}>
                        <Ionicons name="ban-outline" size={20} color="#DC2626" />
                      </View>
                      <Text style={tw`text-base font-semibold text-stone-900`}>Block user</Text>
                    </PressableScale>
                  </>
                ) : (
                  <View style={tw`mt-1 px-3.5 py-3 rounded-2xl bg-[#EAE4D6]`}>
                    <Text style={tw`text-sm text-stone-600 leading-5`}>
                      Tip: tap the share icon under any post — yours or a friend’s — for an Instagram-ready card.
                    </Text>
                  </View>
                )}

                <PressableScale onPress={close} feedback={false} style={tw`mt-2 py-3 items-center`}>
                  <Text style={tw`text-stone-500 font-semibold`}>Cancel</Text>
                </PressableScale>
              </View>
            );
          }}
        </AnimatedBottomSheet>

        <ShareCardSheet
          visible={!!sharePayload}
          payload={sharePayload}
          onClose={() => setSharePayload(null)}
        />
      </View>
    </SafeAreaView>
  );
}

