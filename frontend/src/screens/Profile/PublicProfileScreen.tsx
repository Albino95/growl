import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useAuth } from '../../store/hooks';
import { getCategoryLabel, groupGrowthPaths } from '../../utils/categoryLabels';
import tw from '../../lib/tw';
import BrandLoadingScreen from '../../components/common/BrandLoadingScreen';
import {
  addFriend,
  removeFriend,
  getFriendshipStatus,
  blockUser,
  unblockUser,
  muteUser,
  unmuteUser,
  reportUser,
} from '../../services/api/friends';
import { getUserPosts, type FeedPost } from '../../services/api/feed';
import { openReelsAtPost, isReelPost } from '../../utils/reelNavigation';
import { getUserStories, viewStory, type StoryItem } from '../../services/api/stories';
import { resolveAvatarUri, resolveStoryDisplayUri, resolvePostMediaUri, avatarSource } from '../../utils/images';
import { getPublicProfile, type PublicProfileSummary } from '../../services/api/profile';
import { getUserPublicJournalEntries } from '../../services/api/journal';
import { createConversation } from '../../services/api/messages';
import {
  endorseCandidate,
  getEndorsementStatus,
  type EndorsementStatus,
} from '../../services/api/instructor';
import { TAB_SCREEN_BOTTOM_PADDING } from '../../constants/scroll';
import EmptyState from '../../components/ui/EmptyState';
import ProfilePostsGrid from '../../components/profile/ProfilePostsGrid';
import { alertMessage } from '../../utils/confirmDialog';

