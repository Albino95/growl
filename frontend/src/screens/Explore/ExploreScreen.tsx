/**
 * Explore — discover people via stories & reels (not marketplace).
 * Ranking: `utils/discoverPeople.ts` + category overlap from onboarding paths.
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
  TextInput,
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
import { rankDiscoverPeople, rankDiscoverReelPosts, type DiscoverPerson } from '../../utils/discoverPeople';
import tw from '../../lib/tw';
import { feedListPerformanceProps, horizontalScrollProps } from '../../constants/scroll';

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
  const [addingId, setAddingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const userPaths = user?.categories || [];

  const load = useCallback(async () => {
    try {
      const [feedRes, storiesRes, friends] = await Promise.all([
        getFeedPosts({ mode: 'explore' }),
        getStories({ mode: 'explore' }),
        listFriends(),
      ]);
      const posts = feedRes.success && Array.isArray(feedRes.data) ? feedRes.data : [];
      const fIds = new Set(friends.map((f) => f.id));
      setFriendIds(fIds);

      const grouped =
        storiesRes.success && storiesRes.data?.grouped ? storiesRes.data.grouped : [];
      setStoryGroups(grouped);

      const rankedPeople = rankDiscoverPeople(grouped, posts, userPaths, {
        selfId: user?.id,
        friendIds: fIds,
      });
      const rankedReels = rankDiscoverReelPosts(posts, userPaths, {
        selfId: user?.id,
        friendIds: fIds,
      });

      setPeople(rankedPeople);
      setReels(rankedReels);
    } catch (e) {
      console.warn('[Explore] load failed', e);
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

  const subtitle = useMemo(() => {
    if (!userPaths.length) {
      return 'Meet people through their stories and reels — add friends in your growth areas.';
    }
    return `People outside your friend list, ranked by shared growth areas (${userPaths.length} path${userPaths.length === 1 ? '' : 's'}).`;
  }, [userPaths]);

  const filteredPeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) => {
      if (q && !p.username.toLowerCase().includes(q)) return false;
      if (!selectedCategory) return true;
      const cat = p.latestPost?.category;
      return cat === selectedCategory;
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

  const availableCategories = useMemo(() => {
    const uniq = new Set<string>();
    for (const p of reels) {
      if (p.category) uniq.add(p.category);
    }
    return Array.from(uniq).sort();
  }, [reels]);

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
        const viewedIds = updatedStories
          .filter((story) => story.hasViewed)
          .map((story) => story.id);
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
      setReels((prev) => prev.filter((p) => p.user_id !== userId));
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

  const openPostDetail = (p: FeedPost) => {
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

  const renderPersonCard = (person: DiscoverPerson) => {
    const avatar = resolveAvatarUri(person.userId, person.username, person.avatar);
    const ringUri = person.latestStoryImage
      ? resolveStoryDisplayUri(person.latestStoryImage, person.userId)
      : null;
    const busy = addingId === person.userId;

    return (
      <View
        key={person.userId}
        style={tw`bg-white border border-stone-100 rounded-2xl p-4 mb-3`}
      >
        <View style={tw`flex-row items-center`}>
          <TouchableOpacity
            onPress={() => (person.storyCount > 0 ? openStoryViewer(person) : openProfile(person.userId))}
            style={tw`mr-3`}
          >
            <View
              style={tw`w-16 h-16 rounded-full p-0.5 ${
                person.storyCount > 0 ? 'border-2 border-violet-500' : 'border border-stone-200'
              }`}
            >
              {ringUri ? (
                <Image source={{ uri: ringUri }} style={tw`w-full h-full rounded-full`} contentFit="cover" />
              ) : (
                <Image source={{ uri: avatar }} style={tw`w-full h-full rounded-full`} contentFit="cover" />
              )}
            </View>
            {person.storyCount > 0 ? (
              <View style={tw`absolute -bottom-1 -right-1 bg-violet-600 rounded-full px-1.5 py-0.5`}>
                <Text style={tw`text-[10px] text-white font-bold`}>{person.storyCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
          <View style={tw`flex-1`}>
            <Text style={tw`font-bold text-stone-900`}>{person.username}</Text>
            <Text style={tw`text-xs text-stone-500 mt-0.5`}>
              {person.storyCount > 0
                ? `${person.storyCount} active ${person.storyCount === 1 ? 'story' : 'stories'}`
                : 'New in your cohort'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => void onAddFriend(person.userId)}
            disabled={busy || friendIds.has(person.userId)}
            style={tw`bg-violet-600 px-3 py-2 rounded-xl ${busy ? 'opacity-60' : ''}`}
          >
            <Text style={tw`text-white text-xs font-bold`}>{busy ? '…' : 'Request'}</Text>
          </TouchableOpacity>
        </View>
        <View style={tw`flex-row mt-3 gap-2`}>
          <TouchableOpacity
            onPress={() => openProfile(person.userId)}
            style={tw`flex-1 py-2 rounded-xl bg-stone-100 items-center`}
          >
            <Text style={tw`text-stone-700 text-sm font-semibold`}>Profile</Text>
          </TouchableOpacity>
          {person.storyCount > 0 ? (
            <TouchableOpacity
              onPress={() => openStoryViewer(person)}
              style={tw`flex-1 py-2 rounded-xl bg-violet-50 items-center`}
            >
              <Text style={tw`text-violet-800 text-sm font-semibold`}>Stories</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  const ListHeader = (
    <>
      <View style={tw`mb-4`}>
        <View style={tw`flex-row items-center justify-between mb-2`}>
          <Text style={tw`text-lg font-bold text-violet-900`}>Stories to meet</Text>
          <TouchableOpacity onPress={openReels} style={tw`flex-row items-center`}>
            <Ionicons name="play-circle" size={20} color="#7C3AED" />
            <Text style={tw`text-violet-700 text-sm font-semibold ml-1`}>All reels</Text>
          </TouchableOpacity>
        </View>
        {filteredPeople.filter((p) => p.storyCount > 0).length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} {...horizontalScrollProps}>
            {filteredPeople
              .filter((p) => p.storyCount > 0)
              .slice(0, 12)
              .map((person) => {
                const avatar = resolveAvatarUri(person.userId, person.username, person.avatar);
                const thumb = resolveStoryDisplayUri(
                  person.latestStoryImage,
                  person.userId
                );
                return (
                  <TouchableOpacity
                    key={person.userId}
                    onPress={() => openStoryViewer(person)}
                    style={tw`items-center mr-4 w-20`}
                  >
                    <View style={tw`w-16 h-16 rounded-full border-2 border-violet-500 p-0.5`}>
                      <Image
                        source={{ uri: thumb || avatar }}
                        style={tw`w-full h-full rounded-full`}
                        contentFit="cover"
                      />
                    </View>
                    <Text style={tw`text-xs text-stone-600 mt-1 text-center`} numberOfLines={1}>
                      {person.username.split(' ')[0]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
          </ScrollView>
        ) : (
          <Text style={tw`text-sm text-stone-500`}>No new story rings right now. Check reels below.</Text>
        )}
      </View>
      <Text style={tw`text-lg font-bold text-violet-900 mb-2`}>Reels & posts to discover</Text>
    </>
  );

  return (
    <SafeAreaView style={tw`flex-1 bg-stone-50`} edges={['top']}>
      <View style={tw`px-5 pt-3 pb-2 border-b border-stone-100 bg-white`}>
        <Text style={tw`text-2xl font-bold text-violet-800`}>Explore</Text>
        <Text style={tw`text-sm text-stone-500 mt-1`}>{subtitle}</Text>
        <View style={tw`mt-3`}>
          <View style={tw`flex-row items-center bg-stone-100 rounded-xl px-3`}>
            <Ionicons name="search" size={16} color="#78716C" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search people or captions"
              placeholderTextColor="#A8A29E"
              style={tw`flex-1 py-2.5 px-2 text-stone-800`}
            />
            {query ? (
              <TouchableOpacity onPress={() => setQuery('')} style={tw`p-1`}>
                <Ionicons name="close-circle" size={16} color="#78716C" />
              </TouchableOpacity>
            ) : null}
          </View>
          {availableCategories.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`mt-2`}>
              <TouchableOpacity
                onPress={() => setSelectedCategory(null)}
                style={tw`mr-2 px-3 py-1.5 rounded-full ${
                  selectedCategory === null ? 'bg-violet-600' : 'bg-stone-100'
                }`}
              >
                <Text
                  style={tw`text-xs font-semibold ${
                    selectedCategory === null ? 'text-white' : 'text-stone-700'
                  }`}
                >
                  All
                </Text>
              </TouchableOpacity>
              {availableCategories.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setSelectedCategory(cat)}
                  style={tw`mr-2 px-3 py-1.5 rounded-full ${
                    selectedCategory === cat ? 'bg-violet-600' : 'bg-stone-100'
                  }`}
                >
                  <Text
                    style={tw`text-xs font-semibold capitalize ${
                      selectedCategory === cat ? 'text-white' : 'text-stone-700'
                    }`}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : null}
        </View>
      </View>
      {loading && filteredPeople.length === 0 && filteredReels.length === 0 ? (
        <View style={tw`flex-1 items-center justify-center py-20`}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      ) : (
        <FlatList
          data={filteredReels}
          keyExtractor={(p) => p.id}
          ListHeaderComponent={
            <>
              {ListHeader}
              {filteredPeople.map(renderPersonCard)}
            </>
          }
          renderItem={({ item: p }) => {
            const username = p.metadata?.username || 'Member';
            const avatar = resolveAvatarUri(p.user_id, username, p.metadata?.avatar);
            const image = resolvePostMediaUri(p.image_url, p.category, p.id);
            const isFriend = friendIds.has(p.user_id);
            return (
              <TouchableOpacity
                style={tw`bg-white border border-stone-100 rounded-2xl overflow-hidden mb-3`}
                activeOpacity={0.9}
                onPress={() => openPostDetail(p)}
              >
                <Image source={{ uri: image }} style={tw`w-full h-52 bg-stone-200`} contentFit="cover" />
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
                      style={tw`bg-violet-100 px-2 py-1 rounded-lg`}
                    >
                      <Text style={tw`text-violet-800 text-xs font-bold`}>+ Request</Text>
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
          contentContainerStyle={tw`px-4 pt-3 pb-28`}
          {...feedListPerformanceProps}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" colors={['#7C3AED']} />
          }
          ListEmptyComponent={
            filteredPeople.length === 0 ? (
              <View style={tw`items-center py-12 px-6`}>
                <Ionicons name="people-outline" size={48} color="#C4B5FD" />
                <Text style={tw`text-stone-600 text-center mt-3`}>
                  {query || selectedCategory
                    ? 'No matches for this search/filter yet.'
                    : 'No new creators found right now. Check back soon or refresh after more community activity.'}
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}
