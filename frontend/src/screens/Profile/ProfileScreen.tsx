import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  FlatList,
  Modal,
  TextInput,
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
import { syncCohortFriends, type FriendSummary } from '../../services/api/friends';
import { updateProfileOnServer, fetchCurrentProfile } from '../../services/api/profile';
import { shouldShowBusinessShell } from '../../constants/businessShell';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import { TAB_SCREEN_BOTTOM_PADDING } from '../../constants/scroll';
import ProfileStatsRow from '../../components/profile/ProfileStatsRow';
import ConnectionsListSheet, {
  type ConnectionsSheetMode,
} from '../../components/profile/ConnectionsListSheet';
import EmptyState from '../../components/ui/EmptyState';
import GrowthAreasPicker from '../../components/profile/GrowthAreasPicker';
import { getCategoryMeta } from '../../utils/categoryLabels';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import {
  claimInstructor,
  getInstructorEligibility,
  type InstructorEligibility,
} from '../../services/api/instructor';

type Award = {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
};

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

const AWARDS: Award[] = [
  {
    id: '1',
    name: 'First Steps',
    description: 'Complete your first post',
    icon: '🎯',
    unlocked: true,
    unlockedAt: '2024-01-10',
  },
  {
    id: '2',
    name: 'Week Warrior',
    description: 'Post for 7 consecutive days',
    icon: '🔥',
    unlocked: true,
    unlockedAt: '2024-01-15',
  },
  {
    id: '3',
    name: 'Community Helper',
    description: 'Help 10 other users',
    icon: '🤝',
    unlocked: false,
  },
  {
    id: '4',
    name: 'Instructor Ready',
    description: 'Reach 500 points',
    icon: '🎓',
    unlocked: false,
  },
];

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

  /** Loads posts, stories, cohort connections, and instructor eligibility. */
  const loadProfileContent = useCallback(async () => {
    if (!user?.id) return;
    setProfileLoading(true);
    try {
      const [postList, storyList, cohort, elig, me] = await Promise.all([
        getUserPosts(user.id),
        getUserStories(user.id),
        syncCohortFriends(),
        getInstructorEligibility().catch(() => null),
        fetchCurrentProfile().catch(() => null),
      ]);
      const decay = user.decayTimer || 7;
      setPosts(postList.map((p) => mapFeedPostToProfilePost(p, decay)));
      setStories(storyList.map(mapStoryToProfileStory));
      setFollowing(cohort.following);
      setFollowers(cohort.followers);
      if (elig) setEligibility(elig);
      if (me) {
        setProfileMeta({
          username: me.username,
          avatar: me.avatar,
          bio: me.bio,
          status: me.status,
        });
      }
    } catch (e) {
      console.warn('[ProfileScreen] load profile content', e);
    } finally {
      setProfileLoading(false);
    }
  }, [user?.id, user?.decayTimer]);

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
      'Peers in your growth areas endorsed you. Claiming unlocks the Instructor hub. You can keep posting as usual.',
      { confirmLabel: 'Claim instructor', destructive: false }
    );
    if (!ok) return;
    setClaimBusy(true);
    try {
      const result = await claimInstructor();
      updateUser({ isInstructor: true });
      await refreshProfile();
      setEligibility(result);
      setShowClaimWelcome(true);
    } catch (e) {
      alertMessage('Could not claim', e instanceof Error ? e.message : 'Try again later');
    } finally {
      setClaimBusy(false);
    }
  };

  /** Persists local decay timer preference and refreshes profile content projections. */
  const handleSaveDecayTimer = () => {
    updateUser({ decayTimer: decayDays });
    setShowDecaySettings(false);
    Alert.alert('Success', `Decay timer set to ${decayDays} days`);
    void loadProfileContent();
  };

  /** Persists category updates, then re-syncs cohort-based friend graph. */
  const handleUpdateCategories = async (selectedCategories: string[]) => {
    if (selectedCategories.length === 0) {
      alertMessage('Select at least one', 'Pick at least one growth area before saving.');
      return;
    }
    try {
      await updateProfileOnServer({ categories: selectedCategories });
      updateUser({ categories: selectedCategories });
      try {
        const cohort = await syncCohortFriends();
        setFollowing(cohort.following);
        setFollowers(cohort.followers);
      } catch (cohortErr) {
        console.warn('[ProfileScreen] cohort sync after category update', cohortErr);
      }
      setShowCategorySettings(false);
      alertMessage('Success', 'Growth areas updated!');
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
                  profileMeta.username || user?.email?.split('@')[0],
                  profileMeta.avatar
                ),
              }}
              style={tw`w-20 h-20 rounded-full mr-4 border-2 border-white`}
              contentFit="cover"
            />
            <View style={tw`flex-1`}>
              <Text style={tw`text-2xl font-bold text-stone-900`}>
                {profileMeta.username || user?.email?.split('@')[0] || 'User'}
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
                  Earned from posts, streaks, and community activity.
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

          {/* Instructor Access Card */}
          {isInstructor && (
            <View style={tw`mt-4`}>
              <TouchableOpacity
                onPress={navigateToInstructor}
                style={tw`bg-emerald-700 rounded-xl p-4`}
              >
                <View style={tw`flex-row items-center mb-2`}>
                  <Ionicons name="school" size={24} color="#FFFFFF" />
                  <Text style={tw`text-white font-bold text-lg ml-2`}>Instructor hub</Text>
                </View>
                <Text style={tw`text-white text-xs opacity-90`}>Teach & mentor your community</Text>
              </TouchableOpacity>
            </View>
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
                {user.categories.map((cat) => {
                  const meta = getCategoryMeta(cat);
                  return (
                    <View
                      key={cat}
                      style={tw`flex-row items-center bg-white/90 border border-stone-200/70 rounded-2xl px-3 py-3 mb-2`}
                    >
                      <View style={tw`w-10 h-10 rounded-xl bg-emerald-600/12 items-center justify-center mr-3`}>
                        <Ionicons name={meta.icon} size={20} color="#059669" />
                      </View>
                      <View style={tw`flex-1`}>
                        <Text style={tw`text-[15px] font-bold text-stone-900`}>{meta.parentLabel}</Text>
                        <Text style={tw`text-xs text-stone-500 mt-0.5`}>
                          {meta.subLabel ? meta.subLabel : 'All focuses in this path'}
                        </Text>
                      </View>
                      <Ionicons name="leaf" size={14} color="#059669" />
                    </View>
                  );
                })}
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

        {/* Decay Timer Info */}
        <View style={tw`px-4 py-3 bg-blue-50 border-b border-stone-200`}>
          <View style={tw`flex-row items-center justify-between`}>
            <View style={tw`flex-row items-center`}>
              <Ionicons name="time-outline" size={20} color="#3B82F6" />
              <Text style={tw`text-sm text-stone-700 ml-2`}>
                Decay Timer: {user?.decayTimer || 7} days
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowDecaySettings(true)}>
              <Text style={tw`text-sm text-blue-600 font-semibold`}>Change</Text>
            </TouchableOpacity>
          </View>
          <Text style={tw`text-xs text-stone-500 mt-1`}>
            Posts will automatically decay after this period to keep your timeline focused
          </Text>
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
            {posts.map((post) => (
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
                  <View style={tw`flex-row items-center`}>
                    <Ionicons name="time" size={16} color={post.daysUntilDecay <= 1 ? '#EF4444' : '#F59E0B'} />
                    <Text style={tw`text-sm font-semibold ml-1 ${
                      post.daysUntilDecay <= 1 ? 'text-red-600' : 'text-orange-600'
                    }`}>
                      {post.daysUntilDecay} day{post.daysUntilDecay !== 1 ? 's' : ''} left
                    </Text>
                  </View>
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

        {/* Awards Section */}
        <View style={tw`px-4 py-4 border-t border-stone-200`}>
          <Text style={tw`text-lg font-semibold text-stone-900 mb-3`}>Awards & Achievements</Text>
          <View style={tw`flex-row flex-wrap`}>
            {AWARDS.map((award) => (
              <View key={award.id} style={tw`w-1/2 mb-4 pr-2`}>
                <View
                  style={tw`bg-white border-2 rounded-xl p-4 items-center ${
                    award.unlocked
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-stone-200 bg-stone-50 opacity-60'
                  }`}
                >
                  <Text style={tw`text-4xl mb-2`}>{award.icon}</Text>
                  <Text
                    style={tw`font-semibold text-center mb-1 ${
                      award.unlocked ? 'text-stone-900' : 'text-stone-500'
                    }`}
                  >
                    {award.name}
                  </Text>
                  <Text
                    style={tw`text-xs text-center ${
                      award.unlocked ? 'text-stone-600' : 'text-stone-400'
                    }`}
                  >
                    {award.description}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Quick Actions */}
        {isInstructor && (
          <View style={tw`px-4 py-4 border-b border-stone-200`}>
            <Text style={tw`text-lg font-semibold text-stone-900 mb-3`}>Quick Actions</Text>
            <TouchableOpacity
              onPress={navigateToInstructor}
              style={tw`flex-row items-center justify-between py-4 bg-purple-50 rounded-xl px-4 border border-purple-200`}
            >
              <View style={tw`flex-row items-center flex-1`}>
                <View style={tw`w-12 h-12 bg-purple-500 rounded-full items-center justify-center mr-3`}>
                  <Ionicons name="school" size={24} color="#FFFFFF" />
                </View>
                <View style={tw`flex-1`}>
                  <Text style={tw`font-bold text-stone-900 text-base`}>Instructor Hub</Text>
                  <Text style={tw`text-sm text-stone-600`}>Manage students & courses</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#A855F7" />
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

      {/* Decay Timer Settings Modal */}
      <Modal
        visible={showDecaySettings}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDecaySettings(false)}
      >
        <SafeAreaView style={tw`flex-1 bg-white`}>
          <View style={tw`px-4 pt-4 pb-3 border-b border-stone-200 flex-row items-center justify-between`}>
            <Text style={tw`text-2xl font-bold text-stone-900`}>Decay Timer</Text>
            <TouchableOpacity onPress={() => setShowDecaySettings(false)}>
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView style={tw`flex-1 px-4 pt-6`}>
            <Text style={tw`text-base text-stone-700 mb-4`}>
              Set how many days until your posts automatically decay and are removed from your timeline. 
              This helps you stay focused on current growth areas.
            </Text>
            <View style={tw`bg-stone-50 rounded-xl p-4 mb-4`}>
              <Text style={tw`text-sm text-stone-600 mb-2`}>Days until decay:</Text>
              <TextInput
                value={decayDays.toString()}
                onChangeText={(text) => {
                  const num = parseInt(text) || 0;
                  if (num >= 1 && num <= 365) setDecayDays(num);
                }}
                keyboardType="numeric"
                style={tw`bg-white border border-stone-300 rounded-lg px-4 py-3 text-2xl font-bold text-stone-900`}
              />
              <View style={tw`flex-row gap-2 mt-3`}>
                {[1, 3, 7, 14, 30, 90].map((days) => (
                  <TouchableOpacity
                    key={days}
                    onPress={() => setDecayDays(days)}
                    style={tw`px-3 py-2 rounded-lg ${
                      decayDays === days ? 'bg-brand-600' : 'bg-white border border-stone-300'
                    }`}
                  >
                    <Text style={tw`text-sm font-semibold ${
                      decayDays === days ? 'text-white' : 'text-stone-700'
                    }`}>
                      {days}d
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity
              onPress={handleSaveDecayTimer}
              style={tw`bg-brand-600 rounded-xl py-4 mb-4`}
            >
              <Text style={tw`text-white text-center font-bold text-base`}>Save Settings</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

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
              Your community endorsed you. Open the Instructor hub anytime from Profile.
            </Text>
            <TouchableOpacity
              onPress={() => {
                setShowClaimWelcome(false);
                navigateToInstructor();
              }}
              style={tw`bg-brand-600 rounded-xl py-3 items-center mb-3`}
            >
              <Text style={tw`text-white font-bold`}>Open Instructor hub</Text>
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
    setSaving(true);
    try {
      await onSave(selectedCategories);
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
            Expand a path and choose All or specific focuses. Up to 3 paths.
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
          disabled={saving || selectedCategories.length === 0}
          style={tw`bg-emerald-600 rounded-2xl py-4 items-center ${
            saving || selectedCategories.length === 0 ? 'opacity-50' : ''
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
