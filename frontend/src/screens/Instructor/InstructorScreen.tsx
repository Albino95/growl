import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../store/hooks';
import {
  claimInstructor,
  getInstructorEligibility,
  getInstructorHub,
  respondToPartnershipRequest,
  updateInstructorPartnership,
  type InstructorEligibility,
  type InstructorEndorser,
  type InstructorHub,
  type InstructorPartnership,
  type InstructorPartnershipRequest,
} from '../../services/api/instructor';
import { createConversation } from '../../services/api/messages';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import { getCategoryLabel } from '../../utils/categoryLabels';
import { TAB_SCREEN_BOTTOM_PADDING } from '../../constants/scroll';
import GrowChromeHeader from '../../components/ui/GrowChromeHeader';
import tw from '../../lib/tw';

type HubTab = 'overview' | 'community' | 'partnerships';

function formatMoney(n: number) {
  return `$${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function AvatarBubble({
  avatar,
  name,
  size = 40,
}: {
  avatar?: string | null;
  name: string;
  size?: number;
}) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  if (avatar && (avatar.startsWith('http') || avatar.startsWith('data:'))) {
    return (
      <Image
        source={{ uri: avatar }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }
  return (
    <View
      style={[
        tw`bg-[#EAE4D6] items-center justify-center border border-stone-200/80`,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      {avatar && avatar.length <= 4 ? (
        <Text style={{ fontSize: size * 0.45 }}>{avatar}</Text>
      ) : (
        <Text style={tw`font-bold text-stone-700`}>{initial}</Text>
      )}
    </View>
  );
}

function StatCell({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={tw`flex-1 py-3`}>
      <Text style={tw`text-xl font-bold text-stone-900`}>{value}</Text>
      <Text style={tw`text-[11px] text-stone-500 mt-0.5 uppercase tracking-wide`}>{label}</Text>
    </View>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}) {
  return (
    <View style={tw`py-10 px-4 items-center`}>
      <View style={tw`w-12 h-12 rounded-full bg-[#EAE4D6] items-center justify-center mb-3`}>
        <Ionicons name={icon} size={22} color="#57534E" />
      </View>
      <Text style={tw`text-base font-semibold text-stone-900 text-center`}>{title}</Text>
      <Text style={tw`text-sm text-stone-500 text-center mt-1 leading-5`}>{description}</Text>
    </View>
  );
}

function partnershipTerms(p: {
  partnership_type: string;
  commission_rate: number | null;
  fixed_fee: number | null;
}) {
  if (p.partnership_type === 'commission') {
    return `${p.commission_rate ?? 0}% commission`;
  }
  if (p.partnership_type === 'fixed') {
    return `${formatMoney(p.fixed_fee ?? 0)} fixed fee`;
  }
  return `${p.commission_rate ?? 0}% + ${formatMoney(p.fixed_fee ?? 0)}`;
}

