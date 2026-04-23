import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import { getDashboard, type DashboardKPIs } from '../../services/api/business';
import type { FeedPost } from '../../services/api/feed';
import type { Order } from '../../services/api/marketplace';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchFeedPosts } from '../../store/slices/feedSlice';
import { horizontalScrollProps, verticalScrollProps } from '../../constants/scroll';

type Campaign = {
  id: string;
  name: string;
  type: 'promotion' | 'sponsored' | 'influencer';
  status: 'active' | 'paused' | 'completed';
  budget: number;
  spent: number;
  impressions: number;
  clicks: number;
  conversions: number;
  startDate: string;
  endDate: string;
};

/** UI-only samples until a campaigns API exists */
const MOCK_CAMPAIGNS: Campaign[] = [
  {
    id: '1',
    name: 'Summer Fitness Sale',
    type: 'promotion',
    status: 'active',
    budget: 5000,
    spent: 3200,
    impressions: 45000,
    clicks: 1200,
    conversions: 45,
    startDate: '2024-01-01',
    endDate: '2024-01-31',
  },
  {
    id: '2',
    name: 'Instructor Partnership - Yoga',
    type: 'influencer',
    status: 'active',
    budget: 2000,
    spent: 850,
    impressions: 28000,
    clicks: 890,
    conversions: 23,
    startDate: '2024-01-10',
    endDate: '2024-02-10',
  },
];

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

function showError(message: string) {
  if (Platform.OS === 'web') {
    alert(message);
  } else {
    Alert.alert('Error', message);
  }
}