type Post = {
  id: string;
  image: string;
  caption: string;
  likes: number;
  comments: number;
  createdAt: string;
  category: string;
  subcategory?: string;
  isReel?: boolean;
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

type JournalEntry = {
  id: string;
  date: string;
  content: string;
  isPublic: boolean;
  mood?: string;
  tags?: string[];
};

type PublicUser = PublicProfileSummary;

type RouteParams = {
  PublicProfile: {
    userId: string;
  };
};

/** Normalizes backend feed payload into compact UI card model for public profile posts. */
function mapFeedPostToPublicPost(p: FeedPost): Post {
  return {
    id: p.id,
    image: resolvePostMediaUri(p.image_url, p.category, p.id),
    caption: p.caption || '',
    likes: p.metadata?.likes ?? 0,
    comments: p.metadata?.comments ?? 0,
    createdAt: p.created_at,
    category: p.category,
    subcategory: p.subcategory || undefined,
    isReel: isReelPost(p),
  };
}

/** Converts story API shape into local story model used by this screen. */
function mapStoryItemToStory(s: StoryItem): Story {
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

/** Fetches and maps public posts for the selected profile user. */
async function fetchUserPosts(userId: string): Promise<{ cards: Post[]; raw: FeedPost[] }> {
  const list = await getUserPosts(userId);
  return { cards: list.map(mapFeedPostToPublicPost), raw: list };
}

/** Fetches and maps profile stories for story strip + viewer navigation. */
async function fetchUserStories(userId: string): Promise<Story[]> {
  const list = await getUserStories(userId);
  return list.map(mapStoryItemToStory);
}

// Fetch public journal entries from API
async function fetchPublicJournalEntries(userId: string): Promise<JournalEntry[]> {
  const res = await getUserPublicJournalEntries(userId);
  if (!res.success || !res.data?.entries) return [];
  return res.data.entries.map((e) => ({
    id: e.id,
    date: e.created_at.slice(0, 10),
    content: e.content,
    isPublic: e.isPublic,
    mood: e.mood ?? undefined,
    tags: e.tags,
  }));
}

export default function PublicProfileScreen() {
  const { user: currentUser, updateUser } = useAuth();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'PublicProfile'>>();
  const { userId } = route.params;
  
  const [loading, setLoading] = useState(true);
  const [profileUser, setProfileUser] = useState<PublicUser | null>(null);
  const [activeTab, setActiveTab] = useState<'posts' | 'stories' | 'journal'>('posts');
  const [posts, setPosts] = useState<Post[]>([]);
  const [sourcePosts, setSourcePosts] = useState<FeedPost[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [loadingContent, setLoadingContent] = useState(false);
  const [friendConnected, setFriendConnected] = useState(false);
  const [friendRequestSent, setFriendRequestSent] = useState(false);
  const [friendRequestReceived, setFriendRequestReceived] = useState(false);
  const [friendBusy, setFriendBusy] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [messageBusy, setMessageBusy] = useState(false);
  const [endorseStatus, setEndorseStatus] = useState<EndorsementStatus | null>(null);
  const [endorseBusy, setEndorseBusy] = useState(false);

  const isOwnProfile = currentUser?.id === userId;

  // Reload profile shell + first tab content together when route user changes.
  useEffect(() => {
    setPosts([]);
    setStories([]);
    setJournalEntries([]);
    void loadProfile();
    void prefetchPrimaryContent();
  }, [userId]);

  // Relationship status drives follow button and moderation toggle labels.
  useEffect(() => {
    if (isOwnProfile || !currentUser?.id) {
      setFriendConnected(false);
      setFriendRequestSent(false);
      setFriendRequestReceived(false);
      return;
    }
    let cancelled = false;
    getFriendshipStatus(userId)
      .then((s) => {
        if (!cancelled) {
          setFriendConnected(s.connected);
          setFriendRequestSent(s.requestSent);
          setFriendRequestReceived(s.requestReceived);
          setIsBlocked(s.blocked);
          setIsMuted(s.muted);
        }
      })
      .catch(() => {
        // Keep local defaults when status lookup fails.
      });
    return () => {
      cancelled = true;
    };
  }, [userId, currentUser?.id, isOwnProfile]);

  useEffect(() => {
    if (isOwnProfile || !currentUser?.id) {
      setEndorseStatus(null);
      return;
    }
    let cancelled = false;
    getEndorsementStatus(userId)
      .then((s) => {
        if (!cancelled) setEndorseStatus(s);
      })
      .catch(() => {
        if (!cancelled) setEndorseStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, currentUser?.id, isOwnProfile]);

  const onEndorse = async () => {
    if (endorseBusy || !endorseStatus?.canEndorse) return;
    setEndorseBusy(true);
    try {
      const result = await endorseCandidate(userId);
      if (typeof result.points_total_voter === 'number') {
        updateUser({ points: result.points_total_voter });
      }
      setEndorseStatus((prev) =>
        prev
          ? {
              ...prev,
              canEndorse: false,
              alreadyEndorsed: true,
              endorsementCount: result.endorsementCount,
            }
          : prev
      );
      alertMessage('Endorsed', `Thanks — ${profileUser?.username ?? 'they'} received your endorsement. You earned growth points too.`);
    } catch (e) {
      alertMessage('Could not endorse', e instanceof Error ? e.message : 'Try again later');
    } finally {
      setEndorseBusy(false);
    }
  };

  /** Handles friend request send/cancel/accept and remove-friend actions. */
  const onToggleFriend = async () => {
    if (friendBusy || isOwnProfile) return;
    if (isBlocked) {
      Alert.alert('Blocked user', 'Unblock this user before connecting.');
      return;
    }
    setFriendBusy(true);
    try {
      if (friendConnected) {
        await removeFriend(userId);
        setFriendConnected(false);
        setFriendRequestSent(false);
        setFriendRequestReceived(false);
        if (Platform.OS === 'web') {
          window.alert('Removed from friends.');
        } else {
          Alert.alert('Removed', 'Friend connection removed.');
        }
      } else if (friendRequestSent) {
        await removeFriend(userId);
        setFriendRequestSent(false);
        if (Platform.OS === 'web') {
          window.alert('Friend request cancelled.');
        } else {
          Alert.alert('Cancelled', 'Friend request cancelled.');
        }
      } else {
        const result = await addFriend(userId);
        setFriendConnected(result.connected);
        setFriendRequestSent(result.requestSent);
        setFriendRequestReceived(false);
        if (Platform.OS === 'web') {
          window.alert(result.connected ? 'Friend request accepted.' : 'Friend request sent.');
        } else {
          Alert.alert(
            result.connected ? 'Friends' : 'Request sent',
            result.connected
              ? 'You are now friends.'
              : `${profileUser?.username ?? 'User'} can accept your friend request.`
          );
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not update connection';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setFriendBusy(false);
    }
  };

  // Load tab content when switching tabs (posts are prefetched with the profile).
  useEffect(() => {
    if (!profileUser) return;
    if (activeTab === 'posts') return;
    void loadContent();
  }, [profileUser, activeTab, isBlocked]);

  useEffect(() => {
    if (!isBlocked) return;
    setPosts([]);
    setStories([]);
    setJournalEntries([]);
  }, [isBlocked]);

  /** Loads public profile header/stats metadata. */
  const loadProfile = async () => {
    try {
      setLoading(true);
      const userData = await getPublicProfile(userId);
      setProfileUser(userData);
    } catch (error) {
      console.error('Error loading profile:', error);
      setProfileUser(null);
    } finally {
      setLoading(false);
    }
  };

  /** Prefetch posts while profile metadata loads so the grid appears faster. */
  const prefetchPrimaryContent = async () => {
    if (isBlocked) return;
    try {
      setLoadingContent(true);
      const { cards, raw } = await fetchUserPosts(userId);
      setSourcePosts(raw);
      setPosts(cards);
    } catch (error) {
      console.error('Error prefetching posts:', error);
    } finally {
      setLoadingContent(false);
    }
  };

  /** Loads selected tab content (posts/stories/journal) for current profile user. */
  const loadContent = async () => {
    if (!profileUser) return;
    if (isBlocked) {
      setPosts([]);
      setStories([]);
      setJournalEntries([]);
      return;
    }
    
    try {
      setLoadingContent(true);
      if (activeTab === 'posts') {
        const { cards, raw } = await fetchUserPosts(userId);
        setSourcePosts(raw);
        setPosts(cards);
      } else if (activeTab === 'stories') {
        const userStories = await fetchUserStories(userId);
        setStories(userStories);
      } else if (activeTab === 'journal') {
        const entries = await fetchPublicJournalEntries(userId);
        setJournalEntries(entries);
      }
    } catch (error) {
      console.error('Error loading content:', error);
    } finally {
      setLoadingContent(false);
    }
  };

  /** Opens story viewer modal and syncs viewed-state both locally and server-side. */
  const openStoryViewer = (selectedStoryId?: string) => {
    if (!stories.length || !profileUser) return;
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

  const refreshFriendshipState = async () => {
    try {
      const state = await getFriendshipStatus(userId);
      setFriendConnected(state.connected);
      setFriendRequestSent(state.requestSent);
      setFriendRequestReceived(state.requestReceived);
      setIsBlocked(state.blocked);
      setIsMuted(state.muted);
    } catch {
      // Keep current local state when refresh fails.
    }
  };

  const confirmAction = (title: string, message: string, confirmText = 'Confirm') =>
    new Promise<boolean>((resolve) => {
      if (Platform.OS === 'web') {
        resolve(typeof globalThis.confirm === 'function' ? globalThis.confirm(`${title}\n\n${message}`) : true);
        return;
      }
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmText, style: 'destructive', onPress: () => resolve(true) },
      ]);
    });

  const notify = (title: string, message: string) => {
    if (Platform.OS === 'web' && typeof globalThis.alert === 'function') {
      globalThis.alert(`${title}\n\n${message}`);
      return;
    }
    Alert.alert(title, message);
  };

  const handleBlockMenuPress = async () => {
    setShowOptionsMenu(false);
    const username = profileUser?.username || 'this user';
    const approved = await confirmAction(
      isBlocked ? 'Unblock User' : 'Block User',
      isBlocked
        ? `Do you want to unblock ${username}?`
        : `Are you sure you want to block ${username}?`,
      isBlocked ? 'Unblock' : 'Block'
    );
    if (!approved) return;

    try {
      if (isBlocked) {
        await unblockUser(userId);
        notify('Unblocked', `${username} has been unblocked.`);
      } else {
        await blockUser(userId);
        setPosts([]);
        setStories([]);
        setJournalEntries([]);
        notify('Blocked', `${username} has been blocked.`);
      }
      await refreshFriendshipState();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Could not update block status';
      notify('Error', msg);
    }
  };

  const handleReportMenuPress = () => {
    setShowOptionsMenu(false);
    Alert.alert('Report User', `Why are you reporting ${profileUser?.username}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Spam',
        onPress: async () => {
          try {
            await reportUser(userId, 'spam');
            Alert.alert('Reported', 'Thank you for your report. We will review it.');
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Could not submit report';
            Alert.alert('Error', msg);
          }
        },
      },
      {
        text: 'Harassment',
        onPress: async () => {
          try {
            await reportUser(userId, 'harassment');
            Alert.alert('Reported', 'Thank you for your report. We will review it.');
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Could not submit report';
            Alert.alert('Error', msg);
          }
        },
      },
      {
        text: 'Inappropriate Content',
        onPress: async () => {
          try {
            await reportUser(userId, 'inappropriate_content');
            Alert.alert('Reported', 'Thank you for your report. We will review it.');
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Could not submit report';
            Alert.alert('Error', msg);
          }
        },
      },
      {
        text: 'Other',
        onPress: async () => {
          try {
            await reportUser(userId, 'other');
            Alert.alert('Reported', 'Thank you for your report. We will review it.');
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Could not submit report';
            Alert.alert('Error', msg);
          }
        },
      },
    ]);
  };

  const handleMuteMenuPress = () => {
    setShowOptionsMenu(false);
    Alert.alert(isMuted ? 'Unmute User' : 'Mute User', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: isMuted ? 'Unmute' : 'Mute',
        onPress: async () => {
          try {
            if (isMuted) {
              await unmuteUser(userId);
              Alert.alert('Unmuted', `${profileUser?.username} is now visible in your feed.`);
            } else {
              await muteUser(userId);
              Alert.alert('Muted', `You won't see posts from ${profileUser?.username} in your feed.`);
            }
            await refreshFriendshipState();
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Could not update mute status';
            Alert.alert('Error', msg);
          }
        },
      },
    ]);
  };

  const openOptionsMenu = () => {
    setShowOptionsMenu(true);
  };

  const onMessageFriend = async () => {
    if (!friendConnected || messageBusy || isOwnProfile) return;
    setMessageBusy(true);
    try {
      const res = await createConversation(userId);
      const rootNavigation = navigation.getParent() || navigation;
      (rootNavigation as any).navigate('Messages', {
        conversationId: res.data.conversation.id,
        targetUserId: userId,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Could not open conversation';
      notify('Error', msg);
    } finally {
      setMessageBusy(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={tw`flex-1 bg-[#F3EEE4]`}>
        <BrandLoadingScreen variant="page" message="Loading profile…" manageStatusBar={false} />
      </SafeAreaView>
    );
  }

  if (!profileUser) {
    return (
      <SafeAreaView style={tw`flex-1 bg-[#F3EEE4]`}>
        <View style={tw`flex-1 items-center justify-center px-4`}>
          <Ionicons name="person-outline" size={64} color="#A8A29E" />
          <Text style={tw`text-stone-500 mt-4 text-center text-lg`}>User not found</Text>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={tw`mt-4 bg-emerald-600 px-6 py-3 rounded-xl`}
          >
            <Text style={tw`text-white font-semibold`}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`} edges={['top']}>
      <View style={tw`px-4 py-2.5 flex-row items-center border-b border-stone-200/50`}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={tw`w-10 h-10 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center mr-3`}
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={20} color="#1C1917" />
        </TouchableOpacity>
        <View style={tw`flex-1`}>
          <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
            Profile
          </Text>
          <Text style={tw`text-[17px] font-bold text-stone-900`} numberOfLines={1}>
            {profileUser.username}
          </Text>
        </View>
        <TouchableOpacity
          style={tw`w-10 h-10 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={openOptionsMenu}
          accessibilityLabel="More options"
        >
          <Ionicons name="ellipsis-horizontal" size={20} color="#57534E" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={{ paddingBottom: TAB_SCREEN_BOTTOM_PADDING }}
      >
        <View style={tw`px-5 pt-4 pb-3`}>
          <View style={tw`bg-[#FFFcf7] border border-stone-200/80 rounded-3xl px-4 pt-5 pb-4`}>
            <View style={tw`flex-row items-center mb-3`}>
              <View style={tw`w-[84px] h-[84px] rounded-full overflow-hidden mr-4 border-2 border-emerald-100 bg-[#ECFDF5]`}>
                <Image
                  source={avatarSource(
                    resolveAvatarUri(profileUser.id, profileUser.username, profileUser.avatar)
                  )}
                  style={tw`w-full h-full`}
                  contentFit="cover"
                />
              </View>
              <View style={tw`flex-1`}>
                <Text style={tw`text-2xl font-bold text-stone-900`} numberOfLines={2}>
                  {profileUser.username}
                </Text>
                {profileUser.isInstructor ? (
                  <View style={tw`flex-row items-center mt-1.5 self-start px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200`}>
                    <Ionicons name="school" size={13} color="#059669" />
                    <Text style={tw`text-xs text-emerald-800 font-semibold ml-1`}>Instructor</Text>
                    {(profileUser.endorsementsReceived || 0) > 0 ? (
                      <Text style={tw`text-xs text-emerald-700 ml-1.5`}>
                        · {profileUser.endorsementsReceived} endorsements
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>

            {profileUser.isInstructor && profileUser.teachingHeadline ? (
              <View style={tw`mb-2 px-3.5 py-3 rounded-2xl bg-emerald-50 border border-emerald-100`}>
                <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-700 uppercase`}>
                  Teaching
                </Text>
                <Text style={tw`text-[15px] text-stone-800 mt-1 leading-5`}>
                  {profileUser.teachingHeadline}
                </Text>
              </View>
            ) : null}

            {profileUser.status ? (
              <View style={tw`mb-2 px-3 py-2 rounded-2xl bg-[#EAE4D6] border border-stone-200/60`}>
                <Text style={tw`text-[13px] text-stone-800 leading-5`}>{profileUser.status}</Text>
              </View>
            ) : null}
            {profileUser.bio ? (
              <Text style={tw`text-sm text-stone-500 mb-3 leading-5`}>{profileUser.bio}</Text>
            ) : null}

            <View style={tw`flex-row bg-[#EAE4D6] border border-stone-200/70 rounded-2xl overflow-hidden mb-3.5`}>
              <View style={tw`flex-1 items-center py-2.5`}>
                <Text style={tw`text-lg font-bold text-stone-900`}>{profileUser.postsCount}</Text>
                <Text style={tw`text-xs text-stone-500 mt-0.5`}>Posts</Text>
              </View>
              <View style={tw`w-px bg-stone-200/80 my-2`} />
              <View style={tw`flex-1 items-center py-2.5`}>
                <Text style={tw`text-lg font-bold text-stone-900`}>{profileUser.storiesCount}</Text>
                <Text style={tw`text-xs text-stone-500 mt-0.5`}>Stories</Text>
              </View>
              <View style={tw`w-px bg-stone-200/80 my-2`} />
              <View style={tw`flex-1 items-center py-2.5`}>
                <Text style={tw`text-lg font-bold text-emerald-700`}>{profileUser.points}</Text>
                <Text style={tw`text-xs text-stone-500 mt-0.5`}>Points</Text>
              </View>
            </View>

            {!isOwnProfile && currentUser?.id ? (
              <View style={tw`gap-2`}>
                <View style={tw`flex-row gap-2`}>
                  <TouchableOpacity
                    onPress={() => void onToggleFriend()}
                    disabled={friendBusy}
                    style={tw`flex-1 py-3 rounded-2xl flex-row items-center justify-center gap-1.5 ${
                      friendConnected || friendRequestSent
                        ? 'bg-[#EAE4D6] border border-stone-200'
                        : friendRequestReceived
                          ? 'bg-amber-500'
                          : 'bg-emerald-600'
                    } ${friendBusy ? 'opacity-60' : ''}`}
                  >
                    {friendBusy ? (
                      <ActivityIndicator
                        color={friendConnected || friendRequestSent ? '#57534E' : '#fff'}
                      />
                    ) : (
                      <Ionicons
                        name={
                          friendConnected
                            ? 'checkmark-circle'
                            : friendRequestSent
                              ? 'time'
                              : friendRequestReceived
                                ? 'mail-open'
                                : 'person-add'
                        }
                        size={18}
                        color={friendConnected || friendRequestSent ? '#44403C' : '#fff'}
                      />
                    )}
                    <Text
                      style={tw`font-bold text-sm ${
                        friendConnected || friendRequestSent ? 'text-stone-800' : 'text-white'
                      }`}
                    >
                      {friendBusy
                        ? '…'
                        : friendConnected
                          ? 'Friends'
                          : friendRequestSent
                            ? 'Requested'
                            : friendRequestReceived
                              ? 'Accept'
                              : 'Add friend'}
                    </Text>
                  </TouchableOpacity>

                  {friendConnected ? (
                    <TouchableOpacity
                      onPress={() => void onMessageFriend()}
                      disabled={messageBusy}
                      style={tw`flex-1 py-3 rounded-2xl flex-row items-center justify-center gap-1.5 bg-emerald-600 ${
                        messageBusy ? 'opacity-60' : ''
                      }`}
                    >
                      {messageBusy ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
                      )}
                      <Text style={tw`font-bold text-sm text-white`}>
                        {profileUser.isInstructor ? 'Message coach' : 'Message'}
                      </Text>
                    </TouchableOpacity>
                  ) : profileUser.isInstructor ? (
                    <View style={tw`flex-1 py-3 rounded-2xl items-center justify-center bg-[#ECFDF5] border border-emerald-100 px-2`}>
                      <Text style={tw`text-xs font-semibold text-emerald-800 text-center`}>
                        Add friend to message coach
                      </Text>
                    </View>
                  ) : null}
                </View>

                {endorseStatus &&
                (endorseStatus.alreadyEndorsed ||
                  endorseStatus.canEndorse ||
                  (endorseStatus.sharedCategories?.length ?? 0) === 0) ? (
                  <TouchableOpacity
                    onPress={() => void onEndorse()}
                    disabled={!endorseStatus.canEndorse || endorseBusy}
                    style={tw`py-3 rounded-2xl flex-row items-center justify-center gap-1.5 ${
                      endorseStatus.alreadyEndorsed
                        ? 'bg-[#ECFDF5] border border-emerald-200'
                        : endorseStatus.canEndorse
                          ? 'bg-stone-900'
                          : 'bg-[#EAE4D6] border border-stone-200'
                    } ${endorseBusy ? 'opacity-60' : ''}`}
                  >
                    {endorseBusy ? (
                      <ActivityIndicator
                        color={endorseStatus.canEndorse ? '#fff' : '#57534E'}
                      />
                    ) : (
                      <Ionicons
                        name={endorseStatus.alreadyEndorsed ? 'ribbon' : 'ribbon-outline'}
                        size={18}
                        color={
                          endorseStatus.alreadyEndorsed
                            ? '#059669'
                            : endorseStatus.canEndorse
                              ? '#fff'
                              : '#78716C'
                        }
                      />
                    )}
                    <Text
                      style={tw`font-bold text-sm ${
                        endorseStatus.alreadyEndorsed
                          ? 'text-emerald-700'
                          : endorseStatus.canEndorse
                            ? 'text-white'
                            : 'text-stone-500'
                      }`}
                    >
                      {endorseStatus.alreadyEndorsed
                        ? 'Endorsed'
                        : endorseStatus.canEndorse
                          ? 'Endorse as instructor'
                          : !(currentUser?.categories && currentUser.categories.length > 0)
                            ? 'Add your paths to endorse'
                            : 'Paths don’t overlap yet'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>

          {!profileUser.isInstructor && endorseStatus ? (
            <View style={tw`mt-3 px-4 py-3 rounded-2xl bg-[#EAE4D6] border border-stone-200/80 flex-row items-center`}>
              <View style={tw`w-10 h-10 rounded-full bg-emerald-600/15 items-center justify-center mr-3`}>
                <Ionicons name="ribbon" size={20} color="#059669" />
              </View>
              <View style={tw`flex-1`}>
                <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
                  Instructor track
                </Text>
                <Text style={tw`text-sm text-stone-800 mt-0.5 font-medium`}>
                  {endorseStatus.endorsementCount} endorsement
                  {endorseStatus.endorsementCount === 1 ? '' : 's'}
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* Growth paths */}
        <View style={tw`px-5 pb-3`}>
          <View style={tw`bg-[#EAE4D6] border border-stone-200/80 rounded-2xl p-4`}>
            <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
              Grow!
            </Text>
            <Text style={tw`text-lg font-bold text-stone-900 mt-0.5 mb-3`}>Growth paths</Text>

            {endorseStatus && (endorseStatus.sharedCategories?.length ?? 0) > 0 ? (
              <View style={tw`mb-3`}>
                <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-700 uppercase mb-2`}>
                  Shared with you
                </Text>
                <View style={tw`flex-row flex-wrap`}>
                  {endorseStatus.sharedCategories.map((key) => (
                    <View
                      key={`shared-${key}`}
                      style={tw`bg-emerald-600 px-3 py-1.5 rounded-full mr-2 mb-2 flex-row items-center`}
                    >
                      <Ionicons name="git-compare-outline" size={12} color="#fff" style={tw`mr-1`} />
                      <Text style={tw`text-sm text-white font-semibold`}>
                        {getCategoryLabel(key)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {profileUser.categories && profileUser.categories.length > 0 ? (
              <View>
                {groupGrowthPaths(profileUser.categories).map((group) => {
                  const isShared = (endorseStatus?.sharedCategories || []).some((s) => {
                    const parent = s.includes(':') ? s.split(':')[0] : s;
                    return parent === group.parentKey || s === group.parentKey;
                  });
                  return (
                    <View
                      key={group.parentKey}
                      style={tw`flex-row items-center rounded-2xl px-3 py-3 mb-2 border ${
                        isShared
                          ? 'bg-[#ECFDF5] border-emerald-200'
                          : 'bg-[#FFFcf7] border-stone-200/70'
                      }`}
                    >
                      <View
                        style={tw`w-10 h-10 rounded-xl items-center justify-center mr-3 ${
                          isShared ? 'bg-emerald-600' : 'bg-emerald-600/12'
                        }`}
                      >
                        <Ionicons
                          name={group.icon}
                          size={20}
                          color={isShared ? '#fff' : '#059669'}
                        />
                      </View>
                      <View style={tw`flex-1`}>
                        <Text style={tw`text-[15px] font-bold text-stone-900`}>
                          {group.parentLabel}
                        </Text>
                        <Text style={tw`text-xs text-stone-500 mt-0.5`}>
                          {group.focusLabels.length > 0
                            ? group.focusLabels.join(' · ')
                            : isShared
                              ? 'Shared path with you'
                              : 'Growing here'}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={tw`text-sm text-stone-600`}>
                Paths aren’t listed yet — you can still connect and message.
              </Text>
            )}
          </View>
        </View>

        {/* Tabs */}
        <View style={tw`px-5 pt-1`}>
          <View style={tw`flex-row gap-5 border-b border-stone-200/80`}>
            {(
              [
                { key: 'posts' as const, label: 'Posts' },
                { key: 'stories' as const, label: 'Stories' },
                { key: 'journal' as const, label: 'Journal' },
              ] as const
            ).map((tab) => {
              const active = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  style={tw`pb-2.5 border-b-2 ${
                    active ? 'border-emerald-600' : 'border-transparent'
                  }`}
                >
                  <Text
                    style={tw`text-[15px] ${
                      active ? 'text-stone-900 font-bold' : 'text-stone-400 font-medium'
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
        {isBlocked ? (
          <View style={tw`p-6 items-center justify-center`}>
            <Ionicons name="ban-outline" size={48} color="#A8A29E" />
            <Text style={tw`text-stone-700 mt-3 text-center font-semibold`}>You have blocked this user</Text>
            <Text style={tw`text-stone-500 mt-1 text-center`}>
              Unblock them to view their posts, stories, and activity again.
            </Text>
          </View>
        ) : loadingContent ? (
          <View style={tw`p-8 items-center justify-center`}>
            <ActivityIndicator size="large" color="#059669" />
          </View>
        ) : activeTab === 'posts' ? (
          <ProfilePostsGrid
            posts={posts}
            emptyTitle={
              profileUser.postsCount > 0 ? 'Could not load posts' : 'No posts yet'
            }
            emptyDescription={
              profileUser.postsCount > 0
                ? 'Pull back and open this profile again to retry.'
                : 'This person has not shared a post yet. You can still add them as a friend.'
            }
            onPress={(tile) => {
              if (!profileUser) return;
              const post = posts.find((p) => p.id === tile.id);
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
                  userId: profileUser.id,
                  username: profileUser.username,
                  avatar: resolveAvatarUri(
                    profileUser.id,
                    profileUser.username,
                    profileUser.avatar
                  ),
                  image: post.image,
                  caption: post.caption,
                  category: post.category,
                  subcategory: post.subcategory,
                  likes: post.likes,
                  comments: post.comments,
                  createdAt: post.createdAt,
                  hasLiked: false,
                  reaction: null,
                },
              });
            }}
          />
        ) : activeTab === 'stories' ? (
          <View style={tw`p-4`}>
            {stories.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={tw`flex-row gap-3`}>
                  {stories.map((story) => (
                    <TouchableOpacity
                      key={story.id}
                      style={tw`items-center`}
                      onPress={() => openStoryViewer(story.id)}
                    >
                      <View style={tw`w-[72px] h-[128px] rounded-xl overflow-hidden mb-2 border-2 border-emerald-500 bg-[#EAE4D6]`}>
                        <Image
                          source={{ uri: resolveStoryDisplayUri(story.image, userId, story.id) }}
                          style={tw`w-full h-full`}
                          contentFit="contain"
                        />
                      </View>
                      <Text style={tw`text-xs text-stone-500`}>
                        {story.views} views
                      </Text>
                      <Text style={tw`text-xs text-stone-400 mt-1`}>
                        {new Date(story.createdAt).toLocaleDateString()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <EmptyState
                icon="images-outline"
                title="No stories yet"
                description="Stories from this user will appear here."
              />
            )}
          </View>
        ) : (
          <View style={tw`p-4`}>
            {journalEntries.length > 0 ? (
              journalEntries.map((entry) => (
                <View key={entry.id} style={tw`bg-[#FFFcf7] border border-stone-200/80 rounded-xl p-4 mb-3`}>
                  <View style={tw`flex-row items-center justify-between mb-2`}>
                    <Text style={tw`text-sm font-semibold text-stone-500`}>
                      {new Date(entry.date).toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </Text>
                    <View style={tw`flex-row items-center`}>
                      <Ionicons name="globe" size={16} color="#059669" />
                      <Text style={tw`text-xs text-stone-500 ml-1`}>Public</Text>
                    </View>
                  </View>
                  <Text style={tw`text-stone-900 leading-6`}>{entry.content}</Text>
                  {entry.mood && (
                    <View style={tw`mt-2 flex-row items-center`}>
                      <Ionicons name="happy-outline" size={16} color="#78716C" />
                      <Text style={tw`text-xs text-stone-500 ml-1`}>Mood: {entry.mood}</Text>
                    </View>
                  )}
                  {entry.tags && entry.tags.length > 0 && (
                    <View style={tw`flex-row flex-wrap mt-2`}>
                      {entry.tags.map((tag, index) => (
                        <View key={index} style={tw`bg-[#ECFDF5] border border-emerald-200/80 px-2 py-1 rounded-full mr-2 mb-1`}>
                          <Text style={tw`text-xs text-emerald-800`}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))
            ) : (
              <EmptyState
                icon="book-outline"
                title="No public journal entries"
                description="Public journal updates from this user will show here."
              />
            )}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showOptionsMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOptionsMenu(false)}
      >
        <View style={tw`flex-1 justify-end`}>
          <Pressable
            style={tw`absolute inset-0 bg-black/35`}
            onPress={() => setShowOptionsMenu(false)}
          />
          <View style={tw`bg-[#FFFcf7] px-4 pt-3 pb-6 rounded-t-3xl`}>
            <View style={tw`w-12 h-1.5 bg-[#EAE4D6] rounded-full self-center mb-4`} />

            {!isOwnProfile ? (
              <>
                <Pressable
                  style={tw`py-4 border-b border-[#EAE4D6]`}
                  onPress={() => void handleBlockMenuPress()}
                >
                  <Text style={tw`text-base font-semibold ${isBlocked ? 'text-stone-900' : 'text-red-600'}`}>
                    {isBlocked ? 'Unblock User' : 'Block User'}
                  </Text>
                </Pressable>

                <Pressable
                  style={tw`py-4 border-b border-[#EAE4D6]`}
                  onPress={handleReportMenuPress}
                >
                  <Text style={tw`text-base font-semibold text-stone-900`}>Report User</Text>
                </Pressable>

                <Pressable
                  style={tw`py-4 border-b border-[#EAE4D6]`}
                  onPress={handleMuteMenuPress}
                >
                  <Text style={tw`text-base font-semibold text-stone-900`}>
                    {isMuted ? 'Unmute User' : 'Mute User'}
                  </Text>
                </Pressable>
              </>
            ) : null}

            <Pressable
              style={tw`py-4 border-b border-[#EAE4D6]`}
              onPress={() => {
                setShowOptionsMenu(false);
                Alert.alert('Share Profile', `Share ${profileUser?.username}'s profile with others.`);
              }}
            >
              <Text style={tw`text-base font-semibold text-stone-900`}>Share Profile</Text>
            </Pressable>

            <Pressable
              style={tw`py-4 mt-2`}
              onPress={() => setShowOptionsMenu(false)}
            >
              <Text style={tw`text-base font-semibold text-center text-stone-500`}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

