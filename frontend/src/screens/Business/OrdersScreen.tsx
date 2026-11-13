import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import tw from '../../lib/tw';
import ErrorState from '../../components/ui/ErrorState';
import { useRefresh } from '../../hooks/useRefresh';
import {
  feedListPerformanceProps,
  horizontalScrollProps,
  TAB_SCREEN_BOTTOM_PADDING,
} from '../../constants/scroll';
import { updateOrderStatus } from '../../services/api/marketplace';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchBusinessOrders, patchLocalOrderStatus, setOrdersFilter } from '../../store/slices/businessSlice';
import OrderStatusPill from '../../components/business/OrderStatusPill';
import BusinessEmptyState from '../../components/business/BusinessEmptyState';
import BusinessStatStrip from '../../components/business/BusinessStatStrip';
import BusinessScreen from '../../components/business/BusinessScreen';
import SearchField from '../../components/ui/SearchField';
import SkeletonCard from '../../components/ui/SkeletonCard';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import { parseShippingAddress, safeParseJson } from '../../utils/safeJson';
import {
  isOrderAwaitingPayment,
  orderBusinessTotal,
  orderCurrency,
  type Order,
} from '../../services/api/business';
import MarketplaceCheckoutBanner from '../../components/business/MarketplaceCheckoutBanner';
import { formatCurrency } from '../../utils/money';
import type { BusinessTabsParamList } from '../../app/navigation/tabs/BusinessTabs';

const NEXT_STATUS: Record<string, string | null> = {
  pending: 'processing',
  processing: 'shipped',
  shipped: 'delivered',
  delivered: 'completed',
  completed: null,
  cancelled: null,
};

