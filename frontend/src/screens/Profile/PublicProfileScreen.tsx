import React, { useState, useEffect, useRef } from 'react';
import {
  Animated,
  View,
  Text,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useAuth } from '../../store/hooks';
import { getCategoryLabel, groupGrowthPaths } from '../../utils/categoryLabels';
import tw, { theme } from '../../lib/tw';
import { iconSize } from '../../theme/icons';
import ErrorState from '../../components/ui/ErrorState';
import ProfileHeaderSkeleton from '../../components/profile/ProfileHeaderSkeleton';
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
import { isVideoPostMedia, reelCoverUri } from '../../utils/reelCover';
import { getUserStories, type StoryItem } from '../../services/api/stories';
import { resolveAvatarUri, resolveStoryDisplayUri, resolvePostMediaUri, avatarSource } from '../../utils/images';
import { getPublicProfile, type PublicProfileSummary } from '../../services/api/profile';
import { getUserPublicJournalEntries } from '../../services/api/journal';
import { createConversation } from '../../services/api/messages';
import {
  endorseCandidate,
  getEndorsementStatus,
  requestEndorsement,
  respondToEndorsementRequest,
  type EndorsementStatus,
} from '../../services/api/instructor';
import InstructorOfferCard from '../../components/instructor/InstructorOfferCard';
import { StarRow } from '../../components/instructor/StarRating';
import { openCoachingReachOut } from '../../utils/coachingReachOut';
import { TAB_SCREEN_BOTTOM_PADDING } from '../../constants/scroll';
import EmptyState from '../../components/ui/EmptyState';
import ProfilePostsGrid from '../../components/profile/ProfilePostsGrid';
import { alertMessage } from '../../utils/confirmDialog';
import { toast } from '../../state/useToastStore';
import ShareCardSheet, { type ShareCardPayload } from '../../components/share/ShareCardSheet';
import { feedback } from '../../utils/interactionFeedback';
import { useRefresh } from '../../hooks/useRefresh';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { haptic } from '../../theme/haptics';
import { spring } from '../../theme/motion';
import PressableScale from '../../components/ui/PressableScale';
import BadgeRow from '../../components/badges/BadgeRow';
import LevelPill from '../../components/badges/LevelPill';
import { getUserBadges, type GrowthLevel } from '../../services/api/growth';

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
  isVideo?: boolean;
  cover?: string;
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
    preview?: { username?: string; displayName?: string; avatarUrl?: string | null };
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
    isVideo: isVideoPostMedia(p),
    cover: reelCoverUri(p.metadata as Record<string, unknown> | null | undefined) || undefined,
    hasLiked: !!p.metadata?.has_liked,
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
  const { userId, preview } = route.params;
  
  const [loading, setLoading] = useState(true);
  const [profileUser, setProfileUser] = useState<PublicUser | null>(null);
  const [activeTab, setActiveTab] = useState<'posts' | 'stories' | 'journal'>('posts');
  const [posts, setPosts] = useState<Post[]>([]);
  const [sourcePosts, setSourcePosts] = useState<FeedPost[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [loadingContent, setLoadingContent] = useState(false);
  const [friendConnected, setFriendConnected] = useState(false);
  const friendMorph = useRef(new Animated.Value(1)).current;
  const reducedMotion = useReducedMotion();
  const [friendRequestSent, setFriendRequestSent] = useState(false);
  const [friendRequestReceived, setFriendRequestReceived] = useState(false);
  const [friendBusy, setFriendBusy] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [messageBusy, setMessageBusy] = useState(false);
  const [endorseStatus, setEndorseStatus] = useState<EndorsementStatus | null>(null);
  const [endorseBusy, setEndorseBusy] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [sharePayload, setSharePayload] = useState<ShareCardPayload | null>(null);
  const [profileError, setProfileError] = useState<'not_found' | 'error' | null>(null);
  const [publicBadges, setPublicBadges] = useState<{
    earned: { id: string; earned_at: string }[];
    level: GrowthLevel | null;
  } | null>(null);
  // Latest route userId; responses for a previous user are ignored.
  const currentUserIdRef = useRef(userId);
  currentUserIdRef.current = userId;

  const isOwnProfile = currentUser?.id === userId;

  // Reload profile shell + first tab content together when route user changes.
  useEffect(() => {
    setPosts([]);
    setStories([]);
    setJournalEntries([]);
    void loadProfile();
    void prefetchPrimaryContent();
  }, [userId]);

  // Level + earned badges (public). Endpoint may 404 until deployed — hide quietly.
  useEffect(() => {
    let alive = true;
    setPublicBadges(null);
    getUserBadges(userId)
      .then((res) => {
        if (!alive || !res) return;
        setPublicBadges({
          earned: Array.isArray(res.earned) ? res.earned : [],
          level: res.level && typeof res.level.points === 'number' ? res.level : null,
        });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
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
      feedback.success();
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
              pendingIncoming: false,
              canRequestEndorsement: false,
            }
          : prev
      );
      toast.success(`Endorsed ${profileUser?.username ?? 'them'} · points earned`);
    } catch (e) {
      feedback.error();
      alertMessage('Could not endorse', e instanceof Error ? e.message : 'Try again later');
    } finally {
      setEndorseBusy(false);
    }
  };

  const onRequestEndorsement = async () => {
    if (requestBusy || !endorseStatus?.canRequestEndorsement) return;
    setRequestBusy(true);
    try {
      await requestEndorsement(userId);
      feedback.send();
      setEndorseStatus((prev) =>
        prev
          ? { ...prev, canRequestEndorsement: false, pendingOutgoing: true }
          : prev
      );
      toast.success('Endorsement request sent');
    } catch (e) {
      feedback.error();
      alertMessage('Could not request', e instanceof Error ? e.message : 'Try again later');
    } finally {
      setRequestBusy(false);
    }
  };

  const onRespondIncomingRequest = async (status: 'accepted' | 'declined') => {
    if (!endorseStatus?.pendingIncomingRequestId || endorseBusy) return;
    setEndorseBusy(true);
    try {
      await respondToEndorsementRequest(endorseStatus.pendingIncomingRequestId, status);
      feedback.success();
      setEndorseStatus((prev) =>
        prev
          ? {
              ...prev,
              canEndorse: status === 'accepted' ? false : prev.canEndorse,
              alreadyEndorsed: status === 'accepted' ? true : prev.alreadyEndorsed,
              pendingIncoming: false,
              pendingIncomingRequestId: null,
              endorsementCount:
                status === 'accepted'
                  ? (prev.endorsementCount || 0) + 1
                  : prev.endorsementCount,
            }
          : prev
      );
      if (status === 'accepted') toast.success(`You endorsed ${profileUser?.username ?? 'them'}`);
      else toast.info('Declined · they won’t be notified');
    } catch (e) {
      feedback.error();
      alertMessage('Could not respond', e instanceof Error ? e.message : 'Try again');
    } finally {
      setEndorseBusy(false);
    }
  };

  /**
   * Handles friend request send/cancel/accept and remove-friend actions.
   * Optimistic: the button label morphs immediately; the server call runs
   * behind it and the previous state is restored (with an alert) on failure.
   */
  const onToggleFriend = async () => {
    if (friendBusy || isOwnProfile) return;
    if (isBlocked) {
      void alertMessage('Blocked user', 'Unblock this user before connecting.');
      return;
    }
    const prev = {
      connected: friendConnected,
      sent: friendRequestSent,
      received: friendRequestReceived,
    };
    const morph = () => {
      friendMorph.setValue(reducedMotion ? 1 : 0.86);
      spring(friendMorph, 1, 'snappy', reducedMotion).start();
    };
    const rollback = () => {
      if (currentUserIdRef.current !== userId) return;
      setFriendConnected(prev.connected);
      setFriendRequestSent(prev.sent);
      setFriendRequestReceived(prev.received);
      morph();
    };
    setFriendBusy(true);
    try {
      if (prev.connected || prev.sent) {
        // Remove friend / cancel request.
        haptic('selection');
        setFriendConnected(false);
        setFriendRequestSent(false);
        if (prev.connected) setFriendRequestReceived(false);
        morph();
        await removeFriend(userId);
        toast.success(prev.connected ? 'Removed from friends' : 'Request cancelled');
      } else {
        haptic('tapLight');
        // They'd asked us → accepting connects; otherwise we're now "Requested".
        setFriendConnected(prev.received);
        setFriendRequestSent(!prev.received);
        setFriendRequestReceived(false);
        morph();
        const result = await addFriend(userId);
        if (currentUserIdRef.current === userId) {
          setFriendConnected(result.connected);
          setFriendRequestSent(result.requestSent);
        }
        if (result.connected) {
          toast.success(`You and ${profileUser?.username ?? 'they'} are friends`);
        } else {
          toast.success('Friend request sent');
        }
      }
    } catch (e) {
      rollback();
      feedback.error();
      const msg = e instanceof Error ? e.message : 'Could not update connection';
      void alertMessage('Couldn’t update', msg);
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
  const loadProfile = async (opts?: { silent?: boolean }) => {
    const requestedId = userId;
    try {
      if (!opts?.silent) setLoading(true);
      const userData = await getPublicProfile(requestedId);
      if (currentUserIdRef.current !== requestedId) return;
      setProfileUser(userData);
      setProfileError(null);
    } catch (error) {
      if (currentUserIdRef.current !== requestedId) return;
      console.error('Error loading profile:', error);
      const msg = error instanceof Error ? error.message : '';
      // request() errors carry only a message; the backend 404 says "User not found".
      const notFound = /not found|\(404\)/i.test(msg);
      setProfileError(notFound ? 'not_found' : 'error');
      // Keep showing an already-loaded profile when a refresh fails for a network reason.
      if (notFound || !opts?.silent) setProfileUser(null);
    } finally {
      if (currentUserIdRef.current === requestedId) setLoading(false);
    }
  };

  const refresh = useRefresh(() =>
    Promise.all([
      loadProfile({ silent: true }),
      activeTab === 'posts' ? prefetchPrimaryContent() : loadContent(),
    ])
  );

  /** Prefetch posts while profile metadata loads so the grid appears faster. */
  const prefetchPrimaryContent = async () => {
    if (isBlocked) return;
    const requestedId = userId;
    try {
      setLoadingContent(true);
      const { cards, raw } = await fetchUserPosts(requestedId);
      if (currentUserIdRef.current !== requestedId) return;
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
    
    const requestedId = userId;
    const stale = () => currentUserIdRef.current !== requestedId;
    try {
      setLoadingContent(true);
      if (activeTab === 'posts') {
        const { cards, raw } = await fetchUserPosts(requestedId);
        if (stale()) return;
        setSourcePosts(raw);
        setPosts(cards);
      } else if (activeTab === 'stories') {
        const userStories = await fetchUserStories(requestedId);
        if (stale()) return;
        setStories(userStories);
      } else if (activeTab === 'journal') {
        const entries = await fetchPublicJournalEntries(requestedId);
        if (stale()) return;
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
    void alertMessage(title, message);
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
        toast.success(`${username} unblocked`);
      } else {
        await blockUser(userId);
        setPosts([]);
        setStories([]);
        setJournalEntries([]);
        toast.success(`${username} blocked`);
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
            toast.success('Thanks — we’ll review your report');
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Could not submit report';
            void alertMessage('Error', msg);
          }
        },
      },
      {
        text: 'Harassment',
        onPress: async () => {
          try {
            await reportUser(userId, 'harassment');
            toast.success('Thanks — we’ll review your report');
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Could not submit report';
            void alertMessage('Error', msg);
          }
        },
      },
      {
        text: 'Inappropriate Content',
        onPress: async () => {
          try {
            await reportUser(userId, 'inappropriate_content');
            toast.success('Thanks — we’ll review your report');
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Could not submit report';
            void alertMessage('Error', msg);
          }
        },
      },
      {
        text: 'Other',
        onPress: async () => {
          try {
            await reportUser(userId, 'other');
            toast.success('Thanks — we’ll review your report');
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Could not submit report';
            void alertMessage('Error', msg);
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
              toast.success(`Unmuted ${profileUser?.username ?? ''}`.trim());
            } else {
              await muteUser(userId);
              toast.success(`Muted ${profileUser?.username ?? ''}`.trim());
            }
            await refreshFriendshipState();
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Could not update mute status';
            void alertMessage('Error', msg);
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

  const onReachOut = async () => {
    if (messageBusy || isOwnProfile || !profileUser) return;
    setMessageBusy(true);
    try {
      await openCoachingReachOut(
        navigation,
        userId,
        `Hi ${profileUser.username} — I’d like to talk about a coaching plan.`
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Could not reach this instructor';
      notify('Error', msg);
    } finally {
      setMessageBusy(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
        <ProfileHeaderSkeleton
          preview={
            preview && (preview.username || preview.displayName)
              ? {
                  name: (preview.username || preview.displayName)!,
                  avatarUri: resolveAvatarUri(userId, preview.username, preview.avatarUrl),
                }
              : null
          }
          onBack={
            <PressableScale
              onPress={() => navigation.goBack()}
              style={tw`w-10 h-10 rounded-full bg-raised border border-line/80 items-center justify-center mr-3`}
              accessibilityRole="button"
              accessibilityLabel="Back"
              pressedScale={0.9}
              hitSlop={8}
            >
              <Ionicons name="arrow-back" size={20} color={theme.colors.ink} />
            </PressableScale>
          }
        />
      </SafeAreaView>
    );
  }

  if (!profileUser) {
    const failed = profileError === 'error';
    return (
      <SafeAreaView style={tw`flex-1 bg-page`}>
        <View style={tw`flex-1 items-center justify-center px-4`}>
          {failed ? (
            <ErrorState
              title="Couldn’t load this profile"
              onRetry={() => {
                void loadProfile();
                void prefetchPrimaryContent();
              }}
              style={tw`py-0`}
            />
          ) : (
            <>
              <Ionicons name="person-outline" size={64} color={theme.colors.iconMuted} />
              <Text style={tw`text-ink-2 mt-4 text-center text-lg`}>User not found</Text>
            </>
          )}
          <PressableScale
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            style={tw`mt-4 px-6 py-3 rounded-control ${failed ? 'bg-raised' : 'bg-emerald-600'}`}
          >
            <Text style={tw`font-semibold ${failed ? 'text-stone-800' : 'text-white'}`}>Go Back</Text>
          </PressableScale>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
      <View style={tw`px-gutter py-2.5 flex-row items-center border-b border-line/50`}>
        <PressableScale
          onPress={() => navigation.goBack()}
          style={tw`w-10 h-10 rounded-full bg-raised border border-line/80 items-center justify-center mr-3`}
          accessibilityLabel="Back"
          pressedScale={0.9}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={20} color={theme.colors.ink} />
        </PressableScale>
        <View style={tw`flex-1`}>
          <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase`}>
            Profile
          </Text>
          <Text style={tw`text-callout font-bold text-ink`} numberOfLines={1}>
            {profileUser.username}
          </Text>
        </View>
        <PressableScale
          style={tw`w-10 h-10 rounded-full bg-raised border border-line/80 items-center justify-center`}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={openOptionsMenu}
          accessibilityLabel="More options"
          pressedScale={0.9}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={theme.colors.ink2} />
        </PressableScale>
      </View>

      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={{ paddingBottom: TAB_SCREEN_BOTTOM_PADDING }}
        refreshControl={
          <RefreshControl {...refresh} />
        }
      >
        <View style={tw`px-gutter-wide pt-4 pb-3`}>
          <View style={tw`bg-card border border-line/80 rounded-sheet px-4 pt-5 pb-4`}>
            <View style={tw`flex-row items-center mb-3`}>
              <View style={tw`w-[84px] h-[84px] rounded-full overflow-hidden mr-4 border-2 border-emerald-100 bg-emerald-50`}>
                <Image
                  source={avatarSource(
                    resolveAvatarUri(profileUser.id, profileUser.username, profileUser.avatar)
                  )}
                  style={tw`w-full h-full`}
                  contentFit="cover"
                />
              </View>
              <View style={tw`flex-1`}>
                <Text style={tw`text-2xl font-bold text-ink`} numberOfLines={2}>
                  {profileUser.username}
                </Text>
                {profileUser.isInstructor ? (
                  <View style={tw`flex-row items-center mt-1.5 self-start px-2.5 py-1 rounded-chip bg-emerald-50 border border-emerald-200`}>
                    <Ionicons name="school" size={13} color="#059669" />
                    <Text style={tw`text-xs text-emerald-800 font-semibold ml-1`}>Instructor</Text>
                    {(profileUser.endorsementsReceived || 0) > 0 ? (
                      <Text style={tw`text-xs text-emerald-700 ml-1.5`}>
                        · {profileUser.endorsementsReceived} endorsements
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                {publicBadges?.level && !isBlocked ? (
                  <View style={tw`mt-1.5`}>
                    <LevelPill level={publicBadges.level} />
                  </View>
                ) : null}
              </View>
            </View>

            {publicBadges && publicBadges.earned.length > 0 && !isBlocked ? (
              <View style={tw`mb-3`}>
                <BadgeRow earned={publicBadges.earned} showLocked={false} onPress={null} />
              </View>
            ) : null}

            {profileUser.isInstructor && profileUser.teachingHeadline ? (
              <View style={tw`mb-2 px-3.5 py-3 rounded-card bg-emerald-50 border border-emerald-100`}>
                <Text style={tw`text-caption font-semibold tracking-widest text-emerald-700 uppercase`}>
                  Teaching
                </Text>
                <Text style={tw`text-body text-stone-800 mt-1 leading-5`}>
                  {profileUser.teachingHeadline}
                </Text>
              </View>
            ) : null}

            {profileUser.isInstructor ? (
              <InstructorOfferCard
                offer={profileUser.offering}
                completedPlans={profileUser.completedPlans || 0}
                endorsements={profileUser.endorsementsReceived || 0}
                rating={profileUser.rating}
              />
            ) : profileUser.followThrough && profileUser.followThrough.count > 0 ? (
              <View style={tw`mb-3 px-3.5 py-3 rounded-card bg-card border border-line/80`}>
                <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase`}>
                  Follow-through
                </Text>
                <View style={tw`flex-row items-center mt-1.5`}>
                  <StarRow value={profileUser.followThrough.avg} />
                  <Text style={tw`text-xs text-ink-3 ml-1.5`}>
                    {profileUser.followThrough.avg} · {profileUser.followThrough.count} coach
                    {profileUser.followThrough.count === 1 ? '' : 'es'}
                  </Text>
                </View>
                <Text style={tw`text-xs text-ink-3 mt-1`}>
                  Rated by instructors after 4 completed weeks.
                </Text>
              </View>
            ) : null}

            {profileUser.isInstructor && (profileUser.testimonials || []).length > 0 ? (
              <View style={tw`mb-3`}>
                <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-2`}>
                  From clients
                </Text>
                {profileUser.testimonials!.map((t) => (
                  <View
                    key={t.id}
                    style={tw`mb-2 px-3.5 py-3 rounded-card bg-card border border-line/80`}
                  >
                    <View style={tw`flex-row items-center justify-between`}>
                      <Text style={tw`font-semibold text-ink`}>{t.reviewer.username}</Text>
                      <StarRow value={t.stars} size={12} />
                    </View>
                    {t.body ? (
                      <Text style={tw`text-footnote text-ink-2 mt-1.5 leading-5`}>{t.body}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : profileUser.isInstructor ? (
              <Text style={tw`text-xs text-ink-3 mb-3`}>
                Client reviews appear after 4 completed weeks together.
              </Text>
            ) : null}

            {profileUser.status ? (
              <View style={tw`mb-2 px-3 py-2 rounded-card bg-raised border border-line/60`}>
                <Text style={tw`text-footnote text-stone-800 leading-5`}>{profileUser.status}</Text>
              </View>
            ) : null}
            {profileUser.bio ? (
              <Text style={tw`text-sm text-ink-3 mb-3 leading-5`}>{profileUser.bio}</Text>
            ) : null}

            <View style={tw`flex-row bg-raised border border-line/70 rounded-card overflow-hidden mb-3.5`}>
              <View style={tw`flex-1 items-center py-2.5`}>
                <Text style={tw`text-lg font-bold text-ink`}>{profileUser.postsCount}</Text>
                <Text style={tw`text-xs text-ink-3 mt-0.5`}>Posts</Text>
              </View>
              <View style={tw`w-px bg-line/80 my-2`} />
              <View style={tw`flex-1 items-center py-2.5`}>
                <Text style={tw`text-lg font-bold text-ink`}>{profileUser.storiesCount}</Text>
                <Text style={tw`text-xs text-ink-3 mt-0.5`}>Stories</Text>
              </View>
              <View style={tw`w-px bg-line/80 my-2`} />
              <View style={tw`flex-1 items-center py-2.5`}>
                <Text style={tw`text-lg font-bold text-emerald-700`}>
                  {profileUser.isInstructor
                    ? profileUser.completedPlans || 0
                    : profileUser.points}
                </Text>
                <Text style={tw`text-xs text-ink-3 mt-0.5`}>
                  {profileUser.isInstructor ? 'Plans' : 'Points'}
                </Text>
              </View>
            </View>

            {!isOwnProfile && currentUser?.id ? (
              <View style={tw`gap-2`}>
                <View style={tw`flex-row gap-2`}>
                  <PressableScale
                    onPress={() => void onToggleFriend()}
                    disabled={friendBusy}
                    style={tw`flex-1 py-3 rounded-card flex-row items-center justify-center gap-1.5 ${
                      friendConnected || friendRequestSent
                        ? 'bg-raised border border-line'
                        : friendRequestReceived
                          ? 'bg-amber-500'
                          : 'bg-emerald-600'
                    }`}
                  >
                    <Animated.View
                      style={[tw`flex-row items-center gap-1.5`, { transform: [{ scale: friendMorph }] }]}
                    >
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
                        size={iconSize.sm}
                        color={friendConnected || friendRequestSent ? theme.colors.ink2 : '#fff'}
                      />
                      <Text
                        style={tw`font-bold text-sm ${
                          friendConnected || friendRequestSent ? 'text-stone-800' : 'text-white'
                        }`}
                      >
                        {friendConnected
                            ? 'Friends'
                            : friendRequestSent
                              ? 'Requested'
                              : friendRequestReceived
                                ? 'Accept'
                                : 'Add friend'}
                      </Text>
                    </Animated.View>
                  </PressableScale>

                  {profileUser.isInstructor &&
                  profileUser.offering?.accepting === false &&
                  !friendConnected ? (
                    <View
                      accessibilityState={{ disabled: true }}
                      style={tw`flex-1 py-3 rounded-card flex-row items-center justify-center gap-1.5 bg-raised border border-line/80`}
                    >
                      <Ionicons name="pause-circle-outline" size={iconSize.sm} color={theme.colors.ink3} />
                      <Text style={tw`font-bold text-sm text-ink-3`}>Not taking plans</Text>
                    </View>
                  ) : profileUser.isInstructor && profileUser.offering?.accepting !== false ? (
                    <PressableScale
                      onPress={() => void onReachOut()}
                      disabled={messageBusy}
                      style={tw`flex-1 py-3 rounded-card flex-row items-center justify-center gap-1.5 bg-emerald-600 ${
                        messageBusy ? 'opacity-60' : ''
                      }`}
                    >
                      {messageBusy ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Ionicons name="chatbubble-ellipses" size={iconSize.sm} color="#fff" />
                      )}
                      <Text style={tw`font-bold text-sm text-white`}>Reach out</Text>
                    </PressableScale>
                  ) : friendConnected ? (
                    <PressableScale
                      onPress={() => void onMessageFriend()}
                      disabled={messageBusy}
                      style={tw`flex-1 py-3 rounded-card flex-row items-center justify-center gap-1.5 bg-emerald-600 ${
                        messageBusy ? 'opacity-60' : ''
                      }`}
                    >
                      {messageBusy ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Ionicons name="chatbubble-ellipses" size={iconSize.sm} color="#fff" />
                      )}
                      <Text style={tw`font-bold text-sm text-white`}>Message</Text>
                    </PressableScale>
                  ) : null}
                </View>

                {endorseStatus?.pendingIncoming && endorseStatus.pendingIncomingRequestId ? (
                  <View
                    style={tw`rounded-sheet overflow-hidden border border-red-200 bg-card`}
                  >
                    <View style={tw`h-1.5 bg-energy-600`} />
                    <View style={tw`px-4 py-3.5`}>
                      <View style={tw`flex-row items-center mb-1`}>
                        <Ionicons name="ribbon" size={iconSize.xs} color={tw.color('rose-600')} />
                        <Text
                          style={tw`text-caption font-semibold tracking-widest text-rose-600 uppercase ml-1.5`}
                        >
                          Endorsement ask
                        </Text>
                      </View>
                      <Text style={tw`text-body font-semibold text-ink mt-0.5`}>
                        They asked for your endorsement
                      </Text>
                      <Text style={tw`text-sm text-ink-2 mt-1.5 leading-5`}>
                        Peer trust unlocks their Instructor Hub — no purchase. Shared paths below.
                      </Text>
                      {(endorseStatus.sharedCategories?.length ?? 0) > 0 ? (
                        <View style={tw`flex-row flex-wrap gap-1.5 mt-3`}>
                          {endorseStatus.sharedCategories.slice(0, 3).map((key) => (
                            <View
                              key={`ask-shared-${key}`}
                              style={tw`px-2.5 py-1 rounded-chip bg-energy-50 border border-red-200`}
                            >
                              <Text style={tw`text-caption font-semibold text-rose-600`}>
                                {getCategoryLabel(key)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                      <View style={tw`flex-row gap-2 mt-3.5`}>
                        <PressableScale
                          onPress={() => void onRespondIncomingRequest('accepted')}
                          disabled={endorseBusy}
                          feedback={false}
                          style={tw`flex-1 py-3 rounded-control flex-row items-center justify-center gap-1.5 bg-emerald-600 ${
                            endorseBusy ? 'opacity-60' : ''
                          }`}
                        >
                          {endorseBusy ? (
                            <ActivityIndicator color="#fff" />
                          ) : (
                            <Ionicons name="ribbon" size={iconSize.sm} color="#fff" />
                          )}
                          <Text style={tw`font-bold text-sm text-white`}>Endorse</Text>
                        </PressableScale>
                        <PressableScale
                          onPress={() => void onRespondIncomingRequest('declined')}
                          disabled={endorseBusy}
                          feedback={false}
                          style={tw`px-4 py-3 rounded-control bg-raised border border-line items-center justify-center`}
                        >
                          <Text style={tw`font-semibold text-sm text-ink-2`}>Not now</Text>
                        </PressableScale>
                      </View>
                    </View>
                  </View>
                ) : endorseStatus &&
                  (endorseStatus.alreadyEndorsed ||
                    endorseStatus.canEndorse ||
                    (endorseStatus.sharedCategories?.length ?? 0) === 0) ? (
                  <View
                    style={tw`rounded-sheet overflow-hidden border ${
                      endorseStatus.alreadyEndorsed
                        ? 'border-emerald-200 bg-emerald-50'
                        : endorseStatus.canEndorse
                          ? 'border-ink bg-card'
                          : 'border-line bg-raised'
                    }`}
                  >
                    <View style={tw`px-4 py-3.5`}>
                      <Text
                        style={tw`text-caption font-semibold tracking-widest uppercase ${
                          endorseStatus.alreadyEndorsed || endorseStatus.canEndorse
                            ? 'text-emerald-700'
                            : 'text-ink-3'
                        }`}
                      >
                        {endorseStatus.alreadyEndorsed
                          ? 'Peer trust'
                          : endorseStatus.canEndorse
                            ? 'You can endorse'
                            : 'Endorsement'}
                      </Text>
                      <Text style={tw`text-sm text-ink-2 mt-1 leading-5 mb-3`}>
                        {endorseStatus.alreadyEndorsed
                          ? 'You’ve already backed them on a shared path.'
                          : endorseStatus.canEndorse
                            ? 'Your endorsement helps unlock their Instructor Hub.'
                            : !(currentUser?.categories && currentUser.categories.length > 0)
                              ? 'Add growth paths on your profile to endorse peers.'
                              : 'You need an overlapping growth path to endorse.'}
                      </Text>
                      <PressableScale
                        onPress={() => void onEndorse()}
                        disabled={!endorseStatus.canEndorse || endorseBusy}
                        feedback={false}
                        style={tw`py-3 rounded-control flex-row items-center justify-center gap-1.5 ${
                          endorseStatus.alreadyEndorsed
                            ? 'bg-card border border-emerald-200'
                            : endorseStatus.canEndorse
                              ? 'bg-ink'
                              : 'bg-card/70 border border-line'
                        } ${endorseBusy ? 'opacity-60' : ''}`}
                      >
                        {endorseBusy ? (
                          <ActivityIndicator
                            color={endorseStatus.canEndorse ? theme.colors.page : theme.colors.ink2}
                          />
                        ) : (
                          <Ionicons
                            name={endorseStatus.alreadyEndorsed ? 'ribbon' : 'ribbon-outline'}
                            size={iconSize.sm}
                            color={
                              endorseStatus.alreadyEndorsed
                                ? '#059669'
                                : endorseStatus.canEndorse
                                  ? theme.colors.page
                                  : theme.colors.ink3
                            }
                          />
                        )}
                        <Text
                          style={tw`font-bold text-sm ${
                            endorseStatus.alreadyEndorsed
                              ? 'text-emerald-700'
                              : endorseStatus.canEndorse
                                ? 'text-page'
                                : 'text-ink-3'
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
                      </PressableScale>
                    </View>
                  </View>
                ) : null}

                {endorseStatus?.canRequestEndorsement || endorseStatus?.pendingOutgoing ? (
                  <View
                    style={tw`rounded-sheet overflow-hidden border ${
                      endorseStatus.pendingOutgoing
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-emerald-600/50 bg-card'
                    }`}
                  >
                    <View
                      style={tw`h-1.5 ${
                        endorseStatus.pendingOutgoing ? 'bg-emerald-500' : 'bg-emerald-600'
                      }`}
                    />
                    <View style={tw`px-4 py-3.5`}>
                      <View style={tw`flex-row items-center mb-1`}>
                        <Ionicons
                          name={endorseStatus.pendingOutgoing ? 'time-outline' : 'ribbon-outline'}
                          size={iconSize.xs}
                          color="#059669"
                        />
                        <Text
                          style={tw`text-caption font-semibold tracking-widest text-emerald-700 uppercase ml-1.5`}
                        >
                          {endorseStatus.pendingOutgoing
                            ? 'Request pending'
                            : 'Ask for endorsement'}
                        </Text>
                      </View>
                      <Text style={tw`text-body font-semibold text-ink mt-0.5`}>
                        {endorseStatus.pendingOutgoing
                          ? 'Waiting on their response'
                          : `Ask ${profileUser?.username ?? 'them'} to endorse you`}
                      </Text>
                      <Text style={tw`text-sm text-ink-2 mt-1.5 leading-5`}>
                        {endorseStatus.pendingOutgoing
                          ? 'They’ll see a structured ask in Notifications and can endorse with one tap.'
                          : 'Sends a notification — not a cold DM. Peer trust unlocks your Instructor Hub.'}
                      </Text>
                      {(endorseStatus.sharedCategories?.length ?? 0) > 0 ? (
                        <View style={tw`flex-row flex-wrap gap-1.5 mt-3`}>
                          {endorseStatus.sharedCategories.slice(0, 3).map((key) => (
                            <View
                              key={`req-shared-${key}`}
                              style={tw`px-2.5 py-1 rounded-chip bg-emerald-50 border border-emerald-100`}
                            >
                              <Text style={tw`text-caption font-semibold text-emerald-800`}>
                                {getCategoryLabel(key)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                      <PressableScale
                        onPress={() => void onRequestEndorsement()}
                        disabled={!endorseStatus.canRequestEndorsement || requestBusy}
                        feedback={false}
                        style={tw`mt-3.5 py-3 rounded-control flex-row items-center justify-center gap-1.5 ${
                          endorseStatus.pendingOutgoing
                            ? 'bg-card border border-emerald-200'
                            : 'bg-emerald-600'
                        } ${requestBusy ? 'opacity-60' : ''}`}
                      >
                        {requestBusy ? (
                          <ActivityIndicator
                            color={endorseStatus.pendingOutgoing ? '#059669' : '#fff'}
                          />
                        ) : (
                          <Ionicons
                            name={
                              endorseStatus.pendingOutgoing ? 'time-outline' : 'paper-plane-outline'
                            }
                            size={iconSize.sm}
                            color={endorseStatus.pendingOutgoing ? '#059669' : '#fff'}
                          />
                        )}
                        <Text
                          style={tw`font-bold text-sm ${
                            endorseStatus.pendingOutgoing ? 'text-emerald-700' : 'text-white'
                          }`}
                        >
                          {endorseStatus.pendingOutgoing
                            ? 'Waiting on them'
                            : 'Send endorsement ask'}
                        </Text>
                      </PressableScale>
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          {!profileUser.isInstructor && endorseStatus ? (
            <View style={tw`mt-3 px-4 py-3 rounded-card bg-raised border border-line/80 flex-row items-center`}>
              <View style={tw`w-10 h-10 rounded-full bg-emerald-600/15 items-center justify-center mr-3`}>
                <Ionicons name="ribbon" size={20} color="#059669" />
              </View>
              <View style={tw`flex-1`}>
                <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase`}>
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
        <View style={tw`px-gutter-wide pb-3`}>
          <View style={tw`bg-raised border border-line/80 rounded-card p-4`}>
            <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase`}>
              Grow!
            </Text>
            <Text style={tw`text-lg font-bold text-ink mt-0.5 mb-3`}>Growth paths</Text>

            {endorseStatus && (endorseStatus.sharedCategories?.length ?? 0) > 0 ? (
              <View style={tw`mb-3`}>
                <Text style={tw`text-caption font-semibold tracking-widest text-emerald-700 uppercase mb-2`}>
                  Shared with you
                </Text>
                <View style={tw`flex-row flex-wrap`}>
                  {endorseStatus.sharedCategories.map((key) => (
                    <View
                      key={`shared-${key}`}
                      style={tw`bg-emerald-600 px-3 py-1.5 rounded-chip mr-2 mb-2 flex-row items-center`}
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
                      style={tw`flex-row items-center rounded-card px-3 py-3 mb-2 border ${
                        isShared
                          ? 'bg-emerald-50 border-emerald-200'
                          : 'bg-card border-line/70'
                      }`}
                    >
                      <View
                        style={tw`w-10 h-10 rounded-control items-center justify-center mr-3 ${
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
                        <Text style={tw`text-body font-bold text-ink`}>
                          {group.parentLabel}
                        </Text>
                        <Text style={tw`text-xs text-ink-3 mt-0.5`}>
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
              <Text style={tw`text-sm text-ink-2`}>
                Paths aren’t listed yet — you can still connect and message.
              </Text>
            )}
          </View>
        </View>

        {/* Tabs */}
        <View style={tw`px-gutter-wide pt-1`}>
          <View style={tw`flex-row gap-5 border-b border-line/80`}>
            {(
              [
                { key: 'posts' as const, label: 'Posts' },
                { key: 'stories' as const, label: 'Stories' },
                { key: 'journal' as const, label: 'Journal' },
              ] as const
            ).map((tab) => {
              const active = activeTab === tab.key;
              return (
                <PressableScale
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  style={tw`pb-2.5 border-b-2 ${
                    active ? 'border-emerald-600' : 'border-transparent'
                  }`}
                >
                  <Text
                    style={tw`text-body ${
                      active ? 'text-ink font-bold' : 'text-ink-3 font-medium'
                    }`}
                  >
                    {tab.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </View>

        {/* Content */}
        {isBlocked ? (
          <View style={tw`p-6 items-center justify-center`}>
            <Ionicons name="ban-outline" size={48} color={theme.colors.iconMuted} />
            <Text style={tw`text-ink-2 mt-3 text-center font-semibold`}>You have blocked this user</Text>
            <Text style={tw`text-ink-3 mt-1 text-center`}>
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
                  hasLiked: !!post.hasLiked,
                  reaction: post.hasLiked ? 'love' : null,
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
                    <PressableScale
                      key={story.id}
                      style={tw`items-center`}
                      onPress={() => openStoryViewer(story.id)}
                    >
                      <View style={tw`w-[72px] h-[128px] rounded-control overflow-hidden mb-2 border-2 border-emerald-500 bg-raised`}>
                        <Image
                          source={{ uri: resolveStoryDisplayUri(story.image, userId, story.id) }}
                          style={tw`w-full h-full`}
                          contentFit="contain"
                        />
                      </View>
                      <Text style={tw`text-xs text-ink-3`}>
                        {story.views} views
                      </Text>
                      <Text style={tw`text-xs text-ink-3 mt-1`}>
                        {new Date(story.createdAt).toLocaleDateString()}
                      </Text>
                    </PressableScale>
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
                <View key={entry.id} style={tw`bg-card border border-line/80 rounded-control p-4 mb-3`}>
                  <View style={tw`flex-row items-center justify-between mb-2`}>
                    <Text style={tw`text-sm font-semibold text-ink-3`}>
                      {new Date(entry.date).toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </Text>
                    <View style={tw`flex-row items-center`}>
                      <Ionicons name="globe" size={16} color="#059669" />
                      <Text style={tw`text-xs text-ink-3 ml-1`}>Public</Text>
                    </View>
                  </View>
                  <Text style={tw`text-ink leading-6`}>{entry.content}</Text>
                  {entry.mood && (
                    <View style={tw`mt-2 flex-row items-center`}>
                      <Ionicons name="happy-outline" size={16} color={theme.colors.ink3} />
                      <Text style={tw`text-xs text-ink-3 ml-1`}>Mood: {entry.mood}</Text>
                    </View>
                  )}
                  {entry.tags && entry.tags.length > 0 && (
                    <View style={tw`flex-row flex-wrap mt-2`}>
                      {entry.tags.map((tag, index) => (
                        <View key={index} style={tw`bg-emerald-50 border border-emerald-200/80 px-2 py-1 rounded-chip mr-2 mb-1`}>
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
          <View style={tw`bg-card px-4 pt-3 pb-6 rounded-t-sheet`}>
            <View style={tw`w-12 h-1.5 bg-raised rounded-full self-center mb-4`} />

            {!isOwnProfile ? (
              <>
                <PressableScale
                  accessibilityRole="button"
                  style={tw`py-4 border-b border-line`}
                  onPress={() => void handleBlockMenuPress()}
                >
                  <Text style={tw`text-base font-semibold ${isBlocked ? 'text-ink' : 'text-red-600'}`}>
                    {isBlocked ? 'Unblock User' : 'Block User'}
                  </Text>
                </PressableScale>

                <PressableScale
                  accessibilityRole="button"
                  style={tw`py-4 border-b border-line`}
                  onPress={handleReportMenuPress}
                >
                  <Text style={tw`text-base font-semibold text-ink`}>Report User</Text>
                </PressableScale>

                <PressableScale
                  accessibilityRole="button"
                  style={tw`py-4 border-b border-line`}
                  onPress={handleMuteMenuPress}
                >
                  <Text style={tw`text-base font-semibold text-ink`}>
                    {isMuted ? 'Unmute User' : 'Mute User'}
                  </Text>
                </PressableScale>
              </>
            ) : null}

            <PressableScale
              accessibilityRole="button"
              style={tw`py-4 border-b border-line`}
              onPress={() => {
                setShowOptionsMenu(false);
                if (!profileUser) return;
                setSharePayload({
                  kind: 'profile',
                  userId: profileUser.id,
                  username: profileUser.username,
                  avatar: profileUser.avatar,
                  isInstructor: profileUser.isInstructor,
                  teachingHeadline: profileUser.teachingHeadline,
                  categories: profileUser.categories,
                  points: profileUser.points,
                  endorsements: profileUser.endorsementsReceived,
                });
              }}
            >
              <Text style={tw`text-base font-semibold text-ink`}>Share profile card</Text>
            </PressableScale>

            <PressableScale
              accessibilityRole="button"
              style={tw`py-4 mt-2`}
              onPress={() => setShowOptionsMenu(false)}
            >
              <Text style={tw`text-base font-semibold text-center text-ink-3`}>Cancel</Text>
            </PressableScale>
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

