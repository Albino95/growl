import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { getFeedPosts, toggleFeedPostLike, type FeedPost } from '../../services/api/feed';
import { resolveAvatarUri, resolveStoryDisplayUri } from '../../utils/images';
import tw from '../../lib/tw';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

type ReelRow = FeedPost & {
  liked: boolean;
};

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function ReelsScreen() {
  const navigation = useNavigation();
  const [items, setItems] = useState<ReelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    try {
      const res = await getFeedPosts();
      const posts = res.success && Array.isArray(res.data) ? res.data : [];
      const reels = posts
        .map((p) => ({
          ...p,
          liked: false,
        }))
        .sort((a, b) => {
          const aReel = a.metadata?.format === 'reel' ? 1 : 0;
          const bReel = b.metadata?.format === 'reel' ? 1 : 0;
          if (aReel !== bReel) return bReel - aReel;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
      setItems(reels);
    } catch (e) {
      console.warn('[Reels] load failed', e);
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const onToggleLike = async (postId: string) => {
    try {
      const res = await toggleFeedPostLike(postId);
      const liked = !!res.data?.liked;
      setItems((prev) =>
        prev.map((row) => {
          if (row.id !== postId) return row;
          const base = row.metadata?.likes ?? 0;
          const nextLikes = liked ? base + (row.liked ? 0 : 1) : base - (row.liked ? 1 : 0);
          return {
            ...row,
            liked,
            metadata: { ...row.metadata, likes: Math.max(0, nextLikes) },
          };
        })
      );
    } catch {
      // Keep UI unchanged on failure
    }
  };

  const renderReel = ({ item }: { item: ReelRow }) => {
    const username = item.metadata?.username || 'Member';
    const avatar = resolveAvatarUri(item.user_id, username, item.metadata?.avatar);
    const mediaUri = resolveStoryDisplayUri(item.image_url ?? '', item.user_id, item.id);
    const uri = mediaUri;
    const likes = item.metadata?.likes ?? 0;
    const comments = item.metadata?.comments ?? 0;

    return (
      <View style={[tw`bg-black`, { height: SCREEN_HEIGHT }]}>
        <TouchableOpacity
          activeOpacity={1}
          style={tw`flex-1`}
          onPress={() => {
            const root = navigation.getParent?.() || navigation;
            (root as { navigate: (a: string, b: object) => void }).navigate('PostDetail', {
              post: {
                id: item.id,
                userId: item.user_id,
                username,
                avatar,
                image: uri,
                caption: item.caption || '',
                category: item.category,
                subcategory: item.subcategory || undefined,
                likes,
                comments,
                createdAt: item.created_at,
                hasLiked: item.liked,
                reaction: item.liked ? 'like' : null,
              },
            });
          }}
        >
          <Image source={{ uri }} style={tw`absolute inset-0 w-full h-full`} contentFit="cover" transition={200} />
          <View style={tw`absolute inset-0 bg-black/25`} />
        </TouchableOpacity>

        <SafeAreaView style={tw`absolute top-0 left-0 right-0 z-10`} edges={['top']}>
          <View style={tw`flex-row items-center justify-between px-4 pt-2`}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              hitSlop={12}
              style={tw`w-10 h-10 rounded-full bg-black/45 items-center justify-center`}
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={tw`text-white font-bold text-lg`}>Clips</Text>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              hitSlop={12}
              style={tw`w-10 h-10 rounded-full bg-black/45 items-center justify-center`}
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        <View style={tw`absolute bottom-0 left-0 right-0 pb-10 px-4`}>
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
                  <Text style={tw`text-white/70 text-xs capitalize`}>{item.category}</Text>
                </View>
              </TouchableOpacity>
              <Text style={tw`text-white`} numberOfLines={3}>
                {item.caption || ' '}
              </Text>
            </View>

            <View style={tw`items-center gap-5 pb-2`}>
              <TouchableOpacity style={tw`items-center`} onPress={() => void onToggleLike(item.id)}>
                <View style={tw`w-12 h-12 rounded-full bg-black/40 items-center justify-center`}>
                  <Ionicons name={item.liked ? 'heart' : 'heart-outline'} size={26} color={item.liked ? '#F87171' : '#FFFFFF'} />
                </View>
                <Text style={tw`text-white text-xs mt-1 font-semibold`}>{formatCompact(likes)}</Text>
              </TouchableOpacity>
              <View style={tw`items-center`}>
                <View style={tw`w-12 h-12 rounded-full bg-black/40 items-center justify-center`}>
                  <Ionicons name="chatbubble-outline" size={24} color="#FFFFFF" />
                </View>
                <Text style={tw`text-white text-xs mt-1 font-semibold`}>{formatCompact(comments)}</Text>
              </View>
              <TouchableOpacity
                style={tw`items-center`}
                onPress={() => {
                  const root = navigation.getParent?.() || navigation;
                  (root as { navigate: (a: string, b: object) => void }).navigate('PostDetail', {
                    post: {
                      id: item.id,
                      userId: item.user_id,
                      username,
                      avatar,
                      image: uri,
                      caption: item.caption || '',
                      category: item.category,
                      likes,
                      comments,
                      createdAt: item.created_at,
                      hasLiked: item.liked,
                      reaction: item.liked ? 'like' : null,
                    },
                  });
                }}
              >
                <View style={tw`w-12 h-12 rounded-full bg-black/40 items-center justify-center`}>
                  <Ionicons name="arrow-forward-circle-outline" size={26} color="#FFFFFF" />
                </View>
                <Text style={tw`text-white text-xs mt-1 font-semibold`}>Open</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  if (loading && items.length === 0) {
    return (
      <SafeAreaView style={tw`flex-1 bg-black`} edges={['top']}>
        <View style={tw`flex-row items-center px-4 pt-2`}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={tw`w-10 h-10 rounded-full bg-white/15 items-center justify-center`}
          >
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <View style={tw`flex-1 items-center justify-center`}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={tw`text-white/70 mt-4`}>Loading clips…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={tw`flex-1 bg-black`}>
      <SafeAreaView
        edges={['top']}
        style={tw`absolute top-0 left-0 right-0 z-20 flex-row items-center justify-between px-4 pt-1`}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={tw`w-10 h-10 rounded-full bg-black/40 items-center justify-center`}
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={tw`text-white font-bold text-lg`}>Reels</Text>
        <TouchableOpacity
          onPress={() => {
            const root = navigation.getParent?.() || navigation;
            (root as { navigate: (a: string) => void }).navigate('CreateReel');
          }}
          style={tw`w-10 h-10 rounded-full bg-brand-600 items-center justify-center`}
          accessibilityLabel="Create reel"
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </SafeAreaView>

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        ListEmptyComponent={
          <View style={[tw`items-center justify-center px-8`, { height: SCREEN_HEIGHT }]}>
            <Text style={tw`text-white text-center text-lg mb-2`}>No reels yet</Text>
            <Text style={tw`text-white/60 text-center mb-6`}>
              Create a vertical clip with the pro photo editor — looks, crop, text, and cinematic edges.
            </Text>
            <TouchableOpacity
              onPress={() => {
                const root = navigation.getParent?.() || navigation;
                (root as { navigate: (a: string) => void }).navigate('CreateReel');
              }}
              style={tw`bg-brand-600 px-5 py-3 rounded-full flex-row items-center gap-2`}
            >
              <Ionicons name="film-outline" size={18} color="#fff" />
              <Text style={tw`text-white font-semibold`}>Create Reel</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}
