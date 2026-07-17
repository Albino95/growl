import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
import { horizontalScrollProps, verticalScrollProps } from '../../constants/scroll';
import { updateOrderStatus } from '../../services/api/marketplace';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchBusinessOrders, patchLocalOrderStatus, setOrdersFilter } from '../../store/slices/businessSlice';
import OrderStatusPill from '../../components/business/OrderStatusPill';
import BusinessEmptyState from '../../components/business/BusinessEmptyState';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';

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
  const dispatch = useAppDispatch();
  const orders = useAppSelector((s) => s.business.orders);
  const statusFilter = useAppSelector((s) => s.business.ordersFilter);
  const ordersStatus = useAppSelector((s) => s.business.ordersStatus);
  const [refreshing, setRefreshing] = useState(false);
  const [advancingId, setAdvancingId] = useState<string | null>(null);

  useEffect(() => {
    void dispatch(fetchBusinessOrders());
  }, [dispatch]);

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
    if (statusFilter === 'all') return orders;
    if (statusFilter === 'pending') {
      return orders.filter((o) => o.status === 'pending' || o.status === 'processing');
    }
    return orders.filter((o) => o.status === statusFilter);
  }, [orders, statusFilter]);

  const totalRevenue = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + Number(o.total || 0), 0);
  const pendingCount = orders.filter((o) => o.status === 'pending' || o.status === 'processing').length;
  const loading = ordersStatus === 'loading' && orders.length === 0;

  return (
    <SafeAreaView style={tw`flex-1 bg-stone-50`} edges={['top']}>
      <View style={tw`bg-white px-4 pt-3 pb-3 border-b border-stone-100`}>
        <Text style={tw`text-2xl font-bold text-stone-900 mb-3 tracking-tight`}>Orders</Text>
        <View style={tw`flex-row gap-3 mb-3`}>
          <View style={tw`flex-1 bg-emerald-50 rounded-lg p-3`}>
            <Text style={tw`text-xs text-emerald-700 mb-1`}>Revenue</Text>
            <Text style={tw`text-xl font-bold text-emerald-900`}>${totalRevenue.toFixed(2)}</Text>
          </View>
          <View style={tw`flex-1 bg-amber-50 rounded-lg p-3`}>
            <Text style={tw`text-xs text-amber-700 mb-1`}>To fulfill</Text>
            <Text style={tw`text-xl font-bold text-amber-900`}>{pendingCount}</Text>
          </View>
          <View style={tw`flex-1 bg-stone-100 rounded-lg p-3`}>
            <Text style={tw`text-xs text-stone-600 mb-1`}>Total</Text>
            <Text style={tw`text-xl font-bold text-stone-900`}>{orders.length}</Text>
          </View>
        </View>
        <ScrollView horizontal {...horizontalScrollProps} showsHorizontalScrollIndicator={false}>
          <View style={tw`flex-row gap-2 pr-4`}>
            {['all', 'pending', 'processing', 'shipped', 'delivered', 'cancelled'].map((status) => (
              <TouchableOpacity
                key={status}
                onPress={() => dispatch(setOrdersFilter(status))}
                style={tw`px-4 py-2 rounded-full ${statusFilter === status ? 'bg-emerald-600' : 'bg-stone-100'}`}
              >
                <Text
                  style={tw`text-sm font-semibold ${statusFilter === status ? 'text-white' : 'text-stone-600'}`}
                >
                  {status === 'pending' ? 'To fulfill' : status.charAt(0).toUpperCase() + status.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView
        style={tw`flex-1 px-4 pt-4`}
        {...verticalScrollProps}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#059669" colors={['#059669']} />
        }
      >
        {loading ? (
          <Text style={tw`text-stone-500 text-center py-12`}>Loading orders…</Text>
        ) : filteredOrders.length === 0 ? (
          <BusinessEmptyState
            icon="receipt-outline"
            title={statusFilter === 'all' ? 'No orders yet' : `No ${statusFilter} orders`}
            description="Orders from the marketplace will show up here."
          />
        ) : (
          filteredOrders.map((order) => {
            const shipping =
              typeof order.shipping_address === 'string'
                ? JSON.parse(order.shipping_address)
                : order.shipping_address;
            const customer = shipping?.name || 'Customer';
            const next = NEXT_STATUS[order.status || 'pending'];
            const itemCount = order.items?.length || 0;

            return (
              <View key={order.id} style={tw`bg-white rounded-2xl p-4 mb-3 border border-stone-100`}>
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
                      <Text style={tw`text-lg font-bold text-stone-900 mt-0.5`}>{customer}</Text>
                      <Text style={tw`text-sm text-stone-500 mt-1`}>
                        {itemCount} item{itemCount === 1 ? '' : 's'} ·{' '}
                        {new Date(order.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <View style={tw`items-end`}>
                      <Text style={tw`text-xl font-bold text-stone-900`}>
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
                    style={tw`mt-2 bg-emerald-600 rounded-xl py-3 items-center ${
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
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