export default function MarketingScreen() {
  const dispatch = useAppDispatch();
  const feedPosts = useAppSelector((s) => s.feed.items);
  const feedStatus = useAppSelector((s) => s.feed.status);
  const feedError = useAppSelector((s) => s.feed.error);
  const feedLoading = feedStatus === 'loading';

  const [campaigns] = useState<Campaign[]>(MOCK_CAMPAIGNS);
  const [activeTab, setActiveTab] = useState<'campaigns' | 'posts' | 'create' | 'analytics'>('campaigns');

  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [kpiNotice, setKpiNotice] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);

  const loadKpis = useCallback(async () => {
    setKpiLoading(true);
    setKpiNotice(null);
    try {
      const response = await getDashboard();
      if (response.success && response.data?.kpis) {
        setKpis(response.data.kpis);
      } else {
        setKpis(null);
        setKpiNotice('Could not load store metrics.');
      }
    } catch (e: unknown) {
      setKpis(null);
      const msg = e instanceof Error ? e.message : 'Failed to load dashboard';
      if (/business|FORBIDDEN|403/i.test(msg)) {
        setKpiNotice('Store metrics are available for business accounts. You can still browse community posts below.');
      } else {
        setKpiNotice(msg);
      }
    } finally {
      setKpiLoading(false);
    }
  }, []);

  const loadInitial = useCallback(async () => {
    try {
      await Promise.all([loadKpis(), dispatch(fetchFeedPosts()).unwrap()]);
    } catch {
      // KPIs or feed may fail independently; errors surface in UI state.
    }
  }, [dispatch, loadKpis]);

  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadInitial();
    setRefreshing(false);
  }, [loadInitial]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const totalSpent = campaigns.reduce((sum, c) => sum + c.spent, 0);
  const totalBudget = campaigns.reduce((sum, c) => sum + c.budget, 0);
  const totalConversions = campaigns.reduce((sum, c) => sum + c.conversions, 0);
  const ctr =
    campaigns.length > 0
      ? (campaigns.reduce((sum, c) => sum + (c.impressions ? c.clicks / c.impressions : 0), 0) / campaigns.length) * 100
      : 0;

  const recentOrders: Order[] = kpis?.recent_orders ?? [];

  const renderStorePerformanceCard = () => (
    <View style={tw`bg-white rounded-xl p-4 mb-4 shadow-sm border border-gray-100`}>
      <Text style={tw`text-lg font-bold text-gray-900 mb-3`}>Store performance</Text>
      <Text style={tw`text-xs text-gray-500 mb-3`}>Live data from your business dashboard API</Text>
      {kpiLoading && !kpis ? (
        <ActivityIndicator size="small" color="#2563EB" />
      ) : kpiNotice && !kpis ? (
        <Text style={tw`text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-3`}>{kpiNotice}</Text>
      ) : kpis ? (
        <View style={tw`flex-row flex-wrap -mx-2`}>
          <View style={tw`w-1/2 px-2 mb-3`}>
            <Text style={tw`text-xs text-gray-500 mb-1`}>Revenue</Text>
            <Text style={tw`text-xl font-bold text-gray-900`}>${kpis.total_revenue.toFixed(2)}</Text>
          </View>
          <View style={tw`w-1/2 px-2 mb-3`}>
            <Text style={tw`text-xs text-gray-500 mb-1`}>Orders</Text>
            <Text style={tw`text-xl font-bold text-gray-900`}>{kpis.total_orders}</Text>
            <Text style={tw`text-xs text-gray-500 mt-1`}>
              {kpis.pending_orders} pending · {kpis.completed_orders} completed
            </Text>
          </View>
          <View style={tw`w-1/2 px-2 mb-3`}>
            <Text style={tw`text-xs text-gray-500 mb-1`}>Products</Text>
            <Text style={tw`text-xl font-bold text-gray-900`}>{kpis.total_products}</Text>
          </View>
          <View style={tw`w-1/2 px-2 mb-3`}>
            <Text style={tw`text-xs text-gray-500 mb-1`}>Stock units</Text>
            <Text style={tw`text-xl font-bold text-gray-900`}>{kpis.total_stock ?? 0}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={tw`flex-1 bg-stone-50`} edges={['top']}>
      <View
        style={[
          tw`bg-white px-4 pt-4 pb-3 border-b border-stone-100`,
          Platform.OS === 'ios'
            ? {
                shadowColor: '#0f172a',
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.06,
                shadowRadius: 8,
              }
            : { elevation: 2 },
        ]}
      >
        <Text style={tw`text-2xl font-bold tracking-tight text-stone-900 mb-1`}>Marketing Center</Text>
        <Text style={tw`text-sm text-stone-500 mb-3`}>Campaigns, community signal, and store performance</Text>

        <ScrollView horizontal style={tw`-mx-4 px-4`} {...horizontalScrollProps}>
          <View style={tw`flex-row bg-stone-100 rounded-xl p-1`}>
            {(['campaigns', 'posts', 'create', 'analytics'] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={tw`flex-1 py-2.5 px-3 rounded-lg ${activeTab === tab ? 'bg-white' : ''}`}
              >
                <Text
                  style={tw`text-center text-sm font-semibold ${
                    activeTab === tab ? 'text-emerald-700' : 'text-stone-500'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {activeTab === 'campaigns' && (
        <ScrollView
          style={tw`flex-1 px-4 pt-4`}
          {...verticalScrollProps}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onPullRefresh}
              tintColor="#059669"
              colors={['#059669']}
            />
          }
        >
          {renderStorePerformanceCard()}

          <View style={tw`bg-white rounded-xl p-4 mb-4 shadow-sm border border-gray-100`}>
            <Text style={tw`text-lg font-bold text-gray-900 mb-1`}>Sample campaigns</Text>
            <Text style={tw`text-xs text-gray-500 mb-3`}>
              Placeholder UI only — no campaign API yet. Metrics below are fictional.
            </Text>
            <View style={tw`flex-row flex-wrap -mx-2`}>
              <View style={tw`w-1/2 px-2 mb-3`}>
                <Text style={tw`text-xs text-gray-500 mb-1`}>Budget (sample)</Text>
                <Text style={tw`text-xl font-bold text-gray-900`}>
                  ${totalSpent.toFixed(0)} / ${totalBudget.toFixed(0)}
                </Text>
                <View style={tw`h-2 bg-gray-200 rounded-full mt-2 overflow-hidden`}>
                  <View
                    style={[tw`h-full bg-blue-600 rounded-full`, { width: `${(totalSpent / totalBudget) * 100}%` }]}
                  />
                </View>
              </View>
              <View style={tw`w-1/2 px-2 mb-3`}>
                <Text style={tw`text-xs text-gray-500 mb-1`}>Conversions (sample)</Text>
                <Text style={tw`text-xl font-bold text-green-600`}>{totalConversions}</Text>
                {totalConversions > 0 ? (
                  <Text style={tw`text-xs text-gray-500 mt-1`}>
                    ${(totalSpent / totalConversions).toFixed(2)} per conversion
                  </Text>
                ) : null}
              </View>
              <View style={tw`w-1/2 px-2 mb-3`}>
                <Text style={tw`text-xs text-gray-500 mb-1`}>CTR (sample)</Text>
                <Text style={tw`text-xl font-bold text-blue-600`}>{ctr.toFixed(2)}%</Text>
              </View>
              <View style={tw`w-1/2 px-2 mb-3`}>
                <Text style={tw`text-xs text-gray-500 mb-1`}>Active (sample)</Text>
                <Text style={tw`text-xl font-bold text-gray-900`}>
                  {campaigns.filter((c) => c.status === 'active').length}
                </Text>
              </View>
            </View>
          </View>

          <Text style={tw`text-lg font-bold text-gray-900 mb-3`}>Campaign ideas</Text>
          {campaigns.map((campaign) => (
            <View key={campaign.id} style={tw`bg-white rounded-xl p-4 mb-3 shadow-sm border border-gray-100`}>
              <View style={tw`flex-row items-center justify-between mb-3`}>
                <View style={tw`flex-1`}>
                  <Text style={tw`text-lg font-bold text-gray-900`}>{campaign.name}</Text>
                  <View style={tw`flex-row items-center mt-1`}>
                    <View
                      style={tw`px-2 py-1 rounded-full ${
                        campaign.type === 'promotion'
                          ? 'bg-blue-100'
                          : campaign.type === 'sponsored'
                            ? 'bg-purple-100'
                            : 'bg-orange-100'
                      } mr-2`}
                    >
                      <Text
                        style={tw`text-xs font-semibold ${
                          campaign.type === 'promotion'
                            ? 'text-blue-700'
                            : campaign.type === 'sponsored'
                              ? 'text-purple-700'
                              : 'text-orange-700'
                        }`}
                      >
                        {campaign.type}
                      </Text>
                    </View>
                    <View
                      style={tw`px-2 py-1 rounded-full ${
                        campaign.status === 'active'
                          ? 'bg-green-100'
                          : campaign.status === 'paused'
                            ? 'bg-yellow-100'
                            : 'bg-gray-100'
                      }`}
                    >
                      <Text
                        style={tw`text-xs font-semibold ${
                          campaign.status === 'active'
                            ? 'text-green-700'
                            : campaign.status === 'paused'
                              ? 'text-yellow-700'
                              : 'text-gray-700'
                        }`}
                      >
                        {campaign.status}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={tw`border-t border-gray-100 pt-3`}>
                <View style={tw`flex-row items-center justify-between mb-2`}>
                  <Text style={tw`text-sm text-gray-500`}>Budget</Text>
                  <Text style={tw`text-sm font-semibold text-gray-900`}>
                    ${campaign.spent.toFixed(0)} / ${campaign.budget.toFixed(0)}
                  </Text>
                </View>
                <View style={tw`h-2 bg-gray-200 rounded-full overflow-hidden mb-3`}>
                  <View
                    style={[
                      tw`h-full bg-blue-600 rounded-full`,
                      { width: `${(campaign.spent / campaign.budget) * 100}%` },
                    ]}
                  />
                </View>
                <View style={tw`flex-row flex-wrap -mx-2`}>
                  <View style={tw`w-1/3 px-2`}>
                    <Text style={tw`text-xs text-gray-500`}>Impressions</Text>
                    <Text style={tw`text-sm font-bold text-gray-900`}>{campaign.impressions.toLocaleString()}</Text>
                  </View>
                  <View style={tw`w-1/3 px-2`}>
                    <Text style={tw`text-xs text-gray-500`}>Clicks</Text>
                    <Text style={tw`text-sm font-bold text-gray-900`}>{campaign.clicks.toLocaleString()}</Text>
                  </View>
                  <View style={tw`w-1/3 px-2`}>
                    <Text style={tw`text-xs text-gray-500`}>Conversions</Text>
                    <Text style={tw`text-sm font-bold text-green-600`}>{campaign.conversions}</Text>
                  </View>
                </View>
              </View>
            </View>
          ))}

          <TouchableOpacity
            style={tw`bg-blue-600 rounded-xl py-4 flex-row items-center justify-center mb-4 opacity-60`}
            onPress={() => showError('Campaign creation will be available when the marketing API is added.')}
          >
            <Ionicons name="add-circle" size={24} color="#FFFFFF" style={tw`mr-2`} />
            <Text style={tw`text-white font-bold text-base`}>Create New Campaign</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {activeTab === 'posts' && (
        <ScrollView
          style={tw`flex-1 px-4 pt-4`}
          {...verticalScrollProps}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onPullRefresh}
              tintColor="#059669"
              colors={['#059669']}
            />
          }
        >
          <Text style={tw`text-lg font-bold text-gray-900 mb-3`}>Community feed</Text>
          <Text style={tw`text-sm text-gray-600 mb-4`}>Posts from your live feed API — useful for partnerships and trends.</Text>
          {feedLoading && feedPosts.length === 0 ? (
            <ActivityIndicator style={tw`mt-8`} color="#2563EB" />
          ) : feedError ? (
            <Text style={tw`text-sm text-red-600 mb-4`}>{feedError}</Text>
          ) : feedPosts.length === 0 ? (
            <Text style={tw`text-gray-500`}>No posts in the last week yet.</Text>
          ) : (
            feedPosts.map((post) => {
              const username = post.metadata?.username || 'User';
              const likes = post.metadata?.likes ?? 0;
              const comments = post.metadata?.comments ?? 0;
              const isInstructor = Boolean(post.metadata?.isInstructor);
              return (
                <View key={post.id} style={tw`bg-white rounded-xl p-4 mb-3 shadow-sm border border-gray-100`}>
                  <View style={tw`flex-row items-center mb-3`}>
                    <View style={tw`w-10 h-10 rounded-full bg-gray-100 items-center justify-center mr-3`}>
                      <Text style={tw`text-lg`}>{post.metadata?.avatar || '👤'}</Text>
                    </View>
                    <View style={tw`flex-1`}>
                      <View style={tw`flex-row items-center`}>
                        <Text style={tw`font-semibold text-gray-900`}>{username}</Text>
                        {isInstructor ? (
                          <View style={tw`ml-2 px-2 py-0.5 bg-purple-100 rounded-full`}>
                            <Text style={tw`text-xs font-semibold text-purple-700`}>Instructor</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={tw`text-xs text-gray-500`}>
                        {formatTimeAgo(post.created_at)} · {post.category}
                      </Text>
                    </View>
                  </View>
                  {post.image_url ? (
                    <Image source={{ uri: post.image_url }} style={tw`w-full h-64 rounded-xl mb-3`} resizeMode="cover" />
                  ) : (
                    <View style={tw`w-full h-32 bg-gray-100 rounded-xl items-center justify-center mb-3`}>
                      <Ionicons name="image-outline" size={40} color="#9CA3AF" />
                    </View>
                  )}
                  {post.caption ? <Text style={tw`text-gray-900 mb-3`}>{post.caption}</Text> : null}
                  <View style={tw`flex-row items-center justify-between`}>
                    <View style={tw`flex-row items-center`}>
                      <View style={tw`flex-row items-center mr-4`}>
                        <Ionicons name="heart" size={18} color="#EF4444" />
                        <Text style={tw`text-sm text-gray-600 ml-1`}>{likes}</Text>
                      </View>
                      <View style={tw`flex-row items-center`}>
                        <Ionicons name="chatbubble" size={18} color="#6B7280" />
                        <Text style={tw`text-sm text-gray-600 ml-1`}>{comments}</Text>
                      </View>
                    </View>
                    {isInstructor ? (
                      <TouchableOpacity
                        style={tw`px-4 py-2 bg-blue-600 rounded-lg`}
                        onPress={() =>
                          showError('Partnership requests will use business/instructor APIs when enabled.')
                        }
                      >
                        <Text style={tw`text-white text-sm font-semibold`}>Partner</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {activeTab === 'create' && (
        <View style={tw`flex-1 items-center justify-center p-6`}>
          <Ionicons name="megaphone-outline" size={64} color="#D1D5DB" />
          <Text style={tw`text-gray-500 mt-4 text-center text-lg`}>
            Campaign creation form coming soon
          </Text>
        </View>
      )}

      {activeTab === 'analytics' && (
        <ScrollView
          style={tw`flex-1 px-4 pt-4`}
          {...verticalScrollProps}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onPullRefresh}
              tintColor="#059669"
              colors={['#059669']}
            />
          }
        >
          <Text style={tw`text-lg font-bold text-gray-900 mb-3`}>Analytics</Text>
          <Text style={tw`text-sm text-gray-600 mb-4`}>Pulled from the same business dashboard endpoint as Biz Dashboard.</Text>
          {renderStorePerformanceCard()}
          {kpis && recentOrders.length > 0 ? (
            <View style={tw`bg-white rounded-xl p-4 mb-6 shadow-sm border border-gray-100`}>
              <Text style={tw`text-base font-bold text-gray-900 mb-3`}>Recent orders</Text>
              {recentOrders.slice(0, 8).map((o) => (
                <View key={o.id} style={tw`border-b border-gray-100 py-3 last:border-b-0`}>
                  <View style={tw`flex-row justify-between`}>
                    <Text style={tw`text-sm font-medium text-gray-900`} numberOfLines={1}>
                      {o.id}
                    </Text>
                    <Text style={tw`text-sm font-semibold text-gray-900`}>${Number(o.total).toFixed(2)}</Text>
                  </View>
                  <Text style={tw`text-xs text-gray-500 mt-1 capitalize`}>{o.status}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
