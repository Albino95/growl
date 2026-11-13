import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Animated,
  Easing,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { CommonActions } from '@react-navigation/native';
import { useAuth } from '../../store/hooks';
import { resolveStoryDisplayUri, resolveAvatarUri, resolvePostMediaUri, avatarSource } from '../../utils/images';
import { isVideoMedia } from '../../services/api/media';
import { reelPlaybackSettingsFromMetadata } from '../../utils/reelMedia';
import tw from '../../lib/tw';
import { getUserPosts, type FeedPost } from '../../services/api/feed';
import { openReelsAtPost, isReelPost } from '../../utils/reelNavigation';
import { isVideoPostMedia, reelCoverUri } from '../../utils/reelCover';
import { getUserStories, type StoryItem } from '../../services/api/stories';
import { getConnections, syncCohortFriends, type FriendSummary } from '../../services/api/friends';
import { updateProfileOnServer, fetchCurrentProfile } from '../../services/api/profile';
import { shouldShowBusinessShell } from '../../constants/businessShell';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import { TAB_SCREEN_BOTTOM_PADDING } from '../../constants/scroll';
import ProfileStatsRow from '../../components/profile/ProfileStatsRow';
import ConnectionsListSheet, {
  type ConnectionsSheetMode,
} from '../../components/profile/ConnectionsListSheet';
import EmptyState from '../../components/ui/EmptyState';
import GrowChromeHeader from '../../components/ui/GrowChromeHeader';
import GrowthAreasPicker, {
  clampGrowthPaths,
  growthParentCount,
  MAX_GROWTH_PATHS,
} from '../../components/profile/GrowthAreasPicker';
import DecaySettingsModal from '../../components/profile/DecaySettingsModal';
import DecayCountdownChip from '../../components/profile/DecayCountdownChip';
import ProfilePostsGrid from '../../components/profile/ProfilePostsGrid';
import { groupGrowthPaths } from '../../utils/categoryLabels';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import { triggerPressFeedback } from '../../utils/interactionFeedback';
import { useRefresh } from '../../hooks/useRefresh';
import CountUpText from '../../components/ui/CountUpText';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { breathe } from '../../theme/motion';
import PressableScale from '../../components/ui/PressableScale';
import FadeInUp from '../../components/ui/FadeInUp';
import NotificationBellButton from '../../components/navigation/NotificationBellButton';
import ShareCardSheet, { type ShareCardPayload } from '../../components/share/ShareCardSheet';
import GrowingNowStrip from '../../components/garden/GrowingNowStrip';
import { SHOW_SEEDS } from '../../constants/featureFlags';
import { COACHING_ACTIVE_STATUS } from '../../constants/coaching';
import {
  claimInstructor,
  getInstructorEligibility,
  listCoachingContracts,
  type CoachingContract,
  type InstructorEligibility,
} from '../../services/api/instructor';
import BadgeRow from '../../components/badges/BadgeRow';
import LevelPill from '../../components/badges/LevelPill';
import ProgressTab from '../../components/progress/ProgressTab';
import { getMyBadges, getStreak, type MyBadges, type Streak } from '../../services/api/growth';
import { useGrowthStore } from '../../state/useGrowthStore';

type Post = {
  id: string;
  image: string;
  caption: string;
  likes: number;
  comments: number;
  createdAt: string;
  daysUntilDecay: number;
  category: string;
  subcategory?: string;
  isReel?: boolean;
  isVideo?: boolean;
  cover?: string;
  mediaType?: string;
  contentType?: string;
  videoEdit?: ReturnType<typeof reelPlaybackSettingsFromMetadata>;
  hasLiked?: boolean;
};

type Story = {
  id: string;
  userId: string;
  username: string;
  avatar: string | null;
  image: string;
  createdAt: string;
  views: number;
  hasViewed: boolean;
};

/** Computes remaining full days before a post reaches decay cutoff. */
function daysLeftUntilDecay(createdAtIso: string, decayDays: number): number {
  const created = new Date(createdAtIso).getTime();
  if (Number.isNaN(created)) return decayDays;
  const end = created + decayDays * 86400000;
  return Math.max(0, Math.ceil((end - Date.now()) / 86400000));
}

/** Maps feed payload into profile post cards while attaching decay countdown metadata. */
function mapFeedPostToProfilePost(p: FeedPost, decayDays: number): Post {
  const img = resolvePostMediaUri(p.image_url, p.category, p.id);
  const likes = p.metadata?.likes ?? 0;
  const comments = p.metadata?.comments ?? 0;
  const hasLiked = !!p.metadata?.has_liked;
  return {
    id: p.id,
    image: img,
    caption: p.caption || '',
    likes,
    comments,
    createdAt: p.created_at,
    daysUntilDecay: daysLeftUntilDecay(p.created_at, decayDays),
    category: p.category,
    subcategory: p.subcategory || undefined,
    isReel: isReelPost(p),
    isVideo: isVideoPostMedia(p),
    cover: reelCoverUri(p.metadata as Record<string, unknown> | null | undefined) || undefined,
    mediaType: typeof p.metadata?.media_type === 'string' ? p.metadata.media_type : undefined,
    contentType: typeof p.metadata?.content_type === 'string' ? p.metadata.content_type : undefined,
    videoEdit: reelPlaybackSettingsFromMetadata(p.metadata ?? undefined),
    hasLiked,
  };
}

/** Maps story API payload into local profile story model. */
function mapStoryToProfileStory(s: StoryItem): Story {
  return {
    id: s.id,
    userId: s.userId,
    username: s.username,
    avatar: s.avatar,
    image: s.image || '',
    createdAt: s.createdAt,
    views: s.views ?? 0,
    hasViewed: !!s.hasViewed,
  };
}

