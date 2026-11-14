import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  useWindowDimensions,
  RefreshControl,
  StyleSheet,
  Modal,
  Platform,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect, useRoute, RouteProp } from '@react-navigation/native';
import { getForYouFeed, getFeedPosts, getFeedPost, toggleFeedPostLike, type FeedPost } from '../../services/api/feed';
import { isVideoMedia } from '../../services/api/media';
import { resolvePostMediaUri } from '../../utils/images';
import { cacheRemoteClip } from '../../utils/cacheRemoteClip';
import GrowAvatar from '../../components/ui/GrowAvatar';
import { isReelPost } from '../../utils/reelNavigation';
import { reelPlaybackSettingsFromMetadata } from '../../utils/reelMedia';
import { ReelVideoPlayer, ReelSoundtrack } from '../../components/ui/VideoEditor';
import CommentsScreen from '../Comments/CommentsScreen';
import HeartBurst from '../../components/feed/HeartBurst';
import FeedLikeButton, {
  ReactionPickerBar,
  type FeedReaction,
} from '../../components/feed/FeedLikeButton';
import {
  lockNativeUiAudio,
  longPressPeek,
  triggerFeedback,
  triggerPressFeedback,
  unlockNativeUiAudio,
} from '../../utils/interactionFeedback';
import GrowLoader from '../../components/ui/GrowLoader';
import tw from '../../lib/tw';
import PressableScale from '../../components/ui/PressableScale';

type ReelRow = FeedPost & { liked: boolean; reaction: FeedReaction };

type ReelsRoute = RouteProp<
  {
    Reels:
      | { startPostId?: string; seedPost?: FeedPost; mode?: 'home' | 'explore' }
      | undefined;
  },
  'Reels'
>;

/**
 * Home vs Explore reels:
 * - mode=home (default): for-you feed — friends' reels + suggested (same as Home tab entry).
 * - mode=explore: discovery feed — non-friend reels only (Explore "All reels" / clip taps).
 */

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function ReelsHeader({
  onBack,
  onCreate,
  modeLabel,
}: {
  onBack: () => void;
  onCreate: () => void;
  modeLabel: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={[
        tw`absolute top-0 left-0 right-0 z-20`,
        {
          paddingTop: Math.max(insets.top, 8),
          backgroundColor: 'transparent',
        },
      ]}
    >
      <View
        style={[
          tw`mx-3 mb-1 flex-row items-center justify-between px-2 py-2 rounded-card`,
          {
            backgroundColor: 'rgba(0,0,0,0.45)',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: 'rgba(255,255,255,0.12)',
          },
        ]}
      >
        <PressableScale
          pressedScale={0.9}
          onPress={onBack}
          hitSlop={12}
          style={tw`w-10 h-10 rounded-full bg-white/10 items-center justify-center`}
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </PressableScale>
        <View style={tw`items-center flex-1 px-2`}>
          <Text
            style={tw`text-caption tracking-[3px] uppercase text-[#34D399] font-extrabold`}
          >
            Grow!
          </Text>
          <Text style={tw`text-white font-bold text-base -mt-0.5`}>{modeLabel}</Text>
        </View>
        <PressableScale
          pressedScale={0.9}
          onPress={onCreate}
          hitSlop={12}
          style={tw`w-10 h-10 rounded-full bg-brand-600 items-center justify-center`}
          accessibilityLabel="Create reel"
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </PressableScale>
      </View>
    </View>
  );
}

function ReelsEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <View style={tw`flex-1 items-center justify-center px-8 bg-black`}>
      <View style={tw`w-20 h-20 rounded-full bg-white/10 items-center justify-center mb-5`}>
        <Ionicons name="film-outline" size={36} color="#34D399" />
      </View>
      <Text style={tw`text-white text-center text-xl font-bold mb-2`}>No reels yet</Text>
      <Text style={tw`text-white/60 text-center mb-8 leading-5`}>
        Record a video or edit a photo into a vertical clip — looks, text, and cinematic edges.
      </Text>
      <PressableScale onPress={onCreate} style={tw`bg-brand-600 px-6 py-3.5 rounded-chip flex-row items-center gap-2`}>
        <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
        <Text style={tw`text-white font-bold text-base`}>Create Reel</Text>
      </PressableScale>
    </View>
  );
}


