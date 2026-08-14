import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  FlatList,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { CommonActions } from '@react-navigation/native';
import { useAuth } from '../../store/hooks';
import { getAvatarUrl, getCategoryImageUrl, getPostImageUrl, resolveStoryDisplayUri, resolveAvatarUri, resolvePostMediaUri } from '../../utils/images';
import tw from '../../lib/tw';
import { getUserPosts, type FeedPost } from '../../services/api/feed';
import { getUserStories, viewStory, type StoryItem } from '../../services/api/stories';
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
import GrowthAreasPicker, {
  clampGrowthPaths,
  growthParentCount,
  MAX_GROWTH_PATHS,
} from '../../components/profile/GrowthAreasPicker';
import DecaySettingsModal from '../../components/profile/DecaySettingsModal';
import DecayCountdownChip from '../../components/profile/DecayCountdownChip';
import { groupGrowthPaths } from '../../utils/categoryLabels';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import {
  claimInstructor,
  getInstructorEligibility,
  type InstructorEligibility,
} from '../../services/api/instructor';
import {
  evaluateAchievements,
  TIER_LABELS,
  type AchievementTier,
} from '../../data/achievements';

type Post = {
  id: string;
  image: string;
  caption: string;
  likes: number;
  comments: number;
  createdAt: string;
  daysUntilDecay: number;
  category: string;
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
  return {
    id: p.id,
    image: img,
    caption: p.caption || '',
    likes,
    comments,
    createdAt: p.created_at,
    daysUntilDecay: daysLeftUntilDecay(p.created_at, decayDays),
    category: p.category,
  };
}

/** Maps story API payload into local profile story model. */
function mapStoryToProfileStory(s: StoryItem): Story {
  return {
    id: s.id,
    userId: s.userId,
    username: s.username,
    avatar: s.avatar,
    image: s.image,
    createdAt: s.createdAt,
    views: s.views ?? 0,
    hasViewed: !!s.hasViewed,
  };
}

