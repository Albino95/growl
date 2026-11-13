import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../../components/ui/PressableScale';
import { getOrders, type Order } from '../../services/api/marketplace';
import { CategoryCapsule } from '../../components/ui/CategoryCapsule';
import { alertMessage } from '../../utils/confirmDialog';
import { horizontalScrollProps } from '../../constants/scroll';

type OrderItem = {
  id: string;
  product_id: string;
  quantity: number;
  price: number;
  product_name?: string;
  product_image?: string;
};

const STATUS_META: Record<
  string,
  { label: string; icon: keyof typeof Ionicons.glyphMap; tint: string; chip: string }
> = {
  pending: { label: 'Pending', icon: 'time-outline', tint: 'text-amber-800', chip: 'bg-amber-100' },
  processing: { label: 'Processing', icon: 'sync-outline', tint: 'text-sky-800', chip: 'bg-sky-100' },
  shipped: { label: 'Shipped', icon: 'airplane-outline', tint: 'text-violet-800', chip: 'bg-violet-100' },
  delivered: { label: 'Delivered', icon: 'checkmark-circle-outline', tint: 'text-emerald-800', chip: 'bg-emerald-100' },
  completed: { label: 'Completed', icon: 'checkmark-circle-outline', tint: 'text-emerald-800', chip: 'bg-emerald-100' },
  cancelled: { label: 'Cancelled', icon: 'close-circle-outline', tint: 'text-rose-800', chip: 'bg-rose-100' },
};

const FILTERS: { key: string; label: string; icon?: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending', icon: 'time-outline' },
  { key: 'processing', label: 'Processing', icon: 'sync-outline' },
  { key: 'shipped', label: 'Shipped', icon: 'airplane-outline' },
  { key: 'delivered', label: 'Delivered', icon: 'checkmark-circle-outline' },
  { key: 'completed', label: 'Done', icon: 'checkmark-circle-outline' },
  { key: 'cancelled', label: 'Cancelled', icon: 'close-circle-outline' },
];

