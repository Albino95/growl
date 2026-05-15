/**
 * Explore — discovery surface (separate from home feed).
 *
 * ## Algorithm brainstorm (v1 shipped here)
 * - **Signals:** category overlap with the viewer’s onboarding paths; recency (half-life decay);
 *   light engagement weight (likes + comments on posts); products get a smaller base weight plus category match.
 * - **Blend:** merge recent feed posts + marketplace SKUs into one ranked list so commerce and social both surface.
 * - **Diversity (future):** MMR or per-author caps so one creator does not dominate; session-level de-duplication.
 * - **Cold start:** if the user has no categories, fall back to pure recency + small deterministic jitter (stable shuffle).
 * - **Next iterations:** explicit “trending” table; negative signals (hide/skip); friend-boost; geo or locale;
 *   instructor-only rails; A/B on weights via remote config.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../store/hooks';
import { getFeedPosts, type FeedPost } from '../../services/api/feed';
import { getProducts, type Product } from '../../services/api/marketplace';
import { getAvatarUrl, getPostImageUrl } from '../../utils/images';
import tw from '../../lib/tw';
import { feedListPerformanceProps } from '../../constants/scroll';

type ExploreRow =
  | { kind: 'post'; post: FeedPost; score: number }
  | { kind: 'product'; product: Product; score: number };

function expandUserCategoryKeys(paths: string[]): Set<string> {
  const s = new Set<string>();
  for (const p of paths || []) {
    const x = String(p).trim().toLowerCase();
    if (!x) continue;
    s.add(x);
    const i = x.indexOf(':');
    if (i > 0) s.add(x.slice(0, i));
  }
  return s;
}

function categoryScore(userKeys: Set<string>, category: string, sub?: string | null): number {
  const c = category.toLowerCase();
  const subKey = sub ? `${c}:${String(sub).toLowerCase()}` : '';
  let score = 0;
  if (userKeys.has(c)) score += 35;
  if (subKey && userKeys.has(subKey)) score += 55;
  for (const k of userKeys) {
    if (k.includes(':')) continue;
    if (c.startsWith(k) || k.startsWith(c)) score += 12;
  }
  return score;
}

function recencyScore(iso: string): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  const hours = (Date.now() - t) / (1000 * 60 * 60);
  return Math.max(0, 48 - hours);
}

function jitter(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
  return (h % 100) / 100;
}

function rankExploreRows(posts: FeedPost[], products: Product[], userPaths: string[]): ExploreRow[] {
  const keys = expandUserCategoryKeys(userPaths);
  const rows: ExploreRow[] = [];

  for (const p of posts) {
    const likes = p.metadata?.likes ?? 0;
    const comments = p.metadata?.comments ?? 0;
    const score =
      categoryScore(keys, p.category, p.subcategory) +
      recencyScore(p.created_at) * 0.6 +
      Math.min(40, (likes + comments) * 1.2) +
      jitter(p.id) * 8;
    rows.push({ kind: 'post', post: p, score });
  }

  for (const pr of products) {
    const score =
      categoryScore(keys, pr.category, pr.subcategory) * 0.85 +
      recencyScore(pr.created_at) * 0.35 +
      Math.min(15, (pr.stock > 0 ? 8 : 0)) +
      jitter(pr.id) * 6;
    rows.push({ kind: 'product', product: pr, score });
  }

  return rows.sort((a, b) => b.score - a.score);
}

export default function ExploreScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [rows, setRows] = useState<ExploreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const userPaths = user?.categories || [];

  const load = useCallback(async () => {
    try {
      const [feedRes, prodRes] = await Promise.all([
        getFeedPosts(),
        getProducts({ limit: 24, offset: 0 }),
      ]);
      const posts = feedRes.success && Array.isArray(feedRes.data) ? feedRes.data : [];
      const products =
        prodRes.success && prodRes.data?.products && Array.isArray(prodRes.data.products)
          ? prodRes.data.products
          : [];
      setRows(rankExploreRows(posts, products, userPaths));
    } catch (e) {
      console.warn('[Explore] load failed', e);
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userPaths]);

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

  const subtitle = useMemo(() => {
    if (!userPaths.length) return 'Showing a mix of recent posts and marketplace picks.';
    return `Ranked for your growth areas (${userPaths.length} path${userPaths.length === 1 ? '' : 's'}).`;
  }, [userPaths]);

  const renderItem = ({ item }: { item: ExploreRow }) => {
    if (item.kind === 'post') {
      const p = item.post;
      const username = p.metadata?.username || 'Member';
      const avatar = p.metadata?.avatar || getAvatarUrl(p.user_id, username);
      const image = p.image_url || getPostImageUrl(p.category, p.id);
      return (
        <TouchableOpacity
          style={tw`bg-white border border-stone-100 rounded-2xl p-4 mb-3`}
          activeOpacity={0.88}
          onPress={() => {
            const root = navigation.getParent?.() || navigation;
            (root as { navigate: (a: string, b: object) => void }).navigate('PostDetail', {
              post: {
                id: p.id,
                userId: p.user_id,
                username,
                avatar,
                image,
                caption: p.caption || '',
                category: p.category,
                subcategory: p.subcategory || undefined,
                likes: p.metadata?.likes ?? 0,
                comments: p.metadata?.comments ?? 0,
                createdAt: p.created_at,
                hasLiked: false,
                reaction: null,
              },
            });
          }}
        >
          <View style={tw`flex-row items-center mb-2`}>
            <Image source={{ uri: avatar }} style={tw`w-9 h-9 rounded-full bg-stone-100 mr-2`} />
            <View style={tw`flex-1`}>
              <Text style={tw`font-semibold text-stone-900`}>{username}</Text>
              <Text style={tw`text-xs text-stone-500 capitalize`}>{p.category}</Text>
            </View>
            <View style={tw`px-2 py-0.5 bg-violet-50 rounded-full`}>
              <Text style={tw`text-xs font-semibold text-violet-700`}>Post</Text>
            </View>
          </View>
          <Image source={{ uri: image }} style={tw`w-full h-44 rounded-xl bg-stone-100 mb-2`} contentFit="cover" />
          <Text style={tw`text-stone-800`} numberOfLines={3}>
            {p.caption || ' '}
          </Text>
        </TouchableOpacity>
      );
    }

    const pr = item.product;
    const img = pr.image_url || pr.images?.[0];
    return (
      <TouchableOpacity
        style={tw`bg-white border border-stone-100 rounded-2xl p-4 mb-3`}
        activeOpacity={0.88}
        onPress={() => {
          const root = navigation.getParent?.() || navigation;
          (root as { navigate: (a: string, b: object) => void }).navigate('ProductDetail', {
            productId: pr.id,
          });
        }}
      >
        <View style={tw`flex-row items-center justify-between mb-2`}>
          <Text style={tw`font-semibold text-stone-900`} numberOfLines={1}>
            {pr.name}
          </Text>
          <View style={tw`px-2 py-0.5 bg-emerald-50 rounded-full`}>
            <Text style={tw`text-xs font-semibold text-emerald-700`}>Shop</Text>
          </View>
        </View>
        {img ? (
          <Image source={{ uri: img }} style={tw`w-full h-36 rounded-xl bg-stone-100 mb-2`} contentFit="cover" />
        ) : null}
        <Text style={tw`text-sm text-stone-600 mb-1`} numberOfLines={2}>
          {pr.description || pr.category}
        </Text>
        <Text style={tw`text-emerald-700 font-bold`}>${pr.price.toFixed(2)}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-stone-50`} edges={['top']}>
      <View style={tw`px-5 pt-3 pb-2 border-b border-stone-100 bg-white`}>
        <Text style={tw`text-2xl font-bold text-violet-800`}>Explore</Text>
        <Text style={tw`text-sm text-stone-500 mt-1`}>{subtitle}</Text>
      </View>
      {loading && rows.length === 0 ? (
        <View style={tw`flex-1 items-center justify-center py-20`}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => (r.kind === 'post' ? `p-${r.post.id}` : `pr-${r.product.id}`)}
          renderItem={renderItem}
          contentContainerStyle={tw`px-4 pt-3 pb-24`}
          {...feedListPerformanceProps}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" colors={['#7C3AED']} />
          }
          ListEmptyComponent={
            <View style={tw`items-center py-16 px-6`}>
              <Ionicons name="planet-outline" size={48} color="#C4B5FD" />
              <Text style={tw`text-stone-600 text-center mt-3`}>Nothing to explore yet. Pull to refresh.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
