import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import GrowImage from '../../components/ui/GrowImage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import GrowChromeHeader from '../../components/ui/GrowChromeHeader';
import EmptyState from '../../components/ui/EmptyState';
import PressableScale from '../../components/ui/PressableScale';
import FadeInUp from '../../components/ui/FadeInUp';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type ActivityNotification,
} from '../../services/api/notifications';
import { respondToEndorsementRequest } from '../../services/api/instructor';
import { getFeedPost } from '../../services/api/feed';
import { avatarSource, resolveAvatarUri, resolvePostMediaUri } from '../../utils/images';
import { stageEmoji } from '../../components/garden/seedMeta';
import { feedback } from '../../utils/interactionFeedback';
import { useRefresh } from '../../hooks/useRefresh';
import { haptic } from '../../theme/haptics';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import { alertMessage } from '../../utils/confirmDialog';
import { SHOW_CIRCLES, SHOW_SEEDS } from '../../constants/featureFlags';
import { SkeletonList } from '../../components/ui/SkeletonCard';

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

/** Rose ink for hearts / asks — scheme-aware (rose-600 lightens in dark). Call in render. */
function roseInk(): string {
  return tw.color('rose-600') ?? '#E11D48';
}

function metaForType(type: string): {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tint: string;
  chipBg: string;
  chipText: string;
  rail: string;
} {
  switch (type) {
    case 'friend_request':
    case 'friend_accepted':
      return {
        icon: 'people-outline',
        label: 'Friends',
        tint: theme.colors.brand,
        chipBg: 'bg-emerald-50',
        chipText: 'text-emerald-800',
        rail: theme.colors.brand,
      };
    case 'endorsement_received':
    case 'endorsement_accepted':
      return {
        icon: 'ribbon',
        label: 'Endorsed',
        tint: theme.colors.brand,
        chipBg: 'bg-emerald-50',
        chipText: 'text-emerald-800',
        rail: theme.colors.brand,
      };
    case 'endorsement_request':
      return {
        icon: 'ribbon-outline',
        label: 'Ask',
        tint: roseInk(),
        chipBg: 'bg-energy-50',
        chipText: 'text-rose-600',
        rail: theme.colors.energy,
      };
    case 'post_like':
      return {
        icon: 'heart',
        label: 'Like',
        tint: roseInk(),
        chipBg: 'bg-energy-50',
        chipText: 'text-rose-600',
        rail: theme.colors.energy,
      };
    case 'post_comment':
      return {
        icon: 'chatbubble',
        label: 'Comment',
        tint: theme.colors.brand,
        chipBg: 'bg-emerald-50',
        chipText: 'text-emerald-800',
        rail: theme.colors.brand,
      };
    case 'instructor_claim':
    case 'coaching_inquiry':
    case 'coaching_proposal':
    case 'coaching_accepted':
    case 'coaching_homework':
      return {
        icon: 'school',
        label: type === 'coaching_homework' ? 'Homework' : 'Coaching',
        tint: theme.colors.brand,
        chipBg: 'bg-emerald-50',
        chipText: 'text-emerald-800',
        rail: theme.colors.brand,
      };
    case 'group_join':
    case 'group_invite':
      return {
        icon: 'people',
        label: 'Circle',
        tint: theme.colors.brand,
        chipBg: 'bg-emerald-50',
        chipText: 'text-emerald-800',
        rail: theme.colors.brand,
      };
    case 'app_review':
    case 'app_review_reply':
      return {
        icon: 'chatbubble-ellipses',
        label: type === 'app_review_reply' ? 'Reply' : 'Review',
        tint: theme.colors.energy,
        chipBg: 'bg-energy-50',
        chipText: 'text-rose-600',
        rail: theme.colors.energy,
      };
    default:
      return {
        icon: 'notifications-outline',
        label: 'Grow!',
        tint: theme.colors.ink2,
        chipBg: 'bg-raised',
        chipText: 'text-ink-2',
        rail: tw.color('stone-300') ?? '#D6D3D1',
      };
  }
}

const PAGE_SIZE = 40;

