/**
 * Explore — discover people, stories, posts, and shop picks by growth path.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  Alert,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../store/hooks';
import { getFeedPosts, type FeedPost } from '../../services/api/feed';
import { getStories, viewStory, type StoryItem } from '../../services/api/stories';
import { addFriend, listFriends } from '../../services/api/friends';
import { resolveAvatarUri, resolvePostMediaUri, resolveStoryDisplayUri } from '../../utils/images';
import { rankDiscoverPeople, rankDiscoverReelPosts, type DiscoverPerson } from '../../utils/ranking';
import { rankExploreRows, rankMarketplaceProducts, type RankedProduct } from '../../utils/ranking';
import { getProducts } from '../../services/api/marketplace';
import tw from '../../lib/tw';
import {
  feedListPerformanceProps,
  horizontalScrollProps,
  TAB_SCREEN_BOTTOM_PADDING,
} from '../../constants/scroll';
import SearchField from '../../components/ui/SearchField';
import EmptyState from '../../components/ui/EmptyState';
import GrowChromeHeader from '../../components/ui/GrowChromeHeader';
import { CategoryCapsuleRow, type CapsuleItem } from '../../components/ui/CategoryCapsule';
import CATEGORIES from '../../data/categories';
import { triggerPressFeedback } from '../../utils/interactionFeedback';
import { openReelsAtPost, isReelPost } from '../../utils/reelNavigation';

function SectionTitle({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={tw`flex-row items-end justify-between mb-3 mt-1`}>
      <Text style={tw`text-xs font-semibold tracking-widest text-stone-500 uppercase`}>
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={tw`text-sm font-semibold text-emerald-700`}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function ExploreScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [people, setPeople] = useState<DiscoverPerson[]>([]);
  const [reels, setReels] = useState<FeedPost[]>([]);
  const [storyGroups, setStoryGroups] = useState<
    Array<{ userId: string; username: string; avatar: string | null; stories: StoryItem[] }>
  >([]);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [shopPicks, setShopPicks] = useState<RankedProduct[]>([]);
  const [gridPosts, setGridPosts] = useState<FeedPost[]>([]);

  const userPaths = user?.categories || [];

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const [feedRes, storiesRes, friends, productsRes] = await Promise.all([
        getFeedPosts({ mode: 'explore' }),
        getStories({ mode: 'explore' }),
        listFriends(),
        getProducts({}),
      ]);
      const posts = feedRes.success && Array.isArray(feedRes.data) ? feedRes.data : [];
      const products =
        productsRes.success && Array.isArray(productsRes.data?.products)
          ? productsRes.data.products
          : [];
      const fIds = new Set(friends.map((f) => f.id));
      setFriendIds(fIds);

      const grouped =
        storiesRes.success && storiesRes.data?.grouped ? storiesRes.data.grouped : [];
      setStoryGroups(grouped);

      setPeople(
        rankDiscoverPeople(grouped, posts, userPaths, {
          selfId: user?.id,
          friendIds: fIds,
        })
      );
      setReels(
        rankDiscoverReelPosts(posts, userPaths, {
          selfId: user?.id,
          friendIds: fIds,
        })
      );

      setShopPicks(
        rankMarketplaceProducts(products, userPaths, {
          userPoints: user?.points,
        }).slice(0, 8)
      );

      const rankedGrid = rankExploreRows(posts, [], userPaths, {
        friendIds: fIds,
        applyDiversity: true,
      })
        .filter((r): r is { kind: 'post'; post: FeedPost; score: number } => r.kind === 'post')
        .map((r) => r.post);
      setGridPosts(rankedGrid.slice(0, 24));
    } catch (e) {
      console.warn('[Explore] load failed', e);
      setLoadError('Could not refresh explore content. Pull to retry.');
      setPeople([]);
      setReels([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, userPaths]);

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

  const pathCapsules: CapsuleItem[] = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of reels) {
      if (p.category) counts[p.category] = (counts[p.category] || 0) + 1;
    }
    for (const p of gridPosts) {
      if (p.category) counts[p.category] = (counts[p.category] || 0) + 1;
    }

    // Prefer user's growth paths first, then any categories present in content.
    const orderedKeys: string[] = [];
    for (const key of userPaths) {
      if (typeof key === 'string' && key && !orderedKeys.includes(key)) orderedKeys.push(key);
    }
    for (const key of Object.keys(counts)) {
      if (!orderedKeys.includes(key)) orderedKeys.push(key);
    }
    // Always show full catalog of paths so Explore feels browsable even with sparse data.
    for (const cat of CATEGORIES) {
      if (!orderedKeys.includes(cat.key)) orderedKeys.push(cat.key);
    }

    return orderedKeys.slice(0, 12).map((key) => {
      const meta = CATEGORIES.find((c) => c.key === key);
      return {
        key,
        label: meta?.label || key,
        icon: (meta?.icon || 'ellipse-outline') as keyof typeof Ionicons.glyphMap,
        count: counts[key],
      };
    });
  }, [reels, gridPosts, userPaths]);

  const totalCapsuleCount = useMemo(
    () => reels.length + gridPosts.length,
    [reels.length, gridPosts.length]
  );

  const filteredPeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) => {
      if (q && !p.username.toLowerCase().includes(q)) return false;
      if (!selectedCategory) return true;
      return p.latestPost?.category === selectedCategory;
    });
  }, [people, query, selectedCategory]);

  const filteredReels = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reels.filter((p) => {
      const username = (p.metadata?.username || 'member').toLowerCase();
      const caption = (p.caption || '').toLowerCase();
      if (q && !username.includes(q) && !caption.includes(q)) return false;
      if (!selectedCategory) return true;
      return p.category === selectedCategory;
    });
  }, [reels, query, selectedCategory]);

  const filteredGrid = useMemo(() => {
    if (!selectedCategory) return gridPosts;
    return gridPosts.filter((p) => p.category === selectedCategory);
  }, [gridPosts, selectedCategory]);

  const filteredShop = useMemo(() => {
    if (!selectedCategory) return shopPicks;
    return shopPicks.filter((p) => (p.category || '').split(':')[0] === selectedCategory);
  }, [shopPicks, selectedCategory]);

  const storyPeople = useMemo(
    () => filteredPeople.filter((p) => p.storyCount > 0).slice(0, 12),
    [filteredPeople]
  );

  const openProfile = (userId: string) => {
    const root = navigation.getParent?.() || navigation;
    (root as { navigate: (a: string, b: object) => void }).navigate('PublicProfile', { userId });
  };

  const openStoryViewer = (person: DiscoverPerson) => {
    const g = storyGroups.find((x) => x.userId === person.userId);
    if (!g?.stories?.length) {
      openProfile(person.userId);
      return;
    }
    const root = navigation.getParent?.() || navigation;
    const fullStories = g.stories.map((s) => ({
      ...s,
      image: resolveStoryDisplayUri(s.image, s.userId, s.id),
    }));
    (root as { navigate: (a: string, b: object) => void }).navigate('StoryViewer', {
      stories: fullStories,
      initialIndex: 0,
      onStoriesUpdate: (updatedStories: typeof fullStories) => {
        const viewedIds = updatedStories.filter((story) => story.hasViewed).map((story) => story.id);
        if (viewedIds.length > 0) {
          Promise.all(viewedIds.map((id) => viewStory(id))).catch(() => undefined);
        }
      },
    });
  };

  const onAddFriend = async (userId: string) => {
    if (addingId) return;
    setAddingId(userId);
    try {
      const result = await addFriend(userId);
      setFriendIds((prev) => new Set([...prev, userId]));
      setPeople((prev) => prev.filter((p) => p.userId !== userId));
      // Keep posts visible so users can still open them after sending a request.
      Alert.alert(
        result.connected ? 'Friends' : 'Request sent',
        result.connected
          ? 'You are now friends.'
          : 'Friend request sent. They can accept it from your profile.'
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not add friend';
      Alert.alert('Error', msg);
    } finally {
      setAddingId(null);
    }
  };

  const openReels = () => {
    const root = navigation.getParent?.() || navigation;
    (root as { navigate: (a: string) => void }).navigate('Reels');
  };

  const openMarketplace = () => {
    navigation.navigate('Marketplace' as never);
  };

  const openPostDetail = (p: FeedPost) => {
    if (isReelPost(p)) {
      const root = navigation.getParent?.() || navigation;
      openReelsAtPost(navigation, p.id, p);
      return;
    }
    const username = p.metadata?.username || 'Member';
    const avatar = resolveAvatarUri(p.user_id, username, p.metadata?.avatar);
    const image = resolvePostMediaUri(p.image_url, p.category, p.id);
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
        hasLiked: !!p.metadata?.has_liked,
        reaction: p.metadata?.has_liked ? 'love' : null,
      },
    });
  };

  const ListHeader = (
    <>
      {/* Stories */}
      <SectionTitle title="Stories to meet" actionLabel="All reels" onAction={openReels} />
      {storyPeople.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={tw`mb-5`}
          {...horizontalScrollProps}
        >
          {storyPeople.map((person) => {
            const avatar = resolveAvatarUri(person.userId, person.username, person.avatar);
            const thumb = resolveStoryDisplayUri(person.latestStoryImage, person.userId);
            return (
              <TouchableOpacity
                key={person.userId}
                onPress={() => {
                  triggerPressFeedback();
                  openStoryViewer(person);
                }}
                style={tw`items-center mr-4 w-20`}
              >
                <View style={tw`w-16 h-16 rounded-full border-2 border-emerald-500 p-0.5`}>
                  <Image
                    source={{ uri: thumb || avatar }}
                    style={tw`w-full h-full rounded-full`}
                    contentFit="cover"
                  />
                </View>
                <Text style={tw`text-xs text-stone-600 mt-1.5 text-center`} numberOfLines={1}>
                  {person.username.split(' ')[0]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : (
        <Text style={tw`text-sm text-stone-500 mb-5`}>
          No new story rings right now — browse clips below.
        </Text>
      )}

      {/* Shop */}
      <SectionTitle title="Shop picks" actionLabel="Open shop" onAction={openMarketplace} />
      {filteredShop.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={tw`mb-5`}
          {...horizontalScrollProps}
        >
          {filteredShop.map((product) => (
            <TouchableOpacity
              key={product.id}
              style={tw`w-36 mr-3 bg-white border border-stone-200/80 rounded-2xl overflow-hidden`}
              onPress={() => {
                triggerPressFeedback();
                const root = navigation.getParent?.() || navigation;
                (root as { navigate: (a: string, b: object) => void }).navigate('ProductDetail', {
                  productId: product.id,
                });
              }}
            >
              <Image
                source={{
                  uri: product.image_url || `https://picsum.photos/seed/${product.id}/400/500`,
                }}
                style={tw`w-full h-44 bg-stone-100`}
                contentFit="cover"
              />
              <View style={tw`p-2.5`}>
                <Text style={tw`text-xs font-semibold text-stone-900`} numberOfLines={2}>
                  {product.name}
                </Text>
                <Text style={tw`text-sm font-bold text-emerald-700 mt-1`}>
                  ${product.price.toFixed(2)}
                </Text>
                {product.matchLabel ? (
                  <Text style={tw`text-[10px] text-emerald-600 mt-0.5`} numberOfLines={1}>
                    {product.matchLabel}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <Pressable
          onPress={openMarketplace}
          style={tw`mb-5 px-4 py-4 rounded-2xl bg-emerald-50 border border-emerald-100`}
        >
          <Text style={tw`text-sm text-emerald-800 font-semibold`}>Browse the marketplace →</Text>
        </Pressable>
      )}

      {/* Posts mosaic */}
      <SectionTitle title="Posts for you" />
      {filteredGrid.length > 0 ? (
        <View style={tw`flex-row flex-wrap justify-between mb-5`}>
          {filteredGrid.slice(0, 12).map((p) => {
            const image = resolvePostMediaUri(p.image_url, p.category, p.id);
            return (
              <TouchableOpacity
                key={p.id}
                onPress={() => openPostDetail(p)}
                style={tw`w-[48%] mb-3 rounded-2xl overflow-hidden border border-stone-200/80 bg-white`}
              >
                <Image source={{ uri: image }} style={tw`w-full h-36`} contentFit="cover" />
                <Text style={tw`p-2.5 text-xs font-semibold text-stone-800`} numberOfLines={2}>
                  {p.caption || p.metadata?.username || 'Post'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <Text style={tw`text-sm text-stone-500 mb-5`}>No posts in this path yet.</Text>
      )}

      {/* People */}
      <SectionTitle title="People to meet" />
      {filteredPeople.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={tw`mb-5`}
          {...horizontalScrollProps}
        >
          {filteredPeople.slice(0, 8).map((person) => {
            const avatar = resolveAvatarUri(person.userId, person.username, person.avatar);
            const busy = addingId === person.userId;
            return (
              <View
                key={person.userId}
                style={tw`w-44 mr-3 bg-white border border-stone-200/80 rounded-2xl p-3`}
              >
                <TouchableOpacity
                  onPress={() =>
                    person.storyCount > 0 ? openStoryViewer(person) : openProfile(person.userId)
                  }
                  style={tw`items-center mb-3`}
                >
                  <View
                    style={tw`w-16 h-16 rounded-full p-0.5 ${
                      person.storyCount > 0
                        ? 'border-2 border-emerald-500'
                        : 'border border-stone-200'
                    }`}
                  >
                    <Image
                      source={{ uri: avatar }}
                      style={tw`w-full h-full rounded-full`}
                      contentFit="cover"
                    />
                  </View>
                  <Text style={tw`font-bold text-stone-900 mt-2 text-center`} numberOfLines={1}>
                    {person.username}
                  </Text>
                  <Text style={tw`text-[11px] text-stone-500 mt-0.5 text-center`} numberOfLines={1}>
                    {person.storyCount > 0
                      ? `${person.storyCount} ${person.storyCount === 1 ? 'story' : 'stories'}`
                      : 'In your growth areas'}
                  </Text>
                </TouchableOpacity>
                <View style={tw`flex-row gap-2`}>
                  <TouchableOpacity
                    onPress={() => openProfile(person.userId)}
                    style={tw`flex-1 py-2 rounded-xl bg-stone-100 items-center`}
                  >
                    <Text style={tw`text-stone-700 text-xs font-semibold`}>Profile</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => void onAddFriend(person.userId)}
                    disabled={busy || friendIds.has(person.userId)}
                    style={tw`flex-1 py-2 rounded-xl bg-emerald-600 items-center ${
                      busy ? 'opacity-60' : ''
                    }`}
                  >
                    <Text style={tw`text-white text-xs font-bold`}>
                      {busy ? '…' : 'Request'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <Text style={tw`text-sm text-stone-500 mb-5`}>
          Add growth paths on your profile to discover people in your cohort.
        </Text>
      )}

      <SectionTitle title="Clips & posts" />
    </>
  );

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`} edges={['top']}>
      <GrowChromeHeader
        right={
          <Pressable
            onPress={openMarketplace}
            style={tw`flex-row items-center bg-[#EAE4D6] border border-stone-200/80 rounded-full px-3 py-2`}
          >
            <Ionicons name="storefront-outline" size={16} color="#059669" />
            <Text style={tw`text-sm font-semibold text-emerald-700 ml-1.5`}>Shop</Text>
          </Pressable>
        }
      />

      <View style={tw`px-5 pt-3 pb-2`}>
        <Text style={tw`text-lg font-bold text-stone-900 mb-0.5`}>Explore</Text>
        <Text style={tw`text-sm text-stone-500 mb-3`}>
          {userPaths.length
            ? `Discover people and progress outside your circle · ${userPaths.length} growth path${userPaths.length === 1 ? '' : 's'}`
            : 'Meet people through stories, clips, and shared growth paths.'}
        </Text>

        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Search people or captions"
        />

        <View style={tw`mt-2 -mx-1`}>
          <CategoryCapsuleRow
            items={pathCapsules}
            selectedKey={selectedCategory}
            onSelect={setSelectedCategory}
            allCount={totalCapsuleCount || undefined}
          />
        </View>
      </View>

      {loadError ? (
        <View style={tw`mx-5 mb-2 px-3 py-2 rounded-xl border border-red-200 bg-red-50`}>
          <Text style={tw`text-sm text-red-700`}>{loadError}</Text>
        </View>
      ) : null}

      {loading && filteredPeople.length === 0 && filteredReels.length === 0 ? (
        <View style={tw`flex-1 items-center justify-center py-20`}>
          <ActivityIndicator size="large" color="#059669" />
        </View>
      ) : (
        <FlatList
          data={filteredReels}
          keyExtractor={(p) => p.id}
          ListHeaderComponent={ListHeader}
          renderItem={({ item: p }) => {
            const username = p.metadata?.username || 'Member';
            const avatar = resolveAvatarUri(p.user_id, username, p.metadata?.avatar);
            const image = resolvePostMediaUri(p.image_url, p.category, p.id);
            const isFriend = friendIds.has(p.user_id);
            return (
              <TouchableOpacity
                style={tw`bg-white border border-stone-200/80 rounded-2xl overflow-hidden mb-3`}
                activeOpacity={0.9}
                onPress={() => openPostDetail(p)}
              >
                <Image
                  source={{ uri: image }}
                  style={tw`w-full h-52 bg-stone-200`}
                  contentFit="cover"
                />
                <View style={tw`p-3 flex-row items-center`}>
                  <Image source={{ uri: avatar }} style={tw`w-9 h-9 rounded-full mr-2`} />
                  <View style={tw`flex-1`}>
                    <Text style={tw`font-semibold text-stone-900`}>{username}</Text>
                    <Text style={tw`text-xs text-stone-500 capitalize`}>{p.category}</Text>
                  </View>
                  {!isFriend ? (
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation?.();
                        void onAddFriend(p.user_id);
                      }}
                      style={tw`bg-emerald-50 px-2.5 py-1.5 rounded-lg`}
                    >
                      <Text style={tw`text-emerald-800 text-xs font-bold`}>+ Request</Text>
                    </TouchableOpacity>
                  ) : (
                    <Ionicons name="checkmark-circle" size={22} color="#059669" />
                  )}
                </View>
                {p.caption ? (
                  <Text style={tw`px-3 pb-3 text-stone-700`} numberOfLines={2}>
                    {p.caption}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={[tw`px-5 pt-2`, { paddingBottom: TAB_SCREEN_BOTTOM_PADDING }]}
          {...feedListPerformanceProps}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#059669"
              colors={['#059669']}
            />
          }
          ListEmptyComponent={
            filteredPeople.length === 0 ? (
              <EmptyState
                icon="compass-outline"
                title="Nothing in this path yet"
                description={
                  query || selectedCategory
                    ? 'Try All, or clear search.'
                    : 'Refresh after more community activity — or open Shop to browse gear.'
                }
                actionLabel={selectedCategory ? 'Show all' : 'Open shop'}
                onAction={() =>
                  selectedCategory ? setSelectedCategory(null) : openMarketplace()
                }
              />
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}
