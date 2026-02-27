import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
import { getDashboard, type DashboardKPIs } from '../../services/api/business';
import type { Order } from '../../services/api/marketplace';

type KpiCard = {
  label: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'neutral';
  icon: string;
};

export default function BizDashboard() {
  const navigation = useNavigation<any>();
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month'>('week');
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const response = await getDashboard();
      if (response.success && response.data) {
        setKpis(response.data.kpis);
        setRecentOrders(response.data.kpis.recent_orders || []);
      }
    } catch (error: any) {
      console.error('[BizDashboard] Error loading dashboard:', error);
      if (Platform.OS === 'web') {
        alert(error.message || 'Failed to load dashboard');
      } else {
        Alert.alert('Error', error.message || 'Failed to load dashboard');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadDashboard();
  };

  // Calculate KPI cards from dashboard data
  const kpiCards: KpiCard[] = kpis ? [
    {
      label: 'Revenue',
      value: `$${kpis.total_revenue.toFixed(2)}`,
      change: '+0%', // Could calculate from previous period
      trend: 'up',
      icon: 'cash',
    },
    {
      label: 'Orders',
      value: kpis.total_orders.toString(),
      change: '+0%',
      trend: 'up',
      icon: 'receipt',
    },
    {
      label: 'Products',
      value: kpis.total_products.toString(),
      change: '+0%',
      trend: 'neutral',
      icon: 'cube',
    },
    {
      label: 'Avg Order',
      value: kpis.total_orders > 0 ? `$${(kpis.total_revenue / kpis.total_orders).toFixed(2)}` : '$0.00',
      change: '+0%',
      trend: 'up',
      icon: 'cart',
    },
  ] : [];

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-gray-50`}>
      <ScrollView
        style={tw`flex-1`}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
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
          {loading && !kpis ? (
            <View style={tw`items-center justify-center py-8`}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={tw`text-gray-500 mt-2`}>Loading dashboard...</Text>
            </View>
          ) : (
            <View style={tw`flex-row flex-wrap -mx-2`}>
              {kpiCards.map((kpi, index) => (
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
          )}
        </View>

        {/* Recent Orders */}
        <View style={tw`px-4 mt-2 mb-4`}>
          <View style={tw`flex-row items-center justify-between mb-3`}>
            <Text style={tw`text-lg font-bold text-gray-900`}>Recent Orders</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Orders')}>
              <Text style={tw`text-sm text-blue-600 font-semibold`}>View All</Text>
            </TouchableOpacity>
          </View>
          <View style={tw`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden`}>
            {loading && recentOrders.length === 0 ? (
              <View style={tw`items-center justify-center py-8`}>
                <ActivityIndicator size="large" color="#3B82F6" />
              </View>
            ) : recentOrders.length === 0 ? (
              <View style={tw`p-6 items-center`}>
                <Ionicons name="receipt-outline" size={48} color="#9CA3AF" />
                <Text style={tw`text-gray-500 mt-4 text-center`}>No orders yet</Text>
              </View>
            ) : (
              recentOrders.map((order) => {
                const shippingAddress = typeof order.shipping_address === 'string'
                  ? JSON.parse(order.shipping_address)
                  : order.shipping_address;
                const customerName = shippingAddress?.name || 'Unknown Customer';
                const orderTotal = order.total || 0;
                const orderStatus = order.status || 'pending';
                const firstItem = order.items && order.items.length > 0 ? order.items[0] : null;
                const productName = firstItem?.product_name || 'Product';
                
                return (
                  <TouchableOpacity
                    key={order.id}
                    style={tw`px-4 py-3 border-b border-gray-100 last:border-b-0`}
                    onPress={() => navigation.navigate('Orders')}
                  >
                    <View style={tw`flex-row items-center justify-between`}>
                      <View style={tw`flex-1`}>
                        <Text style={tw`font-semibold text-gray-900`}>{customerName}</Text>
                        <Text style={tw`text-sm text-gray-500`}>{productName}</Text>
                      </View>
                      <View style={tw`items-end`}>
                        <Text style={tw`font-bold text-gray-900`}>${orderTotal.toFixed(2)}</Text>
                        <View
                          style={tw`mt-1 px-2 py-0.5 rounded-full ${
                            orderStatus === 'completed'
                              ? 'bg-green-100'
                              : orderStatus === 'shipped'
                              ? 'bg-blue-100'
                              : orderStatus === 'delivered'
                              ? 'bg-green-100'
                              : 'bg-yellow-100'
                          }`}
                        >
                          <Text
                            style={tw`text-xs font-medium ${
                              orderStatus === 'completed'
                                ? 'text-green-700'
                                : orderStatus === 'shipped'
                                ? 'text-blue-700'
                                : orderStatus === 'delivered'
                                ? 'text-green-700'
                                : 'text-yellow-700'
                            }`}
                          >
                            {orderStatus}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <Text style={tw`text-xs text-gray-400 mt-1`}>{formatTimeAgo(order.created_at)}</Text>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </View>

        {/* Quick Actions */}
        <View style={tw`px-4 mb-6`}>
          <Text style={tw`text-lg font-bold text-gray-900 mb-3`}>Quick Actions</Text>
          <View style={tw`flex-row flex-wrap -mx-2`}>
            <TouchableOpacity
              style={tw`w-1/2 px-2 mb-3`}
              onPress={() => navigation.navigate('Inventory')}
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
              onPress={() => navigation.navigate('Marketing')}
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
              onPress={() => navigation.navigate('Marketing')}
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
              onPress={() => navigation.navigate('Partnerships')}
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