export default function ProfileScreen({ navigation: navProp }: any) {
  const { user, signOut, updateUser, refreshProfile } = useAuth();
  const navigation = navProp || useNavigation();
  const points = user?.points || 0;
  const isInstructor = user?.isInstructor || false;
  const isBusinessAccount = shouldShowBusinessShell(user);

  const [activeTab, setActiveTab] = useState<'posts' | 'stories' | 'shared'>('posts');
  const [showDecaySettings, setShowDecaySettings] = useState(false);
  const [showCategorySettings, setShowCategorySettings] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [showClaimWelcome, setShowClaimWelcome] = useState(false);
  const [showFadedPosts, setShowFadedPosts] = useState(false);
  const [decayDays, setDecayDays] = useState(user?.decayTimer || 7);
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [following, setFollowing] = useState<FriendSummary[]>([]);
  const [followers, setFollowers] = useState<FriendSummary[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [connectionsSheet, setConnectionsSheet] = useState<ConnectionsSheetMode | null>(null);
  const [eligibility, setEligibility] = useState<InstructorEligibility | null>(null);
  const [claimBusy, setClaimBusy] = useState(false);
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
      const [postList, storyList, connections, elig, me] = await Promise.all([
        getUserPosts(user.id),
        getUserStories(user.id),
        getConnections().catch(() => ({
          following: [] as FriendSummary[],
          followers: [] as FriendSummary[],
          followingCount: 0,
          followersCount: 0,
        })),
        getInstructorEligibility().catch(() => null),
        fetchCurrentProfile({ stats: true }).catch(() => null),
      ]);
      if (elig) setEligibility(elig);
      const decay =
        typeof me?.decay_timer === 'number' ? me.decay_timer : user.decayTimer || 7;
      setPosts(postList.map((p) => mapFeedPostToProfilePost(p, decay)));
      setStories(storyList.map(mapStoryToProfileStory));
      setFollowing(connections.following);
      setFollowers(connections.followers);
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
    }
  }, [user?.id, user?.decayTimer, updateUser]);

  useFocusEffect(
    useCallback(() => {
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
        console.log('[ProfileScreen] ===== SIGN OUT STARTED =====');
        console.log('[ProfileScreen] Calling signOut()...');
        
        const result = await signOut();
        console.log('[ProfileScreen] Sign out result:', result);
        console.log('[ProfileScreen] Result type:', result.type);
        console.log('[ProfileScreen] Result payload:', result.payload);
        
        // Wait a bit to ensure state is cleared
        console.log('[ProfileScreen] Waiting 200ms for state to clear...');
        await new Promise(resolve => setTimeout(resolve, 200));
        
        console.log('[ProfileScreen] Getting navigation...');
        const rootNavigation = navigation.getParent() || navigation;
        console.log('[ProfileScreen] Navigation object:', rootNavigation ? 'found' : 'not found');
        
        console.log('[ProfileScreen] Dispatching navigation reset...');
        rootNavigation.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: 'Auth' as never }],
          })
        );
        console.log('[ProfileScreen] ===== NAVIGATION RESET COMPLETE =====');
      } catch (error) {
        console.error('[ProfileScreen] ===== SIGN OUT ERROR =====');
        console.error('[ProfileScreen] Error:', error);
        console.error('[ProfileScreen] Error stack:', (error as Error)?.stack);
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

  const achievementStats = {
    postCount: user?.postCount ?? posts.length,
    categoriesCount: user?.categories?.length ?? 0,
    hasBio: !!(profileMeta.bio && String(profileMeta.bio).trim()),
    streakDays: user?.streakDays ?? 0,
    endorsementsReceived: eligibility?.endorsementsReceived ?? user?.endorsementsReceived ?? 0,
    endorsementsGiven: user?.endorsementsGiven ?? 0,
    points,
    canClaimInstructor: !!eligibility?.canClaim,
    isInstructor,
  };
  const achievements = evaluateAchievements(achievementStats);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const visiblePosts = showFadedPosts
    ? posts
    : posts.filter((p) => p.daysUntilDecay > 0);
  const fadedCount = posts.filter((p) => p.daysUntilDecay <= 0).length;

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
    try {
      await updateProfileOnServer({ categories: next });
      updateUser({ categories: next });
      try {
        const cohort = await syncCohortFriends();
        setFollowing(cohort.following);
        setFollowers(cohort.followers);
      } catch (cohortErr) {
        console.warn('[ProfileScreen] cohort sync after category update', cohortErr);
      }
      setShowCategorySettings(false);
      alertMessage('Success', 'Growth paths updated!');
    } catch (err: unknown) {
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
      onStoriesUpdate: (updatedStories: Array<{ id: string; hasViewed?: boolean }>) => {
        const viewedIds = updatedStories.filter((s) => s.hasViewed).map((s) => s.id);
        if (viewedIds.length > 0) {
          Promise.all(viewedIds.map((id) => viewStory(id))).catch(() => undefined);
        }
        setStories((prev) =>
          prev.map((story) => {
            const updated = updatedStories.find((s) => s.id === story.id);
            return updated ? { ...story, hasViewed: !!updated.hasViewed } : story;
          })
        );
      },
    });
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-[#F3EEE4]`} edges={['top']}>
      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={{
          paddingBottom: Platform.OS === 'web' ? 160 : TAB_SCREEN_BOTTOM_PADDING,
        }}
      >
        {/* Header */}
        <View style={tw`px-5 pt-3 pb-5`}>
          <View style={tw`flex-row items-center justify-between mb-4`}>
            <View>
              <Text style={tw`text-[11px] tracking-[3px] uppercase text-stone-500 font-semibold`}>
                Grow!
              </Text>
              <Text style={tw`text-3xl text-stone-900 mt-1`}>You</Text>
            </View>
            <TouchableOpacity
              onPress={() => navigateFromRoot(navigation, 'Settings')}
              style={tw`w-10 h-10 rounded-full bg-white/80 border border-stone-200 items-center justify-center`}
              accessibilityLabel="Settings"
            >
              <Ionicons name="settings-outline" size={20} color="#059669" />
            </TouchableOpacity>
          </View>

          <View style={tw`flex-row items-center mb-4`}>
            <Image
              source={{
                uri: resolveAvatarUri(
                  user?.id || 'default',
                  profileMeta.username || user?.username || user?.email?.split('@')[0],
                  profileMeta.avatar || user?.avatar
                ),
              }}
              style={tw`w-20 h-20 rounded-full mr-4 border-2 border-white`}
              contentFit="cover"
            />
            <View style={tw`flex-1`}>
              <Text style={tw`text-2xl font-bold text-stone-900`}>
                {profileMeta.username || user?.username || user?.email?.split('@')[0] || 'User'}
              </Text>
              {isInstructor && (
                <View style={tw`flex-row items-center mt-1`}>
                  <Ionicons name="school" size={16} color="#059669" />
                  <Text style={tw`text-sm text-emerald-700 ml-1 font-semibold`}>Instructor</Text>
                </View>
              )}
            </View>
          </View>

          {profileMeta.status ? (
            <Text style={tw`text-sm text-stone-800 mb-1 leading-5`}>{profileMeta.status}</Text>
          ) : null}
          {profileMeta.bio ? (
            <Text style={tw`text-sm text-stone-500 mb-3 leading-5`}>{profileMeta.bio}</Text>
          ) : null}

          <ProfileStatsRow
            postsCount={posts.length}
            followingCount={following.length}
            followersCount={followers.length}
            onPressFollowing={() => setConnectionsSheet('following')}
            onPressFollowers={() => setConnectionsSheet('followers')}
          />

          <Text style={tw`text-xs text-stone-500 mt-3 mb-4 text-center`}>
            Shared growth categories connect you automatically — tap Following or Followers to see everyone.
          </Text>

          <View style={tw`bg-[#EAE4D6] border border-stone-200/80 rounded-2xl p-4 mb-1`}>
            <View style={tw`flex-row items-center justify-between`}>
              <View style={tw`flex-1 pr-3`}>
                <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
                  Growth points
                </Text>
                <Text style={tw`text-3xl font-bold text-stone-900 mt-1`}>{points}</Text>
                <Text style={tw`text-xs text-stone-500 mt-1 leading-4`}>
                  +10 per post · +25 when endorsed · +5 when you endorse · milestones unlock badges
                  (endorsements still gate instructor).
                </Text>
              </View>
              <View style={tw`w-14 h-14 rounded-full bg-emerald-600/15 items-center justify-center`}>
                <Ionicons name="leaf" size={28} color="#059669" />
              </View>
            </View>
          </View>

          {!isInstructor && eligibility ? (
            <View style={tw`mt-4 bg-white border border-brand-200 rounded-2xl p-4`}>
              <Text style={tw`text-base font-bold text-stone-900 mb-1`}>Become an instructor</Text>
              <Text style={tw`text-sm text-stone-600 mb-3`}>
                Earn endorsements from people in your growth areas, then claim your instructor account.
              </Text>
              <View style={tw`mb-2`}>
                <Text style={tw`text-xs text-stone-500 mb-1`}>
                  Endorsements {eligibility.endorsementsReceived}/{eligibility.endorsementsNeeded}
                </Text>
                <View style={tw`h-2 bg-stone-100 rounded-full overflow-hidden`}>
                  <View
                    style={[
                      tw`h-full bg-brand-600 rounded-full`,
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
                <View style={tw`h-2 bg-stone-100 rounded-full overflow-hidden`}>
                  <View
                    style={[
                      tw`h-full bg-violet-500 rounded-full`,
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
                <TouchableOpacity
                  onPress={() => void onClaimInstructor()}
                  disabled={claimBusy}
                  style={tw`bg-brand-600 rounded-xl py-3 items-center ${claimBusy ? 'opacity-60' : ''}`}
                >
                  <Text style={tw`text-white font-bold`}>
                    {claimBusy ? 'Claiming…' : 'Switch to Instructor Account'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text style={tw`text-xs text-stone-500`}>
                  Keep posting and ask peers in your categories to endorse you.
                </Text>
              )}
            </View>
          ) : null}

          {isInstructor && (
            <TouchableOpacity
              onPress={navigateToInstructor}
              style={tw`mt-4 flex-row items-center py-3 border-t border-stone-200/80`}
            >
              <View style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] items-center justify-center mr-3`}>
                <Ionicons name="school-outline" size={18} color="#57534E" />
              </View>
              <View style={tw`flex-1`}>
                <Text style={tw`font-semibold text-stone-900`}>Open Instructor Hub</Text>
                <Text style={tw`text-xs text-stone-500 mt-0.5`}>
                  Community · partnerships · teaching
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#A8A29E" />
            </TouchableOpacity>
          )}
        </View>

        {/* Growth areas */}
        <View style={tw`px-4 py-4`}>
          <View style={tw`bg-[#EAE4D6] border border-stone-200/80 rounded-2xl p-4`}>
            <View style={tw`flex-row items-center justify-between mb-3`}>
              <View>
                <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
                  Grow!
                </Text>
                <Text style={tw`text-lg font-bold text-stone-900 mt-0.5`}>Your growth paths</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowCategorySettings(true)}
                style={tw`flex-row items-center px-3 py-2 rounded-full bg-white border border-stone-200`}
                accessibilityLabel="Edit growth paths"
              >
                <Ionicons name="create-outline" size={16} color="#059669" />
                <Text style={tw`text-xs font-semibold text-emerald-700 ml-1.5`}>Edit</Text>
              </TouchableOpacity>
            </View>

            {user?.categories && user.categories.length > 0 ? (
              <View>
                {groupGrowthPaths(user.categories).map((group) => (
                  <View
                    key={group.parentKey}
                    style={tw`flex-row items-center bg-white/90 border border-stone-200/70 rounded-2xl px-3 py-3 mb-2`}
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
                    <Ionicons name="leaf" size={14} color="#059669" />
                  </View>
                ))}
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setShowCategorySettings(true)}
                style={tw`bg-white/80 border border-dashed border-stone-300 rounded-2xl px-4 py-5 items-center`}
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

        {/* Settings shortcut */}
        <View style={tw`px-5 py-3`}>
          <TouchableOpacity
            onPress={() => navigateFromRoot(navigation, 'Settings')}
            style={tw`flex-row items-center justify-between py-3.5 px-4 bg-white/80 border border-stone-200/80 rounded-2xl`}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="settings-outline" size={20} color="#059669" />
              <View style={tw`ml-3`}>
                <Text style={tw`text-stone-900 font-semibold`}>Settings</Text>
                <Text style={tw`text-xs text-stone-500 mt-0.5`}>
                  Account, preferences, orders, legal
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#A8A29E" />
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={tw`flex-row border-b border-stone-200`}>
          {[
            { key: 'posts', label: 'Posts', icon: 'grid' },
            { key: 'stories', label: 'Stories', icon: 'images' },
            { key: 'shared', label: 'Shared', icon: 'share' },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key as any)}
              style={tw`flex-1 py-3 items-center border-b-2 ${
                activeTab === tab.key ? 'border-brand-600' : 'border-transparent'
              }`}
            >
              <Ionicons
                name={tab.icon as any}
                size={20}
                color={activeTab === tab.key ? '#10B981' : '#9CA3AF'}
              />
              <Text
                style={tw`text-xs mt-1 ${
                  activeTab === tab.key ? 'text-brand-600 font-semibold' : 'text-stone-500'
                }`}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        {activeTab === 'posts' && (
          <View style={tw`p-4`}>
            {fadedCount > 0 ? (
              <TouchableOpacity
                onPress={() => setShowFadedPosts((v) => !v)}
                style={tw`mb-3 flex-row items-center justify-between px-3 py-2 rounded-xl bg-[#EAE4D6] border border-stone-200/80`}
              >
                <Text style={tw`text-xs text-stone-600`}>
                  {showFadedPosts
                    ? 'Showing faded posts'
                    : `${fadedCount} faded post${fadedCount === 1 ? '' : 's'} hidden`}
                </Text>
                <Text style={tw`text-xs font-semibold text-emerald-700`}>
                  {showFadedPosts ? 'Hide faded' : 'Show faded'}
                </Text>
              </TouchableOpacity>
            ) : null}
            {visiblePosts.length === 0 && posts.length > 0 ? (
              <Text style={tw`text-sm text-stone-500 text-center py-6`}>
                All posts have faded. Tap “Show faded” or extend post lifespan.
              </Text>
            ) : null}
            {visiblePosts.map((post) => (
              <TouchableOpacity
                key={post.id}
                style={tw`bg-white border border-stone-200 rounded-xl p-4 mb-3`}
                onPress={() => {
                  const rootNavigation = navigation.getParent() || navigation;
                  (rootNavigation as any).navigate('PostDetail', {
                    post: {
                      id: post.id,
                      userId: user?.id || 'me',
                      username: user?.email?.split('@')[0] || 'User',
                      avatar: getAvatarUrl(user?.id || 'default', user?.email?.split('@')[0]),
                      image: post.image,
                      caption: post.caption,
                      category: post.category,
                      likes: post.likes,
                      comments: post.comments,
                      createdAt: post.createdAt,
                      daysUntilDecay: post.daysUntilDecay,
                      hasLiked: false,
                      reaction: null,
                    },
                  } as never);
                }}
              >
                <View style={tw`flex-row items-center justify-between mb-3`}>
                  <View style={tw`flex-row items-center`}>
                    <Image
                      source={{ uri: post.image }}
                      style={tw`w-16 h-16 rounded-xl mr-3`}
                      contentFit="cover"
                    />
                    <View style={tw`flex-1`}>
                      <Text style={tw`font-semibold text-stone-900`} numberOfLines={2}>
                        {post.caption}
                      </Text>
                      <Text style={tw`text-xs text-stone-500 mt-1`}>
                        {new Date(post.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={tw`flex-row items-center justify-between`}>
                  <View style={tw`flex-row items-center gap-4`}>
                    <View style={tw`flex-row items-center`}>
                      <Ionicons name="heart" size={16} color="#EF4444" />
                      <Text style={tw`text-sm text-stone-600 ml-1`}>{post.likes}</Text>
                    </View>
                    <View style={tw`flex-row items-center`}>
                      <Ionicons name="chatbubble" size={16} color="#6B7280" />
                      <Text style={tw`text-sm text-stone-600 ml-1`}>{post.comments}</Text>
                    </View>
                  </View>
                  <DecayCountdownChip daysLeft={post.daysUntilDecay} compact />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

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
                  style={tw`mt-4 px-4 py-2.5 rounded-xl bg-violet-600`}
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
                        style={tw`w-20 h-20 rounded-xl bg-stone-100 items-center justify-center mb-2 border-2 border-purple-500 overflow-hidden`}
                      >
                        <Image
                          source={{ uri: resolveStoryDisplayUri(story.image, user?.id || 'me', story.id) }}
                          style={tw`w-full h-full`}
                          contentFit="cover"
                        />
                      </View>
                      <Text style={tw`text-xs text-stone-500`}>{story.views} views</Text>
                      <Text style={tw`text-xs text-stone-400 mt-1`}>
                        {new Date(story.createdAt).toLocaleDateString()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        )}

        {activeTab === 'shared' && (
          <EmptyState
            icon="share-outline"
            title="Nothing shared yet"
            description="Content you share with the community will appear here."
          />
        )}

        {/* Growth journey — achievements */}
        <View style={tw`px-4 py-4`}>
          <View style={tw`bg-[#EAE4D6] border border-stone-200/80 rounded-2xl p-4`}>
            <View style={tw`flex-row items-end justify-between mb-4`}>
              <View style={tw`flex-1 pr-3`}>
                <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
                  Grow!
                </Text>
                <Text style={tw`text-lg font-bold text-stone-900 mt-0.5`}>Growth journey</Text>
                <Text style={tw`text-xs text-stone-500 mt-1`}>
                  {unlockedCount} of {achievements.length} unlocked · points and endorsements are separate tracks
                </Text>
              </View>
              <View style={tw`w-11 h-11 rounded-full bg-emerald-600/15 items-center justify-center`}>
                <Ionicons name="ribbon-outline" size={22} color="#059669" />
              </View>
            </View>

            {(Object.keys(TIER_LABELS) as AchievementTier[]).map((tier) => {
              const tierItems = achievements.filter((a) => a.tier === tier);
              if (tierItems.length === 0) return null;
              return (
                <View key={tier} style={tw`mb-3`}>
                  <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-2`}>
                    {TIER_LABELS[tier]}
                  </Text>
                  {tierItems.map((award) => (
                    <View
                      key={award.id}
                      style={tw`flex-row items-center bg-white/90 border border-stone-200/70 rounded-2xl px-3 py-3 mb-2 ${
                        award.unlocked ? '' : 'opacity-75'
                      }`}
                    >
                      <View
                        style={tw`w-12 h-12 rounded-2xl items-center justify-center mr-3 ${
                          award.unlocked ? 'bg-emerald-600' : 'bg-stone-200'
                        }`}
                      >
                        <Ionicons
                          name={award.icon}
                          size={22}
                          color={award.unlocked ? '#FFFFFF' : '#78716C'}
                        />
                      </View>
                      <View style={tw`flex-1 pr-2`}>
                        <Text
                          style={tw`text-[15px] font-bold ${
                            award.unlocked ? 'text-stone-900' : 'text-stone-600'
                          }`}
                        >
                          {award.name}
                        </Text>
                        <Text style={tw`text-xs text-stone-500 mt-0.5 leading-4`}>
                          {award.description}
                        </Text>
                        {!award.unlocked && award.target > 1 ? (
                          <View style={tw`mt-2 h-1.5 bg-stone-100 rounded-full overflow-hidden`}>
                            <View
                              style={[
                                tw`h-full bg-emerald-500 rounded-full`,
                                { width: `${Math.min(100, (award.progress / award.target) * 100)}%` },
                              ]}
                            />
                          </View>
                        ) : null}
                        {!award.unlocked && award.target > 1 ? (
                          <Text style={tw`text-[10px] text-stone-400 mt-1`}>
                            {award.progress}/{award.target}
                          </Text>
                        ) : null}
                      </View>
                      {award.unlocked ? (
                        <View style={tw`px-2 py-1 rounded-full bg-emerald-100`}>
                          <Text style={tw`text-[10px] font-bold text-emerald-800 uppercase`}>Earned</Text>
                        </View>
                      ) : (
                        <Ionicons name="lock-closed-outline" size={16} color="#A8A29E" />
                      )}
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        </View>

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
        loading={profileLoading}
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
    </SafeAreaView>
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