/** Playable URI + whether the reel is a clip (vs. a photo reel). */
function reelMedia(item: ReelRow): { uri: string; isVideo: boolean } {
  const uri = resolvePostMediaUri(item.image_url ?? '', item.category, item.id);
  const mt = typeof item.metadata?.media_type === 'string' ? item.metadata.media_type : undefined;
  const ct =
    typeof item.metadata?.content_type === 'string' ? item.metadata.content_type : undefined;
  if (mt === 'image') return { uri, isVideo: false };
  if (mt === 'video') return { uri, isVideo: true };
  if (isVideoMedia({ uri, mediaType: mt, contentType: ct })) return { uri, isVideo: true };
  // Legacy video reels often have video_edit but no media_type
  return { uri, isVideo: !!item.metadata?.video_edit };
}

export default function ReelsScreen() {
  const navigation = useNavigation();
  const route = useRoute<ReelsRoute>();
  const { height: windowH, width: windowW } = useWindowDimensions();
  const [pageSize, setPageSize] = useState({ w: windowW, h: windowH });
  const pageH = pageSize.h > 0 ? pageSize.h : windowH;
  const startPostId = route.params?.startPostId;
  const seedPost = route.params?.seedPost;
  const reelsMode = route.params?.mode === 'explore' ? 'explore' : 'home';
  const modeLabel = reelsMode === 'explore' ? 'Explore Reels' : 'Reels';
  const scrollToId = useRef(startPostId);

  const seedRow: ReelRow | null =
    seedPost && isReelPost(seedPost)
      ? {
          ...seedPost,
          liked: !!seedPost.metadata?.has_liked,
          reaction: (seedPost.metadata?.has_liked ? 'love' : null) as FeedReaction,
        }
      : null;
  const [items, setItems] = useState<ReelRow[]>(() => (seedRow ? [seedRow] : []));
  const [loading, setLoading] = useState(!seedRow);
  const [refreshing, setRefreshing] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(
    () => startPostId || seedRow?.id || null
  );
  const [commentsPost, setCommentsPost] = useState<ReelRow | null>(null);
  const [sessionStarted, setSessionStarted] = useState(Platform.OS === 'web');
  const [reactionsById, setReactionsById] = useState<Record<string, FeedReaction>>({});
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  const [heartBurst, setHeartBurst] = useState<Record<string, number>>({});
  const [userPausedIds, setUserPausedIds] = useState<Set<string>>(new Set());
  const flatListRef = useRef<FlatList>(null);
  const lastTapRef = useRef<{ id: string; at: number } | null>(null);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pullRefreshingRef = useRef(false);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: ReelRow }> }) => {
      const first = viewableItems[0]?.item;
      if (first?.id) setActiveId(first.id);
    }
  ).current;

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    const root = navigation.getParent?.() || navigation;
    (root as { navigate: (a: string) => void }).navigate('Individual');
  }, [navigation]);

  const openCreateReel = useCallback(() => {
    const root = navigation.getParent?.() || navigation;
    (root as { navigate: (a: string) => void }).navigate('CreateReel');
  }, [navigation]);

  const load = useCallback(async () => {
    const targetId = scrollToId.current;
    try {
      let merged: FeedPost[] = [];
      if (reelsMode === 'explore') {
        const res = await getFeedPosts({ mode: 'explore' });
        merged = res.success && Array.isArray(res.data) ? res.data : [];
      } else {
        const res = await getForYouFeed();
        if (!res.success || !res.data) {
          setItems([]);
          return;
        }
        const following = Array.isArray(res.data.following) ? res.data.following : [];
        const suggested = Array.isArray(res.data.suggested) ? res.data.suggested : [];
        const seen = new Set<string>();
        for (const p of [...following, ...suggested]) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          merged.push(p);
        }
      }

      if (targetId && !merged.some((p) => p.id === targetId)) {
        if (seedPost?.id === targetId) {
          merged.unshift(seedPost);
        } else {
          const fetched = await getFeedPost(targetId);
          if (fetched) merged.unshift(fetched);
        }
      }

      const reels = merged
        .filter((p) => isReelPost(p))
        .map((p) => ({
          ...p,
          liked: !!p.metadata?.has_liked,
          reaction: (p.metadata?.has_liked ? 'love' : null) as FeedReaction,
        }))
        .sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

      setItems(reels);
      setReactionsById((prev) => {
        const next = { ...prev };
        for (const row of reels) {
          if (next[row.id] === undefined) {
            next[row.id] = row.liked ? 'love' : null;
          }
        }
        return next;
      });

      if (targetId) {
        const idx = reels.findIndex((r) => r.id === targetId);
        if (idx >= 0) {
          setActiveId(reels[idx].id);
        } else if (reels[0]?.id) {
          setActiveId(reels[0].id);
          scrollToId.current = undefined;
        }
      } else if (reels[0]?.id) {
        setActiveId(reels[0].id);
      }
    } catch (e) {
      console.warn('[Reels] load failed', e);
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
      pullRefreshingRef.current = false;
    }
  }, [seedPost, reelsMode]);

  useFocusEffect(
    useCallback(() => {
      lockNativeUiAudio();
      if (startPostId) scrollToId.current = startPostId;
      void load();
      return () => {
        unlockNativeUiAudio();
        if (Platform.OS !== 'web') setSessionStarted(false);
      };
    }, [load, startPostId])
  );

  useEffect(() => {
    const targetId = scrollToId.current;
    if (!targetId || items.length === 0) return;
    const idx = items.findIndex((r) => r.id === targetId);
    if (idx < 0) return;

    setActiveId(items[idx].id);
    const scroll = () => {
      flatListRef.current?.scrollToIndex({ index: idx, animated: false });
      scrollToId.current = undefined;
    };
    requestAnimationFrame(() => {
      setTimeout(scroll, 50);
    });
  }, [items]);

  useEffect(() => {
    setUserPausedIds(new Set());
  }, [activeId]);

  useEffect(
    () => () => {
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    },
    []
  );

  const onRefresh = () => {
    if (pullRefreshingRef.current) return;
    pullRefreshingRef.current = true;
    setRefreshing(true);
    void load();
  };

  const playHeartBurst = useCallback((postId: string) => {
    setHeartBurst((prev) => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }));
  }, []);

  const onToggleLike = async (postId: string, opts?: { fromDoubleTap?: boolean }) => {
    const current = items.find((row) => row.id === postId);
    const wasLiked = !!current?.liked;

    if (opts?.fromDoubleTap && wasLiked) {
      // Already liked: the burst replays with the double-tap pattern.
      triggerFeedback('likeDoubleTap');
      playHeartBurst(postId);
      return;
    }

    const nextLiked = !wasLiked;
    const nextLikes = nextLiked
      ? (current?.metadata?.likes ?? 0) + 1
      : Math.max(0, (current?.metadata?.likes ?? 0) - 1);

    // Like = soft + like tone (double-tap: rigid → soft); unlike = light, silent.
    triggerFeedback(nextLiked ? (opts?.fromDoubleTap ? 'likeDoubleTap' : 'like') : 'unlike');

    setItems((prev) =>
      prev.map((row) => {
        if (row.id !== postId) return row;
        return {
          ...row,
          liked: nextLiked,
          reaction: nextLiked ? reactionsById[postId] || 'love' : null,
          metadata: { ...row.metadata, likes: nextLikes },
        };
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
      setItems((prev) =>
        prev.map((row) => {
          if (row.id !== postId) return row;
          const base = current?.metadata?.likes ?? 0;
          const likes = liked
            ? wasLiked
              ? base
              : base + 1
            : Math.max(0, base - (wasLiked ? 1 : 0));
          return {
            ...row,
            liked,
            reaction: liked ? reactionsById[postId] || 'love' : null,
            metadata: { ...row.metadata, likes },
          };
        })
      );
      setReactionsById((prev) => ({
        ...prev,
        [postId]: liked ? prev[postId] || 'love' : null,
      }));
    } catch {
      setItems((prev) =>
        prev.map((row) =>
          row.id === postId
            ? {
                ...row,
                liked: wasLiked,
                reaction: wasLiked ? reactionsById[postId] || 'love' : null,
                metadata: {
                  ...row.metadata,
                  likes: current?.metadata?.likes ?? 0,
                },
              }
            : row
        )
      );
      setReactionsById((prev) => ({
        ...prev,
        [postId]: wasLiked ? prev[postId] || 'love' : null,
      }));
    }
  };

  const setReaction = async (postId: string, reaction: FeedReaction) => {
    setShowReactionPicker(null);
    const current = items.find((row) => row.id === postId);
    if (!reaction) {
      if (current?.liked) await onToggleLike(postId);
      return;
    }

    try {
      if (!current?.liked) {
        await toggleFeedPostLike(postId);
      }
      setItems((prev) =>
        prev.map((row) =>
          row.id === postId
            ? {
                ...row,
                liked: true,
                reaction,
                metadata: {
                  ...row.metadata,
                  likes: current?.liked
                    ? row.metadata?.likes ?? 0
                    : (row.metadata?.likes ?? 0) + 1,
                },
              }
            : row
        )
      );
      setReactionsById((prev) => ({ ...prev, [postId]: reaction }));
      if (reaction === 'love') playHeartBurst(postId);
    } catch {
      /* keep optimistic UI */
    }
  };

  const toggleReelPlayback = useCallback((postId: string) => {
    setUserPausedIds((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  }, []);

  const handleReelPress = (postId: string) => {
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && last.id === postId && now - last.at < 320) {
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      lastTapRef.current = null;
      void onToggleLike(postId, { fromDoubleTap: true });
      return;
    }
    lastTapRef.current = { id: postId, at: now };
    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    singleTapTimerRef.current = setTimeout(() => {
      singleTapTimerRef.current = null;
      lastTapRef.current = null;
      triggerPressFeedback();
      if (Platform.OS !== 'web' && !sessionStarted) {
        setSessionStarted(true);
        return;
      }
      toggleReelPlayback(postId);
    }, 320);
  };

  const handleScrollEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    if (y < -72 && !refreshing && !pullRefreshingRef.current) {
      onRefresh();
    }
  };

  const activeIndex = useMemo(
    () => (activeId ? items.findIndex((r) => r.id === activeId) : -1),
    [items, activeId]
  );

  // Warm the next few clips (and the previous one) so a swipe never waits on the
  // network: video files land in the disk cache NativeClipPlayer reads from,
  // photo reels go through expo-image's cache. Sequential so the active clip
  // keeps the bandwidth; disk only, nothing held in JS memory.
  const prefetchKey = useMemo(() => {
    if (activeIndex < 0) return '';
    return [activeIndex, activeIndex + 1, activeIndex + 2, activeIndex + 3, activeIndex - 1]
      .filter((i) => i >= 0 && i < items.length)
      .map((i) => {
        const media = reelMedia(items[i]);
        return `${media.isVideo ? 'v' : 'i'}|${media.uri}`;
      })
      .join('\n');
  }, [activeIndex, items]);

  useEffect(() => {
    if (!prefetchKey) return;
    let cancelled = false;
    void (async () => {
      for (const entry of prefetchKey.split('\n')) {
        if (cancelled) return;
        const media = { isVideo: entry.startsWith('v|'), uri: entry.slice(2) };
        if (!media.uri) continue;
        if (!media.isVideo) {
          void Image.prefetch(media.uri, 'memory-disk').catch(() => undefined);
          continue;
        }
        if (Platform.OS === 'web') continue;
        await cacheRemoteClip(media.uri).catch(() => '');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prefetchKey]);

  const renderReel = ({ item, index }: { item: ReelRow; index: number }) => {
    const username = item.metadata?.username || 'Member';
    const { uri, isVideo } = reelMedia(item);
    const likes = item.metadata?.likes ?? 0;
    const comments = item.metadata?.comments ?? 0;
    const isActive = activeId === item.id;
    // Player tiers: active plays, index ±1 holds a paused/muted decoded player
    // (first frame ready before the swipe lands), everything further out has
    // no player at all. Max 3 live players at any time.
    const isNeighbour = !isActive && activeIndex >= 0 && Math.abs(index - activeIndex) === 1;
    const mountPlayer = sessionStarted && (isActive || isNeighbour);
    const isUserPaused = userPausedIds.has(item.id);
    const shouldPlay = isActive && sessionStarted && !isUserPaused && !commentsPost;
    const videoEdit = reelPlaybackSettingsFromMetadata(item.metadata);
    const reaction =
      reactionsById[item.id] !== undefined
        ? reactionsById[item.id]
        : item.liked
          ? 'love'
          : null;

    return (
      <View style={[tw`bg-black overflow-hidden`, { height: pageH, width: '100%' }]}>
        {/* Full-bleed media plane — absolute so flex/Pressable quirks can't shrink the video */}
        <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => handleReelPress(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`${isVideo ? 'Video' : 'Photo'} reel by ${username}`}
            accessibilityHint={isVideo ? (shouldPlay ? 'Pauses the video' : 'Plays the video') : undefined}
          >
            {isVideo ? (
              mountPlayer ? (
                <ReelVideoPlayer
                  uri={uri}
                  settings={videoEdit}
                  shouldPlay={shouldPlay}
                  preload={!isActive}
                  contentFit="cover"
                  style={StyleSheet.absoluteFillObject}
                />
              ) : (
                <View style={[StyleSheet.absoluteFillObject, tw`bg-black items-center justify-center`]}>
                  {isActive ? <Ionicons name="play" size={44} color="#FFFFFF" /> : null}
                </View>
              )
            ) : (
              <>
                <Image
                  source={{ uri }}
                  style={StyleSheet.absoluteFillObject}
                  contentFit="cover"
                  transition={200}
                />
                {videoEdit ? (
                  <ReelSoundtrack settings={videoEdit} shouldPlay={shouldPlay} />
                ) : null}
              </>
            )}
            <View style={tw`absolute inset-0 bg-black/20`} pointerEvents="none" />
            {isUserPaused ? (
              <View style={tw`absolute inset-0 items-center justify-center`} pointerEvents="none">
                <View style={tw`w-20 h-20 rounded-full bg-black/45 items-center justify-center border border-white/30`}>
                  <Ionicons name="play" size={40} color="#FFFFFF" style={tw`ml-1`} />
                </View>
              </View>
            ) : null}
            <HeartBurst triggerKey={heartBurst[item.id] || 0} />
          </Pressable>
        </View>

        <View style={tw`absolute bottom-0 left-0 right-0 pb-10 px-gutter`} pointerEvents="box-none">
          <View style={tw`flex-row items-end justify-between`}>
            <View style={tw`flex-1 mr-4`}>
              <PressableScale
                style={tw`flex-row items-center mb-3`}
                onPress={() => {
                  const root = navigation.getParent?.() || navigation;
                  const displayName = (item.metadata as Record<string, unknown> | undefined)
                    ?.display_name;
                  (root as { navigate: (a: string, b: object) => void }).navigate('PublicProfile', {
                    userId: item.user_id,
                    // Lets PublicProfile paint the header instantly while it fetches.
                    preview: {
                      username: item.metadata?.username,
                      displayName: typeof displayName === 'string' ? displayName : undefined,
                      avatarUrl: item.metadata?.avatar ?? null,
                    },
                  });
                }}
              >
                <GrowAvatar
                  userId={item.user_id}
                  username={username}
                  uri={item.metadata?.avatar}
                  size={40}
                  style={tw`border-2 border-white mr-3`}
                />
                <View style={tw`flex-1`}>
                  <Text style={tw`text-white font-semibold`}>{username}</Text>
                  <View style={tw`self-start mt-0.5 px-2 py-0.5 rounded-chip bg-brand-600/30 border border-brand-500/40`}>
                    <Text style={tw`text-[#A7F3D0] text-caption font-semibold capitalize`}>
                      {item.category}
                    </Text>
                  </View>
                </View>
              </PressableScale>
              <Text style={tw`text-white`} numberOfLines={3}>
                {item.caption || ' '}
              </Text>
            </View>

            <View style={tw`items-center gap-5 pb-2`}>
              <View style={tw`items-center relative`}>
                {showReactionPicker === item.id ? (
                  <View style={tw`absolute bottom-14 right-0 z-20`}>
                    <ReactionPickerBar onPick={(r) => void setReaction(item.id, r)} />
                  </View>
                ) : null}
                <View style={tw`w-12 h-12 rounded-full bg-black/40 items-center justify-center`}>
                  <FeedLikeButton
                    hasLiked={item.liked}
                    reaction={reaction}
                    tone="dark"
                    compact
                    onPress={() => void onToggleLike(item.id)}
                    onLongPress={() => {
                      if (showReactionPicker !== item.id) longPressPeek.open();
                      setShowReactionPicker((prev) => (prev === item.id ? null : item.id));
                    }}
                  />
                </View>
                <Text style={tw`text-white text-xs mt-1 font-semibold`}>{formatCompact(likes)}</Text>
              </View>
              <PressableScale
                style={tw`items-center`}
                onPress={() => setCommentsPost(item)}
              >
                <View style={tw`w-12 h-12 rounded-full bg-black/40 items-center justify-center`}>
                  <Ionicons name="chatbubble-outline" size={24} color="#FFFFFF" />
                </View>
                <Text style={tw`text-white text-xs mt-1 font-semibold`}>{formatCompact(comments)}</Text>
              </PressableScale>
            </View>
          </View>
        </View>
      </View>
    );
  };

  if (loading && items.length === 0) {
    return (
      <View style={tw`flex-1 bg-black`}>
        <ReelsHeader onBack={goBack} onCreate={openCreateReel} modeLabel={modeLabel} />
        <View style={tw`flex-1 items-center justify-center`}>
          <GrowLoader label="Finding clips…" />
        </View>
      </View>
    );
  }

  if (!loading && items.length === 0) {
    return (
      <View style={tw`flex-1 bg-black`}>
        <ReelsHeader onBack={goBack} onCreate={openCreateReel} modeLabel={modeLabel} />
        <ReelsEmptyState onCreate={openCreateReel} />
      </View>
    );
  }

  return (
    <View
      style={tw`flex-1 bg-black`}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width <= 0 || height <= 0) return;
        setPageSize((prev) =>
          prev.w === width && prev.h === height ? prev : { w: width, h: height }
        );
      }}
    >
      <FlatList
        ref={flatListRef}
        style={{ flex: 1 }}
        data={items}
        renderItem={renderReel}
        extraData={`${pageH}:${activeId}:${sessionStarted ? '1' : '0'}`}
        keyExtractor={(item) => item.id}
        // One page above + current + one below stays mounted so neighbours are
        // decoded before the swipe lands. Players beyond ±1 never mount
        // (see renderReel). Clipping stays off: detaching VideoViews mid-swipe
        // is what causes the black flash on Android.
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={3}
        removeClippedSubviews={false}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={pageH}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            flatListRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: false,
            });
          }, 100);
        }}
        onScrollEndDrag={handleScrollEndDrag}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#FFFFFF"
            progressViewOffset={80}
          />
        }
        getItemLayout={(_, index) => ({
          length: pageH,
          offset: pageH * index,
          index,
        })}
      />
      <ReelsHeader onBack={goBack} onCreate={openCreateReel} modeLabel={modeLabel} />

      {commentsPost ? (
        <Modal
          visible
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setCommentsPost(null)}
        >
          <CommentsScreen
            postId={commentsPost.id}
            postUsername={commentsPost.metadata?.username || 'Member'}
            postUserId={commentsPost.user_id}
            postCaption={commentsPost.caption || ''}
            onClose={() => setCommentsPost(null)}
            onCommentsChanged={(count) => {
              setItems((prev) =>
                prev.map((row) =>
                  row.id === commentsPost.id
                    ? { ...row, metadata: { ...row.metadata, comments: count } }
                    : row
                )
              );
            }}
          />
        </Modal>
      ) : null}
    </View>
  );
}
