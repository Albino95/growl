import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
import { horizontalScrollProps, verticalScrollProps } from '../../constants/scroll';
import { getBusinessOrders, type Order } from '../../services/api/business';
import { updateOrderStatus } from '../../services/api/marketplace';

type OrderItem = {
  id: string;
  product_id: string;
  quantity: number;
  price: number;
  product_name?: string;
  product_image?: string;
};

type BusinessOrder = Order & {
  orderNumber: string;
  customer: string;
  paymentMethod: string;
};

const STATUS_COLORS = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  processing: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  shipped: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
  delivered: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  completed: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
};

export default function OrdersScreen() {
  const navigation = useNavigation<any>();
  const [orders, setOrders] = useState<BusinessOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const response = await getBusinessOrders();
      if (response.success && response.data) {
        const businessOrders: BusinessOrder[] = response.data.map((order) => {
          const shippingAddress = typeof order.shipping_address === 'string' 
            ? JSON.parse(order.shipping_address) 
            : order.shipping_address;
          
          return {
            ...order,
            orderNumber: `ORD-${order.id.slice(-8).toUpperCase()}`,
            customer: shippingAddress?.name || 'Unknown Customer',
            paymentMethod: order.metadata?.payment_method || 'Card',
            items: order.items || [],
          };
        });
        setOrders(businessOrders);
      }
    } catch (error: any) {
      console.error('[OrdersScreen] Error loading orders:', error);
      if (Platform.OS === 'web') {
        alert(error.message || 'Failed to load orders');
      } else {
        Alert.alert('Error', error.message || 'Failed to load orders');
      }
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

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    try {
      const response = await updateOrderStatus(orderId, newStatus);
      if (response.success && response.data) {
        // Update the order in local state
        setOrders(prevOrders =>
          prevOrders.map(order =>
            order.id === orderId
              ? { ...order, status: response.data.status }
              : order
          )
        );
        if (Platform.OS === 'web') {
          alert(`Order status updated to ${newStatus}`);
        } else {
          Alert.alert('Success', `Order status updated to ${newStatus}`);
        }
      }
    } catch (error: any) {
      console.error('[OrdersScreen] Error updating order status:', error);
      if (Platform.OS === 'web') {
        alert(error.message || 'Failed to update order status');
      } else {
        Alert.alert('Error', error.message || 'Failed to update order status');
      }
    }
  };

  const showStatusMenu = (order: BusinessOrder) => {
    const statusOptions = ['pending', 'processing', 'shipped', 'delivered', 'completed', 'cancelled'];
    const availableStatuses = statusOptions.filter(s => s !== order.status);

    if (availableStatuses.length === 0) {
      return;
    }

    if (Platform.OS === 'web') {
      // For web, show a simple prompt
      const status = prompt(`Update order status:\n${availableStatuses.join(', ')}`);
      if (status && availableStatuses.includes(status)) {
        handleStatusUpdate(order.id, status);
      }
    } else {
      // For native, show action sheet
      Alert.alert(
        'Update Order Status',
        `Current: ${order.status}\n\nSelect new status:`,
        [
          ...availableStatuses.map(status => ({
            text: status.charAt(0).toUpperCase() + status.slice(1),
            onPress: () => handleStatusUpdate(order.id, status),
          })),
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  };

  const filteredOrders = statusFilter === 'all' 
    ? orders 
    : orders.filter(o => o.status === statusFilter);

  const totalRevenue = orders
    .filter(o => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.total, 0);
  const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'processing').length;

  return (
    <SafeAreaView style={tw`flex-1 bg-stone-50`} edges={['top']}>
      <View style={tw`bg-white px-4 pt-3 pb-3 border-b border-stone-100`}>
        <Text style={tw`text-2xl font-bold text-stone-900 mb-3 tracking-tight`}>Orders</Text>
        
        {/* Stats */}
        <View style={tw`flex-row gap-3 mb-3`}>
          <View style={tw`flex-1 bg-green-50 rounded-lg p-3`}>
            <Text style={tw`text-xs text-green-600 mb-1`}>Total Revenue</Text>
            <Text style={tw`text-xl font-bold text-green-900`}>${totalRevenue.toFixed(2)}</Text>
          </View>
          <View style={tw`flex-1 bg-orange-50 rounded-lg p-3`}>
            <Text style={tw`text-xs text-orange-600 mb-1`}>Pending</Text>
            <Text style={tw`text-xl font-bold text-orange-900`}>{pendingOrders}</Text>
          </View>
          <View style={tw`flex-1 bg-blue-50 rounded-lg p-3`}>
            <Text style={tw`text-xs text-blue-600 mb-1`}>Total Orders</Text>
            <Text style={tw`text-xl font-bold text-blue-900`}>{orders.length}</Text>
          </View>
        </View>

        {/* Status Filters */}
        <ScrollView horizontal style={tw`-mx-4 px-4`} {...horizontalScrollProps}>
          <View style={tw`flex-row gap-2`}>
            {['all', 'pending', 'processing', 'shipped', 'delivered', 'cancelled'].map((status) => (
              <TouchableOpacity
                key={status}
                onPress={() => setStatusFilter(status)}
                style={tw`px-4 py-2 rounded-full ${
                  statusFilter === status ? 'bg-emerald-600' : 'bg-stone-100'
                }`}
              >
                <Text style={tw`text-sm font-semibold ${
                  statusFilter === status ? 'text-white' : 'text-stone-600'
                }`}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Orders List */}
      <ScrollView
        style={tw`flex-1 px-4 pt-4`}
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
        {loading && orders.length === 0 ? (
          <View style={tw`items-center justify-center py-12`}>
            <Text style={tw`text-gray-500`}>Loading orders...</Text>
          </View>
        ) : filteredOrders.length === 0 ? (
          <View style={tw`items-center justify-center py-12`}>
            <Ionicons name="receipt-outline" size={64} color="#9CA3AF" />
            <Text style={tw`text-gray-500 mt-4 text-center`}>
              {statusFilter === 'all' ? 'No orders yet' : `No ${statusFilter} orders`}
            </Text>
          </View>
        ) : (
          filteredOrders.map((order) => {
            const statusStyle = STATUS_COLORS[order.status as keyof typeof STATUS_COLORS] || STATUS_COLORS.pending;
            const orderDate = new Date(order.created_at).toLocaleDateString();
            
            return (
              <TouchableOpacity
                key={order.id}
                style={tw`bg-white rounded-xl p-4 mb-3 shadow-sm border border-gray-100`}
                activeOpacity={0.85}
                onPress={() => navigation.getParent()?.navigate('BusinessOrderDetail', { orderId: order.id })}
              >
                <View style={tw`flex-row items-center justify-between mb-3`}>
                  <View>
                    <Text style={tw`text-sm font-semibold text-gray-500`}>{order.orderNumber}</Text>
                    <Text style={tw`text-lg font-bold text-gray-900 mt-1`}>{order.customer}</Text>
                  </View>
                  <View style={tw`items-end`}>
                    <TouchableOpacity
                      onPress={() => showStatusMenu(order)}
                      style={tw`px-3 py-1.5 rounded-full ${statusStyle.bg} border ${statusStyle.border} mb-2 flex-row items-center`}
                    >
                      <Text style={tw`text-xs font-semibold ${statusStyle.text}`}>
                        {order.status.toUpperCase()}
                      </Text>
                      <Ionicons name="chevron-down" size={12} style={tw`ml-1 ${statusStyle.text}`} />
                    </TouchableOpacity>
                    <Text style={tw`text-xl font-bold text-gray-900`}>${order.total.toFixed(2)}</Text>
                  </View>
                </View>

                <View style={tw`border-t border-gray-100 pt-3`}>
                  {order.items && order.items.length > 0 ? (
                    order.items.map((item: OrderItem, idx: number) => (
                      <View key={item.id || idx} style={tw`flex-row items-center justify-between mb-2`}>
                        <Text style={tw`text-sm text-gray-600 flex-1`}>
                          {item.quantity}x {item.product_name || 'Product'}
                        </Text>
                        <Text style={tw`text-sm font-semibold text-gray-900`}>
                          ${(item.quantity * item.price).toFixed(2)}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={tw`text-sm text-gray-400`}>No items</Text>
                  )}
                </View>

                <View style={tw`flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100`}>
                  <View style={tw`flex-row items-center`}>
                    <Ionicons name="calendar-outline" size={16} color="#6B7280" />
                    <Text style={tw`text-xs text-gray-500 ml-1`}>{orderDate}</Text>
                  </View>
                  <View style={tw`flex-row items-center`}>
                    <Ionicons name="card-outline" size={16} color="#6B7280" />
                    <Text style={tw`text-xs text-gray-500 ml-1`}>{order.paymentMethod}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
