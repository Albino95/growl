import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';

type KpiCard = {
  label: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'neutral';
  icon: string;
};

const MOCK_KPIS: KpiCard[] = [
  { label: 'Revenue', value: '$12,450', change: '+12.5%', trend: 'up', icon: 'cash' },
  { label: 'Orders', value: '234', change: '+8.2%', trend: 'up', icon: 'receipt' },
  { label: 'Conversion', value: '3.2%', change: '-0.5%', trend: 'down', icon: 'trending-up' },
  { label: 'Avg Order', value: '$53.20', change: '+5.1%', trend: 'up', icon: 'cart' },
];

const MOCK_RECENT_ORDERS = [
  { id: '1', customer: 'John D.', product: 'Fitness Bundle', amount: '$89.99', status: 'completed', time: '2h ago' },
  { id: '2', customer: 'Sarah M.', product: 'Yoga Mat', amount: '$34.99', status: 'pending', time: '4h ago' },
  { id: '3', customer: 'Mike T.', product: 'Protein Powder', amount: '$45.50', status: 'shipped', time: '6h ago' },
];

export default function BizDashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month'>('week');

  return (
    <SafeAreaView style={tw`flex-1 bg-gray-50`}>
      <ScrollView style={tw`flex-1`}>
        {/* Header */}
        <View style={tw`bg-white px-4 pt-4 pb-3 border-b border-gray-200`}>
          <View style={tw`flex-row items-center justify-between mb-3`}>
            <View>
              <Text style={tw`text-2xl font-bold text-gray-900`}>Business Dashboard</Text>
              <Text style={tw`text-sm text-gray-500 mt-1`}>Welcome back! Here's your overview</Text>
            </View>
            <TouchableOpacity style={tw`w-10 h-10 rounded-full bg-blue-100 items-center justify-center`}>
              <Ionicons name="notifications-outline" size={24} color="#3B82F6" />
            </TouchableOpacity>
          </View>

          {/* Period Selector */}
          <View style={tw`flex-row bg-gray-100 rounded-lg p-1`}>
            {(['today', 'week', 'month'] as const).map((period) => (
              <TouchableOpacity
                key={period}
                onPress={() => setSelectedPeriod(period)}
                style={tw`flex-1 py-2 rounded-md ${
                  selectedPeriod === period ? 'bg-white shadow-sm' : ''
                }`}
              >
                <Text
                  style={tw`text-center text-sm font-medium ${
                    selectedPeriod === period ? 'text-blue-600' : 'text-gray-600'
                  }`}
                >
                  {period.charAt(0).toUpperCase() + period.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* KPI Cards */}
        <View style={tw`px-4 pt-4`}>
          <Text style={tw`text-lg font-bold text-gray-900 mb-3`}>Key Metrics</Text>
          <View style={tw`flex-row flex-wrap -mx-2`}>
            {MOCK_KPIS.map((kpi, index) => (
              <View key={index} style={tw`w-1/2 px-2 mb-4`}>
                <View style={tw`bg-white rounded-xl p-4 shadow-sm border border-gray-100`}>
                  <View style={tw`flex-row items-center justify-between mb-2`}>
                    <Ionicons
                      name={kpi.icon as any}
                      size={24}
                      color={kpi.trend === 'up' ? '#10B981' : kpi.trend === 'down' ? '#EF4444' : '#6B7280'}
                    />
                    <View
                      style={tw`px-2 py-1 rounded-full ${
                        kpi.trend === 'up'
                          ? 'bg-green-100'
                          : kpi.trend === 'down'
                          ? 'bg-red-100'
                          : 'bg-gray-100'
                      }`}
                    >
                      <Text
                        style={tw`text-xs font-semibold ${
                          kpi.trend === 'up'
                            ? 'text-green-700'
                            : kpi.trend === 'down'
                            ? 'text-red-700'
                            : 'text-gray-700'
                        }`}
                      >
                        {kpi.change}
                      </Text>
                    </View>
                  </View>
                  <Text style={tw`text-2xl font-bold text-gray-900 mb-1`}>{kpi.value}</Text>
                  <Text style={tw`text-sm text-gray-500`}>{kpi.label}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Recent Orders */}
        <View style={tw`px-4 mt-2 mb-4`}>
          <View style={tw`flex-row items-center justify-between mb-3`}>
            <Text style={tw`text-lg font-bold text-gray-900`}>Recent Orders</Text>
            <TouchableOpacity>
              <Text style={tw`text-sm text-blue-600 font-semibold`}>View All</Text>
            </TouchableOpacity>
          </View>
          <View style={tw`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden`}>
            {MOCK_RECENT_ORDERS.map((order) => (
              <View
                key={order.id}
                style={tw`px-4 py-3 border-b border-gray-100 last:border-b-0`}
              >
                <View style={tw`flex-row items-center justify-between`}>
                  <View style={tw`flex-1`}>
                    <Text style={tw`font-semibold text-gray-900`}>{order.customer}</Text>
                    <Text style={tw`text-sm text-gray-500`}>{order.product}</Text>
                  </View>
                  <View style={tw`items-end`}>
                    <Text style={tw`font-bold text-gray-900`}>{order.amount}</Text>
                    <View
                      style={tw`mt-1 px-2 py-0.5 rounded-full ${
                        order.status === 'completed'
                          ? 'bg-green-100'
                          : order.status === 'shipped'
                          ? 'bg-blue-100'
                          : 'bg-yellow-100'
                      }`}
                    >
                      <Text
                        style={tw`text-xs font-medium ${
                          order.status === 'completed'
                            ? 'text-green-700'
                            : order.status === 'shipped'
                            ? 'text-blue-700'
                            : 'text-yellow-700'
                        }`}
                      >
                        {order.status}
                      </Text>
                    </View>
                  </View>
                </View>
                <Text style={tw`text-xs text-gray-400 mt-1`}>{order.time}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Quick Actions */}
        <View style={tw`px-4 mb-6`}>
          <Text style={tw`text-lg font-bold text-gray-900 mb-3`}>Quick Actions</Text>
          <View style={tw`flex-row flex-wrap -mx-2`}>
            <TouchableOpacity
              style={tw`w-1/2 px-2 mb-3`}
              onPress={() => {
                // Navigate to add product
              }}
            >
              <View style={tw`bg-white rounded-xl p-4 border border-gray-200 items-center`}>
                <View style={tw`w-12 h-12 bg-blue-100 rounded-full items-center justify-center mb-2`}>
                  <Ionicons name="add-circle" size={28} color="#3B82F6" />
                </View>
                <Text style={tw`text-sm font-semibold text-gray-900`}>Add Product</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={tw`w-1/2 px-2 mb-3`}
              onPress={() => {
                // Navigate to create promotion
              }}
            >
              <View style={tw`bg-white rounded-xl p-4 border border-gray-200 items-center`}>
                <View style={tw`w-12 h-12 bg-purple-100 rounded-full items-center justify-center mb-2`}>
                  <Ionicons name="megaphone" size={28} color="#A855F7" />
                </View>
                <Text style={tw`text-sm font-semibold text-gray-900`}>Create Promotion</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={tw`w-1/2 px-2 mb-3`}
              onPress={() => {
                // Navigate to analytics
              }}
            >
              <View style={tw`bg-white rounded-xl p-4 border border-gray-200 items-center`}>
                <View style={tw`w-12 h-12 bg-green-100 rounded-full items-center justify-center mb-2`}>
                  <Ionicons name="analytics" size={28} color="#10B981" />
                </View>
                <Text style={tw`text-sm font-semibold text-gray-900`}>View Analytics</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={tw`w-1/2 px-2 mb-3`}
              onPress={() => {
                // Navigate to partnerships
              }}
            >
              <View style={tw`bg-white rounded-xl p-4 border border-gray-200 items-center`}>
                <View style={tw`w-12 h-12 bg-orange-100 rounded-full items-center justify-center mb-2`}>
                  <Ionicons name="people" size={28} color="#F97316" />
                </View>
                <Text style={tw`text-sm font-semibold text-gray-900`}>Find Partners</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