export default function OrdersScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<BusinessTabsParamList, 'Orders'>>();
  const dispatch = useAppDispatch();
  const orders = useAppSelector((s) => s.business.orders);
  const statusFilter = useAppSelector((s) => s.business.ordersFilter);
  const ordersStatus = useAppSelector((s) => s.business.ordersStatus);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(route.params?.search || '');

  // Refetch whenever the tab regains focus (e.g. after changing status in order detail).
  useFocusEffect(
    useCallback(() => {
      void dispatch(fetchBusinessOrders());
    }, [dispatch])
  );

  useEffect(() => {
    if (route.params?.search) setSearchQuery(route.params.search);
  }, [route.params?.search]);

  const refresh = useRefresh(() => dispatch(fetchBusinessOrders()));

  const advanceStatus = async (orderId: string, current: string) => {
    const next = NEXT_STATUS[current];
    if (!next) return;
    const ok = await confirmAsync('Update status', `Mark this order as ${next}?`, {
      confirmLabel: `Mark ${next}`,
    });
    if (!ok) return;
    setAdvancingId(orderId);
    try {
      const response = await updateOrderStatus(orderId, next);
      if (response.success && response.data) {
        dispatch(patchLocalOrderStatus({ orderId, status: response.data.status }));
      }
    } catch (e: unknown) {
      alertMessage('Error', e instanceof Error ? e.message : 'Failed to update status');
    } finally {
      setAdvancingId(null);
    }
  };

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = orders;
    if (statusFilter !== 'all') {
      if (statusFilter === 'pending') {
        list = list.filter(
          (o) =>
            (o.status === 'pending' || o.status === 'processing') && !isOrderAwaitingPayment(o)
        );
      } else {
        list = list.filter((o) => o.status === statusFilter);
      }
    }
    if (!q) return list;
    return list.filter((o) => {
      const shipping = parseShippingAddress(o.shipping_address);
      const customer = (shipping?.name || '').toLowerCase();
      const idTail = o.id.slice(-8).toLowerCase();
      return (
        o.id.toLowerCase().includes(q) ||
        idTail.includes(q) ||
        customer.includes(q) ||
        (o.user_id || '').toLowerCase().includes(q)
      );
    });
  }, [orders, statusFilter, searchQuery]);

  // Only paid orders count as revenue / fulfilment work; use this seller's share of each order.
  const paidOrders = orders.filter((o) => !isOrderAwaitingPayment(o));
  const totalRevenue = paidOrders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + orderBusinessTotal(o), 0);
  const pendingCount = paidOrders.filter(
    (o) => o.status === 'pending' || o.status === 'processing'
  ).length;
  const loading = ordersStatus === 'loading' && orders.length === 0;
  const loadFailed = ordersStatus === 'failed' && orders.length === 0;

  const renderOrder = ({ item: order }: { item: Order }) => {
    const shipping = parseShippingAddress(order.shipping_address);
    const customer = shipping?.name || 'Customer';
    const awaitingPayment = isOrderAwaitingPayment(order);
    const next = awaitingPayment ? null : NEXT_STATUS[order.status || 'pending'];
    const itemCount = order.items?.length || 0;
    const meta = safeParseJson<{ tracking_number?: string; carrier?: string }>(order.metadata, {});
    const trackingLine =
      meta.tracking_number
        ? `${meta.carrier ? `${meta.carrier}: ` : ''}${meta.tracking_number}`
        : null;

    return (
      <View style={tw`py-4 border-b border-stone-200/70`}>
        <TouchableOpacity
          onPress={() =>
            navigation.getParent()?.navigate('BusinessOrderDetail', { orderId: order.id })
          }
        >
          <View style={tw`flex-row items-start justify-between mb-2`}>
            <View style={tw`flex-1 pr-2`}>
              <Text style={tw`text-xs text-stone-500 font-semibold`}>
                ORD-{order.id.slice(-8).toUpperCase()}
              </Text>
              <Text style={tw`text-base font-bold text-stone-900 mt-0.5`}>{customer}</Text>
              <Text style={tw`text-sm text-stone-500 mt-1`}>
                {itemCount} item{itemCount === 1 ? '' : 's'} ·{' '}
                {new Date(order.created_at).toLocaleDateString()}
              </Text>
              {trackingLine ? (
                <Text style={tw`text-xs text-emerald-700 mt-1 font-medium`} numberOfLines={1}>
                  {trackingLine}
                </Text>
              ) : null}
            </View>
            <View style={tw`items-end`}>
              <Text style={tw`text-lg font-bold text-stone-900`}>
                {formatCurrency(orderBusinessTotal(order), orderCurrency(order))}
              </Text>
              <View style={tw`mt-1`}>
                <OrderStatusPill
                  status={order.status || 'pending'}
                  awaitingPayment={awaitingPayment}
                />
              </View>
            </View>
          </View>
        </TouchableOpacity>
        {next ? (
          <TouchableOpacity
            style={tw`mt-1 bg-emerald-600 rounded-xl py-3 items-center ${
              advancingId === order.id ? 'opacity-50' : ''
            }`}
            disabled={advancingId === order.id}
            onPress={() => void advanceStatus(order.id, order.status || 'pending')}
          >
            <Text style={tw`text-white font-semibold`}>
              {advancingId === order.id ? 'Updating…' : `Mark ${next}`}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  return (
    <BusinessScreen
      title="Orders"
      subtitle="Fulfill, ship, and track marketplace orders"
      onSettings={() => navigation.getParent()?.navigate('BusinessSettings')}
      onMessages={() => navigation.getParent()?.navigate('BusinessMessages')}
    >
      <View style={tw`px-5 pb-3`}>
        <MarketplaceCheckoutBanner style={tw`mb-3`} />
        <BusinessStatStrip
          items={[
            { label: 'Revenue', value: formatCurrency(totalRevenue), tone: 'emerald' },
            { label: 'To fulfill', value: String(pendingCount), tone: 'amber' },
            { label: 'Total', value: String(orders.length), tone: 'stone' },
          ]}
        />
        <View style={tw`mt-3`}>
          <SearchField
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search customer or order ID…"
          />
        </View>
        <ScrollView horizontal {...horizontalScrollProps} showsHorizontalScrollIndicator={false} style={tw`mt-3`}>
          <View style={tw`flex-row gap-2 pr-4`}>
            {['all', 'pending', 'processing', 'shipped', 'delivered', 'cancelled'].map((status) => (
              <TouchableOpacity
                key={status}
                onPress={() => dispatch(setOrdersFilter(status))}
                style={tw`px-3.5 py-2 rounded-full ${
                  statusFilter === status
                    ? 'bg-emerald-600'
                    : 'bg-[#EAE4D6]/80 border border-stone-200/60'
                }`}
              >
                <Text
                  style={tw`text-sm font-semibold ${
                    statusFilter === status ? 'text-white' : 'text-stone-600'
                  }`}
                >
                  {status === 'pending' ? 'To fulfill' : status.charAt(0).toUpperCase() + status.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      <FlatList
        style={tw`flex-1`}
        data={filteredOrders}
        keyExtractor={(item) => item.id}
        renderItem={renderOrder}
        contentContainerStyle={[
          tw`px-5 pt-1`,
          filteredOrders.length === 0 ? tw`flex-grow` : null,
          { paddingBottom: TAB_SCREEN_BOTTOM_PADDING },
        ]}
        refreshControl={
          <RefreshControl {...refresh} />
        }
        {...feedListPerformanceProps}
        ListEmptyComponent={
          loading ? (
            <View>
              <SkeletonCard variant="product" />
              <SkeletonCard variant="product" />
            </View>
          ) : loadFailed ? (
            <ErrorState
              title="Couldn’t load orders"
              onRetry={() => void dispatch(fetchBusinessOrders())}
            />
          ) : (
            <BusinessEmptyState
              icon="receipt-outline"
              title={
                searchQuery
                  ? 'No matching orders'
                  : statusFilter === 'all'
                    ? 'No orders yet'
                    : `No ${statusFilter} orders`
              }
              description="Orders from the marketplace will show up here."
            />
          )
        }
      />
    </BusinessScreen>
  );
}
