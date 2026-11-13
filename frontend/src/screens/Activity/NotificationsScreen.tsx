import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
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
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import { alertMessage } from '../../utils/confirmDialog';
import { SHOW_CIRCLES, SHOW_SEEDS } from '../../constants/featureFlags';

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
        tint: '#059669',
        chipBg: 'bg-emerald-50',
        chipText: 'text-emerald-800',
        rail: '#059669',
      };
    case 'endorsement_received':
    case 'endorsement_accepted':
      return {
        icon: 'ribbon',
        label: 'Endorsed',
        tint: '#059669',
        chipBg: 'bg-emerald-50',
        chipText: 'text-emerald-800',
        rail: '#059669',
      };
    case 'endorsement_request':
      return {
        icon: 'ribbon-outline',
        label: 'Ask',
        tint: '#E11D48',
        chipBg: 'bg-[#FFF1F0]',
        chipText: 'text-[#E11D48]',
        rail: '#F97066',
      };
    case 'post_like':
      return {
        icon: 'heart',
        label: 'Like',
        tint: '#E11D48',
        chipBg: 'bg-[#FFF1F0]',
        chipText: 'text-[#E11D48]',
        rail: '#F97066',
      };
    case 'post_comment':
      return {
        icon: 'chatbubble',
        label: 'Comment',
        tint: '#059669',
        chipBg: 'bg-emerald-50',
        chipText: 'text-emerald-800',
        rail: '#059669',
      };
    case 'instructor_claim':
    case 'coaching_inquiry':
    case 'coaching_proposal':
    case 'coaching_accepted':
    case 'coaching_homework':
      return {
        icon: 'school',
        label: type === 'coaching_homework' ? 'Homework' : 'Coaching',
        tint: '#059669',
        chipBg: 'bg-emerald-50',
        chipText: 'text-emerald-800',
        rail: '#059669',
      };
    case 'group_join':
    case 'group_invite':
      return {
        icon: 'people',
        label: 'Circle',
        tint: '#059669',
        chipBg: 'bg-emerald-50',
        chipText: 'text-emerald-800',
        rail: '#059669',
      };
    case 'app_review':
    case 'app_review_reply':
      return {
        icon: 'chatbubble-ellipses',
        label: type === 'app_review_reply' ? 'Reply' : 'Review',
        tint: '#F97066',
        chipBg: 'bg-[#FFF1F0]',
        chipText: 'text-[#E11D48]',
        rail: '#F97066',
      };
    default:
      return {
        icon: 'notifications-outline',
        label: 'Grow!',
        tint: '#57534E',
        chipBg: 'bg-[#EAE4D6]',
        chipText: 'text-stone-700',
        rail: '#D6D3D1',
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
  const [refreshing, setRefreshing] = useState(false);
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
      setRefreshing(false);
    }
  }, []);

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
        navigateFromRoot(navigation, 'PublicProfile', { userId: item.actor.id });
      }
      return;
    }

    if (item.ref_type === 'conversation' && item.ref_id) {
      navigateFromRoot(navigation, 'Messages', { conversationId: item.ref_id });
      return;
    }

    if (item.ref_type === 'growth_group' && item.ref_id) {
      if (SHOW_CIRCLES) navigateFromRoot(navigation, 'CircleDetail', { groupId: item.ref_id });
      else if (item.actor?.id) navigateFromRoot(navigation, 'PublicProfile', { userId: item.actor.id });
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
      navigateFromRoot(navigation, 'PublicProfile', { userId: item.ref_id });
      return;
    }
    if (item.actor?.id) {
      navigateFromRoot(navigation, 'PublicProfile', { userId: item.actor.id });
    }
  };

  const openActorProfile = (item: ActivityNotification) => {
    feedback.open();
    if (item.actor?.id) {
      navigateFromRoot(navigation, 'PublicProfile', { userId: item.actor.id });
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
      feedback.success();
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
    <SafeAreaView style={tw`flex-1 bg-surface-page`} edges={['top']}>
      <GrowChromeHeader
        leftAccessory={
          <Pressable
            onPress={() => navigation.goBack()}
            style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={18} color="#1C1917" />
          </Pressable>
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
            >
              <Text style={tw`text-sm font-semibold text-emerald-700`}>Mark all read</Text>
            </PressableScale>
          ) : null
        }
      />

      <FadeInUp style={tw`px-5 pt-3 pb-4`}>
        <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-700 uppercase`}>
          Activity
        </Text>
        <View style={tw`flex-row items-end justify-between mt-0.5`}>
          <Text style={tw`text-[28px] font-bold text-stone-900 leading-8`}>Notifications</Text>
          {unread > 0 ? (
            <View style={tw`px-2.5 py-1 rounded-full bg-energy-600 mb-0.5`}>
              <Text style={tw`text-[11px] font-bold text-white`}>{unread} new</Text>
            </View>
          ) : (
            <View style={tw`px-2.5 py-1 rounded-full bg-[#EAE4D6] mb-0.5`}>
              <Text style={tw`text-[11px] font-bold text-stone-600`}>Caught up</Text>
            </View>
          )}
        </View>
        <Text style={tw`text-sm text-stone-500 mt-1.5 leading-5`}>
          Friends, endorsement asks, and moments on your paths — respond without leaving the feed.
        </Text>
      </FadeInUp>

      {loading ? (
        <View style={tw`flex-1 items-center justify-center`}>
          <ActivityIndicator color="#059669" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={tw`px-4 pb-28 ${items.length === 0 ? 'flex-1' : ''}`}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor="#059669"
            />
          }
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <View style={tw`py-4 items-center`}>
                <ActivityIndicator color="#059669" />
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

            return (
              <FadeInUp delay={Math.min(index, 8) * 35}>
              <PressableScale
                onPress={() => void openItem(item)}
                feedback="open"
                style={tw`mb-3 rounded-[22px] border overflow-hidden ${
                  actionable
                    ? 'bg-[#FFFcf7] border-[#FECACA]'
                    : item.unread
                      ? 'bg-[#FFFcf7] border-emerald-200/90'
                      : 'bg-[#FFFcf7] border-stone-200/80'
                }`}
              >
                <View style={tw`flex-row`}>
                  <View
                    style={{
                      width: 5,
                      backgroundColor: actionable
                        ? '#F97066'
                        : item.unread
                          ? meta.rail
                          : '#E7E5E4',
                    }}
                  />
                  <View style={tw`flex-1`}>
                    {actionable ? <View style={tw`h-1 bg-energy-600`} /> : null}
                    <View style={tw`px-3.5 py-3.5 flex-row items-start`}>
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation?.();
                          openActorProfile(item);
                        }}
                        style={tw`relative mr-3`}
                        accessibilityLabel={
                          item.actor ? `Open ${item.actor.username} profile` : 'Profile'
                        }
                      >
                        <Image
                          source={avatarSource(avatar)}
                          style={tw`w-12 h-12 rounded-full bg-[#EAE4D6]`}
                          contentFit="cover"
                        />
                        <View
                          style={[
                            tw`absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full items-center justify-center border-2 border-[#FFFcf7]`,
                            {
                              backgroundColor:
                                meta.tint === '#E11D48' ? '#FFF1F0' : '#ECFDF5',
                            },
                          ]}
                        >
                          <Ionicons name={meta.icon} size={12} color={meta.tint} />
                        </View>
                        {item.unread ? (
                          <View
                            style={tw`absolute -top-0.5 -left-0.5 w-2.5 h-2.5 rounded-full bg-energy-600 border-2 border-[#FFFcf7]`}
                          />
                        ) : null}
                      </Pressable>

                      <View style={tw`flex-1`}>
                        <View style={tw`flex-row items-center justify-between mb-1.5`}>
                          <View style={tw`px-2 py-0.5 rounded-full ${meta.chipBg}`}>
                            <Text style={tw`text-[10px] font-bold ${meta.chipText}`}>
                              {meta.label}
                            </Text>
                          </View>
                          <Text style={tw`text-[11px] text-stone-400`}>
                            {timeAgo(item.created_at)}
                          </Text>
                        </View>
                        <Text style={tw`text-[15px] font-semibold text-stone-900 leading-5`}>
                          {item.title}
                        </Text>
                        {item.body ? (
                          <Text
                            style={tw`text-sm text-stone-500 mt-1 leading-5`}
                            numberOfLines={3}
                          >
                            {item.body}
                          </Text>
                        ) : null}

                        {preview && !actionable ? (
                          <View style={tw`mt-3 flex-row items-center rounded-2xl overflow-hidden border border-stone-200/80 bg-[#F3EEE4]`}>
                            {previewImage ? (
                              <Image
                                source={{ uri: previewImage }}
                                style={tw`w-[72px] h-[72px] bg-[#EAE4D6]`}
                                contentFit="cover"
                              />
                            ) : (
                              <View
                                style={tw`w-[72px] h-[72px] items-center justify-center ${
                                  preview.kind === 'seed'
                                    ? 'bg-emerald-50'
                                    : preview.kind === 'group'
                                      ? 'bg-emerald-50'
                                      : 'bg-[#EAE4D6]'
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
                              <Text style={tw`text-[10px] font-bold tracking-widest text-stone-400 uppercase`}>
                                {preview.kind === 'post'
                                  ? 'Post'
                                  : preview.kind === 'seed'
                                    ? 'Seed'
                                    : preview.kind === 'group'
                                      ? 'Circle'
                                      : 'Person'}
                              </Text>
                              <Text
                                style={tw`text-sm font-semibold text-stone-900 mt-0.5`}
                                numberOfLines={2}
                              >
                                {preview.title}
                              </Text>
                            </View>
                          </View>
                        ) : null}

                        {actionable ? (
                          <View
                            style={tw`mt-3.5 rounded-2xl overflow-hidden border border-[#FECACA] bg-[#FFF1F0]`}
                          >
                            <View style={tw`px-3.5 py-3`}>
                              <View style={tw`flex-row items-center mb-1`}>
                                <Ionicons name="ribbon" size={14} color="#E11D48" />
                                <Text
                                  style={tw`text-[11px] font-semibold tracking-widest text-[#E11D48] uppercase ml-1.5`}
                                >
                                  Endorsement ask
                                </Text>
                              </View>
                              <Text style={tw`text-sm text-stone-700 mt-1 leading-5`}>
                                They share a growth path with you. One tap helps unlock their
                                Instructor Hub — peer trust, no purchase.
                              </Text>
                              <View style={tw`flex-row gap-2 mt-3`}>
                                <PressableScale
                                  onPress={() => void onRespondRequest(item, 'accepted')}
                                  disabled={busyId === item.id}
                                  feedback="success"
                                  style={tw`flex-1 py-3 rounded-xl bg-emerald-600 items-center flex-row justify-center gap-1.5 ${
                                    busyId === item.id ? 'opacity-60' : ''
                                  }`}
                                >
                                  <Ionicons name="ribbon" size={16} color="#fff" />
                                  <Text style={tw`text-white font-bold text-sm`}>Endorse</Text>
                                </PressableScale>
                                <PressableScale
                                  onPress={() => void onRespondRequest(item, 'declined')}
                                  disabled={busyId === item.id}
                                  feedback="tap"
                                  style={tw`px-4 py-3 rounded-xl bg-white border border-stone-200 items-center`}
                                >
                                  <Text style={tw`text-stone-700 font-semibold text-sm`}>
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
