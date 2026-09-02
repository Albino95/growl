import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Pressable,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Modal,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect, useRoute, RouteProp } from '@react-navigation/native';
import { getForYouFeed, getFeedPost, toggleFeedPostLike, type FeedPost } from '../../services/api/feed';
import { isVideoMedia } from '../../services/api/media';
import { resolveAvatarUri, resolvePostMediaUri } from '../../utils/images';
import { isReelPost } from '../../utils/reelNavigation';
import { reelPlaybackSettingsFromMetadata } from '../../utils/reelMedia';
import { ReelVideoPlayer } from '../../components/ui/VideoEditor';
import CommentsScreen from '../Comments/CommentsScreen';
import HeartBurst from '../../components/feed/HeartBurst';
import FeedLikeButton, {
  ReactionPickerBar,
  type FeedReaction,
} from '../../components/feed/FeedLikeButton';
import { triggerPressFeedback } from '../../utils/interactionFeedback';
import tw from '../../lib/tw';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

type ReelRow = FeedPost & { liked: boolean; reaction: FeedReaction };

type ReelsRoute = RouteProp<
  { Reels: { startPostId?: string; seedPost?: FeedPost } | undefined },
  'Reels'
>;

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function ReelsHeader({ onBack, onCreate }: { onBack: () => void; onCreate: () => void }) {
  return (
    <SafeAreaView edges={['top']} style={tw`bg-black/80`}>
      <View style={tw`flex-row items-center justify-between px-4 py-2`}>
        <TouchableOpacity
          onPress={onBack}
          hitSlop={12}
          style={tw`w-10 h-10 rounded-full bg-white/10 items-center justify-center`}
        >
          <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={tw`items-center`}>
          <Text style={tw`text-[10px] tracking-[2px] uppercase text-emerald-400 font-bold`}>
            Grow!
          </Text>
          <Text style={tw`text-white font-bold text-lg`}>Reels</Text>
        </View>
        <TouchableOpacity
          onPress={onCreate}
          hitSlop={12}
          style={tw`w-10 h-10 rounded-full bg-brand-600 items-center justify-center`}
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
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
      <TouchableOpacity onPress={onCreate} style={tw`bg-brand-600 px-6 py-3.5 rounded-full flex-row items-center gap-2`}>
        <Ionicons name="add-circle-outline" size={20} color="#fff" />
        <Text style={tw`text-white font-bold text-base`}>Create Reel</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ReelsScreen() {
  const navigation = useNavigation();
  const route = useRoute<ReelsRoute>();
  const startPostId = route.params?.startPostId;
  const seedPost = route.params?.seedPost;
  const scrollToId = useRef(startPostId);

  const [items, setItems] = useState<ReelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [commentsPost, setCommentsPost] = useState<ReelRow | null>(null);
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
      const res = await getForYouFeed();
      if (!res.success || !res.data) {
        setItems([]);
        return;
      }
      const following = Array.isArray(res.data.following) ? res.data.following : [];
      const suggested = Array.isArray(res.data.suggested) ? res.data.suggested : [];
      const seen = new Set<string>();
      const merged: FeedPost[] = [];
      for (const p of [...following, ...suggested]) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        merged.push(p);
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
  }, [seedPost]);

  useFocusEffect(
    useCallback(() => {
      if (startPostId) scrollToId.current = startPostId;
      setLoading(true);
      void load();
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
      playHeartBurst(postId);
      return;
    }

    const nextLiked = !wasLiked;
    const nextLikes = nextLiked
      ? (current?.metadata?.likes ?? 0) + 1
      : Math.max(0, (current?.metadata?.likes ?? 0) - 1);

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
      triggerPressFeedback();
      void onToggleLike(postId, { fromDoubleTap: true });
      return;
    }
    lastTapRef.current = { id: postId, at: now };
    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    singleTapTimerRef.current = setTimeout(() => {
      singleTapTimerRef.current = null;
      lastTapRef.current = null;
      triggerPressFeedback();
      toggleReelPlayback(postId);
    }, 320);
  };

  const handleScrollEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    if (y < -72 && !refreshing && !pullRefreshingRef.current) {
      onRefresh();
    }
  };

  const renderReel = ({ item }: { item: ReelRow }) => {
    const username = item.metadata?.username || 'Member';
    const avatar = resolveAvatarUri(item.user_id, username, item.metadata?.avatar);
    const uri = resolvePostMediaUri(item.image_url ?? '', item.category, item.id);
    const likes = item.metadata?.likes ?? 0;
    const comments = item.metadata?.comments ?? 0;
    const isVideo = isVideoMedia({
      uri,
      mediaType: item.metadata?.media_type,
      contentType: item.metadata?.content_type,
    });
    const isActive = activeId === item.id;
    const isUserPaused = userPausedIds.has(item.id);
    const shouldPlay = isActive && !isUserPaused && !commentsPost;
    const videoEdit = reelPlaybackSettingsFromMetadata(item.metadata);
    const reaction = reactionsById[item.id] ?? (item.liked ? 'love' : null);

    return (
      <View style={[tw`bg-black overflow-hidden`, { height: SCREEN_HEIGHT, width: '100%' }]}>
        {/* Full-bleed media plane — absolute so flex/Pressable quirks can't shrink the video */}
        <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => handleReelPress(item.id)}>
            {isVideo ? (
              <ReelVideoPlayer
                uri={uri}
                settings={videoEdit}
                shouldPlay={shouldPlay}
                style={StyleSheet.absoluteFillObject}
              />
            ) : (
              <Image
                source={{ uri }}
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
                transition={200}
              />
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

        <View style={tw`absolute bottom-0 left-0 right-0 pb-10 px-4`} pointerEvents="box-none">
          <View style={tw`flex-row items-end justify-between`}>
            <View style={tw`flex-1 mr-4`}>
              <TouchableOpacity
                style={tw`flex-row items-center mb-3`}
                onPress={() => {
                  const root = navigation.getParent?.() || navigation;
                  (root as { navigate: (a: string, b: object) => void }).navigate('PublicProfile', {
                    userId: item.user_id,
                  });
                }}
              >
                <Image source={{ uri: avatar }} style={tw`w-10 h-10 rounded-full border-2 border-white mr-3`} />
                <View style={tw`flex-1`}>
                  <Text style={tw`text-white font-semibold`}>{username}</Text>
                  <View style={tw`self-start mt-0.5 px-2 py-0.5 rounded-full bg-brand-600/30 border border-brand-500/40`}>
                    <Text style={tw`text-emerald-200 text-[10px] font-semibold capitalize`}>
                      {item.category}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
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
                    onLongPress={() =>
                      setShowReactionPicker((prev) => (prev === item.id ? null : item.id))
                    }
                  />
                </View>
                <Text style={tw`text-white text-xs mt-1 font-semibold`}>{formatCompact(likes)}</Text>
              </View>
              <TouchableOpacity
                style={tw`items-center`}
                onPress={() => setCommentsPost(item)}
              >
                <View style={tw`w-12 h-12 rounded-full bg-black/40 items-center justify-center`}>
                  <Ionicons name="chatbubble-outline" size={24} color="#FFFFFF" />
                </View>
                <Text style={tw`text-white text-xs mt-1 font-semibold`}>{formatCompact(comments)}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  if (loading && items.length === 0) {
    return (
      <View style={tw`flex-1 bg-black`}>
        <ReelsHeader onBack={goBack} onCreate={openCreateReel} />
        <View style={tw`flex-1 items-center justify-center`}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={tw`text-white/70 mt-4`}>Loading clips…</Text>
        </View>
      </View>
    );
  }

  if (!loading && items.length === 0) {
    return (
      <View style={tw`flex-1 bg-black`}>
        <ReelsHeader onBack={goBack} onCreate={openCreateReel} />
        <ReelsEmptyState onCreate={openCreateReel} />
      </View>
    );
  }

  return (
    <View style={tw`flex-1 bg-black`}>
      <FlatList
        ref={flatListRef}
        data={items}
        renderItem={renderReel}
        keyExtractor={(item) => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={SCREEN_HEIGHT}
        decelerationRate="fast"
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
            tintColor="#fff"
            progressViewOffset={80}
          />
        }
        getItemLayout={(_, index) => ({
          length: SCREEN_HEIGHT,
          offset: SCREEN_HEIGHT * index,
          index,
        })}
      />
      <SafeAreaView edges={['top']} pointerEvents="box-none" style={tw`absolute top-0 left-0 right-0`}>
        <ReelsHeader onBack={goBack} onCreate={openCreateReel} />
      </SafeAreaView>

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
