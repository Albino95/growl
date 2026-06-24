import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
import { getDashboard, type DashboardKPIs } from '../../services/api/business';
import type { Order } from '../../services/api/marketplace';
import { verticalScrollProps } from '../../constants/scroll';
import { startOfBusinessPeriod, bucketOrdersByDay } from '../../utils/businessMetrics';

type KpiCard = {
  label: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'neutral';
  icon: string;
};

export default function BizDashboard() {
  const navigation = useNavigation<any>();
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month'>('week');
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (period: 'today' | 'week' | 'month', isPullRefresh = false) => {
    try {
      if (!isPullRefresh) {
        setLoading(true);
      }
      setLoadError(null);
      const response = await getDashboard(period);
      if (response.success && response.data) {
        setKpis(response.data.kpis);
        setRecentOrders(response.data.kpis.recent_orders || []);
      }
    } catch (error: unknown) {
      console.error('[BizDashboard] Error loading dashboard:', error);
      const msg = error instanceof Error ? error.message : 'Failed to load dashboard';
      setLoadError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard(selectedPeriod, false);
  }, [loadDashboard, selectedPeriod]);

  const handleRefresh = () => {
    setRefreshing(true);
    void loadDashboard(selectedPeriod, true);
  };

  const openAnalytics = () => {
    navigation.getParent()?.navigate('BusinessAnalytics' as never);
  };

  const filteredRecentOrders = useMemo(() => {
    const t0 = startOfBusinessPeriod(selectedPeriod);
    return recentOrders.filter((o) => new Date(o.created_at).getTime() >= t0);
  }, [recentOrders, selectedPeriod]);

  const orderBars = useMemo(() => bucketOrdersByDay(recentOrders, 7), [recentOrders]);
  const maxBar = Math.max(1, ...orderBars.map((b) => b.count));

  const kpiCards: KpiCard[] = kpis
    ? [
        {
          label: 'Revenue',
          value: `$${kpis.total_revenue.toFixed(2)}`,
          change: `${kpis.deltas?.net_revenue_pct ?? 0}%`,
          trend: (kpis.deltas?.net_revenue_pct ?? 0) >= 0 ? 'up' : 'down',
          icon: 'cash',
        },
        {
          label: 'Orders',
          value: kpis.total_orders.toString(),
          change: `${kpis.deltas?.orders_pct ?? 0}%`,
          trend: (kpis.deltas?.orders_pct ?? 0) >= 0 ? 'up' : 'down',
          icon: 'receipt',
        },
        {
          label: 'Products',
          value: kpis.total_products.toString(),
          change: 'live',
          trend: 'neutral',
          icon: 'cube',
        },
        {
          label: 'Avg Order',
          value:
            kpis.total_orders > 0 ? `$${(kpis.total_revenue / kpis.total_orders).toFixed(2)}` : '$0.00',
          change: 'live',
          trend: 'neutral',
          icon: 'cart',
        },
      ]
    : [];

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-stone-50`} edges={['top']}>
      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={tw`pb-8`}
        {...verticalScrollProps}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#059669"
            colors={['#059669']}
          />
        }
      >
        <View style={tw`bg-white px-4 pt-4 pb-3 border-b border-stone-100`}>
          <View style={tw`flex-row items-center justify-between mb-3`}>
            <View style={tw`flex-1 pr-2`}>
              <Text style={tw`text-2xl font-bold tracking-tight text-stone-900`}>Business Dashboard</Text>
              <Text style={tw`text-sm text-stone-500 mt-1`}>
                Period filter applies to recent activity & charts below
              </Text>
            </View>
            <TouchableOpacity
              onPress={openAnalytics}
              style={tw`w-11 h-11 rounded-full bg-emerald-50 items-center justify-center border border-emerald-100`}
            >
              <Ionicons name="analytics-outline" size={22} color="#059669" />
            </TouchableOpacity>
          </View>

          <View style={tw`flex-row bg-stone-100 rounded-xl p-1`}>
            {(['today', 'week', 'month'] as const).map((period) => (
              <TouchableOpacity
                key={period}
                onPress={() => setSelectedPeriod(period)}
                style={tw`flex-1 py-2 rounded-lg ${selectedPeriod === period ? 'bg-white shadow-sm' : ''}`}
              >
                <Text
                  style={tw`text-center text-sm font-semibold ${
                    selectedPeriod === period ? 'text-emerald-700' : 'text-stone-500'
                  }`}
                >
                  {period.charAt(0).toUpperCase() + period.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={tw`px-4 pt-4`}>
          <Text style={tw`text-lg font-bold text-stone-900 mb-3`}>Key metrics</Text>
          {loadError ? (
            <View style={tw`mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200`}>
              <Text style={tw`text-sm text-red-700`}>{loadError}</Text>
            </View>
          ) : null}
          {loading && !kpis ? (
            <View style={tw`items-center justify-center py-8`}>
              <ActivityIndicator size="large" color="#059669" />
              <Text style={tw`text-stone-500 mt-2`}>Loading dashboard…</Text>
            </View>
          ) : (
            <View style={tw`flex-row flex-wrap -mx-2`}>
              {kpiCards.map((kpi, index) => (
                <View key={index} style={tw`w-1/2 px-2 mb-4`}>
                  <View style={tw`bg-white rounded-2xl p-4 border border-stone-100`}>
                    <View style={tw`flex-row items-center justify-between mb-2`}>
                      <Ionicons
                        name={kpi.icon as keyof typeof Ionicons.glyphMap}
                        size={24}
                        color={
                          kpi.trend === 'up' ? '#059669' : kpi.trend === 'down' ? '#EF4444' : '#78716C'
                        }
                      />
                      <View
                        style={tw`px-2 py-1 rounded-full ${
                          kpi.trend === 'up'
                            ? 'bg-emerald-50'
                            : kpi.trend === 'down'
                              ? 'bg-red-100'
                              : 'bg-stone-100'
                        }`}
                      >
                        <Text
                          style={tw`text-xs font-semibold ${
                            kpi.trend === 'up'
                              ? 'text-emerald-800'
                              : kpi.trend === 'down'
                                ? 'text-red-700'
                                : 'text-stone-600'
                          }`}
                        >
                          {kpi.change}
                        </Text>
                      </View>
                    </View>
                    <Text style={tw`text-2xl font-bold text-stone-900 mb-1`}>{kpi.value}</Text>
                    <Text style={tw`text-sm text-stone-500`}>{kpi.label}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {!loading && recentOrders.length > 0 ? (
          <View style={tw`px-4 mb-4`}>
            <View style={tw`flex-row items-center justify-between mb-2`}>
              <Text style={tw`text-lg font-bold text-stone-900`}>Order rhythm</Text>
              <TouchableOpacity onPress={openAnalytics}>
                <Text style={tw`text-sm text-emerald-700 font-semibold`}>Details</Text>
              </TouchableOpacity>
            </View>
            <View style={tw`bg-white rounded-2xl p-4 border border-stone-100`}>
              <Text style={tw`text-xs text-stone-500 mb-3`}>Last 7 days (from dashboard orders)</Text>
              <View style={tw`flex-row items-end justify-between h-28 px-1`}>
                {orderBars.map((b) => {
                  const h = Math.max(6, Math.round((b.count / maxBar) * 96));
                  return (
                    <View key={b.label} style={tw`flex-1 items-center mx-0.5`}>
                      <View style={[tw`w-full rounded-t-md bg-emerald-500`, { height: h }]} />
                      <Text style={tw`text-[10px] text-stone-400 mt-1`} numberOfLines={1}>
                        {b.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        ) : null}

        <View style={tw`px-4 mt-2 mb-4`}>
          <View style={tw`flex-row items-center justify-between mb-3`}>
            <Text style={tw`text-lg font-bold text-stone-900`}>Recent orders</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Orders')}>
              <Text style={tw`text-sm text-emerald-700 font-semibold`}>View all</Text>
            </TouchableOpacity>
          </View>
          <Text style={tw`text-xs text-stone-500 mb-2`}>
            Showing orders from selected period ({filteredRecentOrders.length} in view)
          </Text>
          <View style={tw`bg-white rounded-2xl border border-stone-100 overflow-hidden`}>
            {loading && recentOrders.length === 0 ? (
              <View style={tw`items-center justify-center py-8`}>
                <ActivityIndicator size="large" color="#059669" />
              </View>
            ) : filteredRecentOrders.length === 0 ? (
              <View style={tw`p-6 items-center`}>
                <Ionicons name="receipt-outline" size={48} color="#A8A29E" />
                <Text style={tw`text-stone-500 mt-4 text-center`}>
                  No orders in this period yet
                </Text>
              </View>
            ) : (
              filteredRecentOrders.map((order) => {
                const shippingAddress =
                  typeof order.shipping_address === 'string'
                    ? JSON.parse(order.shipping_address)
                    : order.shipping_address;
                const customerName = shippingAddress?.name || 'Unknown Customer';
                const orderTotal = order.total || 0;
                const orderStatus = order.status || 'pending';
                const firstItem = order.items && order.items.length > 0 ? order.items[0] : null;
                const productName = firstItem?.product_name || 'Product';

                return (
                  <TouchableOpacity
                    key={order.id}
                    style={tw`px-4 py-3 border-b border-stone-100 last:border-b-0`}
                    onPress={() => navigation.navigate('Orders')}
                  >
                    <View style={tw`flex-row items-center justify-between`}>
                      <View style={tw`flex-1`}>
                        <Text style={tw`font-semibold text-stone-900`}>{customerName}</Text>
                        <Text style={tw`text-sm text-stone-500`}>{productName}</Text>
                      </View>
                      <View style={tw`items-end`}>
                        <Text style={tw`font-bold text-stone-900`}>${orderTotal.toFixed(2)}</Text>
                        <View
                          style={tw`mt-1 px-2 py-0.5 rounded-full ${
                            orderStatus === 'completed'
                              ? 'bg-emerald-50'
                              : orderStatus === 'shipped'
                                ? 'bg-blue-50'
                                : orderStatus === 'delivered'
                                  ? 'bg-emerald-50'
                                  : 'bg-amber-50'
                          }`}
                        >
                          <Text
                            style={tw`text-xs font-medium ${
                              orderStatus === 'completed'
                                ? 'text-emerald-800'
                                : orderStatus === 'shipped'
                                  ? 'text-blue-700'
                                  : orderStatus === 'delivered'
                                    ? 'text-emerald-800'
                                    : 'text-amber-800'
                            }`}
                          >
                            {orderStatus}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <Text style={tw`text-xs text-stone-400 mt-1`}>{formatTimeAgo(order.created_at)}</Text>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </View>

        <View style={tw`px-4 mb-6`}>
          <Text style={tw`text-lg font-bold text-stone-900 mb-3`}>Quick actions</Text>
          <View style={tw`flex-row flex-wrap -mx-2`}>
            <TouchableOpacity style={tw`w-1/2 px-2 mb-3`} onPress={() => navigation.navigate('Inventory')}>
              <View style={tw`bg-white rounded-2xl p-4 border border-stone-200 items-center`}>
                <View style={tw`w-12 h-12 bg-emerald-50 rounded-full items-center justify-center mb-2`}>
                  <Ionicons name="add-circle" size={28} color="#059669" />
                </View>
                <Text style={tw`text-sm font-semibold text-stone-900`}>Add product</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={tw`w-1/2 px-2 mb-3`} onPress={() => navigation.navigate('Marketing')}>
              <View style={tw`bg-white rounded-2xl p-4 border border-stone-200 items-center`}>
                <View style={tw`w-12 h-12 bg-violet-50 rounded-full items-center justify-center mb-2`}>
                  <Ionicons name="megaphone" size={28} color="#7C3AED" />
                </View>
                <Text style={tw`text-sm font-semibold text-stone-900`}>Promotions</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={tw`w-1/2 px-2 mb-3`} onPress={openAnalytics}>
              <View style={tw`bg-white rounded-2xl p-4 border border-stone-200 items-center`}>
                <View style={tw`w-12 h-12 bg-teal-50 rounded-full items-center justify-center mb-2`}>
                  <Ionicons name="analytics" size={28} color="#0D9488" />
                </View>
                <Text style={tw`text-sm font-semibold text-stone-900`}>Analytics</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={tw`w-1/2 px-2 mb-3`} onPress={() => navigation.navigate('Partnerships')}>
              <View style={tw`bg-white rounded-2xl p-4 border border-stone-200 items-center`}>
                <View style={tw`w-12 h-12 bg-orange-50 rounded-full items-center justify-center mb-2`}>
                  <Ionicons name="people" size={28} color="#EA580C" />
                </View>
                <Text style={tw`text-sm font-semibold text-stone-900`}>Partners</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
