import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import tw from '../../lib/tw';
import { verticalScrollProps } from '../../constants/scroll';
import { useAppDispatch, useAppSelector, useAuth } from '../../store/hooks';
import { fetchBusinessGrow, fetchPromoCodes } from '../../store/slices/businessSlice';
import {
  createPartnershipRequest,
  updatePartnershipRequest,
  updatePartnershipStatus,
  createCampaign,
  updateCampaign,
  createPromoCode,
  updatePromoCode,
  type PartnershipRecord,
  type DiscoverInstructor,
  type MarketingCampaign,
  type PromoCode,
} from '../../services/api/business';
import { getUserPosts, type FeedPost } from '../../services/api/feed';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import BusinessEmptyState from '../../components/business/BusinessEmptyState';
import type { BusinessTabsParamList } from '../../app/navigation/tabs/BusinessTabs';

type MainSegment = 'partners' | 'community';
type PartnerTab = 'partners' | 'discover';
type CommunityTab = 'posts' | 'campaigns' | 'promos' | 'create';

function formatTimeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function categoriesPreview(categories?: string[]) {
  return categories && categories.length ? categories.slice(0, 2).join(', ') : 'General';
}

export default function GrowScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<BusinessTabsParamList, 'Grow'>>();
  const dispatch = useAppDispatch();
  const { user } = useAuth();

  const partnerships = useAppSelector((s) => s.business.partnerships);
  const partnershipRequests = useAppSelector((s) => s.business.partnershipRequests);
  const discoverInstructors = useAppSelector((s) => s.business.discoverInstructors);
  const partnershipPerformance = useAppSelector((s) => s.business.partnershipPerformance);
  const campaigns = useAppSelector((s) => s.business.campaigns);
  const promoCodes = useAppSelector((s) => s.business.promoCodes);
  const growStatus = useAppSelector((s) => s.business.growStatus);

  const [mainSegment, setMainSegment] = useState<MainSegment>(route.params?.segment ?? 'partners');
  const [partnerTab, setPartnerTab] = useState<PartnerTab>('partners');
  const [communityTab, setCommunityTab] = useState<CommunityTab>('posts');
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [selectedPartner, setSelectedPartner] = useState<PartnershipRecord | null>(null);
  const [discoverTarget, setDiscoverTarget] = useState<DiscoverInstructor | null>(null);
  const [requestCommission, setRequestCommission] = useState('12');
  const [requestMessage, setRequestMessage] = useState('');

  const [userPosts, setUserPosts] = useState<FeedPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);

  const [campaignForm, setCampaignForm] = useState({
    name: '',
    type: 'promotion' as MarketingCampaign['type'],
    budget: '',
    endDate: '',
  });
  const [campaignBusy, setCampaignBusy] = useState(false);
  const [promoForm, setPromoForm] = useState({
    code: '',
    type: 'percent' as PromoCode['type'],
    value: '',
    maxUses: '',
  });
  const [promoBusy, setPromoBusy] = useState(false);

  const stackNav = navigation.getParent?.() || navigation;
  const loading = growStatus === 'loading' && partnerships.length === 0 && discoverInstructors.length === 0;

  const perfById = useMemo(() => {
    const map = new Map<string, (typeof partnershipPerformance)[0]>();
    partnershipPerformance.forEach((p) => map.set(p.id, p));
    return map;
  }, [partnershipPerformance]);

  const pendingRequests = useMemo(
    () => partnershipRequests.filter((r) => r.status === 'pending'),
    [partnershipRequests]
  );

  const activePartners = useMemo(
    () => partnerships.filter((p) => p.status === 'active').length,
    [partnerships]
  );

  useEffect(() => {
    if (route.params?.segment) setMainSegment(route.params.segment);
  }, [route.params?.segment]);

  useEffect(() => {
    void dispatch(fetchBusinessGrow());
  }, [dispatch]);

  const loadPosts = useCallback(async () => {
    if (!user?.id) return;
    setPostsLoading(true);
    setPostsError(null);
    try {
      const posts = await getUserPosts(user.id);
      setUserPosts(posts);
    } catch (e: unknown) {
      setPostsError(e instanceof Error ? e.message : 'Could not load posts');
    } finally {
      setPostsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (mainSegment === 'community' && communityTab === 'posts' && user?.id) {
      void loadPosts();
    }
  }, [mainSegment, communityTab, user?.id, loadPosts]);

  useEffect(() => {
    if (mainSegment === 'community' && communityTab === 'promos') {
      void dispatch(fetchPromoCodes());
    }
  }, [mainSegment, communityTab, dispatch]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await dispatch(fetchBusinessGrow()).unwrap();
      if (mainSegment === 'community' && communityTab === 'posts') {
        await loadPosts();
      }
    } catch {
      // grow slice handles error state
    } finally {
      setRefreshing(false);
    }
  }, [dispatch, mainSegment, communityTab, loadPosts]);

  const openInstructorProfile = (instructorId: string) => {
    navigateFromRoot(navigation, 'PublicProfile', { userId: instructorId });
  };

  const handleRequestAction = async (requestId: string, status: 'approved' | 'declined') => {
    if (busyId) return;
    try {
      setBusyId(requestId);
      await updatePartnershipRequest(requestId, status);
      alertMessage(status === 'approved' ? 'Approved' : 'Declined', `Request ${status}.`);
      await dispatch(fetchBusinessGrow()).unwrap();
    } catch (e: unknown) {
      alertMessage('Error', e instanceof Error ? e.message : 'Could not update request');
    } finally {
      setBusyId(null);
    }
  };

  const handlePartnershipStatus = async (
    partnershipId: string,
    status: 'active' | 'paused' | 'ended'
  ) => {
    const labels = { active: 'reactivate', paused: 'pause', ended: 'end' };
    const ok = await confirmAsync(
      'Update partnership',
      `Are you sure you want to ${labels[status]} this partnership?`,
      { confirmLabel: 'Confirm', destructive: status === 'ended' }
    );
    if (!ok) return;
    try {
      setBusyId(partnershipId);
      await updatePartnershipStatus(partnershipId, status);
      alertMessage('Updated', `Partnership ${status}.`);
      setSelectedPartner(null);
      await dispatch(fetchBusinessGrow()).unwrap();
    } catch (e: unknown) {
      alertMessage('Error', e instanceof Error ? e.message : 'Could not update partnership');
    } finally {
      setBusyId(null);
    }
  };

  const openDiscoverModal = (instructor: DiscoverInstructor) => {
    setRequestCommission('12');
    setRequestMessage('');
    setDiscoverTarget(instructor);
  };

  const sendPartnershipRequest = async () => {
    if (!discoverTarget || busyId) return;
    const rate = Number(requestCommission);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
      alertMessage('Invalid rate', 'Enter a commission rate between 1 and 100.');
      return;
    }
    try {
      setBusyId(discoverTarget.id);
      await createPartnershipRequest({
        instructorId: discoverTarget.id,
        partnershipType: 'commission',
        commissionRate: rate,
        message: requestMessage.trim() || undefined,
      });
      alertMessage('Request sent', `Partnership request sent to ${discoverTarget.username}.`);
      setDiscoverTarget(null);
      await dispatch(fetchBusinessGrow()).unwrap();
    } catch (e: unknown) {
      alertMessage('Error', e instanceof Error ? e.message : 'Could not send request');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateCampaign = async () => {
    const name = campaignForm.name.trim();
    const budget = Number(campaignForm.budget);
    if (!name) {
      alertMessage('Missing name', 'Please enter a campaign name.');
      return;
    }
    if (!Number.isFinite(budget) || budget <= 0) {
      alertMessage('Invalid budget', 'Please enter a valid budget.');
      return;
    }
    const endDate =
      campaignForm.endDate.trim() ||
      new Date(Date.now() + 21 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    try {
      setCampaignBusy(true);
      await createCampaign({ name, type: campaignForm.type, budget, end_date: endDate });
      alertMessage('Campaign created', `${name} is now active.`);
      setCampaignForm({ name: '', type: 'promotion', budget: '', endDate: '' });
      setCommunityTab('campaigns');
      await dispatch(fetchBusinessGrow()).unwrap();
    } catch (e: unknown) {
      alertMessage('Error', e instanceof Error ? e.message : 'Could not create campaign');
    } finally {
      setCampaignBusy(false);
    }
  };

  const handleCreatePromo = async () => {
    const code = promoForm.code.trim();
    const value = Number(promoForm.value);
    const maxUses = promoForm.maxUses.trim() ? Number(promoForm.maxUses) : undefined;
    if (!code) {
      alertMessage('Missing code', 'Enter a promo code.');
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      alertMessage('Invalid value', 'Enter a valid discount value.');
      return;
    }
    if (promoForm.type === 'percent' && value > 100) {
      alertMessage('Invalid percent', 'Percent discount cannot exceed 100.');
      return;
    }
    try {
      setPromoBusy(true);
      await createPromoCode({
        code,
        type: promoForm.type,
        value,
        max_uses: maxUses,
      });
      alertMessage('Created', `Promo code ${code.toUpperCase()} is active.`);
      setPromoForm({ code: '', type: 'percent', value: '', maxUses: '' });
      await dispatch(fetchPromoCodes()).unwrap();
    } catch (e: unknown) {
      alertMessage('Error', e instanceof Error ? e.message : 'Could not create promo code');
    } finally {
      setPromoBusy(false);
    }
  };

  const handleDeactivatePromo = async (promo: PromoCode) => {
    const ok = await confirmAsync('Deactivate code', `Deactivate ${promo.code}?`, {
      confirmLabel: 'Deactivate',
      destructive: true,
    });
    if (!ok) return;
    try {
      setBusyId(promo.id);
      await updatePromoCode(promo.id, { active: false });
      await dispatch(fetchPromoCodes()).unwrap();
    } catch (e: unknown) {
      alertMessage('Error', e instanceof Error ? e.message : 'Could not update promo code');
    } finally {
      setBusyId(null);
    }
  };

  const handleCampaignStatus = async (campaignId: string, status: 'paused' | 'completed' | 'active') => {
    const label = status === 'paused' ? 'pause' : status === 'completed' ? 'complete' : 'reactivate';
    const ok = await confirmAsync('Update campaign', `Are you sure you want to ${label} this campaign?`);
    if (!ok) return;
    try {
      setBusyId(campaignId);
      await updateCampaign(campaignId, { status });
      await dispatch(fetchBusinessGrow()).unwrap();
    } catch (e: unknown) {
      alertMessage('Error', e instanceof Error ? e.message : 'Could not update campaign');
    } finally {
      setBusyId(null);
    }
  };

  const renderPartnerCard = (partner: PartnershipRecord) => {
    const perf = perfById.get(partner.id);
    const revenue = perf?.attributed_revenue ?? 0;
    return (
      <TouchableOpacity
        key={partner.id}
        style={tw`bg-white rounded-2xl p-4 mb-3 border border-stone-100`}
        onPress={() => setSelectedPartner(partner)}
        activeOpacity={0.85}
      >
        <View style={tw`flex-row items-start`}>
          <View style={tw`w-12 h-12 rounded-full bg-stone-100 items-center justify-center mr-3`}>
            <Text style={tw`text-2xl`}>{partner.instructor_avatar || '👤'}</Text>
          </View>
          <View style={tw`flex-1`}>
            <View style={tw`flex-row items-center justify-between`}>
              <Text style={tw`text-base font-bold text-stone-900`}>{partner.instructor_name}</Text>
              <View
                style={tw`px-2 py-0.5 rounded-full ${
                  partner.status === 'active'
                    ? 'bg-emerald-100'
                    : partner.status === 'paused'
                      ? 'bg-amber-100'
                      : 'bg-stone-100'
                }`}
              >
                <Text
                  style={tw`text-xs font-semibold capitalize ${
                    partner.status === 'active'
                      ? 'text-emerald-800'
                      : partner.status === 'paused'
                        ? 'text-amber-800'
                        : 'text-stone-600'
                  }`}
                >
                  {partner.status}
                </Text>
              </View>
            </View>
            <Text style={tw`text-xs text-stone-500 mt-1`}>{categoriesPreview(partner.categories)}</Text>
            <View style={tw`flex-row mt-2`}>
              <Text style={tw`text-xs text-stone-500 mr-3`}>
                {partner.commission_rate ?? 0}% commission
              </Text>
              <Text style={tw`text-xs font-semibold text-emerald-700`}>
                ${revenue.toFixed(2)} attributed
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#A8A29E" />
        </View>
      </TouchableOpacity>
    );
  };

  const renderPartnersSegment = () => (
    <View style={tw`flex-1`}>
      <View style={tw`flex-row bg-stone-100 rounded-xl p-1 mx-4 mt-3 mb-2`}>
        {(['partners', 'discover'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setPartnerTab(tab)}
            style={tw`flex-1 py-2 rounded-lg ${partnerTab === tab ? 'bg-white' : ''}`}
          >
            <Text
              style={tw`text-center text-sm font-semibold ${
                partnerTab === tab ? 'text-emerald-700' : 'text-stone-500'
              }`}
            >
              {tab === 'partners' ? 'My partners' : 'Discover'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={tw`flex-1 px-4 pt-2`}
        {...verticalScrollProps}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#059669" colors={['#059669']} />
        }
      >
        {loading ? (
          <ActivityIndicator style={tw`mt-8`} color="#059669" />
        ) : null}

        {partnerTab === 'partners' ? (
          <>
            <View style={tw`flex-row gap-2 mb-4`}>
              <View style={tw`flex-1 bg-emerald-50 rounded-xl p-3 border border-emerald-100`}>
                <Text style={tw`text-xs text-emerald-700`}>Active</Text>
                <Text style={tw`text-xl font-bold text-emerald-900`}>{activePartners}</Text>
              </View>
              <View style={tw`flex-1 bg-stone-50 rounded-xl p-3 border border-stone-100`}>
                <Text style={tw`text-xs text-stone-500`}>Total</Text>
                <Text style={tw`text-xl font-bold text-stone-900`}>{partnerships.length}</Text>
              </View>
              <View style={tw`flex-1 bg-amber-50 rounded-xl p-3 border border-amber-100`}>
                <Text style={tw`text-xs text-amber-700`}>Pending</Text>
                <Text style={tw`text-xl font-bold text-amber-900`}>{pendingRequests.length}</Text>
              </View>
            </View>

            {partnershipRequests.length > 0 ? (
              <View style={tw`mb-4`}>
                <Text style={tw`text-sm font-semibold text-stone-700 mb-2`}>Request queue</Text>
                {partnershipRequests.map((request) => (
                  <View
                    key={request.id}
                    style={tw`bg-white rounded-xl p-3 mb-2 border border-stone-100`}
                  >
                    <View style={tw`flex-row items-center justify-between`}>
                      <Text style={tw`font-semibold text-stone-900`}>{request.instructor_name}</Text>
                      <Text style={tw`text-xs text-stone-400`}>
                        {new Date(request.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text style={tw`text-xs text-stone-500 mt-1 mb-2`}>
                      {categoriesPreview(request.categories)} · {request.commission_rate ?? 0}%
                    </Text>
                    {request.message ? (
                      <Text style={tw`text-xs text-stone-600 mb-2 italic`}>"{request.message}"</Text>
                    ) : null}
                    {request.status === 'pending' ? (
                      <View style={tw`flex-row`}>
                        <TouchableOpacity
                          style={tw`px-3 py-1.5 bg-emerald-100 rounded-lg mr-2`}
                          disabled={busyId === request.id}
                          onPress={() => void handleRequestAction(request.id, 'approved')}
                        >
                          <Text style={tw`text-xs font-semibold text-emerald-800`}>Approve</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={tw`px-3 py-1.5 bg-red-100 rounded-lg`}
                          disabled={busyId === request.id}
                          onPress={() => void handleRequestAction(request.id, 'declined')}
                        >
                          <Text style={tw`text-xs font-semibold text-red-800`}>Decline</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <Text
                        style={tw`text-xs font-semibold ${
                          request.status === 'approved' ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {request.status === 'approved' ? 'Approved' : 'Declined'}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            ) : null}

            {partnerships.length === 0 && !loading ? (
              <BusinessEmptyState
                icon="people-outline"
                title="No partners yet"
                description="Discover instructors who align with your brand and send partnership requests."
                actionLabel="Discover instructors"
                onAction={() => setPartnerTab('discover')}
              />
            ) : (
              partnerships.map(renderPartnerCard)
            )}
          </>
        ) : (
          <>
            <Text style={tw`text-sm text-stone-500 mb-3`}>
              Discover instructors who align with your brand
            </Text>
            {discoverInstructors.length === 0 && !loading ? (
              <BusinessEmptyState
                icon="search-outline"
                title="No instructors to show"
                description="Check back later for new partnership opportunities."
              />
            ) : (
              discoverInstructors.map((instructor) => {
                const hasPending = partnershipRequests.some(
                  (r) => r.instructor_id === instructor.id && r.status === 'pending'
                );
                return (
                  <View
                    key={instructor.id}
                    style={tw`bg-white rounded-2xl p-4 mb-3 border border-stone-100`}
                  >
                    <View style={tw`flex-row items-start mb-3`}>
                      <View style={tw`w-12 h-12 rounded-full bg-stone-100 items-center justify-center mr-3`}>
                        <Text style={tw`text-2xl`}>{instructor.avatar || '👤'}</Text>
                      </View>
                      <View style={tw`flex-1`}>
                        <TouchableOpacity onPress={() => openInstructorProfile(instructor.id)}>
                          <Text style={tw`text-base font-bold text-stone-900`}>{instructor.username}</Text>
                        </TouchableOpacity>
                        <Text style={tw`text-xs text-stone-500 mt-1`}>
                          {categoriesPreview(instructor.categories)}
                        </Text>
                        <View style={tw`flex-row items-center mt-2`}>
                          <Ionicons name="people" size={14} color="#78716C" />
                          <Text style={tw`text-xs text-stone-500 ml-1 mr-3`}>
                            {instructor.vote_count.toLocaleString()} votes
                          </Text>
                          <Ionicons name="trending-up" size={14} color="#78716C" />
                          <Text style={tw`text-xs text-stone-500 ml-1`}>{instructor.points} pts</Text>
                        </View>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={tw`rounded-xl py-3 ${hasPending ? 'bg-stone-300' : 'bg-emerald-600'}`}
                      disabled={hasPending || !!busyId}
                      onPress={() => openDiscoverModal(instructor)}
                    >
                      <Text style={tw`text-white text-center font-semibold text-sm`}>
                        {hasPending ? 'Request sent' : 'Send partnership request'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </>
        )}
        <View style={tw`h-6`} />
      </ScrollView>
    </View>
  );

  const renderCommunitySegment = () => (
    <View style={tw`flex-1`}>
      <View style={tw`flex-row bg-stone-100 rounded-xl p-1 mx-4 mt-3 mb-2`}>
        {(['posts', 'campaigns', 'promos', 'create'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setCommunityTab(tab)}
            style={tw`flex-1 py-2 rounded-lg ${communityTab === tab ? 'bg-white' : ''}`}
          >
            <Text
              style={tw`text-center text-xs font-semibold ${
                communityTab === tab ? 'text-emerald-700' : 'text-stone-500'
              }`}
              numberOfLines={1}
            >
              {tab === 'promos' ? 'Promos' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={tw`flex-1 px-4 pt-2`}
        {...verticalScrollProps}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#059669" colors={['#059669']} />
        }
      >
        {communityTab === 'posts' ? (
          <>
            {postsLoading && userPosts.length === 0 ? (
              <ActivityIndicator style={tw`mt-8`} color="#059669" />
            ) : postsError ? (
              <View style={tw`bg-red-50 border border-red-200 rounded-xl p-3 mb-3`}>
                <Text style={tw`text-sm text-red-700`}>{postsError}</Text>
              </View>
            ) : userPosts.length === 0 ? (
              <BusinessEmptyState
                icon="images-outline"
                title="No posts yet"
                description="Share content to build community around your brand."
                actionLabel="Create post"
                onAction={() => stackNav.navigate('BusinessCreatePost')}
              />
            ) : (
              userPosts.map((post) => {
                const likes = post.metadata?.likes ?? 0;
                const comments = post.metadata?.comments ?? 0;
                return (
                  <View
                    key={post.id}
                    style={tw`bg-white rounded-2xl p-4 mb-3 border border-stone-100`}
                  >
                    <Text style={tw`text-xs text-stone-400 mb-2`}>
                      {formatTimeAgo(post.created_at)} · {post.category}
                    </Text>
                    {post.image_url ? (
                      <Image
                        source={{ uri: post.image_url }}
                        style={tw`w-full h-48 rounded-xl mb-3`}
                        resizeMode="cover"
                      />
                    ) : null}
                    {post.caption ? (
                      <Text style={tw`text-sm text-stone-800 mb-3`} numberOfLines={4}>
                        {post.caption}
                      </Text>
                    ) : null}
                    <View style={tw`flex-row items-center`}>
                      <View style={tw`flex-row items-center mr-4`}>
                        <Ionicons name="heart" size={16} color="#EF4444" />
                        <Text style={tw`text-sm text-stone-600 ml-1`}>{likes}</Text>
                      </View>
                      <View style={tw`flex-row items-center`}>
                        <Ionicons name="chatbubble-outline" size={16} color="#78716C" />
                        <Text style={tw`text-sm text-stone-600 ml-1`}>{comments}</Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </>
        ) : null}

        {communityTab === 'campaigns' ? (
          <>
            {campaigns.length === 0 ? (
              <BusinessEmptyState
                icon="megaphone-outline"
                title="No campaigns yet"
                description="Launch a promotion, sponsored placement, or influencer campaign."
                actionLabel="Create campaign"
                onAction={() => setCommunityTab('create')}
              />
            ) : (
              campaigns.map((campaign) => (
                <View
                  key={campaign.id}
                  style={tw`bg-white rounded-2xl p-4 mb-3 border border-stone-100`}
                >
                  <View style={tw`flex-row items-start justify-between mb-2`}>
                    <View style={tw`flex-1 pr-2`}>
                      <Text style={tw`text-base font-bold text-stone-900`}>{campaign.name}</Text>
                      <View style={tw`flex-row items-center mt-1`}>
                        <View style={tw`px-2 py-0.5 rounded-full bg-emerald-50 mr-2`}>
                          <Text style={tw`text-xs font-semibold text-emerald-800 capitalize`}>
                            {campaign.type}
                          </Text>
                        </View>
                        <View
                          style={tw`px-2 py-0.5 rounded-full ${
                            campaign.status === 'active'
                              ? 'bg-emerald-100'
                              : campaign.status === 'paused'
                                ? 'bg-amber-100'
                                : 'bg-stone-100'
                          }`}
                        >
                          <Text
                            style={tw`text-xs font-semibold capitalize ${
                              campaign.status === 'active'
                                ? 'text-emerald-800'
                                : campaign.status === 'paused'
                                  ? 'text-amber-800'
                                  : 'text-stone-600'
                            }`}
                          >
                            {campaign.status}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                  <Text style={tw`text-sm font-semibold text-stone-900 mb-3`}>
                    Budget ${campaign.budget.toFixed(0)}
                  </Text>
                  {campaign.end_date ? (
                    <Text style={tw`text-xs text-stone-400 mb-3`}>
                      Ends {new Date(campaign.end_date).toLocaleDateString()}
                    </Text>
                  ) : null}
                  <View style={tw`flex-row flex-wrap gap-2`}>
                    {campaign.status === 'active' ? (
                      <>
                        <TouchableOpacity
                          style={tw`px-3 py-2 bg-amber-100 rounded-lg`}
                          disabled={busyId === campaign.id}
                          onPress={() => void handleCampaignStatus(campaign.id, 'paused')}
                        >
                          <Text style={tw`text-xs font-semibold text-amber-800`}>Pause</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={tw`px-3 py-2 bg-stone-100 rounded-lg`}
                          disabled={busyId === campaign.id}
                          onPress={() => void handleCampaignStatus(campaign.id, 'completed')}
                        >
                          <Text style={tw`text-xs font-semibold text-stone-700`}>Complete</Text>
                        </TouchableOpacity>
                      </>
                    ) : campaign.status === 'paused' ? (
                      <>
                        <TouchableOpacity
                          style={tw`px-3 py-2 bg-emerald-100 rounded-lg`}
                          disabled={busyId === campaign.id}
                          onPress={() => void handleCampaignStatus(campaign.id, 'active')}
                        >
                          <Text style={tw`text-xs font-semibold text-emerald-800`}>Reactivate</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={tw`px-3 py-2 bg-stone-100 rounded-lg`}
                          disabled={busyId === campaign.id}
                          onPress={() => void handleCampaignStatus(campaign.id, 'completed')}
                        >
                          <Text style={tw`text-xs font-semibold text-stone-700`}>Complete</Text>
                        </TouchableOpacity>
                      </>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </>
        ) : null}

        {communityTab === 'promos' ? (
          <>
            <View style={tw`bg-white rounded-2xl p-4 border border-stone-100 mb-4`}>
              <Text style={tw`text-base font-bold text-stone-900 mb-3`}>New promo code</Text>
              <Text style={tw`text-sm font-semibold text-stone-700 mb-1`}>Code</Text>
              <TextInput
                value={promoForm.code}
                onChangeText={(code) => setPromoForm((p) => ({ ...p, code }))}
                placeholder="SUMMER20"
                placeholderTextColor="#A8A29E"
                autoCapitalize="characters"
                style={tw`bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 mb-3 text-stone-900`}
              />
              <Text style={tw`text-sm font-semibold text-stone-700 mb-2`}>Type</Text>
              <View style={tw`flex-row mb-3`}>
                {(['percent', 'fixed'] as const).map((type) => (
                  <TouchableOpacity
                    key={type}
                    onPress={() => setPromoForm((p) => ({ ...p, type }))}
                    style={tw`px-3 py-2 rounded-full mr-2 ${
                      promoForm.type === type ? 'bg-emerald-600' : 'bg-stone-100'
                    }`}
                  >
                    <Text
                      style={tw`text-xs font-semibold capitalize ${
                        promoForm.type === type ? 'text-white' : 'text-stone-700'
                      }`}
                    >
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={tw`text-sm font-semibold text-stone-700 mb-1`}>
                Value {promoForm.type === 'percent' ? '(%)' : '(USD)'}
              </Text>
              <TextInput
                value={promoForm.value}
                onChangeText={(value) => setPromoForm((p) => ({ ...p, value }))}
                placeholder={promoForm.type === 'percent' ? '20' : '10'}
                placeholderTextColor="#A8A29E"
                keyboardType="numeric"
                style={tw`bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 mb-3 text-stone-900`}
              />
              <Text style={tw`text-sm font-semibold text-stone-700 mb-1`}>Max uses (optional)</Text>
              <TextInput
                value={promoForm.maxUses}
                onChangeText={(maxUses) => setPromoForm((p) => ({ ...p, maxUses }))}
                placeholder="100"
                placeholderTextColor="#A8A29E"
                keyboardType="numeric"
                style={tw`bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 mb-4 text-stone-900`}
              />
              <TouchableOpacity
                style={tw`bg-emerald-600 rounded-xl py-3 items-center ${promoBusy ? 'opacity-60' : ''}`}
                disabled={promoBusy}
                onPress={() => void handleCreatePromo()}
              >
                <Text style={tw`text-white font-bold`}>{promoBusy ? 'Creating…' : 'Create promo code'}</Text>
              </TouchableOpacity>
            </View>

            {promoCodes.length === 0 ? (
              <BusinessEmptyState
                icon="pricetag-outline"
                title="No promo codes yet"
                description="Create discount codes for your community."
              />
            ) : (
              promoCodes.map((promo) => (
                <View
                  key={promo.id}
                  style={tw`bg-white rounded-2xl p-4 mb-3 border border-stone-100`}
                >
                  <View style={tw`flex-row items-start justify-between mb-2`}>
                    <View style={tw`flex-1 pr-2`}>
                      <Text style={tw`text-base font-bold text-stone-900`}>{promo.code}</Text>
                      <Text style={tw`text-sm text-stone-600 mt-1`}>
                        {promo.type === 'percent' ? `${promo.value}% off` : `$${promo.value.toFixed(2)} off`}
                        {promo.max_uses != null ? ` · max ${promo.max_uses} uses` : ''}
                      </Text>
                      <Text style={tw`text-xs text-stone-400 mt-1`}>
                        Used {promo.uses} time{promo.uses === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <View
                      style={tw`px-2 py-0.5 rounded-full ${
                        promo.active ? 'bg-emerald-100' : 'bg-stone-100'
                      }`}
                    >
                      <Text
                        style={tw`text-xs font-semibold ${
                          promo.active ? 'text-emerald-800' : 'text-stone-600'
                        }`}
                      >
                        {promo.active ? 'Active' : 'Inactive'}
                      </Text>
                    </View>
                  </View>
                  {promo.active ? (
                    <TouchableOpacity
                      style={tw`px-3 py-2 bg-red-50 rounded-lg self-start`}
                      disabled={busyId === promo.id}
                      onPress={() => void handleDeactivatePromo(promo)}
                    >
                      <Text style={tw`text-xs font-semibold text-red-700`}>Deactivate</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))
            )}
          </>
        ) : null}

        {communityTab === 'create' ? (
          <View style={tw`bg-white rounded-2xl p-4 border border-stone-100 mb-4`}>
            <Text style={tw`text-base font-bold text-stone-900 mb-1`}>Share with community</Text>
            <Text style={tw`text-sm text-stone-500 mb-4`}>
              Post photos and updates to drive awareness for your store.
            </Text>
            <TouchableOpacity
              style={tw`bg-emerald-600 rounded-xl py-4 flex-row items-center justify-center mb-6`}
              onPress={() => stackNav.navigate('BusinessCreatePost')}
            >
              <Ionicons name="camera-outline" size={22} color="#FFFFFF" style={tw`mr-2`} />
              <Text style={tw`text-white font-bold`}>Create post</Text>
            </TouchableOpacity>

            <Text style={tw`text-base font-bold text-stone-900 mb-1`}>New campaign</Text>
            <Text style={tw`text-sm text-stone-500 mb-4`}>
              Set budget and end date — campaigns start active immediately.
            </Text>

            <Text style={tw`text-sm font-semibold text-stone-700 mb-1`}>Campaign name</Text>
            <TextInput
              value={campaignForm.name}
              onChangeText={(name) => setCampaignForm((p) => ({ ...p, name }))}
              placeholder="e.g. Summer Strength Bundle"
              placeholderTextColor="#A8A29E"
              style={tw`bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 mb-3 text-stone-900`}
            />

            <Text style={tw`text-sm font-semibold text-stone-700 mb-2`}>Type</Text>
            <View style={tw`flex-row mb-3`}>
              {(['promotion', 'sponsored', 'influencer'] as const).map((type) => (
                <TouchableOpacity
                  key={type}
                  onPress={() => setCampaignForm((p) => ({ ...p, type }))}
                  style={tw`px-3 py-2 rounded-full mr-2 ${
                    campaignForm.type === type ? 'bg-emerald-600' : 'bg-stone-100'
                  }`}
                >
                  <Text
                    style={tw`text-xs font-semibold capitalize ${
                      campaignForm.type === type ? 'text-white' : 'text-stone-700'
                    }`}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={tw`text-sm font-semibold text-stone-700 mb-1`}>Budget (USD)</Text>
            <TextInput
              value={campaignForm.budget}
              onChangeText={(budget) => setCampaignForm((p) => ({ ...p, budget }))}
              placeholder="1500"
              placeholderTextColor="#A8A29E"
              keyboardType="numeric"
              style={tw`bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 mb-3 text-stone-900`}
            />

            <Text style={tw`text-sm font-semibold text-stone-700 mb-1`}>End date (YYYY-MM-DD)</Text>
            <TextInput
              value={campaignForm.endDate}
              onChangeText={(endDate) => setCampaignForm((p) => ({ ...p, endDate }))}
              placeholder="2026-08-01"
              placeholderTextColor="#A8A29E"
              style={tw`bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 mb-4 text-stone-900`}
            />

            <TouchableOpacity
              style={tw`bg-emerald-600 rounded-xl py-3 items-center ${campaignBusy ? 'opacity-60' : ''}`}
              disabled={campaignBusy}
              onPress={() => void handleCreateCampaign()}
            >
              <Text style={tw`text-white font-bold`}>
                {campaignBusy ? 'Creating…' : 'Launch campaign'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <View style={tw`h-6`} />
      </ScrollView>
    </View>
  );

  const selectedPerf = selectedPartner ? perfById.get(selectedPartner.id) : undefined;

  return (
    <SafeAreaView style={tw`flex-1 bg-stone-50`} edges={['top']}>
      <View style={tw`bg-white px-4 pt-4 pb-3 border-b border-stone-100`}>
        <Text style={tw`text-2xl font-bold tracking-tight text-stone-900 mb-1`}>Grow</Text>
        <Text style={tw`text-sm text-stone-500 mb-3`}>Partnerships & community marketing</Text>
        <View style={tw`flex-row bg-stone-100 rounded-xl p-1`}>
          {(['partners', 'community'] as const).map((seg) => (
            <TouchableOpacity
              key={seg}
              onPress={() => setMainSegment(seg)}
              style={tw`flex-1 py-2.5 rounded-lg ${mainSegment === seg ? 'bg-white' : ''}`}
            >
              <Text
                style={tw`text-center text-sm font-semibold ${
                  mainSegment === seg ? 'text-emerald-700' : 'text-stone-500'
                }`}
              >
                {seg === 'partners' ? 'Partners' : 'Community'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {mainSegment === 'partners' ? renderPartnersSegment() : renderCommunitySegment()}

      {/* Partner detail modal */}
      <Modal visible={!!selectedPartner} animationType="slide" transparent onRequestClose={() => setSelectedPartner(null)}>
        <View style={tw`flex-1 bg-black/40 justify-end`}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={tw`bg-white rounded-t-3xl px-4 pt-4 pb-8 max-h-[85%]`}>
              {selectedPartner ? (
                <ScrollView {...verticalScrollProps}>
                  <View style={tw`flex-row items-center justify-between mb-4`}>
                    <Text style={tw`text-xl font-bold text-stone-900`}>{selectedPartner.instructor_name}</Text>
                    <TouchableOpacity onPress={() => setSelectedPartner(null)}>
                      <Ionicons name="close" size={24} color="#78716C" />
                    </TouchableOpacity>
                  </View>
                  <Text style={tw`text-sm text-stone-500 mb-4`}>
                    {categoriesPreview(selectedPartner.categories)} · {selectedPartner.partnership_type}
                  </Text>
                  <View style={tw`bg-stone-50 rounded-xl p-4 mb-4 border border-stone-100`}>
                    <View style={tw`flex-row justify-between mb-2`}>
                      <Text style={tw`text-sm text-stone-500`}>Commission</Text>
                      <Text style={tw`text-sm font-bold text-emerald-700`}>
                        {selectedPartner.commission_rate ?? 0}%
                      </Text>
                    </View>
                    <View style={tw`flex-row justify-between mb-2`}>
                      <Text style={tw`text-sm text-stone-500`}>Attributed revenue</Text>
                      <Text style={tw`text-sm font-bold text-stone-900`}>
                        ${(selectedPerf?.attributed_revenue ?? 0).toFixed(2)}
                      </Text>
                    </View>
                    <View style={tw`flex-row justify-between`}>
                      <Text style={tw`text-sm text-stone-500`}>Status</Text>
                      <Text style={tw`text-sm font-semibold capitalize text-stone-900`}>
                        {selectedPartner.status}
                      </Text>
                    </View>
                  </View>
                  <View style={tw`flex-row flex-wrap gap-2 mb-4`}>
                    {selectedPartner.status === 'active' ? (
                      <>
                        <TouchableOpacity
                          style={tw`flex-1 min-w-[40%] py-3 bg-amber-100 rounded-xl items-center`}
                          disabled={busyId === selectedPartner.id}
                          onPress={() =>
                            void handlePartnershipStatus(selectedPartner.id, 'paused')
                          }
                        >
                          <Text style={tw`font-semibold text-amber-800`}>Pause</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={tw`flex-1 min-w-[40%] py-3 bg-red-100 rounded-xl items-center`}
                          disabled={busyId === selectedPartner.id}
                          onPress={() => void handlePartnershipStatus(selectedPartner.id, 'ended')}
                        >
                          <Text style={tw`font-semibold text-red-800`}>End</Text>
                        </TouchableOpacity>
                      </>
                    ) : selectedPartner.status === 'paused' ? (
                      <>
                        <TouchableOpacity
                          style={tw`flex-1 min-w-[40%] py-3 bg-emerald-100 rounded-xl items-center`}
                          disabled={busyId === selectedPartner.id}
                          onPress={() =>
                            void handlePartnershipStatus(selectedPartner.id, 'active')
                          }
                        >
                          <Text style={tw`font-semibold text-emerald-800`}>Reactivate</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={tw`flex-1 min-w-[40%] py-3 bg-red-100 rounded-xl items-center`}
                          disabled={busyId === selectedPartner.id}
                          onPress={() => void handlePartnershipStatus(selectedPartner.id, 'ended')}
                        >
                          <Text style={tw`font-semibold text-red-800`}>End</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <TouchableOpacity
                        style={tw`flex-1 py-3 bg-emerald-100 rounded-xl items-center`}
                        disabled={busyId === selectedPartner.id}
                        onPress={() => void handlePartnershipStatus(selectedPartner.id, 'active')}
                      >
                        <Text style={tw`font-semibold text-emerald-800`}>Reactivate</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <TouchableOpacity
                    style={tw`py-3 border border-stone-200 rounded-xl items-center`}
                    onPress={() => openInstructorProfile(selectedPartner.instructor_id)}
                  >
                    <Text style={tw`font-semibold text-stone-700`}>View profile</Text>
                  </TouchableOpacity>
                </ScrollView>
              ) : null}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Discover request modal */}
      <Modal visible={!!discoverTarget} animationType="slide" transparent onRequestClose={() => setDiscoverTarget(null)}>
        <View style={tw`flex-1 bg-black/40 justify-end`}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={tw`bg-white rounded-t-3xl px-4 pt-4 pb-8`}>
              {discoverTarget ? (
                <>
                  <View style={tw`flex-row items-center justify-between mb-4`}>
                    <Text style={tw`text-lg font-bold text-stone-900`}>
                      Request · {discoverTarget.username}
                    </Text>
                    <TouchableOpacity onPress={() => setDiscoverTarget(null)}>
                      <Ionicons name="close" size={24} color="#78716C" />
                    </TouchableOpacity>
                  </View>
                  <Text style={tw`text-sm font-semibold text-stone-700 mb-1`}>Commission rate (%)</Text>
                  <TextInput
                    value={requestCommission}
                    onChangeText={setRequestCommission}
                    keyboardType="numeric"
                    placeholder="12"
                    placeholderTextColor="#A8A29E"
                    style={tw`bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 mb-3 text-stone-900`}
                  />
                  <Text style={tw`text-sm font-semibold text-stone-700 mb-1`}>Message (optional)</Text>
                  <TextInput
                    value={requestMessage}
                    onChangeText={setRequestMessage}
                    placeholder="Tell them why you'd like to partner…"
                    placeholderTextColor="#A8A29E"
                    multiline
                    numberOfLines={3}
                    style={tw`bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 mb-4 text-stone-900 min-h-[80px]`}
                    textAlignVertical="top"
                  />
                  <TouchableOpacity
                    style={tw`bg-emerald-600 rounded-xl py-3 items-center ${busyId ? 'opacity-60' : ''}`}
                    disabled={!!busyId}
                    onPress={() => void sendPartnershipRequest()}
                  >
                    <Text style={tw`text-white font-bold`}>Send request</Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