export default function InstructorScreen({ navigation }: any) {
  const { user, updateUser, refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<HubTab>('overview');
  const [eligibility, setEligibility] = useState<InstructorEligibility | null>(null);
  const [hub, setHub] = useState<InstructorHub | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadEligibility = useCallback(async () => {
    try {
      const elig = await getInstructorEligibility();
      setEligibility(elig);
    } catch {
      setEligibility(null);
    }
  }, []);

  const loadHub = useCallback(async () => {
    try {
      const data = await getInstructorHub();
      setHub(data);
    } catch {
      setHub(null);
    }
  }, []);

  const reload = useCallback(async () => {
    if (!user?.isInstructor) {
      setLoading(true);
      await loadEligibility();
      setLoading(false);
      return;
    }
    setLoading(true);
    await loadHub();
    setLoading(false);
  }, [user?.isInstructor, loadEligibility, loadHub]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    if (user?.isInstructor) await loadHub();
    else await loadEligibility();
    setRefreshing(false);
  };

  const onClaim = async () => {
    if (!eligibility?.canClaim || claimBusy) return;
    const ok = await confirmAsync(
      'Become an instructor?',
      'You have enough peer endorsements and posts. Claiming unlocks the Instructor Hub.',
      { confirmLabel: 'Claim instructor' }
    );
    if (!ok) return;
    setClaimBusy(true);
    try {
      const result = await claimInstructor();
      updateUser({ isInstructor: true });
      await refreshProfile();
      setEligibility(result);
      await loadHub();
      alertMessage('Welcome', 'You’re an instructor. Your hub is ready.');
    } catch (e) {
      alertMessage('Could not claim', e instanceof Error ? e.message : 'Try again');
    } finally {
      setClaimBusy(false);
    }
  };

  const openProfile = (userId: string) => {
    navigateFromRoot(navigation, 'PublicProfile', { userId });
  };

  const openMessages = (targetUserId?: string) => {
    navigateFromRoot(navigation, 'Messages', targetUserId ? { targetUserId } : undefined);
  };

  const messageEndorser = async (person: InstructorEndorser) => {
    if (!person.is_friend) {
      openProfile(person.id);
      return;
    }
    setBusyId(person.id);
    try {
      const res = await createConversation(person.id);
      navigateFromRoot(navigation, 'Messages', {
        conversationId: res.data.conversation.id,
        targetUserId: person.id,
      });
    } catch (e) {
      alertMessage('Could not open chat', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusyId(null);
    }
  };

  const onRespondRequest = async (
    req: InstructorPartnershipRequest,
    status: 'approved' | 'declined'
  ) => {
    const label = status === 'approved' ? 'Accept' : 'Decline';
    const ok = await confirmAsync(
      `${label} partnership?`,
      `${req.business_name} offered ${partnershipTerms(req)}.`,
      { confirmLabel: label, destructive: status === 'declined' }
    );
    if (!ok) return;
    setBusyId(req.id);
    try {
      await respondToPartnershipRequest(req.id, status);
      await loadHub();
    } catch (e) {
      alertMessage('Error', e instanceof Error ? e.message : 'Could not update request');
    } finally {
      setBusyId(null);
    }
  };

  const onUpdatePartnership = async (
    p: InstructorPartnership,
    status: 'active' | 'paused' | 'ended'
  ) => {
    const labels = { active: 'reactivate', paused: 'pause', ended: 'end' } as const;
    const ok = await confirmAsync(
      'Update partnership',
      `Are you sure you want to ${labels[status]} your partnership with ${p.business_name}?`,
      { confirmLabel: labels[status], destructive: status === 'ended' }
    );
    if (!ok) return;
    setBusyId(p.id);
    try {
      await updateInstructorPartnership(p.id, status);
      await loadHub();
    } catch (e) {
      alertMessage('Error', e instanceof Error ? e.message : 'Could not update partnership');
    } finally {
      setBusyId(null);
    }
  };

  if (!user?.isInstructor) {
    return (
      <SafeAreaView style={tw`flex-1 bg-surface-page`} edges={['top']}>
        <GrowChromeHeader
          leftAccessory={
            <Pressable
              onPress={() => navigation.goBack?.() || navigation.navigate('Profile')}
              style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={18} color="#1C1917" />
            </Pressable>
          }
        />
        <ScrollView
          contentContainerStyle={[tw`px-5 pt-4`, { paddingBottom: TAB_SCREEN_BOTTOM_PADDING }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor="#059669" />
          }
        >
          <Text style={tw`text-lg font-bold text-stone-900`}>Instructor Hub</Text>
          <Text style={tw`text-sm text-stone-500 mt-1 leading-5 mb-6`}>
            Peers in your growth areas endorse you. Hit the bar, then claim access — no purchase
            required.
          </Text>

          {loading ? (
            <ActivityIndicator color="#059669" style={tw`mt-8`} />
          ) : eligibility ? (
            <View style={tw`border-t border-stone-200/80 pt-5`}>
              <Text style={tw`text-sm text-stone-500 mb-1`}>
                Endorsements {eligibility.endorsementsReceived}/{eligibility.endorsementsNeeded}
              </Text>
              <View style={tw`h-1.5 bg-stone-200/80 rounded-full mb-5 overflow-hidden`}>
                <View
                  style={[
                    tw`h-full bg-emerald-600`,
                    {
                      width: `${Math.min(
                        (eligibility.endorsementsReceived / eligibility.endorsementsNeeded) * 100,
                        100
                      )}%`,
                    },
                  ]}
                />
              </View>
              <Text style={tw`text-sm text-stone-500 mb-1`}>
                Posts {eligibility.postCount}/{eligibility.postsNeeded}
              </Text>
              <View style={tw`h-1.5 bg-stone-200/80 rounded-full mb-6 overflow-hidden`}>
                <View
                  style={[
                    tw`h-full bg-emerald-600`,
                    {
                      width: `${Math.min(
                        (eligibility.postCount / Math.max(eligibility.postsNeeded, 1)) * 100,
                        100
                      )}%`,
                    },
                  ]}
                />
              </View>
              {eligibility.canClaim ? (
                <TouchableOpacity
                  onPress={() => void onClaim()}
                  disabled={claimBusy}
                  style={tw`bg-emerald-700 rounded-xl py-3.5 items-center ${claimBusy ? 'opacity-60' : ''}`}
                >
                  <Text style={tw`text-white font-bold`}>
                    {claimBusy ? 'Claiming…' : 'Claim instructor status'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View>
                  <Text style={tw`text-sm text-stone-500 leading-5 mb-4`}>
                    Keep sharing progress and ask people in your categories to endorse you from your
                    public profile.
                  </Text>
                  <TouchableOpacity
                    onPress={() => navigateFromRoot(navigation, 'Post')}
                    style={tw`flex-row items-center justify-center py-3 border border-stone-200/80 rounded-xl bg-white/60`}
                  >
                    <Ionicons name="create-outline" size={18} color="#059669" />
                    <Text style={tw`text-emerald-700 font-semibold ml-2`}>Create a post</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : (
            <Text style={tw`text-center text-stone-500 mt-6`}>
              Could not load eligibility. Pull to refresh.
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const stats = hub?.stats;
  const tabs: { key: HubTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'community', label: `Community${stats?.endorsers ? ` · ${stats.endorsers}` : ''}` },
    {
      key: 'partnerships',
      label: `Partners${
        stats?.pending_requests
          ? ` · ${stats.pending_requests}`
          : stats?.active_partnerships
            ? ` · ${stats.active_partnerships}`
            : ''
      }`,
    },
  ];

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`} edges={['top']}>
      <GrowChromeHeader
        leftAccessory={
          <Pressable
            onPress={() => navigation.goBack?.() || navigation.navigate('Profile')}
            style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={18} color="#1C1917" />
          </Pressable>
        }
        right={
          <>
            <Pressable
              onPress={() => openMessages()}
              style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
              accessibilityLabel="Messages"
            >
              <Ionicons name="chatbubbles-outline" size={17} color="#059669" />
            </Pressable>
            <Pressable
              onPress={() => navigateFromRoot(navigation, 'Post')}
              style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
              accessibilityLabel="Create post"
            >
              <Ionicons name="create-outline" size={17} color="#059669" />
            </Pressable>
          </>
        }
      />

      <View style={tw`px-5 pt-3 pb-1`}>
        <Text style={tw`text-lg font-bold text-stone-900`}>Instructor Hub</Text>
        <Text style={tw`text-sm text-stone-500 mt-0.5 leading-5`}>
          Community, partnerships, and your teaching presence.
        </Text>
      </View>

      <View style={tw`flex-row px-5 mt-3 border-b border-stone-200/80`}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={tw`mr-5 pb-2.5 border-b-2 ${
              activeTab === tab.key ? 'border-emerald-600' : 'border-transparent'
            }`}
          >
            <Text
              style={tw`text-sm font-semibold ${
                activeTab === tab.key ? 'text-emerald-700' : 'text-stone-500'
              }`}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && !hub ? (
        <View style={tw`flex-1 items-center justify-center`}>
          <ActivityIndicator color="#059669" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: TAB_SCREEN_BOTTOM_PADDING, paddingTop: 8 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor="#059669" />
          }
        >
          {activeTab === 'overview' && stats ? (
            <View style={tw`px-5 pt-2`}>
              <View style={tw`flex-row border-b border-stone-200/80`}>
                <StatCell label="Points" value={stats.points} />
                <StatCell label="Endorsements" value={stats.endorsements} />
                <StatCell label="Posts" value={stats.posts} />
              </View>
              <View style={tw`flex-row border-b border-stone-200/80`}>
                <StatCell label="Partners" value={stats.active_partnerships} />
                <StatCell label="Pending" value={stats.pending_requests} />
                <StatCell label="Referrals" value={stats.referral_orders} />
              </View>

              {stats.referral_revenue > 0 ? (
                <View style={tw`py-4 border-b border-stone-200/80`}>
                  <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
                    Attributed sales
                  </Text>
                  <Text style={tw`text-2xl font-bold text-stone-900 mt-1`}>
                    {formatMoney(stats.referral_revenue)}
                  </Text>
                  <Text style={tw`text-sm text-stone-500 mt-0.5`}>
                    From partnership referrals across your brands
                  </Text>
                </View>
              ) : null}

              <Text
                style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mt-5 mb-2`}
              >
                Shortcuts
              </Text>
              {[
                {
                  icon: 'person-outline' as const,
                  label: 'View public profile',
                  subtitle: 'Where peers endorse you',
                  onPress: () => user?.id && openProfile(user.id),
                },
                {
                  icon: 'create-outline' as const,
                  label: 'Share progress',
                  subtitle: 'Post to your growth areas',
                  onPress: () => navigateFromRoot(navigation, 'Post'),
                },
                {
                  icon: 'chatbubbles-outline' as const,
                  label: 'Messages',
                  subtitle: 'Coach friends in your network',
                  onPress: () => openMessages(),
                },
                {
                  icon: 'people-outline' as const,
                  label: 'Community',
                  subtitle: `${stats.endorsers} people endorsed you`,
                  onPress: () => setActiveTab('community'),
                },
                {
                  icon: 'briefcase-outline' as const,
                  label: 'Partnerships',
                  subtitle:
                    stats.pending_requests > 0
                      ? `${stats.pending_requests} request${stats.pending_requests === 1 ? '' : 's'} waiting`
                      : `${stats.active_partnerships} active`,
                  onPress: () => setActiveTab('partnerships'),
                },
              ].map((item, i, arr) => (
                <TouchableOpacity
                  key={item.label}
                  onPress={item.onPress}
                  style={tw`flex-row items-center py-3.5 ${
                    i < arr.length - 1 ? 'border-b border-stone-200/80' : ''
                  }`}
                >
                  <View style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] items-center justify-center mr-3`}>
                    <Ionicons name={item.icon} size={18} color="#57534E" />
                  </View>
                  <View style={tw`flex-1 pr-2`}>
                    <Text style={tw`font-semibold text-stone-900`}>{item.label}</Text>
                    <Text style={tw`text-xs text-stone-500 mt-0.5`}>{item.subtitle}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#A8A29E" />
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {activeTab === 'community' ? (
            <View style={tw`px-5 pt-2`}>
              <Text style={tw`text-sm text-stone-500 mb-3 leading-5`}>
                People who endorsed you in shared growth areas. Connect as friends to message them.
              </Text>
              {!hub?.endorsers?.length ? (
                <EmptyState
                  icon="people-outline"
                  title="No endorsers yet"
                  description="Share your public profile so peers in your categories can endorse you."
                />
              ) : (
                hub.endorsers.map((person, i) => (
                  <View
                    key={person.id}
                    style={tw`flex-row items-center py-3.5 ${
                      i < hub.endorsers.length - 1 ? 'border-b border-stone-200/80' : ''
                    }`}
                  >
                    <TouchableOpacity onPress={() => openProfile(person.id)}>
                      <AvatarBubble avatar={person.avatar} name={person.username} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => openProfile(person.id)}
                      style={tw`flex-1 ml-3 pr-2`}
                    >
                      <Text style={tw`font-semibold text-stone-900`}>{person.username}</Text>
                      <Text style={tw`text-xs text-stone-500 mt-0.5`} numberOfLines={1}>
                        {(person.categories || []).slice(0, 2).map(getCategoryLabel).join(' · ') ||
                          `${person.points} pts`}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => void messageEndorser(person)}
                      disabled={busyId === person.id}
                      style={tw`px-3 py-1.5 rounded-full border border-stone-200/80 bg-white/60`}
                    >
                      <Text style={tw`text-xs font-semibold text-emerald-700`}>
                        {busyId === person.id
                          ? '…'
                          : person.is_friend
                            ? 'Message'
                            : 'Profile'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          ) : null}

          {activeTab === 'partnerships' ? (
            <View style={tw`px-5 pt-2`}>
              {(hub?.pending_requests?.length ?? 0) > 0 ? (
                <View style={tw`mb-6`}>
                  <Text
                    style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-2`}
                  >
                    Incoming requests
                  </Text>
                  {hub!.pending_requests.map((req) => (
                    <View
                      key={req.id}
                      style={tw`py-4 border-b border-stone-200/80`}
                    >
                      <View style={tw`flex-row items-center mb-2`}>
                        <AvatarBubble
                          avatar={req.business_avatar}
                          name={req.business_name}
                          size={36}
                        />
                        <View style={tw`ml-3 flex-1`}>
                          <Text style={tw`font-semibold text-stone-900`}>{req.business_name}</Text>
                          <Text style={tw`text-xs text-stone-500 mt-0.5`}>
                            {partnershipTerms(req)}
                          </Text>
                        </View>
                      </View>
                      {req.message ? (
                        <Text style={tw`text-sm text-stone-600 mb-3 leading-5`}>{req.message}</Text>
                      ) : null}
                      <View style={tw`flex-row`}>
                        <TouchableOpacity
                          onPress={() => void onRespondRequest(req, 'approved')}
                          disabled={busyId === req.id}
                          style={tw`flex-1 mr-2 py-2.5 rounded-xl bg-emerald-700 items-center ${
                            busyId === req.id ? 'opacity-60' : ''
                          }`}
                        >
                          <Text style={tw`text-white font-semibold text-sm`}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => void onRespondRequest(req, 'declined')}
                          disabled={busyId === req.id}
                          style={tw`flex-1 ml-2 py-2.5 rounded-xl border border-stone-200/80 bg-white/60 items-center`}
                        >
                          <Text style={tw`text-stone-700 font-semibold text-sm`}>Decline</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}

              <Text
                style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-2`}
              >
                Your partnerships
              </Text>
              {!hub?.partnerships?.length ? (
                <EmptyState
                  icon="briefcase-outline"
                  title="No partnerships yet"
                  description="Businesses discover instructors and send partnership requests. Accept them here."
                />
              ) : (
                hub.partnerships.map((p, i) => (
                  <View
                    key={p.id}
                    style={tw`py-4 ${i < hub.partnerships.length - 1 ? 'border-b border-stone-200/80' : ''}`}
                  >
                    <View style={tw`flex-row items-center`}>
                      <AvatarBubble
                        avatar={p.business_avatar}
                        name={p.business_name}
                        size={36}
                      />
                      <View style={tw`ml-3 flex-1`}>
                        <Text style={tw`font-semibold text-stone-900`}>{p.business_name}</Text>
                        <Text style={tw`text-xs text-stone-500 mt-0.5`}>
                          {partnershipTerms(p)} · {p.status}
                        </Text>
                      </View>
                    </View>
                    {(p.attributed_orders > 0 || p.attributed_revenue > 0) && (
                      <Text style={tw`text-sm text-stone-600 mt-2`}>
                        {p.attributed_orders} referral order
                        {p.attributed_orders === 1 ? '' : 's'} · {formatMoney(p.attributed_revenue)}
                      </Text>
                    )}
                    <View style={tw`flex-row mt-3`}>
                      {p.status === 'active' ? (
                        <>
                          <TouchableOpacity
                            onPress={() => void onUpdatePartnership(p, 'paused')}
                            disabled={busyId === p.id}
                            style={tw`mr-4`}
                          >
                            <Text style={tw`text-sm font-semibold text-stone-600`}>Pause</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => void onUpdatePartnership(p, 'ended')}
                            disabled={busyId === p.id}
                          >
                            <Text style={tw`text-sm font-semibold text-red-600`}>End</Text>
                          </TouchableOpacity>
                        </>
                      ) : p.status === 'paused' ? (
                        <>
                          <TouchableOpacity
                            onPress={() => void onUpdatePartnership(p, 'active')}
                            disabled={busyId === p.id}
                            style={tw`mr-4`}
                          >
                            <Text style={tw`text-sm font-semibold text-emerald-700`}>Resume</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => void onUpdatePartnership(p, 'ended')}
                            disabled={busyId === p.id}
                          >
                            <Text style={tw`text-sm font-semibold text-red-600`}>End</Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <TouchableOpacity
                          onPress={() => void onUpdatePartnership(p, 'active')}
                          disabled={busyId === p.id}
                        >
                          <Text style={tw`text-sm font-semibold text-emerald-700`}>Reactivate</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))
              )}
            </View>
          ) : null}

          {!hub && !loading ? (
            <Text style={tw`text-center text-stone-500 mt-8 px-5`}>
              Could not load hub. Pull to refresh.
            </Text>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
