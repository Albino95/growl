import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import tw from '../../lib/tw';
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
import type { Order } from '../../services/api/business';
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
  const [refreshing, setRefreshing] = useState(false);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(route.params?.search || '');

  useEffect(() => {
    void dispatch(fetchBusinessOrders());
  }, [dispatch]);

  useEffect(() => {
    if (route.params?.search) setSearchQuery(route.params.search);
  }, [route.params?.search]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await dispatch(fetchBusinessOrders());
    setRefreshing(false);
  };

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
        list = list.filter((o) => o.status === 'pending' || o.status === 'processing');
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

  const totalRevenue = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + Number(o.total || 0), 0);
  const pendingCount = orders.filter((o) => o.status === 'pending' || o.status === 'processing').length;
  const loading = ordersStatus === 'loading' && orders.length === 0;

  const renderOrder = ({ item: order }: { item: Order }) => {
    const shipping = parseShippingAddress(order.shipping_address);
    const customer = shipping?.name || 'Customer';
    const next = NEXT_STATUS[order.status || 'pending'];
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
              <Text style={tw`text-xs text-stone-400 font-semibold`}>
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
                ${Number(order.total || 0).toFixed(2)}
              </Text>
              <View style={tw`mt-1`}>
                <OrderStatusPill status={order.status || 'pending'} />
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
        <BusinessStatStrip
          items={[
            { label: 'Revenue', value: `$${totalRevenue.toFixed(2)}`, tone: 'emerald' },
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
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#059669" colors={['#059669']} />
        }
        {...feedListPerformanceProps}
        ListEmptyComponent={
          loading ? (
            <View>
              <SkeletonCard variant="product" />
              <SkeletonCard variant="product" />
            </View>
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
