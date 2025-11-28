import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';

type Order = {
  id: string;
  orderNumber: string;
  customer: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  date: string;
  paymentMethod: string;
};

const MOCK_ORDERS: Order[] = [
  {
    id: '1',
    orderNumber: 'ORD-2024-001',
    customer: 'John Doe',
    items: [{ name: 'Yoga Mat', quantity: 2, price: 34.99 }],
    total: 69.98,
    status: 'shipped',
    date: '2024-01-15',
    paymentMethod: 'Credit Card',
  },
  {
    id: '2',
    orderNumber: 'ORD-2024-002',
    customer: 'Sarah Smith',
    items: [
      { name: 'Protein Powder', quantity: 1, price: 45.50 },
      { name: 'Resistance Bands', quantity: 1, price: 29.99 },
    ],
    total: 75.49,
    status: 'processing',
    date: '2024-01-15',
    paymentMethod: 'PayPal',
  },
  {
    id: '3',
    orderNumber: 'ORD-2024-003',
    customer: 'Mike Johnson',
    items: [{ name: 'Fitness Tracker', quantity: 1, price: 89.99 }],
    total: 89.99,
    status: 'pending',
    date: '2024-01-14',
    paymentMethod: 'Credit Card',
  },
];

const STATUS_COLORS = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  processing: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  shipped: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
  delivered: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
};

export default function OrdersScreen() {
  const [orders] = useState<Order[]>(MOCK_ORDERS);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredOrders = statusFilter === 'all' 
    ? orders 
    : orders.filter(o => o.status === statusFilter);

  const totalRevenue = orders
    .filter(o => o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.total, 0);
  const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'processing').length;

  return (
    <SafeAreaView style={tw`flex-1 bg-gray-50`}>
      {/* Header */}
      <View style={tw`bg-white px-4 pt-4 pb-3 border-b border-gray-200`}>
        <Text style={tw`text-2xl font-bold text-gray-900 mb-3`}>Orders Management</Text>
        
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`-mx-4 px-4`}>
          <View style={tw`flex-row gap-2`}>
            {['all', 'pending', 'processing', 'shipped', 'delivered', 'cancelled'].map((status) => (
              <TouchableOpacity
                key={status}
                onPress={() => setStatusFilter(status)}
                style={tw`px-4 py-2 rounded-full ${
                  statusFilter === status ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <Text style={tw`text-sm font-semibold ${
                  statusFilter === status ? 'text-white' : 'text-gray-700'
                }`}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Orders List */}
      <ScrollView style={tw`flex-1 px-4 pt-4`}>
        {filteredOrders.map((order) => {
          const statusStyle = STATUS_COLORS[order.status];
          return (
            <TouchableOpacity
              key={order.id}
              style={tw`bg-white rounded-xl p-4 mb-3 shadow-sm border border-gray-100`}
            >
              <View style={tw`flex-row items-center justify-between mb-3`}>
                <View>
                  <Text style={tw`text-sm font-semibold text-gray-500`}>{order.orderNumber}</Text>
                  <Text style={tw`text-lg font-bold text-gray-900 mt-1`}>{order.customer}</Text>
                </View>
                <View style={tw`items-end`}>
                  <View style={tw`px-3 py-1.5 rounded-full ${statusStyle.bg} border ${statusStyle.border} mb-2`}>
                    <Text style={tw`text-xs font-semibold ${statusStyle.text}`}>
                      {order.status.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={tw`text-xl font-bold text-gray-900`}>${order.total.toFixed(2)}</Text>
                </View>
              </View>

              <View style={tw`border-t border-gray-100 pt-3`}>
                {order.items.map((item, idx) => (
                  <View key={idx} style={tw`flex-row items-center justify-between mb-2`}>
                    <Text style={tw`text-sm text-gray-600`}>
                      {item.quantity}x {item.name}
                    </Text>
                    <Text style={tw`text-sm font-semibold text-gray-900`}>
                      ${(item.quantity * item.price).toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>

              <View style={tw`flex-row items-center justify-between mt-3 pt-3 border-t border-gray-100`}>
                <View style={tw`flex-row items-center`}>
                  <Ionicons name="calendar-outline" size={16} color="#6B7280" />
                  <Text style={tw`text-xs text-gray-500 ml-1`}>{order.date}</Text>
                </View>
                <View style={tw`flex-row items-center`}>
                  <Ionicons name="card-outline" size={16} color="#6B7280" />
                  <Text style={tw`text-xs text-gray-500 ml-1`}>{order.paymentMethod}</Text>
                </View>
                <TouchableOpacity style={tw`px-3 py-1 bg-blue-600 rounded-lg`}>
                  <Text style={tw`text-white text-xs font-semibold`}>View Details</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
