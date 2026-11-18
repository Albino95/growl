/**
 * Explore — discover people, stories, posts, and shop picks by growth path.
 */

import { toast } from '../../state/useToastStore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import GrowImage from '../../components/ui/GrowImage';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect, useScrollToTop, useRoute } from '@react-navigation/native';
import { usePostEventsStore } from '../../state/usePostEventsStore';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import { useAuth } from '../../store/hooks';
import { getFeedPosts, type FeedPost } from '../../services/api/feed';
import { getStories, type StoryItem } from '../../services/api/stories';
import { addFriend, listFriends } from '../../services/api/friends';
import type { SearchPerson, SearchPost } from '../../services/api/search';
import ExploreSearchInput from '../../components/search/ExploreSearchInput';
import RecentSearches, { type SuggestedChip } from '../../components/search/RecentSearches';
import SearchResults from '../../components/search/SearchResults';
import { useExploreSearch } from '../../components/search/useExploreSearch';
import { useRecentSearchStore } from '../../state/useRecentSearchStore';
import {
  avatarSource,
  resolveAvatarUri,
  resolvePostMediaUri,
  resolveStoryDisplayUri,
} from '../../utils/images';
import { rankDiscoverPeople, rankDiscoverReelPosts, type DiscoverPerson } from '../../utils/ranking';
import { rankExploreRows, rankMarketplaceProducts, type RankedProduct } from '../../utils/ranking';
import { getProducts, type Product as ApiProduct } from '../../services/api/marketplace';
import tw, { theme } from '../../lib/tw';
import { SkeletonList } from '../../components/ui/SkeletonCard';
import {
  feedListPerformanceProps,
  horizontalScrollProps,
  TAB_SCREEN_BOTTOM_PADDING,
} from '../../constants/scroll';
import EmptyState from '../../components/ui/EmptyState';
import GrowChromeHeader from '../../components/ui/GrowChromeHeader';
import { CategoryCapsuleRow, type CapsuleItem } from '../../components/ui/CategoryCapsule';
import CATEGORIES from '../../data/categories';
import { triggerPressFeedback } from '../../utils/interactionFeedback';
import { openReelsAtPost, openReelsFeed, isReelPost } from '../../utils/reelNavigation';
import { postMatchesCategoryFilter } from '../../utils/categoryFilter';
import { getCategoryLabel, getCategoryMeta } from '../../utils/categoryLabels';
import { featureFlags } from '../../constants/featureFlags';
import { getApiBaseUrl } from '../../services/api/http';
import InstructorDiscoveryStrip from '../../components/instructor/InstructorDiscoveryStrip';
import { openCoachingReachOut } from '../../utils/coachingReachOut';
import type { DiscoverInstructor } from '../../services/api/instructor';
import { feedback } from '../../utils/interactionFeedback';
import { haptic } from '../../theme/haptics';
import { useRefresh } from '../../hooks/useRefresh';
import SpringIn from '../../components/ui/SpringIn';
import PressableScale from '../../components/ui/PressableScale';
import GrowAvatar from '../../components/ui/GrowAvatar';
import MessagesInboxButton from '../../components/navigation/MessagesInboxButton';
import { alertMessage } from '../../utils/confirmDialog';
import ChallengesStrip from '../../components/challenges/ChallengesStrip';
import type { ProfilePreview } from '../../app/navigation/RootNavigator';

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
      <Text style={tw`text-xs font-semibold tracking-widest text-ink-3 uppercase`}>
        {title}
      </Text>
      {actionLabel && onAction ? (
        <PressableScale onPress={onAction} hitSlop={8}>
          <Text style={tw`text-sm font-semibold text-emerald-700`}>{actionLabel}</Text>
        </PressableScale>
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
  const friendIdsRef = useRef(friendIds);
  friendIdsRef.current = friendIds;
  const listRef = useRef<FlatList<FeedPost>>(null);
  useScrollToTop(listRef);
  const [pendingRequestIds, setPendingRequestIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  /** The user a request was just sent to — its "Requested" pill springs in. */
  const [justRequestedId, setJustRequestedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [shopPicks, setShopPicks] = useState<RankedProduct<ApiProduct>[]>([]);
  const [gridPosts, setGridPosts] = useState<FeedPost[]>([]);
  // Your own post deleted elsewhere → drop it here without a refetch.
  const deletedPostIds = usePostEventsStore((s) => s.deletedIds);
  useEffect(() => {
    if (deletedPostIds.length === 0) return;
    const gone = new Set(deletedPostIds);
    setGridPosts((prev) => (prev.some((p) => gone.has(p.id)) ? prev.filter((p) => !gone.has(p.id)) : prev));
    setReels((prev) => (prev.some((p) => gone.has(p.id)) ? prev.filter((p) => !gone.has(p.id)) : prev));
  }, [deletedPostIds]);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const route = useRoute();
  const routeQuery = (route.params as { query?: string } | undefined)?.query;

  const userPaths = useMemo(() => user?.categories || [], [user?.categories]);
  const isSearching = query.trim().length > 0;
  const isQaEnv =
    featureFlags.appEnv === 'qa' || getApiBaseUrl().includes('growl-backend-qa');

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      // allSettled: one failing source must not blank the others.
      const [feedS, storiesS, friendsS, productsS] = await Promise.allSettled([
        getFeedPosts({ mode: 'explore' }),
        getStories({ mode: 'explore' }),
        listFriends(),
        getProducts({}),
      ]);
      const feedRes = feedS.status === 'fulfilled' ? feedS.value : null;
      const storiesRes = storiesS.status === 'fulfilled' ? storiesS.value : null;
      const productsRes = productsS.status === 'fulfilled' ? productsS.value : null;
      const feedOk = !!feedRes?.success;
      const storiesOk = !!storiesRes?.success;
      const friendsOk = friendsS.status === 'fulfilled';
      const productsOk = !!productsRes?.success;

      const failed: string[] = [];
      if (!feedOk) failed.push('posts');
      if (!storiesOk) failed.push('stories');
      if (!friendsOk) failed.push('friends');
      if (!productsOk) failed.push('shop');
      for (const r of [feedS, storiesS, friendsS, productsS]) {
        if (r.status === 'rejected') console.warn('[Explore] load part failed', r.reason);
      }

      const posts = feedOk && Array.isArray(feedRes?.data) ? feedRes.data : [];
      const products =
        productsOk && Array.isArray(productsRes?.data?.products) ? productsRes.data.products : [];
      const fIds = friendsOk ? new Set(friendsS.value.map((f) => f.id)) : friendIdsRef.current;
      if (friendsOk) setFriendIds(fIds);

      const grouped = storiesOk && storiesRes?.data?.grouped ? storiesRes.data.grouped : [];
      if (storiesOk) setStoryGroups(grouped);

      try {
        if (feedOk || storiesOk) {
          setPeople(
            rankDiscoverPeople(grouped, posts, userPaths, {
              selfId: user?.id,
              friendIds: fIds,
            })
          );
        }
        if (feedOk) {
          setReels(
            rankDiscoverReelPosts(posts, userPaths, {
              selfId: user?.id,
              friendIds: fIds,
            })
          );
        }
        if (productsOk) {
          setShopPicks(
            rankMarketplaceProducts(products, userPaths, {
              userPoints: user?.points,
            }).slice(0, 8)
          );
        }
        if (feedOk) {
          const rankedGrid = rankExploreRows(posts, [], userPaths, {
            friendIds: fIds,
            applyDiversity: true,
          })
            .filter((r): r is { kind: 'post'; post: FeedPost; score: number } => r.kind === 'post')
            .map((r) => r.post);
          setGridPosts(rankedGrid.slice(0, 24));
        }
      } catch (rankErr) {
        console.warn('[Explore] rank failed', rankErr);
        setPeople([]);
        setReels([]);
        setShopPicks([]);
        setGridPosts(posts.slice(0, 24));
      }

      if (failed.length > 0) {
        setLoadError(
          failed.length === 4
            ? 'Could not refresh explore content.'
            : `Could not load ${failed.join(', ')}.`
        );
      }
    } catch (e) {
      console.warn('[Explore] load failed', e);
      setLoadError('Could not refresh explore content.');
    } finally {
      setLoading(false);
    }
  }, [user?.id, userPaths]);

  const lastExploreLoad = React.useRef(0);
  useFocusEffect(
    useCallback(() => {
      const age = Date.now() - lastExploreLoad.current;
      if (age < 45_000 && lastExploreLoad.current > 0) return;
      lastExploreLoad.current = Date.now();
      void load();
    }, [load])
  );

  const search = useExploreSearch(query);
  const recentSearches = useRecentSearchStore((st) => st.items);
  const loadRecentFor = useRecentSearchStore((st) => st.loadFor);
  const addRecent = useRecentSearchStore((st) => st.add);
  const removeRecent = useRecentSearchStore((st) => st.remove);
  const clearRecent = useRecentSearchStore((st) => st.clear);

  useEffect(() => {
    void loadRecentFor(user?.id ?? null);
  }, [user?.id, loadRecentFor]);

  // Explore opened with { query } (e.g. a #tag tap): search it, then clear the param so the
  // same tag can be tapped again later.
  useEffect(() => {
    const q = typeof routeQuery === 'string' ? routeQuery.trim() : '';
    if (!q) return;
    setQuery(q);
    addRecent(q);
    (navigation as unknown as { setParams?: (p: object) => void }).setParams?.({ query: undefined });
  }, [routeQuery, navigation, addRecent]);

  const pickSearch = useCallback(
    (q: string) => {
      setQuery(q);
      addRecent(q);
      searchInputRef.current?.blur();
    },
    [addRecent]
  );

  const suggestedPaths = useMemo<SuggestedChip[]>(() => {
    const keys = [...new Set(userPaths.map((c) => c.split(':')[0]))];
    for (const c of CATEGORIES) {
      if (keys.length >= 6) break;
      if (!keys.includes(c.key)) keys.push(c.key);
    }
    return keys.slice(0, 6).map((k) => ({ key: k, label: getCategoryLabel(k) }));
  }, [userPaths]);

  const onSubmitSearch = () => {
    const q = query.trim();
    if (!q) return;
    const secret = q.toLowerCase();
    if (secret === 'growl' || secret === 'still growing' || secret === 'seed smile') {
      feedback.celebrate();
      alertMessage('Still growing.', 'You found a quiet corner.');
    }
    addRecent(q);
    // Run now instead of waiting for the pending debounce.
    search.runNow();
  };

  const [challengesRefreshKey, setChallengesRefreshKey] = useState(0);
  const openChallenge = useCallback(
    (challengeId: string) => navigateFromRoot(navigation, 'ChallengeDetail', { challengeId }),
    [navigation]
  );

  const refresh = useRefresh(() => {
    setChallengesRefreshKey((k) => k + 1);
    return load();
  });
  const { refreshing, onRefresh } = refresh;

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
      // Sub-paths (`fitness:building-muscle`) show their own label and the parent's icon.
      const m = getCategoryMeta(key);
      return {
        key,
        label: m.subLabel || m.parentLabel,
        icon: m.icon as keyof typeof Ionicons.glyphMap,
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
      if (!p.latestPost) return true;
      return postMatchesCategoryFilter(p.latestPost, selectedCategory);
    });
  }, [people, query, selectedCategory]);

  const filteredReels = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reels.filter((p) => {
      const username = (p.metadata?.username || 'member').toLowerCase();
      const caption = (p.caption || '').toLowerCase();
      if (q && !username.includes(q) && !caption.includes(q)) return false;
      return postMatchesCategoryFilter(p, selectedCategory);
    });
  }, [reels, query, selectedCategory]);

  const filteredGrid = useMemo(() => {
    return gridPosts.filter((p) => postMatchesCategoryFilter(p, selectedCategory));
  }, [gridPosts, selectedCategory]);

  const filteredShop = useMemo(() => {
    if (!selectedCategory) return shopPicks;
    return shopPicks.filter((p) => (p.category || '').split(':')[0] === selectedCategory.split(':')[0]);
  }, [shopPicks, selectedCategory]);

  const storyPeople = useMemo(
    () => filteredPeople.filter((p) => p.storyCount > 0).slice(0, 12),
    [filteredPeople]
  );

  const filteredShopHits = useMemo(() => {
    if (!isSearching) return [];
    const q = query.trim().toLowerCase();
    return shopPicks.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.matchLabel || '').toLowerCase().includes(q)
    );
  }, [shopPicks, query, isSearching]);

  const openProfile = (userId: string, preview?: ProfilePreview) => {
    const root = navigation.getParent?.() || navigation;
    (root as { navigate: (a: string, b: object) => void }).navigate('PublicProfile', { userId, preview });
  };

  const openStoryViewer = (person: DiscoverPerson) => {
    const g = storyGroups.find((x) => x.userId === person.userId);
    if (!g?.stories?.length) {
      openProfile(person.userId, { username: person.username, avatarUrl: person.avatar });
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
      // StoryViewer records each view once on the server.
    });
  };

  const onAddFriend = async (userId: string) => {
    if (addingId) return;
    if (friendIds.has(userId) || pendingRequestIds.has(userId)) return;
    setAddingId(userId);
    haptic('tapLight');
    try {
      const result = await addFriend(userId);
      if (result.connected) {
        // They had already asked us — this tap accepted it.
        haptic('success');
        setFriendIds((prev) => new Set([...prev, userId]));
        setPendingRequestIds((prev) => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
      } else if (result.requestSent) {
        setJustRequestedId(userId);
        setPendingRequestIds((prev) => new Set([...prev, userId]));
      }
      setPeople((prev) => prev.filter((p) => p.userId !== userId));
      toast.success(result.connected ? 'You are now friends' : 'Friend request sent');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not add friend';
      void alertMessage('Could not add', msg);
    } finally {
      setAddingId(null);
    }
  };

  const openReels = () => {
    openReelsFeed(navigation, 'explore');
  };

  const openMarketplace = () => {
    navigation.navigate('Marketplace' as never);
  };

  const messageInstructor = async (person: DiscoverInstructor) => {
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
      void alertMessage(
        'Cannot reach out',
        e instanceof Error ? e.message : 'Try again in a moment.'
      );
    }
  };

  const openPostDetail = (p: FeedPost) => {
    if (isReelPost(p)) {
      openReelsAtPost(navigation, p.id, p, 'explore');
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

  const openSearchPost = (p: SearchPost) => {
    addRecent(query);
    const feedLike: FeedPost = {
      id: p.id,
      user_id: p.author.id,
      image_url: p.thumb_url,
      // PostDetail re-fetches the full caption; the snippet is only a placeholder.
      caption: p.caption_snippet,
      category: p.category || '',
      subcategory: null,
      created_at: p.created_at || new Date().toISOString(),
      metadata: { username: p.author.username, avatar: p.author.avatar_url ?? undefined },
    };
    openPostDetail(feedLike);
  };

  const openSearchPerson = (p: SearchPerson) => {
    addRecent(query);
    openProfile(p.id, { username: p.username, avatarUrl: p.avatar_url });
  };

  const renderPersonAction = (hit: SearchPerson) => {
    if (user?.id && hit.id === user.id) return null;
    const busy = addingId === hit.id;
    const isFriend = hit.is_friend || friendIds.has(hit.id);
    const isRequested = !isFriend && pendingRequestIds.has(hit.id);
    if (isFriend) {
      return (
        <Ionicons
          name="checkmark-circle"
          size={22}
          color={theme.colors.brand}
          accessibilityLabel="Friends"
        />
      );
    }
    if (isRequested) {
      return (
        <SpringIn
          animate={justRequestedId === hit.id}
          style={tw`bg-raised border border-line px-3 py-2 rounded-control`}
        >
          <Text style={tw`text-ink-2 text-xs font-bold`}>Requested</Text>
        </SpringIn>
      );
    }
    return (
      <PressableScale
        onPress={() => void onAddFriend(hit.id)}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`Send ${hit.username} a friend request`}
        style={tw`bg-emerald-600 px-3 py-2 rounded-control ${busy ? 'opacity-60' : ''}`}
      >
        <Text style={tw`text-white text-xs font-bold`}>{busy ? '…' : 'Request'}</Text>
      </PressableScale>
    );
  };

  const shopHitsSection =
    filteredShopHits.length > 0 ? (
      <>
        <SectionTitle title="Shop" actionLabel="Open shop" onAction={openMarketplace} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={tw`mb-5`}
          {...horizontalScrollProps}
        >
          {filteredShopHits.map((product) => (
            <PressableScale
              key={product.id}
              style={tw`w-36 mr-3 bg-card border border-line/80 rounded-card overflow-hidden`}
              accessibilityRole="button"
              accessibilityLabel={product.name}
              onPress={() => {
                triggerPressFeedback();
                const root = navigation.getParent?.() || navigation;
                (root as { navigate: (a: string, b: object) => void }).navigate(
                  'ProductDetail',
                  { productId: product.id, source: 'explore', preview: { title: product.name, imageUrl: product.image_url, price: product.price } }
                );
              }}
            >
              <GrowImage
                source={{ uri: product.image_url || '' }}
                style={tw`w-full h-44 bg-raised`}
                contentFit="cover"
              />
              <View style={tw`p-2.5`}>
                <Text style={tw`text-xs font-semibold text-ink`} numberOfLines={2}>
                  {product.name}
                </Text>
                <Text style={tw`text-sm font-bold text-emerald-700 mt-1`}>
                  ${product.price.toFixed(2)}
                </Text>
              </View>
            </PressableScale>
          ))}
        </ScrollView>
      </>
    ) : null;

  const SearchResultsHeader = (
    <SearchResults
      query={query}
      result={search.result}
      loading={search.loading}
      error={search.error}
      onRetry={search.runNow}
      seeAll={search.seeAll}
      onSeeAll={(type) => {
        addRecent(query);
        search.openSeeAll(type);
      }}
      onCloseSeeAll={search.closeSeeAll}
      onLoadMore={search.loadMore}
      onRetrySeeAll={search.retrySeeAll}
      onOpenPerson={openSearchPerson}
      onOpenPost={openSearchPost}
      onOpenTag={(tag) => pickSearch(`#${tag}`)}
      renderPersonAction={renderPersonAction}
      suggestions={suggestedPaths}
      onPickSuggestion={pickSearch}
      onClear={() => setQuery('')}
      footer={search.seeAll ? null : shopHitsSection}
      footerHasResults={filteredShopHits.length > 0}
    />
  );

  const showRecents = searchFocused && !isSearching;

  const ListHeader = isSearching ? (
    SearchResultsHeader
  ) : showRecents ? (
    <RecentSearches
      recents={recentSearches}
      suggestions={suggestedPaths}
      onPick={pickSearch}
      onRemove={removeRecent}
      onClearAll={clearRecent}
    />
  ) : (
    <>
      <SectionTitle title="Recommended for you" />
      <Text style={tw`text-sm text-ink-3 mb-4 -mt-1`}>
        People, stories, and posts matched to your growth paths. Search above to find anyone.
      </Text>

      <InstructorDiscoveryStrip
        forPaths
        category={selectedCategory}
        title={
          selectedCategory
            ? `Instructors · ${getCategoryLabel(selectedCategory)}`
            : 'Instructors on your paths'
        }
        onOpenProfile={openProfile}
        onMessage={(p) => void messageInstructor(p)}
        onSeeAll={() => {
          feedback.open();
          navigateFromRoot(navigation, 'Instructors');
        }}
      />

      <ChallengesStrip
        path={selectedCategory}
        refreshKey={challengesRefreshKey}
        onOpen={openChallenge}
      />

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
              <PressableScale
                key={person.userId}
                onPress={() => openStoryViewer(person)}
                feedback="open"
                pressedScale={0.94}
                style={tw`items-center mr-4 w-20`}
              >
                <View style={tw`w-16 h-16 rounded-full border-2 border-emerald-500 p-0.5`}>
                  <GrowImage
                    source={thumb ? { uri: thumb } : avatarSource(avatar)}
                    style={tw`w-full h-full rounded-full`}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                </View>
                <Text style={tw`text-xs text-ink-2 mt-1.5 text-center`} numberOfLines={1}>
                  {person.username.split(' ')[0]}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>
      ) : (
        <Text style={tw`text-sm text-ink-3 mb-5`}>
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
            <PressableScale
              key={product.id}
              feedback="open"
              pressedScale={0.97}
              style={tw`w-36 mr-3 bg-card border border-line/80 rounded-card overflow-hidden`}
              onPress={() => {
                const root = navigation.getParent?.() || navigation;
                (root as { navigate: (a: string, b: object) => void }).navigate('ProductDetail', {
                  productId: product.id,
                  source: 'explore',
                  preview: { title: product.name, imageUrl: product.image_url, price: product.price },
                });
              }}
            >
              <GrowImage
                source={{
                  uri: product.image_url || '',
                }}
                style={tw`w-full h-44 bg-stone-100`}
                contentFit="cover"
              />
              <View style={tw`p-2.5`}>
                <Text style={tw`text-xs font-semibold text-ink`} numberOfLines={2}>
                  {product.name}
                </Text>
                <Text style={tw`text-sm font-bold text-emerald-700 mt-1`}>
                  ${product.price.toFixed(2)}
                </Text>
                {product.matchLabel ? (
                  <Text style={tw`text-caption font-medium text-emerald-700 mt-0.5`} numberOfLines={1}>
                    {product.matchLabel}
                  </Text>
                ) : null}
              </View>
            </PressableScale>
          ))}
        </ScrollView>
      ) : (
        <PressableScale
          onPress={openMarketplace}
          style={tw`mb-5 px-4 py-4 rounded-card bg-emerald-50 border border-emerald-100`}
        >
          <Text style={tw`text-sm text-emerald-800 font-semibold`}>Browse the marketplace →</Text>
        </PressableScale>
      )}

      {/* Posts mosaic */}
      <SectionTitle title="Posts for you" />
      {filteredGrid.length > 0 ? (
        <View style={tw`flex-row flex-wrap justify-between mb-5`}>
          {filteredGrid.slice(0, 12).map((p) => {
            const image = resolvePostMediaUri(p.image_url, p.category, p.id);
            return (
              <PressableScale
                key={p.id}
                onPress={() => openPostDetail(p)}
                style={tw`w-[48%] mb-3 rounded-card overflow-hidden border border-line/80 bg-card`}
              >
                <GrowImage
                  source={{ uri: image }}
                  style={tw`w-full h-36`}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
                <Text style={tw`p-2.5 text-xs font-semibold text-ink`} numberOfLines={2}>
                  {p.caption || p.metadata?.username || 'Post'}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      ) : (
        <Text style={tw`text-sm text-ink-3 mb-5`}>No posts in this path yet.</Text>
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
            const busy = addingId === person.userId;
            return (
              <View
                key={person.userId}
                style={tw`w-44 mr-3 bg-card border border-line/80 rounded-card p-3`}
              >
                <PressableScale
                  onPress={() =>
                    person.storyCount > 0 ? openStoryViewer(person) : openProfile(person.userId, { username: person.username, avatarUrl: person.avatar })
                  }
                  style={tw`items-center mb-3`}
                >
                  <View
                    style={tw`w-16 h-16 rounded-full p-0.5 ${
                      person.storyCount > 0
                        ? 'border-2 border-emerald-500'
                        : 'border border-line'
                    }`}
                  >
                    <GrowAvatar
                      userId={person.userId}
                      username={person.username}
                      uri={person.avatar}
                      size={60}
                    />
                  </View>
                  <Text style={tw`font-bold text-ink mt-2 text-center`} numberOfLines={1}>
                    {person.username}
                  </Text>
                  <Text style={tw`text-caption font-medium text-ink-3 mt-0.5 text-center`} numberOfLines={1}>
                    {person.storyCount > 0
                      ? `${person.storyCount} ${person.storyCount === 1 ? 'story' : 'stories'}`
                      : 'In your growth areas'}
                  </Text>
                </PressableScale>
                <View style={tw`flex-row gap-2`}>
                  <PressableScale
                    onPress={() => openProfile(person.userId, { username: person.username, avatarUrl: person.avatar })}
                    style={tw`flex-1 py-2 rounded-control bg-raised items-center`}
                  >
                    <Text style={tw`text-ink-2 text-xs font-semibold`}>Profile</Text>
                  </PressableScale>
                  {friendIds.has(person.userId) ? (
                    <View style={tw`flex-1 py-2 rounded-control bg-raised items-center`}>
                      <Text style={tw`text-ink-2 text-xs font-bold`}>Friends</Text>
                    </View>
                  ) : pendingRequestIds.has(person.userId) ? (
                    <SpringIn
                      animate={justRequestedId === person.userId}
                      style={tw`flex-1 py-2 rounded-control bg-raised items-center`}
                    >
                      <Text style={tw`text-ink-2 text-xs font-bold`}>Requested</Text>
                    </SpringIn>
                  ) : (
                    <PressableScale
                      onPress={() => void onAddFriend(person.userId)}
                      disabled={busy}
                      style={tw`flex-1 py-2 rounded-control bg-emerald-600 items-center ${
                        busy ? 'opacity-60' : ''
                      }`}
                    >
                      <Text style={tw`text-white text-xs font-bold`}>
                        {busy ? '…' : 'Request'}
                      </Text>
                    </PressableScale>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <Text style={tw`text-sm text-ink-3 mb-5`}>
          Add growth paths on your profile to discover people in your cohort.
        </Text>
      )}

      <SectionTitle title="Clips & posts" />
    </>
  );

  return (
    <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
      <GrowChromeHeader
        right={
          <>
            <MessagesInboxButton />
            <PressableScale
              onPress={openMarketplace}
              style={tw`flex-row items-center bg-raised border border-line/80 rounded-chip px-3 py-2`}
            >
              <Ionicons name="storefront-outline" size={16} color={theme.colors.brand} />
              <Text style={tw`text-sm font-semibold text-emerald-700 ml-1.5`}>Shop</Text>
            </PressableScale>
          </>
        }
      />

      <View style={tw`px-gutter-wide pt-3 pb-2`}>
        <View style={tw`flex-row items-center mb-0.5`}>
          <Text style={tw`text-callout font-bold text-ink`}>Explore</Text>
          {isQaEnv ? (
            <View style={tw`ml-2 px-2 py-0.5 rounded-chip bg-amber-100 border border-amber-300`}>
              <Text style={tw`text-caption font-bold text-amber-800 tracking-wide`}>QA</Text>
            </View>
          ) : null}
        </View>
        <Text style={tw`text-sm text-ink-3 mb-3`}>
          {userPaths.length
            ? `Discover people and progress outside your circle · ${userPaths.length} growth path${userPaths.length === 1 ? '' : 's'}`
            : 'Meet people through stories, clips, and shared growth paths.'}
        </Text>

        <ExploreSearchInput
          ref={searchInputRef}
          value={query}
          onChangeText={setQuery}
          onSubmit={onSubmitSearch}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
        />

        {!isSearching && !showRecents ? (
          <View style={tw`mt-2 -mx-1`}>
            <CategoryCapsuleRow
              items={pathCapsules}
              selectedKey={selectedCategory}
              onSelect={setSelectedCategory}
              allCount={totalCapsuleCount || undefined}
            />
          </View>
        ) : null}
      </View>

      {loadError ? (
        <View style={tw`mx-5 mb-2 px-3 py-2 rounded-control border border-red-200 bg-red-50`}>
          <View style={tw`flex-row items-center justify-between`}>
            <Text style={tw`flex-1 text-sm text-red-700`}>{loadError}</Text>
            <PressableScale
              onPress={() => void onRefresh()}
              disabled={refreshing}
              accessibilityRole="button"
              accessibilityLabel="Retry loading explore content"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={tw`ml-3`}
            >
              <Text style={tw`text-sm font-semibold text-red-700`}>
                {refreshing ? 'Retrying…' : 'Retry'}
              </Text>
            </PressableScale>
          </View>
        </View>
      ) : null}

      {loading && filteredPeople.length === 0 && filteredReels.length === 0 ? (
        <View style={tw`flex-1 px-gutter-wide pt-2`}>
          <SkeletonList variant="explore" count={3} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={isSearching || showRecents ? [] : filteredReels}
          keyExtractor={(p) => p.id}
          ListHeaderComponent={ListHeader}
          renderItem={({ item: p }) => {
            const username = p.metadata?.username || 'Member';
            const image = resolvePostMediaUri(p.image_url, p.category, p.id);
            const isFriend = friendIds.has(p.user_id);
            const isRequested = !isFriend && pendingRequestIds.has(p.user_id);
            return (
              <PressableScale
                style={tw`bg-card border border-line/80 rounded-card overflow-hidden mb-3`}
                onPress={() => openPostDetail(p)}
              >
                <GrowImage
                  source={{ uri: image }}
                  style={tw`w-full h-52 bg-stone-200`}
                  cachePolicy="memory-disk"
                  contentFit="cover"
                />
                <View style={tw`p-3 flex-row items-center`}>
                    <GrowAvatar
                      userId={p.user_id}
                      username={username}
                      uri={p.metadata?.avatar}
                      size={36}
                      style={tw`mr-2`}
                    />
                  <View style={tw`flex-1`}>
                    <Text style={tw`font-semibold text-ink`}>{username}</Text>
                    <Text style={tw`text-xs text-ink-3 capitalize`}>{p.category}</Text>
                  </View>
                  {isFriend ? (
                    <Ionicons name="checkmark-circle" size={22} color={theme.colors.brand} />
                  ) : isRequested ? (
                    <SpringIn
                      animate={justRequestedId === p.user_id}
                      style={tw`bg-raised px-2.5 py-1.5 rounded-control`}
                    >
                      <Text style={tw`text-ink-2 text-xs font-bold`}>Requested</Text>
                    </SpringIn>
                  ) : (
                    <PressableScale
                      onPress={(e) => {
                        e.stopPropagation?.();
                        void onAddFriend(p.user_id);
                      }}
                      style={tw`bg-emerald-50 px-2.5 py-1.5 rounded-control`}
                    >
                      <Text style={tw`text-emerald-800 text-xs font-bold`}>+ Request</Text>
                    </PressableScale>
                  )}
                </View>
                {p.caption ? (
                  <Text style={tw`px-3 pb-3 text-ink-2`} numberOfLines={2}>
                    {p.caption}
                  </Text>
                ) : null}
              </PressableScale>
            );
          }}
          contentContainerStyle={[tw`px-gutter-wide pt-2`, { paddingBottom: TAB_SCREEN_BOTTOM_PADDING }]}
          {...feedListPerformanceProps}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          // Search results / recents live in the header: keep the last ones reachable above the keyboard.
          automaticallyAdjustKeyboardInsets
          refreshControl={
            <RefreshControl {...refresh} />
          }
          ListEmptyComponent={
            isSearching || showRecents ? null : filteredPeople.length === 0 ? (
              <EmptyState
                icon="compass-outline"
                title="Nothing in this path yet"
                description={
                  query || selectedCategory
                    ? 'Try All, or clear search.'
                    : 'Refresh after more community activity — or open Journal to capture today’s progress.'
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
