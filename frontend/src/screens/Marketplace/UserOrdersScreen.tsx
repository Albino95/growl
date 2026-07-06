import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
import { getOrders, type Order } from '../../services/api/marketplace';

type OrderItem = {
  id: string;
  product_id: string;
  quantity: number;
  price: number;
  product_name?: string;
  product_image?: string;
};

const STATUS_COLORS = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  processing: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  shipped: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
  delivered: { bg: 'bg-brand-100', text: 'text-brand-700', border: 'border-brand-300' },
  completed: { bg: 'bg-brand-100', text: 'text-brand-700', border: 'border-brand-300' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
};

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

  const filteredOrders = statusFilter === 'all' 
    ? orders 
    : orders.filter(o => o.status === statusFilter);

  const totalSpent = orders
    .filter(o => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.total, 0);

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`}>
      {/* Header */}
      <View style={tw`bg-white px-4 pt-4 pb-3 border-b border-stone-200`}>
        <View style={tw`flex-row items-center mb-3`}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={tw`mr-3`}
          >
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={tw`text-2xl font-bold text-stone-900 flex-1`}>My Orders</Text>
        </View>
        
        {/* Stats */}
        <View style={tw`flex-row gap-3 mb-3`}>
          <View style={tw`flex-1 bg-brand-50 rounded-lg p-3`}>
            <Text style={tw`text-xs text-brand-600 mb-1`}>Total Spent</Text>
            <Text style={tw`text-xl font-bold text-brand-900`}>${totalSpent.toFixed(2)}</Text>
          </View>
          <View style={tw`flex-1 bg-blue-50 rounded-lg p-3`}>
            <Text style={tw`text-xs text-blue-600 mb-1`}>Total Orders</Text>
            <Text style={tw`text-xl font-bold text-blue-900`}>{orders.length}</Text>
          </View>
        </View>

        {/* Status Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`-mx-4 px-4`}>
          <View style={tw`flex-row gap-2`}>
            {['all', 'pending', 'processing', 'shipped', 'delivered', 'completed', 'cancelled'].map((status) => (
              <TouchableOpacity
                key={status}
                onPress={() => setStatusFilter(status)}
                style={tw`px-4 py-2 rounded-full ${
                  statusFilter === status ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <Text style={tw`text-sm font-semibold ${
                  statusFilter === status ? 'text-white' : 'text-stone-700'
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {loading && orders.length === 0 ? (
          <View style={tw`items-center justify-center py-12`}>
            <Text style={tw`text-stone-500`}>Loading orders...</Text>
          </View>
        ) : filteredOrders.length === 0 ? (
          <View style={tw`items-center justify-center py-12`}>
            <Ionicons name="receipt-outline" size={64} color="#9CA3AF" />
            <Text style={tw`text-stone-500 mt-4 text-center`}>
              {statusFilter === 'all' ? 'No orders yet' : `No ${statusFilter} orders`}
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Marketplace' as never)}
              style={tw`mt-4 px-6 py-3 bg-blue-600 rounded-full`}
            >
              <Text style={tw`text-white font-semibold`}>Browse Marketplace</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filteredOrders.map((order) => {
            const statusStyle = STATUS_COLORS[order.status as keyof typeof STATUS_COLORS] || STATUS_COLORS.pending;
            const orderDate = new Date(order.created_at).toLocaleDateString();
            const shippingAddress = typeof order.shipping_address === 'string' 
              ? JSON.parse(order.shipping_address) 
              : order.shipping_address;
            
            return (
              <View
                key={order.id}
                style={tw`bg-white rounded-xl p-4 mb-3 shadow-sm border border-stone-100`}
              >
                <View style={tw`flex-row items-center justify-between mb-3`}>
                  <View>
                    <Text style={tw`text-sm font-semibold text-stone-500`}>
                      Order #{order.id.slice(-8).toUpperCase()}
                    </Text>
                    <Text style={tw`text-lg font-bold text-stone-900 mt-1`}>
                      ${order.total.toFixed(2)}
                    </Text>
                  </View>
                  <View style={tw`px-3 py-1.5 rounded-full ${statusStyle.bg} border ${statusStyle.border}`}>
                    <Text style={tw`text-xs font-semibold ${statusStyle.text}`}>
                      {order.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={tw`border-t border-stone-100 pt-3 mb-3`}>
                  {order.items && order.items.length > 0 ? (
                    order.items.map((item: OrderItem, idx: number) => (
                      <View key={item.id || idx} style={tw`flex-row items-center justify-between mb-2`}>
                        <Text style={tw`text-sm text-stone-600 flex-1`}>
                          {item.quantity}x {item.product_name || 'Product'}
                        </Text>
                        <Text style={tw`text-sm font-semibold text-stone-900`}>
                          ${(item.quantity * item.price).toFixed(2)}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={tw`text-sm text-stone-400`}>No items</Text>
                  )}
                </View>

                {shippingAddress && (
                  <View style={tw`border-t border-stone-100 pt-3 mb-3`}>
                    <Text style={tw`text-xs font-semibold text-stone-500 mb-1`}>Shipping Address</Text>
                    <Text style={tw`text-sm text-stone-700`}>
                      {shippingAddress.name}
                    </Text>
                    <Text style={tw`text-sm text-stone-700`}>
                      {shippingAddress.street}
                    </Text>
                    <Text style={tw`text-sm text-stone-700`}>
                      {shippingAddress.city}, {shippingAddress.state} {shippingAddress.zip}
                    </Text>
                  </View>
                )}

                <View style={tw`flex-row items-center justify-between pt-3 border-t border-stone-100`}>
                  <View style={tw`flex-row items-center`}>
                    <Ionicons name="calendar-outline" size={16} color="#6B7280" />
                    <Text style={tw`text-xs text-stone-500 ml-1`}>{orderDate}</Text>
                  </View>
                  {order.status === 'shipped' && (
                    <TouchableOpacity style={tw`flex-row items-center`}>
                      <Ionicons name="car-outline" size={16} color="#6B7280" />
                      <Text style={tw`text-xs text-stone-500 ml-1`}>Track Order</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
