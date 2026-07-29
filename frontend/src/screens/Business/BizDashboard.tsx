import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
import { useBusinessDashboard } from '../../hooks/useBusinessDashboard';
import {
  setCatalogFilter,
  setOrdersFilter,
  fetchNotifications,
  markNotificationReadLocal,
} from '../../store/slices/businessSlice';
import { markBusinessNotificationRead } from '../../services/api/business';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { verticalScrollProps, TAB_SCREEN_BOTTOM_PADDING } from '../../constants/scroll';
import BusinessScreen from '../../components/business/BusinessScreen';
import KpiCard from '../../components/business/KpiCard';
import PeriodToggle from '../../components/business/PeriodToggle';
import ActionInbox, { type ActionInboxItem } from '../../components/business/ActionInbox';
import OrderStatusPill from '../../components/business/OrderStatusPill';
import SkeletonCard from '../../components/ui/SkeletonCard';
import { parseShippingAddress } from '../../utils/safeJson';
import { featureFlags } from '../../constants/featureFlags';

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

function SectionHeading({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={tw`flex-row items-center justify-between mb-2`}>
      <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
        {title}
      </Text>
      {action && onAction ? (
        <TouchableOpacity onPress={onAction}>
          <Text style={tw`text-sm font-semibold text-emerald-700`}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function BizDashboard() {
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const notifications = useAppSelector((s) => s.business.notifications);
  const unreadCount = useAppSelector((s) => s.business.unreadNotificationCount);
  const { period, setPeriod, kpis, timeseries, status, error, loading, refresh } =
    useBusinessDashboard();
  const [refreshing, setRefreshing] = useState(false);

  const stackNav = navigation.getParent?.() || navigation;

  const openAnalytics = () => stackNav.navigate('BusinessAnalytics');
  const openSettings = () => stackNav.navigate('BusinessSettings');
  const openCustomers = () => stackNav.navigate('BusinessCustomers');
  const openMessages = () => stackNav.navigate('BusinessMessages');
  const openCreatePost = () => stackNav.navigate('BusinessCreatePost');

  useFocusEffect(
    useCallback(() => {
      void dispatch(fetchNotifications());
    }, [dispatch])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh({ force: true }), dispatch(fetchNotifications()).unwrap()]);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, dispatch]);

  const handleNotificationPress = useCallback(
    (id: string, refType?: string | null, refId?: string | null) => {
      dispatch(markNotificationReadLocal(id));
      void markBusinessNotificationRead(id).catch(() => {});
      if (refType === 'order' && refId) {
        stackNav.navigate('BusinessOrderDetail', { orderId: refId });
      }
    },
    [dispatch, stackNav]
  );

  const inboxItems: ActionInboxItem[] = useMemo(() => {
    const items: ActionInboxItem[] = [];

    notifications
      .filter((n) => !n.read)
      .slice(0, 5)
      .forEach((n) => {
        items.push({
          id: `notif-${n.id}`,
          title: n.title,
          subtitle: n.body || undefined,
          icon: 'notifications-outline',
          tone: 'blue',
          onPress: () => handleNotificationPress(n.id, n.ref_type, n.ref_id),
        });
      });

    if (!kpis) return items;
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
  }, [kpis, navigation, dispatch, notifications, handleNotificationPress]);

  const maxSeries = Math.max(1, ...timeseries.map((p) => p.orders || 0));
  const recent = (kpis?.recent_orders || []).slice(0, 5);
  const net = kpis?.net_revenue ?? kpis?.total_revenue ?? 0;
  const aov = kpis?.aov ?? 0;
  const availablePayout = net * 0.92;
  const feePending = net * 0.08;

  const notificationBadge =
    unreadCount > 0 ? (
      <View style={tw`min-w-[22px] h-[22px] rounded-full bg-red-500 items-center justify-center px-1`}>
        <Text style={tw`text-[11px] font-bold text-white`}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
      </View>
    ) : null;

  const quickActions = [
    {
      label: 'Add product',
      icon: 'add-circle-outline' as const,
      onPress: () => navigation.navigate('Catalog', { openForm: true }),
    },
    {
      label: 'Orders',
      icon: 'receipt-outline' as const,
      onPress: () => navigation.navigate('Orders'),
    },
    {
      label: 'Customers',
      icon: 'people-outline' as const,
      onPress: openCustomers,
    },
    {
      label: 'Messages',
      icon: 'chatbubbles-outline' as const,
      onPress: openMessages,
    },
    {
      label: 'Post',
      icon: 'create-outline' as const,
      onPress: openCreatePost,
    },
    {
      label: 'Partners',
      icon: 'people-outline' as const,
      onPress: () => navigation.navigate('Grow', { segment: 'partners' }),
    },
    {
      label: 'Campaigns',
      icon: 'megaphone-outline' as const,
      onPress: () => navigation.navigate('Grow', { segment: 'community' }),
    },
    {
      label: 'Analytics',
      icon: 'analytics-outline' as const,
      onPress: openAnalytics,
    },
    ...(featureFlags.enableKYC
      ? [
          {
            label: 'Verify ID',
            icon: 'shield-checkmark-outline' as const,
            onPress: () => stackNav.navigate('BusinessKYC'),
          },
        ]
      : []),
  ];

  return (
    <BusinessScreen
      title="Home"
      subtitle="What needs attention and how the store is doing"
      onAnalytics={openAnalytics}
      onSettings={openSettings}
      onMessages={openMessages}
      headerRight={notificationBadge}
    >
      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={{ paddingBottom: TAB_SCREEN_BOTTOM_PADDING }}
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
        <View style={tw`px-5 mb-4`}>
          <PeriodToggle value={period} onChange={setPeriod} />
        </View>

        <View style={tw`px-5 mb-6`}>
          <SectionHeading title="Action inbox" />
          {error ? (
            <View style={tw`mb-3 py-2`}>
              <Text style={tw`text-sm text-red-700 mb-1`}>{error}</Text>
              <TouchableOpacity onPress={() => void refresh({ force: true })}>
                <Text style={tw`text-sm font-semibold text-emerald-700`}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {loading ? <SkeletonCard variant="product" /> : <ActionInbox items={inboxItems} />}
        </View>

        <View style={tw`px-5 mb-6`}>
          <SectionHeading title="Key metrics" action="Full analytics" onAction={openAnalytics} />
          {loading ? (
            <View style={tw`gap-3`}>
              <SkeletonCard variant="product" />
            </View>
          ) : (
            <View style={tw`flex-row flex-wrap gap-2.5`}>
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

        <View style={tw`px-5 mb-6`}>
          <SectionHeading title="Payout balance" />
          <View style={tw`flex-row`}>
            <View style={tw`flex-1 pr-4`}>
              <Text style={tw`text-xs text-stone-500`}>Available</Text>
              <Text style={tw`text-xl font-bold text-emerald-700 mt-0.5`}>
                ${availablePayout.toFixed(2)}
              </Text>
            </View>
            <View style={tw`flex-1 border-l border-stone-200/80 pl-4`}>
              <Text style={tw`text-xs text-stone-500`}>Platform fee hold</Text>
              <Text style={tw`text-xl font-bold text-stone-800 mt-0.5`}>
                ${feePending.toFixed(2)}
              </Text>
            </View>
          </View>
          <Text style={tw`text-xs text-stone-500 mt-2 leading-4`}>
            Estimated from net revenue this period. Transfers settle through your connected payout method.
          </Text>
        </View>

        <View style={tw`px-5 mb-6`}>
          <SectionHeading title="Order rhythm" action="Analytics" onAction={openAnalytics} />
          {timeseries.length === 0 ? (
            <Text style={tw`text-sm text-stone-500`}>No order volume in this period yet.</Text>
          ) : (
            <View style={tw`flex-row items-end justify-between h-28`}>
              {timeseries.map((p) => {
                const h = Math.max(6, Math.round(((p.orders || 0) / maxSeries) * 96));
                const label = (p.day || '').slice(5) || p.day;
                return (
                  <View key={p.day} style={tw`flex-1 items-center mx-0.5`}>
                    <View style={[tw`w-full rounded-t-md bg-emerald-600/80`, { height: h }]} />
                    <Text style={tw`text-[9px] text-stone-400 mt-1`} numberOfLines={1}>
                      {label}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={tw`px-5 mb-6`}>
          <SectionHeading title="Recent orders" action="View all" onAction={() => navigation.navigate('Orders')} />
          {recent.length === 0 ? (
            <View style={tw`py-6 items-center`}>
              <Ionicons name="receipt-outline" size={32} color="#A8A29E" />
              <Text style={tw`text-stone-500 mt-2 text-sm`}>No orders in this period</Text>
            </View>
          ) : (
            recent.map((order) => {
              const shipping = parseShippingAddress(order.shipping_address);
              return (
                <TouchableOpacity
                  key={order.id}
                  style={tw`flex-row items-center py-3 border-b border-stone-200/70`}
                  onPress={() => stackNav.navigate('BusinessOrderDetail', { orderId: order.id })}
                >
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
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={tw`px-5 mb-4`}>
          <SectionHeading title="Quick actions" />
          <View style={tw`flex-row flex-wrap -mx-1`}>
            {quickActions.map((action) => (
              <Pressable
                key={action.label}
                onPress={action.onPress}
                style={tw`w-1/3 px-1 mb-2`}
              >
                <View style={tw`items-center py-3`}>
                  <View style={tw`w-10 h-10 rounded-full bg-[#EAE4D6] items-center justify-center mb-1.5`}>
                    <Ionicons name={action.icon} size={20} color="#059669" />
                  </View>
                  <Text style={tw`text-xs font-semibold text-stone-800 text-center`} numberOfLines={1}>
                    {action.label}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        {status === 'loading' && kpis ? (
          <Text style={tw`text-center text-xs text-stone-400 mb-4`}>Refreshing…</Text>
        ) : null}
      </ScrollView>
    </BusinessScreen>
  );
}