function ProfileStoryThumb({
  story,
  userId,
}: {
  story: Story;
  userId?: string;
}) {
  const [failed, setFailed] = useState(false);
  const ownerId = story.userId || userId || 'me';
  const uri = resolveStoryDisplayUri(story.image, ownerId, story.id);
  const isVideo = isVideoMedia({ uri });

  if (isVideo && uri) {
    return (
      <View style={tw`w-full h-full bg-stone-900 items-center justify-center`}>
        <Ionicons name="play" size={18} color="#fff" />
        <View
          style={tw`absolute bottom-1 right-1 bg-black/55 px-1.5 py-0.5 rounded flex-row items-center`}
          pointerEvents="none"
        >
          <Ionicons name="play" size={10} color="#fff" />
        </View>
      </View>
    );
  }

  if (!uri || failed) {
    return (
      <View style={tw`w-full h-full bg-stone-200 items-center justify-center`}>
        <Ionicons name="image-outline" size={22} color="#A8A29E" />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={tw`w-full h-full`}
      contentFit="contain"
      placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
      transition={200}
      onError={() => setFailed(true)}
    />
  );
}

function ProfilePostThumb({ post }: { post: Post }) {
  const isVideo =
    post.isReel &&
    isVideoMedia({
      uri: post.image,
      mediaType: post.mediaType,
      contentType: post.contentType,
    });

  if (isVideo) {
    return (
      <View style={tw`w-16 h-16 rounded-xl mr-3 overflow-hidden bg-stone-900 items-center justify-center`}>
        <Ionicons name="film-outline" size={18} color="#fff" />
        <View
          style={tw`absolute bottom-0.5 right-0.5 bg-black/60 px-1 py-0.5 rounded`}
          pointerEvents="none"
        >
          <Ionicons name="film-outline" size={10} color="#fff" />
        </View>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: post.image }}
      style={tw`w-16 h-16 rounded-xl mr-3`}
      contentFit="cover"
      placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
    />
  );
}

