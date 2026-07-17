import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
import { useBusinessDashboard } from '../../hooks/useBusinessDashboard';
import { setCatalogFilter, setOrdersFilter } from '../../store/slices/businessSlice';
import { useAppDispatch } from '../../store/hooks';
import { verticalScrollProps } from '../../constants/scroll';
import KpiCard from '../../components/business/KpiCard';
import PeriodToggle from '../../components/business/PeriodToggle';
import ActionInbox, { type ActionInboxItem } from '../../components/business/ActionInbox';
import OrderStatusPill from '../../components/business/OrderStatusPill';
import SkeletonCard from '../../components/ui/SkeletonCard';
import SectionLabel from '../../components/ui/SectionLabel';

function formatTimeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function BizDashboard() {
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const { period, setPeriod, kpis, timeseries, status, error, loading, refresh } =
    useBusinessDashboard();
  const [refreshing, setRefreshing] = useState(false);

  const stackNav = navigation.getParent?.() || navigation;

  const openAnalytics = () => stackNav.navigate('BusinessAnalytics');
  const openSettings = () => stackNav.navigate('BusinessSettings');

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh({ force: true });
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const inboxItems: ActionInboxItem[] = useMemo(() => {
    if (!kpis) return [];
    const items: ActionInboxItem[] = [];
    if ((kpis.pending_orders || 0) > 0) {
      items.push({
        id: 'pending-orders',
        title: `${kpis.pending_orders} order${kpis.pending_orders === 1 ? '' : 's'} to fulfill`,
        subtitle: 'Mark as processing or ship',
        icon: 'receipt-outline',
        tone: 'amber',
        onPress: () => {
          dispatch(setOrdersFilter('pending'));
          navigation.navigate('Orders');
        },
      });
    }
    if ((kpis.low_stock_count || 0) > 0) {
      items.push({
        id: 'low-stock',
        title: `${kpis.low_stock_count} SKU${kpis.low_stock_count === 1 ? '' : 's'} low stock`,
        subtitle: `Below threshold of ${kpis.low_stock_threshold ?? 10}`,
        icon: 'alert-circle-outline',
        tone: 'red',
        onPress: () => {
          dispatch(setCatalogFilter('low'));
          navigation.navigate('Catalog');
        },
      });
    }
    if ((kpis.pending_partner_requests || 0) > 0) {
      items.push({
        id: 'partner-requests',
        title: `${kpis.pending_partner_requests} partnership request${kpis.pending_partner_requests === 1 ? '' : 's'}`,
        subtitle: 'Review discover requests',
        icon: 'people-outline',
        tone: 'blue',
        onPress: () => navigation.navigate('Grow', { segment: 'partners' }),
      });
    }
    return items;
  }, [kpis, navigation, dispatch]);

  const maxSeries = Math.max(1, ...timeseries.map((p) => p.orders || 0));
  const recent = (kpis?.recent_orders || []).slice(0, 5);
  const net = kpis?.net_revenue ?? kpis?.total_revenue ?? 0;
  const aov = kpis?.aov ?? 0;

  return (
    <SafeAreaView style={tw`flex-1 bg-stone-50`} edges={['top']}>
      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={tw`pb-10`}
        {...verticalScrollProps}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#059669"
            colors={['#059669']}
          />
        }
      >
        <View style={tw`bg-white px-4 pt-4 pb-3 border-b border-stone-100`}>
          <View style={tw`flex-row items-center justify-between mb-3`}>
            <View style={tw`flex-1 pr-2`}>
              <Text style={tw`text-2xl font-bold tracking-tight text-stone-900`}>Home</Text>
              <Text style={tw`text-sm text-stone-500 mt-1`}>What needs attention & how the store is doing</Text>
            </View>
            <View style={tw`flex-row`}>
              <TouchableOpacity
                onPress={openAnalytics}
                style={tw`w-11 h-11 rounded-full bg-emerald-50 items-center justify-center border border-emerald-100 mr-2`}
              >
                <Ionicons name="analytics-outline" size={22} color="#059669" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={openSettings}
                style={tw`w-11 h-11 rounded-full bg-stone-100 items-center justify-center`}
              >
                <Ionicons name="settings-outline" size={22} color="#57534E" />
              </TouchableOpacity>
            </View>
          </View>
          <PeriodToggle value={period} onChange={setPeriod} />
        </View>

        <View style={tw`px-4 pt-4`}>
          <SectionLabel>Action inbox</SectionLabel>
          {error ? (
            <View style={tw`mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200`}>
              <Text style={tw`text-sm text-red-700 mb-2`}>{error}</Text>
              <TouchableOpacity onPress={() => void refresh({ force: true })}>
                <Text style={tw`text-sm font-semibold text-red-800`}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {loading ? <SkeletonCard variant="product" /> : <ActionInbox items={inboxItems} />}
        </View>

        <View style={tw`px-4 pt-5`}>
          <SectionLabel>Key metrics</SectionLabel>
          {loading ? (
            <View style={tw`gap-3`}>
              <SkeletonCard variant="product" />
              <SkeletonCard variant="product" />
            </View>
          ) : (
            <View style={tw`flex-row flex-wrap gap-3`}>
              <KpiCard
                label="Net revenue"
                value={`$${Number(net).toFixed(2)}`}
                change={`${kpis?.deltas?.net_revenue_pct ?? 0}%`}
                trend={(kpis?.deltas?.net_revenue_pct ?? 0) >= 0 ? 'up' : 'down'}
                icon="cash-outline"
                onPress={openAnalytics}
              />
              <KpiCard
                label="Orders"
                value={String(kpis?.total_orders ?? 0)}
                change={`${kpis?.deltas?.orders_pct ?? 0}%`}
                trend={(kpis?.deltas?.orders_pct ?? 0) >= 0 ? 'up' : 'down'}
                icon="receipt-outline"
                onPress={() => navigation.navigate('Orders')}
              />
              <KpiCard
                label="AOV"
                value={`$${Number(aov).toFixed(2)}`}
                change="avg"
                trend="neutral"
                icon="cart-outline"
                onPress={openAnalytics}
              />
              <KpiCard
                label="To fulfill"
                value={String(kpis?.pending_orders ?? 0)}
                change="live"
                trend={(kpis?.pending_orders ?? 0) > 0 ? 'down' : 'neutral'}
                icon="cube-outline"
                onPress={() => {
                  dispatch(setOrdersFilter('pending'));
                  navigation.navigate('Orders');
                }}
              />
            </View>
          )}
        </View>

        <View style={tw`px-4 pt-5`}>
          <View style={tw`flex-row items-center justify-between mb-2`}>
            <Text style={tw`text-lg font-bold text-stone-900`}>Order rhythm</Text>
            <TouchableOpacity onPress={openAnalytics}>
              <Text style={tw`text-sm text-emerald-700 font-semibold`}>Full analytics</Text>
            </TouchableOpacity>
          </View>
          <View style={tw`bg-white rounded-2xl p-4 border border-stone-100`}>
            {timeseries.length === 0 ? (
              <Text style={tw`text-sm text-stone-500`}>No order volume in this period yet.</Text>
            ) : (
              <View style={tw`flex-row items-end justify-between h-28`}>
                {timeseries.map((p) => {
                  const h = Math.max(6, Math.round(((p.orders || 0) / maxSeries) * 96));
                  const label = (p.day || '').slice(5) || p.day;
                  return (
                    <View key={p.day} style={tw`flex-1 items-center mx-0.5`}>
                      <View style={[tw`w-full rounded-t-md bg-emerald-500`, { height: h }]} />
                      <Text style={tw`text-[9px] text-stone-400 mt-1`} numberOfLines={1}>
                        {label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </View>

        <View style={tw`px-4 pt-5`}>
          <View style={tw`flex-row items-center justify-between mb-3`}>
            <Text style={tw`text-lg font-bold text-stone-900`}>Recent orders</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Orders')}>
              <Text style={tw`text-sm text-emerald-700 font-semibold`}>View all</Text>
            </TouchableOpacity>
          </View>
          <View style={tw`bg-white rounded-2xl border border-stone-100 overflow-hidden`}>
            {recent.length === 0 ? (
              <View style={tw`p-6 items-center`}>
                <Ionicons name="receipt-outline" size={40} color="#A8A29E" />
                <Text style={tw`text-stone-500 mt-3 text-center text-sm`}>No orders in this period</Text>
              </View>
            ) : (
              recent.map((order) => {
                const shipping =
                  typeof order.shipping_address === 'string'
                    ? JSON.parse(order.shipping_address)
                    : order.shipping_address;
                return (
                  <TouchableOpacity
                    key={order.id}
                    style={tw`px-4 py-3 border-b border-stone-100`}
                    onPress={() =>
                      stackNav.navigate('BusinessOrderDetail', { orderId: order.id })
                    }
                  >
                    <View style={tw`flex-row items-center justify-between`}>
                      <View style={tw`flex-1 pr-2`}>
                        <Text style={tw`font-semibold text-stone-900`}>
                          {shipping?.name || 'Customer'}
                        </Text>
                        <Text style={tw`text-xs text-stone-400 mt-0.5`}>
                          {formatTimeAgo(order.created_at)}
                        </Text>
                      </View>
                      <View style={tw`items-end`}>
                        <Text style={tw`font-bold text-stone-900`}>
                          ${Number(order.total || 0).toFixed(2)}
                        </Text>
                        <View style={tw`mt-1`}>
                          <OrderStatusPill status={order.status || 'pending'} />
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </View>

        <View style={tw`px-4 pt-5`}>
          <Text style={tw`text-lg font-bold text-stone-900 mb-3`}>Quick actions</Text>
          <View style={tw`flex-row flex-wrap -mx-1.5`}>
            {[
              {
                label: 'Add product',
                icon: 'add-circle' as const,
                color: '#059669',
                bg: 'bg-emerald-50',
                onPress: () => navigation.navigate('Catalog', { openForm: true }),
              },
              {
                label: 'Orders',
                icon: 'receipt' as const,
                color: '#2563EB',
                bg: 'bg-blue-50',
                onPress: () => navigation.navigate('Orders'),
              },
              {
                label: 'Discover',
                icon: 'people' as const,
                color: '#EA580C',
                bg: 'bg-orange-50',
                onPress: () => navigation.navigate('Grow', { segment: 'partners' }),
              },
              {
                label: 'Analytics',
                icon: 'analytics' as const,
                color: '#0D9488',
                bg: 'bg-teal-50',
                onPress: openAnalytics,
              },
            ].map((action) => (
              <TouchableOpacity key={action.label} style={tw`w-1/2 px-1.5 mb-3`} onPress={action.onPress}>
                <View style={tw`bg-white rounded-2xl p-4 border border-stone-200 items-center`}>
                  <View style={tw`w-12 h-12 ${action.bg} rounded-full items-center justify-center mb-2`}>
                    <Ionicons name={action.icon} size={26} color={action.color} />
                  </View>
                  <Text style={tw`text-sm font-semibold text-stone-900`}>{action.label}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {status === 'loading' && kpis ? (
          <Text style={tw`text-center text-xs text-stone-400 mt-2`}>Refreshing…</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