export default function UserOrdersScreen() {
  const navigation = useNavigation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const response = await getOrders();
      if (response.success && response.data) {
        setOrders(response.data);
      }
    } catch (error: any) {
      console.error('[UserOrdersScreen] Error loading orders:', error);
      void alertMessage('Error', error.message || 'Failed to load orders');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };

  const filteredOrders = useMemo(
    () => (statusFilter === 'all' ? orders : orders.filter((o) => o.status === statusFilter)),
    [orders, statusFilter]
  );

  const totalSpent = orders
    .filter((o) => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.total, 0);

  const activeCount = orders.filter((o) =>
    ['pending', 'processing', 'shipped'].includes(o.status)
  ).length;

  return (
    <SafeAreaView style={tw`flex-1 bg-page`}>
      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={tw`pb-10`}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.brand} />}
      >
        <View style={tw`px-gutter pt-3 pb-2`}>
          <View style={tw`flex-row items-center mb-4`}>
            <PressableScale
              onPress={() => navigation.goBack()}
              style={tw`w-10 h-10 rounded-full bg-card border border-line items-center justify-center mr-3`}
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={20} color={theme.colors.ink} />
            </PressableScale>
            <View style={tw`flex-1`}>
              <Text style={tw`text-caption font-semibold tracking-widest text-emerald-700 uppercase`}>
                Grow!
              </Text>
              <Text style={tw`text-2xl font-bold text-ink`}>My Orders</Text>
            </View>
          </View>

          <View style={tw`bg-raised border border-line/80 rounded-card p-4 mb-4`}>
            <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase`}>
              Your shop activity
            </Text>
            <View style={tw`flex-row mt-3`}>
              <View style={tw`flex-1 pr-3`}>
                <Text style={tw`text-xs text-ink-3`}>Spent</Text>
                <Text style={tw`text-2xl font-bold text-ink mt-0.5`}>
                  ${totalSpent.toFixed(2)}
                </Text>
              </View>
              <View style={tw`w-px bg-stone-300/70 mx-1`} />
              <View style={tw`flex-1 px-3`}>
                <Text style={tw`text-xs text-ink-3`}>Orders</Text>
                <Text style={tw`text-2xl font-bold text-ink mt-0.5`}>{orders.length}</Text>
              </View>
              <View style={tw`w-px bg-stone-300/70 mx-1`} />
              <View style={tw`flex-1 pl-3`}>
                <Text style={tw`text-xs text-ink-3`}>In progress</Text>
                <Text style={tw`text-2xl font-bold text-emerald-700 mt-0.5`}>{activeCount}</Text>
              </View>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={tw`pb-1`}
            style={{ flexGrow: 0 }}
            {...horizontalScrollProps}
          >
            {FILTERS.map((f) => (
              <CategoryCapsule
                key={f.key}
                label={f.label}
                icon={f.icon}
                selected={statusFilter === f.key}
                onPress={() => setStatusFilter(f.key)}
                compact
              />
            ))}
          </ScrollView>
        </View>

        <View style={tw`px-gutter pt-3`}>
          {loading && orders.length === 0 ? (
            <View style={tw`items-center justify-center py-16`}>
              <Text style={tw`text-ink-3`}>Loading orders...</Text>
            </View>
          ) : filteredOrders.length === 0 ? (
            <View style={tw`items-center justify-center py-16 px-6`}>
              <View style={tw`w-16 h-16 rounded-full bg-emerald-600/10 items-center justify-center mb-4`}>
                <Ionicons name="bag-handle-outline" size={32} color={theme.colors.brand} />
              </View>
              <Text style={tw`text-lg font-bold text-ink text-center`}>
                {statusFilter === 'all' ? 'No orders yet' : `No ${statusFilter} orders`}
              </Text>
              <Text style={tw`text-sm text-ink-3 text-center mt-2 leading-5`}>
                When you check out from Grow! Shop, your orders will show up here.
              </Text>
              <PressableScale
                onPress={() => navigation.navigate('Marketplace' as never)}
                style={tw`mt-5 px-6 py-3.5 bg-emerald-600 rounded-card`}
              >
                <Text style={tw`text-white font-semibold`}>Browse Shop</Text>
              </PressableScale>
            </View>
          ) : (
            filteredOrders.map((order) => {
              const meta = STATUS_META[order.status] || STATUS_META.pending;
              const orderDate = new Date(order.created_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              });
              const shippingAddress =
                typeof order.shipping_address === 'string'
                  ? JSON.parse(order.shipping_address)
                  : order.shipping_address;

              return (
                <View
                  key={order.id}
                  style={tw`bg-card border border-line/80 rounded-card p-4 mb-3`}
                >
                  <View style={tw`flex-row items-start justify-between mb-3`}>
                    <View style={tw`flex-1 pr-3`}>
                      <Text style={tw`text-caption font-semibold tracking-wider text-ink-3 uppercase`}>
                        Order · {order.id.slice(-8).toUpperCase()}
                      </Text>
                      <Text style={tw`text-xl font-bold text-ink mt-1`}>
                        ${order.total.toFixed(2)}
                      </Text>
                      <View style={tw`flex-row items-center mt-1.5`}>
                        <Ionicons name="calendar-outline" size={14} color={theme.colors.iconMuted} />
                        <Text style={tw`text-xs text-ink-3 ml-1`}>{orderDate}</Text>
                      </View>
                    </View>
                    <View style={tw`items-end gap-1.5`}>
                      <View style={tw`flex-row items-center px-2.5 py-1.5 rounded-chip ${meta.chip}`}>
                        <Ionicons name={meta.icon} size={14} color={tw.color('emerald-800')} style={tw`mr-1`} />
                        <Text style={tw`text-xs font-semibold ${meta.tint}`}>{meta.label}</Text>
                      </View>
                      {(() => {
                        const paid = (order.payment_status || '').toLowerCase() === 'paid';
                        return (
                          <View
                            style={tw`flex-row items-center px-2.5 py-1 rounded-chip ${
                              paid ? 'bg-brand-50' : 'bg-raised'
                            }`}
                          >
                            <Ionicons
                              name={paid ? 'card' : 'card-outline'}
                              size={12}
                              color={paid ? theme.colors.brand : theme.colors.ink3}
                              style={tw`mr-1`}
                            />
                            <Text
                              style={tw`text-caption font-semibold ${
                                paid ? 'text-brand-700' : 'text-ink-2'
                              }`}
                            >
                              {paid ? 'Paid' : 'Unpaid'}
                            </Text>
                          </View>
                        );
                      })()}
                    </View>
                  </View>

                  <View style={tw`border-t border-line pt-3`}>
                    {order.items && order.items.length > 0 ? (
                      order.items.map((item: OrderItem, idx: number) => (
                        <View
                          key={item.id || idx}
                          style={tw`flex-row items-center justify-between mb-2`}
                        >
                          <Text style={tw`text-sm text-ink-2 flex-1 pr-3`} numberOfLines={2}>
                            {item.quantity}× {item.product_name || 'Product'}
                          </Text>
                          <Text style={tw`text-sm font-semibold text-ink`}>
                            ${(item.quantity * item.price).toFixed(2)}
                          </Text>
                        </View>
                      ))
                    ) : (
                      <Text style={tw`text-sm text-ink-3`}>No items listed</Text>
                    )}
                  </View>

                  {shippingAddress ? (
                    <View style={tw`border-t border-line pt-3 mt-1`}>
                      <Text style={tw`text-caption font-semibold tracking-wider text-ink-3 uppercase mb-1`}>
                        Ship to
                      </Text>
                      <Text style={tw`text-sm text-ink-2`}>{shippingAddress.name}</Text>
                      <Text style={tw`text-sm text-ink-2`}>
                        {shippingAddress.street}
                        {shippingAddress.city
                          ? `\n${shippingAddress.city}, ${shippingAddress.state} ${shippingAddress.zip}`
                          : ''}
                      </Text>
                    </View>
                  ) : null}

                  {order.status === 'shipped' ? (
                    <PressableScale
                      style={tw`mt-3 flex-row items-center justify-center py-2.5 rounded-control bg-emerald-50`}
                    >
                      <Ionicons name="navigate-outline" size={16} color={theme.colors.brand} />
                      <Text style={tw`text-sm font-semibold text-emerald-700 ml-1.5`}>Track shipment</Text>
                    </PressableScale>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