export default function ProfileScreen({ navigation: navProp }: any) {
  const { user, signOut, updateUser, refreshProfile } = useAuth();
  const navigation = navProp || useNavigation();
  const points = user?.points || 0;
  const isInstructor = user?.isInstructor || false;
  const isBusinessAccount = shouldShowBusinessShell(user);

  const [activeTab, setActiveTab] = useState<'posts' | 'stories' | 'progress'>('posts');
  const [progressOpened, setProgressOpened] = useState(false);
  const [progressRefreshKey, setProgressRefreshKey] = useState(0);
  const [myBadges, setMyBadges] = useState<MyBadges | null>(null);
  const [fallbackStreak, setFallbackStreak] = useState<Streak | null>(null);
  const storeStreak = useGrowthStore((s) => s.streak);
  const streak = storeStreak ?? fallbackStreak;
  const [showDecaySettings, setShowDecaySettings] = useState(false);
  const [showCategorySettings, setShowCategorySettings] = useState(false);
  const [pathSyncVisible, setPathSyncVisible] = useState(false);
  const [pathSyncPhase, setPathSyncPhase] = useState<'leaving' | 'joining' | 'done'>('leaving');
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [showClaimWelcome, setShowClaimWelcome] = useState(false);
  const [showDecayedPosts, setShowDecayedPosts] = useState(false);
  const [sharePayload, setSharePayload] = useState<ShareCardPayload | null>(null);
  const [decayDays, setDecayDays] = useState(user?.decayTimer || 7);
  const [posts, setPosts] = useState<Post[]>([]);
  const [sourcePosts, setSourcePosts] = useState<FeedPost[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [following, setFollowing] = useState<FriendSummary[]>([]);
  const [followers, setFollowers] = useState<FriendSummary[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [postsLoaded, setPostsLoaded] = useState(false);
  const refresh = useRefresh(async () => {
    if (progressOpened) setProgressRefreshKey((k) => k + 1);
    await loadProfileContent();
  });
  const [connectionsSheet, setConnectionsSheet] = useState<ConnectionsSheetMode | null>(null);
  const connectionsSheetRef = useRef<ConnectionsSheetMode | null>(null);
  connectionsSheetRef.current = connectionsSheet;
  const cohortBootstrapRef = useRef(false);
  const [eligibility, setEligibility] = useState<InstructorEligibility | null>(null);
  const [claimBusy, setClaimBusy] = useState(false);
  const [myPlans, setMyPlans] = useState<CoachingContract[]>([]);
  const [profileMeta, setProfileMeta] = useState<{
    username?: string;
    avatar?: string;
    bio?: string | null;
    status?: string | null;
  }>({});

  /** Loads posts, stories, connections, and instructor eligibility. */
  const loadProfileContent = useCallback(async () => {
    if (!user?.id) return;
    setProfileLoading(true);
    try {
      // Lightweight GET connections — avoid POST sync-cohort on every focus (that walks all users).
      // Each request fails on its own so one error doesn't skip the rest of the profile.
      const [postList, storyList, connections, elig, me, plans, badges] = await Promise.all([
        getUserPosts(user.id).catch((e) => {
          console.warn('[ProfileScreen] load posts', e);
          return null;
        }),
        getUserStories(user.id).catch((e) => {
          console.warn('[ProfileScreen] load stories', e);
          return null;
        }),
        getConnections().catch(() => ({
          following: [] as FriendSummary[],
          followers: [] as FriendSummary[],
          followingCount: 0,
          followersCount: 0,
        })),
        getInstructorEligibility().catch(() => null),
        fetchCurrentProfile({ stats: true }).catch(() => null),
        listCoachingContracts().catch(() => [] as CoachingContract[]),
        // Growth endpoints may not be deployed yet — hide those sections quietly.
        getMyBadges().catch(() => null),
        useGrowthStore.getState().refresh().catch(() => undefined),
      ]);
      if (badges && Array.isArray(badges.earned)) setMyBadges(badges);
      if (!useGrowthStore.getState().streak) {
        const s = await getStreak().catch(() => null);
        if (s && typeof s.current === 'number') setFallbackStreak(s);
      }
      setMyPlans(plans.filter((p) => p.role === 'client' && p.status === 'active'));
      if (elig) setEligibility(elig);
      const decay =
        typeof me?.decay_timer === 'number' ? me.decay_timer : user.decayTimer || 7;
      if (postList) {
        setSourcePosts(postList);
        setPosts(postList.map((p) => mapFeedPostToProfilePost(p, decay)));
      }
      if (storyList) setStories(storyList.map(mapStoryToProfileStory));
      setFollowing(connections.following);
      setFollowers(connections.followers);
      const cats = me?.categories || user?.categories || [];
      if (
        !cohortBootstrapRef.current &&
        cats.length > 0 &&
        connections.following.length === 0 &&
        connections.followers.length === 0
      ) {
        cohortBootstrapRef.current = true;
        try {
          const cohort = await syncCohortFriends();
          setFollowing(cohort.following);
          setFollowers(cohort.followers);
        } catch (e) {
          console.warn('[ProfileScreen] cohort bootstrap', e);
        }
      }
      if (me) {
        setProfileMeta({
          username: me.username,
          avatar: me.avatar,
          bio: me.bio,
          status: me.status,
        });
        if (typeof me.decay_timer === 'number') {
          setDecayDays(me.decay_timer);
        }
        updateUser({
          points: me.points,
          decayTimer: me.decay_timer ?? 7,
          postCount: me.post_count ?? 0,
          endorsementsReceived: me.endorsements_received ?? 0,
          endorsementsGiven: me.endorsements_given ?? 0,
          streakDays: me.streak_days ?? 0,
          bio: me.bio ?? null,
          status: me.status ?? null,
          username: me.username,
          avatar: me.avatar,
          categories: me.categories,
          isInstructor: me.is_instructor,
        });
      }
    } catch (e) {
      console.warn('[ProfileScreen] load profile content', e);
    } finally {
      setProfileLoading(false);
      setPostsLoaded(true);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (connectionsSheetRef.current) return;
      void loadProfileContent();
    }, [loadProfileContent])
  );

  useEffect(() => {
    setDecayDays(user?.decayTimer || 7);
  }, [user?.decayTimer]);

  // If business account, don't show profile - they should only see business screens
  if (isBusinessAccount) {
    return null;
  }

  /** Signs user out, then hard-resets navigation stack back to auth route. */
  const handleSignOutConfirm = async () => {
    const performSignOut = async () => {
      try {
        await signOut();

        // Give the auth state a moment to clear before leaving the screen.
        await new Promise((resolve) => setTimeout(resolve, 200));

        const rootNavigation = navigation.getParent() || navigation;
        rootNavigation.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: 'Auth' as never }],
          })
        );
      } catch (error) {
        console.error('[ProfileScreen] Sign out failed:', error);
        if (Platform.OS === 'web') {
          alert(`Failed to sign out: ${(error as Error)?.message || 'Unknown error'}`);
        } else {
          Alert.alert('Error', `Failed to sign out: ${(error as Error)?.message || 'Unknown error'}`);
        }
      }
    };

    // Close modal and perform sign-out
    setShowSignOutModal(false);
    await performSignOut();
  };

  /** Navigates to instructor area with defensive fallbacks for nested navigation states. */
  const navigateToInstructor = () => {
    navigation.navigate('Instructor' as never);
  };

  const onClaimInstructor = async () => {
    if (claimBusy || !eligibility?.canClaim) return;
    const ok = await confirmAsync(
      'Switch to Instructor Account?',
      'Peers in your growth areas endorsed you. Claiming unlocks the Instructor hub and awards growth points.',
      { confirmLabel: 'Claim instructor', destructive: false }
    );
    if (!ok) return;
    setClaimBusy(true);
    try {
      const result = await claimInstructor();
      updateUser({
        isInstructor: true,
        ...(typeof result.points_total === 'number' ? { points: result.points_total } : {}),
      });
      await refreshProfile();
      setEligibility(result);
      setShowClaimWelcome(true);
    } catch (e) {
      alertMessage('Could not claim', e instanceof Error ? e.message : 'Try again later');
    } finally {
      setClaimBusy(false);
    }
  };

  /** Persists post lifespan to profile metadata and refreshes post countdown. */
  const handleSaveDecayTimer = async (days: number) => {
    try {
      await updateProfileOnServer({ decay_timer: days });
      setDecayDays(days);
      updateUser({ decayTimer: days });
      setShowDecaySettings(false);
      alertMessage('Saved', `Posts soft-hide after ${days} day${days === 1 ? '' : 's'}.`);
      void loadProfileContent();
    } catch (e) {
      alertMessage('Could not save', e instanceof Error ? e.message : 'Try again later');
    }
  };

  const visiblePosts = showDecayedPosts
    ? posts
    : posts.filter((p) => p.daysUntilDecay > 0);
  const decayedCount = posts.filter((p) => p.daysUntilDecay <= 0).length;

  /** Persists category updates, then re-syncs cohort-based friend graph. */
  const handleUpdateCategories = async (selectedCategories: string[]) => {
    const next = clampGrowthPaths(selectedCategories);
    if (next.length === 0) {
      alertMessage('Select at least one', 'Pick at least one growth path before saving.');
      return;
    }
    if (growthParentCount(next) > MAX_GROWTH_PATHS) {
      alertMessage('Limit reached', `You can save at most ${MAX_GROWTH_PATHS} growth paths.`);
      return;
    }

    const prev = user?.categories || [];
    const prevSet = new Set(prev.map((c) => c.toLowerCase()));
    const nextSet = new Set(next.map((c) => c.toLowerCase()));
    const pathsChanged =
      prev.length !== next.length ||
      next.some((c) => !prevSet.has(c.toLowerCase())) ||
      prev.some((c) => !nextSet.has(c.toLowerCase()));

    if (pathsChanged) {
      const ok = await confirmAsync(
        'Update growth paths?',
        'Changing paths reconnects you with people in your new areas and removes auto-connections from paths you leave. Friends you added yourself stay. Block, restrict, and report still work as usual.',
        { confirmLabel: 'Update paths', cancelLabel: 'Keep current' }
      );
      if (!ok) return;
    }

    try {
      if (pathsChanged) {
        setShowCategorySettings(false);
        setPathSyncPhase('leaving');
        setPathSyncVisible(true);
      }

      await updateProfileOnServer({ categories: next });
      updateUser({ categories: next });

      if (pathsChanged) {
        setPathSyncPhase('joining');
        try {
          // Profile PUT already awaited cohort resync; refresh lists for the UI.
          const cohort = await getConnections();
          setFollowing(cohort.following);
          setFollowers(cohort.followers);
        } catch (cohortErr) {
          console.warn('[ProfileScreen] connections refresh after category update', cohortErr);
          try {
            const cohort = await syncCohortFriends();
            setFollowing(cohort.following);
            setFollowers(cohort.followers);
          } catch {
            /* ignore */
          }
        }

        setPathSyncPhase('done');
        await new Promise((r) => setTimeout(r, 650));
        setPathSyncVisible(false);
        alertMessage('Paths updated', 'Your circle now matches your growth areas.');
      } else {
        setShowCategorySettings(false);
        alertMessage('Saved', 'Growth paths unchanged.');
      }
    } catch (err: unknown) {
      setPathSyncVisible(false);
      const msg = err instanceof Error ? err.message : 'Could not update growth areas';
      alertMessage('Error', msg);
    }
  };

  /** Opens story viewer and propagates hasViewed updates to backend and local state. */
  const openStoriesViewer = (selectedStoryId?: string) => {
    if (!stories.length) return;
    const initialIndex = selectedStoryId
      ? Math.max(0, stories.findIndex((story) => story.id === selectedStoryId))
      : 0;
    const rootNavigation = navigation.getParent() || navigation;
    (rootNavigation as any).navigate('StoryViewer', {
      stories: stories.map((story) => ({
        id: story.id,
        userId: story.userId,
        username: story.username,
        avatar: story.avatar || resolveAvatarUri(story.userId, story.username, story.avatar),
        image: resolveStoryDisplayUri(story.image, story.userId, story.id),
        createdAt: story.createdAt,
        views: story.views,
        hasViewed: story.hasViewed,
      })),
      initialIndex,
      // StoryViewer records each view once; this only updates local seen state.
      onStoriesUpdate: (updatedStories: Array<{ id: string; hasViewed?: boolean }>) => {
        setStories((prev) =>
          prev.map((story) => {
            const updated = updatedStories.find((s) => s.id === story.id);
            return updated ? { ...story, hasViewed: !!updated.hasViewed } : story;
          })
        );
      },
    });
  };

  const displayName =
    profileMeta.username || user?.username || user?.email?.split('@')[0] || 'User';

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`} edges={['top']}>
      <GrowChromeHeader
        right={
          <View style={tw`flex-row items-center gap-2`}>
            <NotificationBellButton />
            <PressableScale
              onPress={() => navigateFromRoot(navigation, 'Messages')}
              feedback="open"
              style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
              accessibilityLabel="Inbox"
            >
              <Ionicons name="chatbubbles-outline" size={17} color="#059669" />
            </PressableScale>
            <PressableScale
              onPress={() => navigateFromRoot(navigation, 'Settings')}
              feedback="open"
              style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
              accessibilityLabel="Settings"
            >
              <Ionicons name="settings-outline" size={17} color="#059669" />
            </PressableScale>
          </View>
        }
      />
      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={{
          paddingBottom: Platform.OS === 'web' ? 160 : TAB_SCREEN_BOTTOM_PADDING,
        }}
        refreshControl={
          <RefreshControl {...refresh} />
        }
      >
        {/* Identity */}
        <FadeInUp style={tw`px-5 pt-4 pb-4`}>
          <View style={tw`bg-[#FFFcf7] border border-stone-200/80 rounded-3xl px-4 pt-5 pb-4`}>
            <View style={tw`flex-row items-center mb-3`}>
              <View style={tw`w-[84px] h-[84px] rounded-full overflow-hidden mr-4 border-2 border-emerald-100 bg-[#ECFDF5]`}>
                <Image
                  source={avatarSource(
                    resolveAvatarUri(
                      user?.id || 'default',
                      displayName,
                      profileMeta.avatar || user?.avatar
                    )
                  )}
                  style={tw`w-full h-full`}
                  contentFit="cover"
                />
              </View>
              <View style={tw`flex-1`}>
                <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
                  Profile
                </Text>
                <Text style={tw`text-2xl font-bold text-stone-900 mt-0.5`} numberOfLines={1}>
                  {displayName}
                </Text>
                {isInstructor ? (
                  <View style={tw`flex-row items-center mt-1.5 self-start px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200`}>
                    <Ionicons name="school" size={13} color="#059669" />
                    <Text style={tw`text-xs text-emerald-800 font-semibold ml-1`}>Instructor</Text>
                  </View>
                ) : null}
                {myBadges?.level ? (
                  <View style={tw`mt-1.5`}>
                    <LevelPill level={myBadges.level} />
                  </View>
                ) : null}
              </View>
            </View>

            {streak ? (
              <View
                style={tw`flex-row mb-3 rounded-2xl bg-[#FFF1F0] border border-[#FECACA]/70 px-3 py-2.5`}
                accessible
                accessibilityLabel={`Streak: ${streak.current} days now, longest ${streak.longest}, ${streak.total_days} days in total`}
              >
                {(
                  [
                    { label: 'Streak', value: streak.current, icon: '🔥' },
                    { label: 'Longest', value: streak.longest, icon: '🌿' },
                    { label: 'Total days', value: streak.total_days, icon: '🌱' },
                  ] as const
                ).map((it, i) => (
                  <View
                    key={it.label}
                    style={tw`flex-1 items-center ${i > 0 ? 'border-l border-[#FECACA]/70' : ''}`}
                  >
                    <CountUpText
                      style={tw`text-base font-bold text-stone-900`}
                      prefix={`${it.icon} `}
                      value={it.value}
                    />
                    <Text style={tw`text-[11px] text-stone-500 mt-0.5`}>{it.label}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {profileMeta.status ? (
              <View style={tw`mb-2 px-3 py-2 rounded-2xl bg-[#EAE4D6] border border-stone-200/60`}>
                <Text style={tw`text-[13px] text-stone-800 leading-5`}>{profileMeta.status}</Text>
              </View>
            ) : null}
            {profileMeta.bio ? (
              <Text style={tw`text-sm text-stone-500 mb-3 leading-5`}>{profileMeta.bio}</Text>
            ) : (
              <Text style={tw`text-sm text-stone-500 mb-3 leading-5`}>
                Add a short bio so people know what you’re growing toward.
              </Text>
            )}

            <ProfileStatsRow
              postsCount={posts.length}
              followingCount={following.length}
              followersCount={followers.length}
              onPressFollowing={() => setConnectionsSheet('following')}
              onPressFollowers={() => setConnectionsSheet('followers')}
            />

            <View style={tw`flex-row gap-2 mt-3.5`}>
              <PressableScale
                onPress={() => navigateFromRoot(navigation, 'EditProfile')}
                feedback="open"
                style={tw`flex-1 py-3 rounded-2xl bg-emerald-600 items-center`}
              >
                <Text style={tw`text-white font-bold text-sm`}>Edit profile</Text>
              </PressableScale>
              <PressableScale
                onPress={() => setShowCategorySettings(true)}
                feedback="open"
                style={tw`flex-1 py-3 rounded-2xl bg-[#EAE4D6] border border-stone-200 items-center`}
              >
                <Text style={tw`text-stone-800 font-bold text-sm`}>Paths</Text>
              </PressableScale>
              <PressableScale
                onPress={() =>
                  setSharePayload({
                    kind: 'profile',
                    userId: user?.id || 'me',
                    username: displayName,
                    avatar: profileMeta.avatar || user?.avatar,
                    isInstructor,
                    teachingHeadline: undefined,
                    categories: user?.categories || [],
                    points,
                    endorsements: user?.endorsementsReceived,
                  })
                }
                feedback="open"
                style={tw`w-12 py-3 rounded-2xl bg-[#EAE4D6] border border-stone-200 items-center justify-center`}
                accessibilityLabel="Share profile card"
              >
                <Ionicons name="share-outline" size={18} color="#57534E" />
              </PressableScale>
            </View>
          </View>

          <View style={tw`mt-3 bg-[#EAE4D6] border border-stone-200/80 rounded-2xl px-4 py-3.5 flex-row items-center`}>
            <View style={tw`w-11 h-11 rounded-full bg-emerald-600/15 items-center justify-center mr-3`}>
              <Ionicons name="ribbon" size={22} color="#059669" />
            </View>
            <View style={tw`flex-1`}>
              <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
                Growth points
              </Text>
              <CountUpText style={tw`text-2xl font-bold text-stone-900 mt-0.5`} value={points} />
            </View>
            <Text style={tw`text-[11px] text-stone-500 text-right w-28 leading-4`}>
              Posts & endorsements earn points
            </Text>
          </View>

          {myBadges ? (
            <View style={tw`mt-3`}>
              <BadgeRow earned={myBadges.earned} catalog={myBadges.catalog} next={myBadges.next} />
            </View>
          ) : null}

          <PressableScale
            onPress={() => navigateFromRoot(navigation, 'Invite')}
            feedback="open"
            style={tw`mt-3 flex-row items-center px-4 py-3.5 bg-[#ECFDF5] border border-emerald-100 rounded-2xl`}
            accessibilityRole="button"
          >
            <View style={tw`w-9 h-9 rounded-full bg-emerald-600 items-center justify-center mr-3`}>
              <Ionicons name="person-add-outline" size={17} color="#fff" />
            </View>
            <View style={tw`flex-1`}>
              <Text style={tw`font-semibold text-stone-900`}>Invite friends</Text>
              <Text style={tw`text-xs text-stone-500 mt-0.5`}>Growing is easier together</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#A8A29E" />
          </PressableScale>

          {!isInstructor && eligibility ? (
            <View style={tw`mt-3 bg-[#FFFcf7] border border-stone-200/80 rounded-2xl p-4`}>
              <Text style={tw`text-base font-bold text-stone-900 mb-1`}>Become an instructor</Text>
              <Text style={tw`text-sm text-stone-600 mb-3`}>
                Earn endorsements from people on your paths, then claim instructor.
              </Text>
              <View style={tw`mb-2`}>
                <Text style={tw`text-xs text-stone-500 mb-1`}>
                  Endorsements {eligibility.endorsementsReceived}/{eligibility.endorsementsNeeded}
                </Text>
                <View style={tw`h-2 bg-[#EAE4D6] rounded-full overflow-hidden`}>
                  <View
                    style={[
                      tw`h-full bg-emerald-600 rounded-full`,
                      {
                        width: `${Math.min(
                          (eligibility.endorsementsReceived / eligibility.endorsementsNeeded) * 100,
                          100
                        )}%`,
                      },
                    ]}
                  />
                </View>
              </View>
              <View style={tw`mb-3`}>
                <Text style={tw`text-xs text-stone-500 mb-1`}>
                  Posts {eligibility.postCount}/{eligibility.postsNeeded}
                </Text>
                <View style={tw`h-2 bg-[#EAE4D6] rounded-full overflow-hidden`}>
                  <View
                    style={[
                      tw`h-full bg-energy-600 rounded-full`,
                      {
                        width: `${Math.min(
                          (eligibility.postCount / Math.max(eligibility.postsNeeded, 1)) * 100,
                          100
                        )}%`,
                      },
                    ]}
                  />
                </View>
              </View>
              {eligibility.canClaim ? (
                <PressableScale
                  onPress={() => void onClaimInstructor()}
                  disabled={claimBusy}
                  feedback="success"
                  style={tw`bg-emerald-600 rounded-2xl py-3 items-center ${claimBusy ? 'opacity-60' : ''}`}
                >
                  <Text style={tw`text-white font-bold`}>
                    {claimBusy ? 'Claiming…' : 'Claim instructor'}
                  </Text>
                </PressableScale>
              ) : (
                <Text style={tw`text-xs text-stone-500`}>
                  Keep posting and ask peers on your paths to endorse you.
                </Text>
              )}
            </View>
          ) : null}

          <PressableScale
            onPress={() => navigateFromRoot(navigation, 'AppReviews')}
            feedback="open"
            style={tw`mt-3 flex-row items-center px-4 py-3.5 bg-[#FFF1F0] border border-[#FECACA] rounded-2xl`}
          >
            <View style={tw`w-9 h-9 rounded-full bg-[#F97066] items-center justify-center mr-3`}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color="#fff" />
            </View>
            <View style={tw`flex-1`}>
              <Text style={tw`font-semibold text-stone-900`}>Review Grow!</Text>
              <Text style={tw`text-xs text-stone-500 mt-0.5`}>
                We read every note and reply here first
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#A8A29E" />
          </PressableScale>

          <PressableScale
            onPress={() => navigateFromRoot(navigation, 'Instructors')}
            feedback="open"
            style={tw`mt-3 flex-row items-center px-4 py-3.5 bg-[#FFFcf7] border border-stone-200/80 rounded-2xl`}
          >
            <View style={tw`w-9 h-9 rounded-full bg-emerald-50 items-center justify-center mr-3`}>
              <Ionicons name="school-outline" size={18} color="#059669" />
            </View>
            <View style={tw`flex-1`}>
              <Text style={tw`font-semibold text-stone-900`}>Instructors</Text>
              <Text style={tw`text-xs text-stone-500 mt-0.5`}>
                Find a coach · talk · written plan
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#A8A29E" />
          </PressableScale>

          {myPlans.length > 0 ? (
            <PressableScale
              onPress={() =>
                navigateFromRoot(navigation, 'CoachingContract', { contractId: myPlans[0].id })
              }
              feedback="open"
              style={tw`mt-3 flex-row items-center px-4 py-3.5 bg-emerald-50 border border-emerald-100 rounded-2xl`}
            >
              <View style={tw`w-9 h-9 rounded-full bg-emerald-600 items-center justify-center mr-3`}>
                <Ionicons name="school-outline" size={18} color="#fff" />
              </View>
              <View style={tw`flex-1`}>
                <Text style={tw`font-semibold text-stone-900`}>My coaching plan</Text>
                <Text style={tw`text-xs text-stone-500 mt-0.5`}>
                  {myPlans[0].instructor?.username || 'Coach'} · {COACHING_ACTIVE_STATUS}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#A8A29E" />
            </PressableScale>
          ) : null}

          {isInstructor ? (
            <PressableScale
              onPress={navigateToInstructor}
              feedback="open"
              style={tw`mt-3 flex-row items-center px-4 py-3.5 bg-[#FFFcf7] border border-stone-200/80 rounded-2xl`}
            >
              <View style={tw`w-9 h-9 rounded-full bg-emerald-600 items-center justify-center mr-3`}>
                <Ionicons name="school-outline" size={18} color="#fff" />
              </View>
              <View style={tw`flex-1`}>
                <Text style={tw`font-semibold text-stone-900`}>Instructor Hub</Text>
                <Text style={tw`text-xs text-stone-500 mt-0.5`}>
                  Community · partnerships · teaching
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#A8A29E" />
            </PressableScale>
          ) : null}
        </FadeInUp>

        {SHOW_SEEDS ? (
          <View style={tw`px-4 pt-2`}>
            <GrowingNowStrip />
          </View>
        ) : null}

        {/* Growth areas — edit via Paths in the identity card */}
        <View style={tw`px-4 py-4`}>
          <View style={tw`bg-[#EAE4D6] border border-stone-200/80 rounded-2xl p-4`}>
            <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
              Grow!
            </Text>
            <Text style={tw`text-lg font-bold text-stone-900 mt-0.5 mb-3`}>Your growth paths</Text>

            {user?.categories && user.categories.length > 0 ? (
              <View>
                {groupGrowthPaths(user.categories).map((group) => (
                  <View
                    key={group.parentKey}
                    style={tw`flex-row items-center bg-[#FFFcf7] border border-stone-200/70 rounded-2xl px-3 py-3 mb-2`}
                  >
                    <View style={tw`w-10 h-10 rounded-xl bg-emerald-600/12 items-center justify-center mr-3`}>
                      <Ionicons name={group.icon} size={20} color="#059669" />
                    </View>
                    <View style={tw`flex-1`}>
                      <Text style={tw`text-[15px] font-bold text-stone-900`}>{group.parentLabel}</Text>
                      <Text style={tw`text-xs text-stone-500 mt-0.5`}>
                        {group.focusLabels.length > 0
                          ? group.focusLabels.join(' · ')
                          : 'All focuses in this path'}
                      </Text>
                    </View>
                  </View>
                ))}
                <Text style={tw`text-xs text-stone-500 mt-1`}>
                  Change them anytime with Paths above.
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setShowCategorySettings(true)}
                style={tw`bg-[#FFFcf7] border border-dashed border-stone-300 rounded-2xl px-4 py-5 items-center`}
              >
                <Ionicons name="add-circle-outline" size={28} color="#059669" />
                <Text style={tw`text-sm font-semibold text-stone-800 mt-2`}>Add growth paths</Text>
                <Text style={tw`text-xs text-stone-500 mt-1 text-center`}>
                  Pick up to 3 areas to personalize your feed
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Post lifespan */}
        <View style={tw`px-4 pb-2`}>
          <View style={tw`bg-[#EAE4D6] border border-stone-200/80 rounded-2xl p-4`}>
            <View style={tw`flex-row items-center justify-between`}>
              <View style={tw`flex-1 pr-3`}>
                <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
                  Post lifespan
                </Text>
                <Text style={tw`text-lg font-bold text-stone-900 mt-0.5`}>
                  {decayDays} day{decayDays === 1 ? '' : 's'}
                </Text>
                <Text style={tw`text-xs text-stone-500 mt-1 leading-4`}>
                  Posts soft-hide from timelines after this window so focus stays current.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowDecaySettings(true)}
                style={tw`px-3 py-2 rounded-full bg-white border border-stone-200`}
              >
                <Text style={tw`text-xs font-semibold text-emerald-700`}>Change</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Tabs */}
        <View style={tw`px-5 pt-1`}>
          <View style={tw`flex-row gap-5 border-b border-stone-200/80`}>
            {(
              [
                { key: 'posts' as const, label: 'Posts' },
                { key: 'stories' as const, label: 'Stories' },
                { key: 'progress' as const, label: 'Progress' },
              ] as const
            ).map((tab) => {
              const active = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => {
                    if (tab.key === 'progress') setProgressOpened(true);
                    setActiveTab(tab.key);
                  }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  style={tw`pb-2.5 border-b-2 ${
                    active ? 'border-emerald-600' : 'border-transparent'
                  }`}
                >
                  <Text
                    style={tw`text-[15px] ${
                      active ? 'text-stone-900 font-bold' : 'text-stone-500 font-medium'
                    }`}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Content */}
        {activeTab === 'posts' && (
          <View style={tw`p-4`}>
            {decayedCount > 0 ? (
              <TouchableOpacity
                onPress={() => setShowDecayedPosts((v) => !v)}
                style={tw`mb-3 flex-row items-center justify-between px-3 py-2 rounded-xl bg-[#EAE4D6] border border-stone-200/80`}
              >
                <Text style={tw`text-xs text-stone-600`}>
                  {showDecayedPosts
                    ? 'Showing decayed posts'
                    : `${decayedCount} decayed post${decayedCount === 1 ? '' : 's'} hidden`}
                </Text>
                <Text style={tw`text-xs font-semibold text-emerald-700`}>
                  {showDecayedPosts ? 'Hide decayed' : 'Show decayed'}
                </Text>
              </TouchableOpacity>
            ) : null}
            {!postsLoaded && posts.length === 0 ? (
              <ActivityIndicator color="#059669" style={tw`py-8`} />
            ) : visiblePosts.length === 0 && posts.length > 0 ? (
              <Text style={tw`text-sm text-stone-500 text-center py-6`}>
                All posts have decayed. Tap “Show decayed” or extend post lifespan.
              </Text>
            ) : (
              <View style={tw`-mx-4`}>
                <ProfilePostsGrid
                  posts={visiblePosts}
                  emptyTitle="No posts yet"
                  emptyDescription="Share a photo or reel and it will land here."
                  onPress={(tile) => {
                    const post = visiblePosts.find((p) => p.id === tile.id);
                    if (!post) return;
                    const rootNavigation = navigation.getParent() || navigation;
                    if (post.isReel) {
                      openReelsAtPost(
                        rootNavigation,
                        post.id,
                        sourcePosts.find((p) => p.id === post.id)
                      );
                      return;
                    }
                    (rootNavigation as any).navigate('PostDetail', {
                      post: {
                        id: post.id,
                        userId: user?.id || 'me',
                        username:
                          profileMeta.username ||
                          user?.username ||
                          user?.email?.split('@')[0] ||
                          'User',
                        avatar: resolveAvatarUri(
                          user?.id || 'default',
                          profileMeta.username ||
                            user?.username ||
                            user?.email?.split('@')[0],
                          profileMeta.avatar || user?.avatar
                        ),
                        image: post.image,
                        caption: post.caption,
                        category: post.category,
                        subcategory: post.subcategory,
                        likes: post.likes,
                        comments: post.comments,
                        createdAt: post.createdAt,
                        daysUntilDecay: post.daysUntilDecay,
                        hasLiked: !!post.hasLiked,
                        reaction: post.hasLiked ? 'love' : null,
                      },
                    } as never);
                  }}
                />
              </View>
            )}
          </View>
        )}

        {/* Progress — mounted on first open (lazy fetch), kept mounted afterwards. */}
        {progressOpened ? (
          <View style={activeTab === 'progress' ? undefined : { display: 'none' }}>
            <ProgressTab
              username={displayName}
              userId={user?.id}
              avatar={profileMeta.avatar || user?.avatar}
              currentStreak={streak?.current ?? null}
              refreshKey={progressRefreshKey}
              onShare={setSharePayload}
            />
          </View>
        ) : null}

        {activeTab === 'stories' && (
          <View style={tw`p-4`}>
            {stories.length === 0 ? (
              <View style={tw`items-center py-8`}>
                <Text style={tw`text-stone-500 text-center`}>
                  No active stories yet.
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    const rootNavigation = navigation.getParent() || navigation;
                    (rootNavigation as any).navigate('CreateStory');
                  }}
                  style={tw`mt-4 px-4 py-2.5 rounded-xl bg-emerald-600`}
                >
                  <Text style={tw`text-white font-semibold`}>Create Story</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={tw`flex-row gap-3`}>
                  {stories.map((story) => (
                    <TouchableOpacity
                      key={story.id}
                      style={tw`items-center`}
                      onPress={() => openStoriesViewer(story.id)}
                    >
                      <View
                        style={tw`w-[72px] h-[128px] rounded-xl bg-stone-100 items-center justify-center mb-2 border-2 border-emerald-500 overflow-hidden`}
                      >
                        <ProfileStoryThumb story={story} userId={user?.id} />
                      </View>
                      <Text style={tw`text-xs text-stone-500`}>{story.views} views</Text>
                      <Text style={tw`text-xs text-stone-500 mt-1`}>
                        {new Date(story.createdAt).toLocaleDateString()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        )}

        {isInstructor && (
          <View style={tw`px-5 py-4 border-b border-stone-200/80`}>
            <Text style={tw`text-xs font-semibold tracking-widest text-stone-500 uppercase mb-2`}>
              Teaching
            </Text>
            <TouchableOpacity
              onPress={navigateToInstructor}
              style={tw`flex-row items-center py-3.5`}
            >
              <View style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] items-center justify-center mr-3`}>
                <Ionicons name="school-outline" size={18} color="#57534E" />
              </View>
              <View style={tw`flex-1 pr-2`}>
                <Text style={tw`font-semibold text-stone-900`}>Instructor Hub</Text>
                <Text style={tw`text-xs text-stone-500 mt-0.5`}>
                  Community, partnerships, and teaching tools
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#A8A29E" />
            </TouchableOpacity>
          </View>
        )}

        {/* Sign out */}
        <View style={tw`px-5 py-4`}>
          <TouchableOpacity
            onPress={() => setShowSignOutModal(true)}
            style={tw`flex-row items-center justify-center py-3.5 bg-white/80 border border-stone-200/80 rounded-2xl`}
          >
            <Ionicons name="log-out-outline" size={20} color="#DC2626" />
            <Text style={tw`text-red-600 ml-2 font-semibold`}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <ConnectionsListSheet
        visible={connectionsSheet !== null}
        mode={connectionsSheet ?? 'following'}
        users={connectionsSheet === 'followers' ? followers : following}
        loading={profileLoading && (connectionsSheet === 'followers' ? followers : following).length === 0}
        onClose={() => setConnectionsSheet(null)}
        onSelectUser={(id) => {
          setConnectionsSheet(null);
          navigateFromRoot(navigation, 'PublicProfile', { userId: id });
        }}
      />

      {/* Sign Out Confirmation Modal */}
      <Modal
        visible={showSignOutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSignOutModal(false)}
      >
        <View style={tw`flex-1 bg-black/40 justify-center items-center`}>
          <View style={tw`w-11/12 max-w-sm bg-white rounded-2xl p-6`}>
            <Text style={tw`text-xl font-semibold text-stone-900 mb-2`}>Sign Out</Text>
            <Text style={tw`text-sm text-stone-600 mb-6`}>
              Are you sure you want to sign out? You will need to log in again to access your account.
            </Text>
            <View style={tw`flex-row justify-end`}>
              <TouchableOpacity
                onPress={() => setShowSignOutModal(false)}
                style={tw`px-4 py-2 rounded-full mr-2`}
              >
                <Text style={tw`text-sm text-stone-600`}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSignOutConfirm}
                style={tw`px-4 py-2 rounded-full bg-red-500`}
              >
                <Text style={tw`text-sm text-white font-semibold`}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <DecaySettingsModal
        visible={showDecaySettings}
        initialDays={decayDays}
        onClose={() => setShowDecaySettings(false)}
        onSave={handleSaveDecayTimer}
      />

      {/* Category Settings Modal */}
      <Modal
        visible={showCategorySettings}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCategorySettings(false)}
      >
        <CategoryPickerModal
          currentCategories={user?.categories || []}
          onSave={handleUpdateCategories}
          onClose={() => setShowCategorySettings(false)}
        />
      </Modal>

      <PathChangeSyncOverlay visible={pathSyncVisible} phase={pathSyncPhase} />

      <Modal
        visible={showClaimWelcome}
        transparent
        animationType="fade"
        onRequestClose={() => setShowClaimWelcome(false)}
      >
        <View style={tw`flex-1 bg-black/40 justify-center items-center px-6`}>
          <View style={tw`w-full max-w-sm bg-white rounded-2xl p-6`}>
            <Text style={tw`text-xl font-bold text-stone-900 mb-2`}>You’re an instructor</Text>
            <Text style={tw`text-sm text-stone-600 mb-6`}>
              Your community endorsed you. Open the Instructor Hub anytime from Profile.
            </Text>
            <TouchableOpacity
              onPress={() => {
                setShowClaimWelcome(false);
                navigateToInstructor();
              }}
              style={tw`bg-brand-600 rounded-xl py-3 items-center mb-3`}
            >
              <Text style={tw`text-white font-bold`}>Open Instructor Hub</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowClaimWelcome(false)} style={tw`py-2 items-center`}>
              <Text style={tw`text-stone-600 font-semibold`}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ShareCardSheet
        visible={!!sharePayload}
        payload={sharePayload}
        onClose={() => setSharePayload(null)}
      />
    </SafeAreaView>
  );
}

/** Full-screen sync state while cohort edges detach / attach after a path change. */
function PathChangeSyncOverlay({
  visible,
  phase,
}: {
  visible: boolean;
  phase: 'leaving' | 'joining' | 'done';
}) {
  const pulse = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!visible) return;
    // Pulse holds still under Reduce Motion; the ring keeps turning as the
    // "working" indicator (like a system spinner).
    pulse.setValue(reduced ? 1 : 0);
    const pulseLoop = breathe(pulse, 0, 1, { period: 1800 }, reduced);
    const ringLoop = Animated.loop(
      Animated.timing(ring, {
        toValue: 1,
        duration: 2200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    pulseLoop?.start();
    ringLoop.start();
    return () => {
      pulseLoop?.stop();
      ringLoop.stop();
      pulse.setValue(0);
      ring.setValue(0);
    };
  }, [visible, pulse, ring, reduced]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.06] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const rotate = ring.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const copy =
    phase === 'leaving'
      ? {
          title: 'Refreshing your circle',
          body: 'Letting go of auto-connections from paths you’re leaving…',
        }
      : phase === 'joining'
        ? {
            title: 'Meeting your new cohort',
            body: 'Linking with people who share your updated growth areas…',
          }
        : {
            title: 'You’re set',
            body: 'Following and followers now match your paths.',
          };

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <View style={tw`flex-1 bg-[#F3EEE4] items-center justify-center px-8`}>
        <View style={tw`absolute inset-0`}>
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#ECFDF5', opacity: 0.55 }]} />
          <View
            style={{
              position: 'absolute',
              top: -80,
              right: -60,
              width: 220,
              height: 220,
              borderRadius: 110,
              backgroundColor: '#059669',
              opacity: 0.08,
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: -40,
              left: -40,
              width: 180,
              height: 180,
              borderRadius: 90,
              backgroundColor: '#059669',
              opacity: 0.06,
            }}
          />
        </View>

        <Text style={tw`text-[11px] tracking-[4px] uppercase text-emerald-700 font-bold mb-8`}>
          Grow!
        </Text>

        <View style={tw`items-center justify-center mb-10`}>
          <Animated.View
            style={{
              position: 'absolute',
              width: 128,
              height: 128,
              borderRadius: 64,
              borderWidth: 1.5,
              borderColor: 'rgba(5,150,105,0.25)',
              borderStyle: 'dashed',
              transform: [{ rotate }],
            }}
          />
          <Animated.View
            style={[
              tw`w-24 h-24 rounded-full items-center justify-center`,
              {
                backgroundColor: '#ECFDF5',
                borderWidth: 1,
                borderColor: 'rgba(5,150,105,0.35)',
                transform: [{ scale }],
                opacity,
              },
            ]}
          >
            <Ionicons
              name={phase === 'done' ? 'checkmark' : phase === 'joining' ? 'people' : 'sparkles-outline'}
              size={36}
              color="#059669"
            />
          </Animated.View>
        </View>

        <Text style={tw`text-2xl font-bold text-stone-900 text-center mb-2`}>{copy.title}</Text>
        <Text style={tw`text-sm text-stone-500 text-center leading-5 max-w-xs`}>{copy.body}</Text>

        {phase !== 'done' ? (
          <View style={tw`mt-10 flex-row items-center`}>
            <View style={tw`w-1.5 h-1.5 rounded-full bg-emerald-600 mr-1.5`} />
            <View style={tw`w-1.5 h-1.5 rounded-full bg-emerald-600/50 mr-1.5`} />
            <View style={tw`w-1.5 h-1.5 rounded-full bg-emerald-600/25`} />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

/** Modal shell around GrowthAreasPicker for editing growth areas from Profile. */
function CategoryPickerModal({
  currentCategories,
  onSave,
  onClose,
}: {
  currentCategories: string[];
  onSave: (categories: string[]) => void | Promise<void>;
  onClose: () => void;
}) {
  const [selectedCategories, setSelectedCategories] = useState<string[]>(currentCategories);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    const next = clampGrowthPaths(selectedCategories);
    if (growthParentCount(next) === 0 || growthParentCount(next) > MAX_GROWTH_PATHS) return;
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`}>
      <View style={tw`px-5 pt-4 pb-3 flex-row items-start justify-between`}>
        <View style={tw`flex-1 pr-3`}>
          <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-700 uppercase`}>
            Grow!
          </Text>
          <Text style={tw`text-2xl font-bold text-stone-900 mt-1`}>Change your paths</Text>
          <Text style={tw`text-sm text-stone-500 mt-1.5 leading-5`}>
            Expand a path and choose All or multiple focuses. Up to 3 paths.
          </Text>
        </View>
        <TouchableOpacity
          onPress={onClose}
          disabled={saving}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={tw`w-10 h-10 rounded-full bg-white border border-stone-200 items-center justify-center`}
        >
          <Ionicons name="close" size={20} color="#57534E" />
        </TouchableOpacity>
      </View>

      <View style={[tw`flex-1 px-5 pt-1`, { minHeight: 0 }]}>
        <GrowthAreasPicker value={selectedCategories} onChange={setSelectedCategories} />
      </View>

      <View style={tw`px-5 pt-3 pb-6 border-t border-stone-200/80 bg-[#F3EEE4]`}>
        <TouchableOpacity
          onPress={() => void handleSave()}
          disabled={saving || growthParentCount(selectedCategories) === 0 || growthParentCount(selectedCategories) > MAX_GROWTH_PATHS}
          style={tw`bg-emerald-600 rounded-2xl py-4 items-center ${
            saving || growthParentCount(selectedCategories) === 0 || growthParentCount(selectedCategories) > MAX_GROWTH_PATHS
              ? 'opacity-50'
              : ''
          }`}
        >
          <Text style={tw`text-white text-center font-bold text-base`}>
            {saving ? 'Saving…' : 'Save growth paths'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