function isActionableEndorseRequest(item: ActivityNotification): boolean {
  return (
    item.type === 'endorsement_request' &&
    item.ref_type === 'endorsement_request' &&
    !!item.ref_id &&
    !item.title.toLowerCase().includes('you endorsed') &&
    !item.title.toLowerCase().includes('declined')
  );
}

export default function NotificationsScreen() {
  const navigation = useNavigation();
  const [items, setItems] = useState<ActivityNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);

  const unread = useMemo(() => items.filter((n) => n.unread).length, [items]);

  const load = useCallback(async () => {
    try {
      const res = await listNotifications({ limit: PAGE_SIZE });
      setItems(res.notifications);
      setHasMore(res.notifications.length >= PAGE_SIZE);
    } catch {
      setItems([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, []);
  const refresh = useRefresh(load);
  const { refreshing } = refresh;

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMoreRef.current || loading || refreshing) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const res = await listNotifications({ limit: PAGE_SIZE, offset: items.length });
      setItems((prev) => {
        const seen = new Set(prev.map((n) => n.id));
        return [...prev, ...res.notifications.filter((n) => !seen.has(n.id))];
      });
      setHasMore(res.notifications.length >= PAGE_SIZE);
    } catch {
      /* keep what we have; a later scroll retries */
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, loading, refreshing, items.length]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const openItem = async (item: ActivityNotification) => {
    feedback.open();
    if (item.unread) {
      void markNotificationRead(item.id);
      setItems((prev) =>
        prev.map((n) =>
          n.id === item.id ? { ...n, unread: false, read_at: new Date().toISOString() } : n
        )
      );
    }

    if (item.type === 'instructor_claim') {
      navigateFromRoot(navigation, 'Individual');
      return;
    }

    if (item.ref_type === 'app_review') {
      navigateFromRoot(navigation, 'AppReviews');
      return;
    }

    // Homework (and any coaching update) opens the plan it belongs to.
    if (item.ref_type === 'coaching_contract' && item.ref_id) {
      navigateFromRoot(navigation, 'CoachingContract', { contractId: item.ref_id });
      return;
    }

    if (item.ref_type === 'growth_seed' || item.type === 'coaching_homework') {
      // Older homework notifications point at the seed. While Seeds/Garden is
      // hidden, fall back to the sender's profile instead of opening the seed.
      if (SHOW_SEEDS && item.ref_type === 'growth_seed' && item.ref_id) {
        navigateFromRoot(navigation, 'SeedDetail', { seedId: item.ref_id });
      } else if (item.actor?.id) {
        navigateFromRoot(navigation, 'PublicProfile', { userId: item.actor.id, preview: { username: item.actor.username, avatarUrl: item.actor.avatar } });
      }
      return;
    }

    if (item.ref_type === 'conversation' && item.ref_id) {
      navigateFromRoot(navigation, 'Messages', { conversationId: item.ref_id });
      return;
    }

    if (item.ref_type === 'growth_group' && item.ref_id) {
      if (SHOW_CIRCLES) navigateFromRoot(navigation, 'CircleDetail', { groupId: item.ref_id });
      else if (item.actor?.id) navigateFromRoot(navigation, 'PublicProfile', { userId: item.actor.id, preview: { username: item.actor.username, avatarUrl: item.actor.avatar } });
      return;
    }

    if (
      (item.ref_type === 'post' || item.type === 'post_like' || item.type === 'post_comment') &&
      item.ref_id
    ) {
      try {
        const remote = await getFeedPost(item.ref_id);
        if (remote) {
          const liked = !!remote.metadata?.has_liked;
          navigateFromRoot(navigation, 'PostDetail', {
            post: {
              id: remote.id,
              userId: remote.user_id,
              username: remote.metadata?.username || item.actor?.username || 'User',
              avatar: resolveAvatarUri(
                remote.user_id,
                remote.metadata?.username || item.actor?.username,
                remote.metadata?.avatar || item.actor?.avatar
              ),
              image: resolvePostMediaUri(remote.image_url, remote.category, remote.id),
              caption: remote.caption || '',
              category: remote.category,
              subcategory: remote.subcategory || undefined,
              likes: Number(remote.metadata?.likes || 0),
              comments: Number(remote.metadata?.comments || 0),
              createdAt: remote.created_at,
              hasLiked: liked,
              reaction: liked ? 'love' : null,
            },
          });
          return;
        }
      } catch {
        /* fall through */
      }
    }

    if (item.ref_type === 'user' && item.ref_id) {
      navigateFromRoot(navigation, 'PublicProfile', { userId: item.ref_id, preview: item.actor?.id === item.ref_id ? { username: item.actor.username, avatarUrl: item.actor.avatar } : undefined });
      return;
    }
    if (item.actor?.id) {
      navigateFromRoot(navigation, 'PublicProfile', { userId: item.actor.id, preview: { username: item.actor.username, avatarUrl: item.actor.avatar } });
    }
  };

  const openActorProfile = (item: ActivityNotification) => {
    feedback.open();
    if (item.actor?.id) {
      navigateFromRoot(navigation, 'PublicProfile', { userId: item.actor.id, preview: { username: item.actor.username, avatarUrl: item.actor.avatar } });
    }
  };

  const onRespondRequest = async (
    item: ActivityNotification,
    status: 'accepted' | 'declined'
  ) => {
    if (!item.ref_id || item.ref_type !== 'endorsement_request') return;
    setBusyId(item.id);
    try {
      await respondToEndorsementRequest(item.ref_id, status);
      // Accepting is an outcome worth a success; declining is a quiet state change.
      haptic(status === 'accepted' ? 'success' : 'tapLight');
      void markNotificationRead(item.id);
      setItems((prev) =>
        prev.map((n) =>
          n.id === item.id
            ? {
                ...n,
                unread: false,
                read_at: new Date().toISOString(),
                type: status === 'accepted' ? 'endorsement_accepted' : n.type,
                title:
                  status === 'accepted'
                    ? 'You endorsed them'
                    : 'You declined the endorsement request',
                body:
                  status === 'accepted'
                    ? 'They just got closer to unlocking the Instructor Hub.'
                    : null,
              }
            : n
        )
      );
    } catch (e) {
      feedback.error();
      alertMessage('Could not respond', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
      <GrowChromeHeader
        leftAccessory={
          <PressableScale
            onPress={() => navigation.goBack()}
            pressedScale={0.9}
            hitSlop={8}
            style={tw`w-9 h-9 rounded-full bg-raised border border-line/80 items-center justify-center`}
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={18} color={theme.colors.ink} />
          </PressableScale>
        }
        right={
          unread > 0 ? (
            <PressableScale
              onPress={() => {
                void markAllNotificationsRead()
                  .then(() => {
                    setItems((prev) =>
                      prev.map((n) => ({
                        ...n,
                        unread: false,
                        read_at: n.read_at || new Date().toISOString(),
                      }))
                    );
                    feedback.success();
                  })
                  .catch(() => {
                    feedback.error();
                    void alertMessage('Notifications', 'Could not mark everything as read. Try again.');
                  });
              }}
              feedback={false}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={tw`text-sm font-semibold text-emerald-700`}>Mark all read</Text>
            </PressableScale>
          ) : null
        }
      />

      <FadeInUp style={tw`px-gutter-wide pt-3 pb-4`}>
        <Text style={tw`text-caption font-semibold tracking-widest text-emerald-700 uppercase`}>
          Activity
        </Text>
        <View style={tw`flex-row items-end justify-between mt-0.5`}>
          <Text style={tw`text-display font-extrabold text-ink`}>Notifications</Text>
          {unread > 0 ? (
            <View style={tw`px-2.5 py-1 rounded-full bg-energy-600 mb-0.5`}>
              <Text style={tw`text-caption font-bold text-white`}>{unread} new</Text>
            </View>
          ) : (
            <View style={tw`px-2.5 py-1 rounded-full bg-raised mb-0.5`}>
              <Text style={tw`text-caption font-bold text-ink-2`}>Caught up</Text>
            </View>
          )}
        </View>
        <Text style={tw`text-body text-ink-3 mt-1.5`}>
          Friends, endorsement asks, and moments on your paths — respond without leaving the feed.
        </Text>
      </FadeInUp>

      {loading ? (
        <View style={tw`flex-1 px-gutter`}>
          <SkeletonList variant="notification" count={6} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={tw`px-gutter pb-28 ${items.length === 0 ? 'flex-1' : ''}`}
          refreshControl={
            <RefreshControl {...refresh} />
          }
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <View style={tw`py-4 items-center`}>
                <ActivityIndicator color={theme.colors.brand} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="notifications-outline"
              title="You’re all caught up"
              description="When someone endorses you, sends a friend request, or likes a post, it shows up here."
            />
          }
          renderItem={({ item, index }) => {
            const meta = metaForType(item.type);
            const avatar = item.actor
              ? resolveAvatarUri(item.actor.id, item.actor.username, item.actor.avatar)
              : '';
            const actionable = isActionableEndorseRequest(item);
            // Seeds/Garden is hidden: no seed preview card (the plain row still shows).
            const preview =
              !SHOW_SEEDS && item.preview?.kind === 'seed' ? null : item.preview;
            const previewImage =
              preview?.kind === 'post' && preview.image
                ? resolvePostMediaUri(preview.image)
                : '';

            // One screen-reader element per row; inner buttons become actions.
            const rowLabel = [
              item.unread ? 'Unread' : '',
              meta.label,
              item.title,
              item.body || '',
              timeAgo(item.created_at),
            ]
              .filter(Boolean)
              .join(', ');
            const rowActions = [
              ...(item.actor ? [{ name: 'profile', label: `Open ${item.actor.username} profile` }] : []),
              ...(actionable
                ? [
                    { name: 'endorse', label: 'Endorse' },
                    { name: 'decline', label: 'Not now' },
                  ]
                : []),
            ];

            return (
              <FadeInUp delay={Math.min(index, 8) * 35}>
              <PressableScale
                onPress={() => void openItem(item)}
                feedback="open"
                accessibilityRole="button"
                accessibilityLabel={rowLabel}
                accessibilityActions={rowActions}
                onAccessibilityAction={(e) => {
                  const name = e.nativeEvent.actionName;
                  if (name === 'profile') openActorProfile(item);
                  else if (name === 'endorse') void onRespondRequest(item, 'accepted');
                  else if (name === 'decline') void onRespondRequest(item, 'declined');
                }}
                style={tw`mb-3 rounded-sheet border overflow-hidden ${
                  actionable
                    ? 'bg-card border-red-200'
                    : item.unread
                      ? 'bg-card border-emerald-200/90'
                      : 'bg-card border-line/80'
                }`}
              >
                <View style={tw`flex-row`}>
                  <View
                    style={{
                      width: 5,
                      backgroundColor: actionable
                        ? theme.colors.energy
                        : item.unread
                          ? meta.rail
                          : theme.colors.line,
                    }}
                  />
                  <View style={tw`flex-1`}>
                    {actionable ? <View style={tw`h-1 bg-energy-600`} /> : null}
                    <View style={tw`p-4 flex-row items-start`}>
                      <PressableScale
                        pressedScale={0.92}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          openActorProfile(item);
                        }}
                        style={tw`relative mr-3`}
                        accessibilityLabel={
                          item.actor ? `Open ${item.actor.username} profile` : 'Profile'
                        }
                      >
                        <GrowImage
                          source={avatarSource(avatar)}
                          style={tw`w-12 h-12 rounded-full bg-raised`}
                          contentFit="cover"
                        />
                        <View
                          style={[
                            tw`absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full items-center justify-center border-2 border-card`,
                            {
                              backgroundColor:
                                meta.chipBg === 'bg-energy-50' ? theme.colors.energySoft : theme.colors.brandSoft,
                            },
                          ]}
                        >
                          <Ionicons name={meta.icon} size={12} color={meta.tint} />
                        </View>
                        {item.unread ? (
                          <View
                            style={tw`absolute -top-0.5 -left-0.5 w-2.5 h-2.5 rounded-full bg-energy-600 border-2 border-card`}
                          />
                        ) : null}
                      </PressableScale>

                      <View style={tw`flex-1`}>
                        <View style={tw`flex-row items-center justify-between mb-1.5`}>
                          <View style={tw`px-2 py-0.5 rounded-full ${meta.chipBg}`}>
                            <Text style={tw`text-caption font-bold ${meta.chipText}`}>
                              {meta.label}
                            </Text>
                          </View>
                          <Text style={tw`text-caption text-ink-3`}>
                            {timeAgo(item.created_at)}
                          </Text>
                        </View>
                        {/* Unread = bold title + dot on the avatar (not colour alone). */}
                        <Text
                          style={tw`text-body ${item.unread ? 'font-bold' : 'font-medium'} text-ink leading-5`}
                        >
                          {item.title}
                        </Text>
                        {item.body ? (
                          <Text
                            style={tw`text-sm text-ink-3 mt-1 leading-5`}
                            numberOfLines={3}
                          >
                            {item.body}
                          </Text>
                        ) : null}

                        {preview && !actionable ? (
                          <View style={tw`mt-3 flex-row items-center rounded-card overflow-hidden border border-line/80 bg-page`}>
                            {previewImage ? (
                              <GrowImage
                                source={{ uri: previewImage }}
                                style={tw`w-[72px] h-[72px] bg-raised`}
                                contentFit="cover"
                              />
                            ) : (
                              <View
                                style={tw`w-[72px] h-[72px] items-center justify-center ${
                                  preview.kind === 'seed'
                                    ? 'bg-emerald-50'
                                    : preview.kind === 'group'
                                      ? 'bg-emerald-50'
                                      : 'bg-raised'
                                }`}
                              >
                                <Text style={tw`text-2xl`}>
                                  {preview.kind === 'seed'
                                    ? stageEmoji(preview.subtitle || 'seed')
                                    : preview.kind === 'group'
                                      ? '🌿'
                                      : '👋'}
                                </Text>
                              </View>
                            )}
                            <View style={tw`flex-1 px-3 py-2.5`}>
                              <Text style={tw`text-caption font-bold tracking-widest text-ink-3 uppercase`}>
                                {preview.kind === 'post'
                                  ? 'Post'
                                  : preview.kind === 'seed'
                                    ? 'Seed'
                                    : preview.kind === 'group'
                                      ? 'Circle'
                                      : 'Person'}
                              </Text>
                              <Text
                                style={tw`text-sm font-semibold text-ink mt-0.5`}
                                numberOfLines={2}
                              >
                                {preview.title}
                              </Text>
                            </View>
                          </View>
                        ) : null}

                        {actionable ? (
                          <View
                            style={tw`mt-3.5 rounded-card overflow-hidden border border-red-200 bg-energy-50`}
                          >
                            <View style={tw`p-3`}>
                              <View style={tw`flex-row items-center mb-1`}>
                                <Ionicons name="ribbon" size={14} color={roseInk()} />
                                <Text
                                  style={tw`text-caption font-semibold tracking-widest text-rose-600 uppercase ml-1.5`}
                                >
                                  Endorsement ask
                                </Text>
                              </View>
                              <Text style={tw`text-sm text-ink-2 mt-1 leading-5`}>
                                They share a growth path with you. One tap helps unlock their
                                Instructor Hub — peer trust, no purchase.
                              </Text>
                              <View style={tw`flex-row gap-2 mt-3`}>
                                <PressableScale
                                  onPress={() => void onRespondRequest(item, 'accepted')}
                                  disabled={busyId === item.id}
                                  style={tw`flex-1 py-3 rounded-control bg-emerald-600 items-center flex-row justify-center gap-1.5 ${
                                    busyId === item.id ? 'opacity-60' : ''
                                  }`}
                                >
                                  <Ionicons name="ribbon" size={16} color="#FFFFFF" />
                                  <Text style={tw`text-white font-bold text-sm`}>Endorse</Text>
                                </PressableScale>
                                <PressableScale
                                  onPress={() => void onRespondRequest(item, 'declined')}
                                  disabled={busyId === item.id}
                                  style={tw`px-4 py-3 rounded-control bg-card border border-line items-center`}
                                >
                                  <Text style={tw`text-ink-2 font-semibold text-sm`}>
                                    Not now
                                  </Text>
                                </PressableScale>
                              </View>
                            </View>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </View>
                </View>
              </PressableScale>
              </FadeInUp>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
