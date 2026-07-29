import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
import BusinessEmptyState from '../../components/business/BusinessEmptyState';
import SkeletonCard from '../../components/ui/SkeletonCard';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchCustomers } from '../../store/slices/businessSlice';
import { feedListPerformanceProps, TAB_SCREEN_BOTTOM_PADDING } from '../../constants/scroll';
import type { BusinessCustomer } from '../../services/api/business';

function formatDate(dateString: string) {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

export default function CustomersScreen() {
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const customers = useAppSelector((s) => s.business.customers);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(customers.length === 0);

  const load = useCallback(async () => {
    try {
      await dispatch(fetchCustomers()).unwrap();
    } catch {
      // silent — empty state handles
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openCustomerOrders = (customer: BusinessCustomer) => {
    const tabNav = navigation.getParent()?.getParent?.() || navigation.getParent?.() || navigation;
    tabNav.navigate('BusinessMain', {
      screen: 'Orders',
      params: { search: customer.username || customer.email || customer.user_id },
    });
  };

  const renderCustomer = ({ item }: { item: BusinessCustomer }) => (
    <TouchableOpacity
      style={tw`py-4 border-b border-stone-200/70`}
      onPress={() => openCustomerOrders(item)}
      activeOpacity={0.85}
    >
      <View style={tw`flex-row items-center`}>
        <View style={tw`w-11 h-11 rounded-full bg-[#EAE4D6] items-center justify-center mr-3`}>
          <Text style={tw`text-lg`}>{item.avatar || '👤'}</Text>
        </View>
        <View style={tw`flex-1 pr-2`}>
          <Text style={tw`text-base font-bold text-stone-900`}>{item.username}</Text>
          <Text style={tw`text-xs text-stone-500 mt-0.5`}>{item.email}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#A8A29E" />
      </View>
      <View style={tw`flex-row mt-3`}>
        <View style={tw`flex-1`}>
          <Text style={tw`text-xs text-stone-500`}>LTV</Text>
          <Text style={tw`text-sm font-bold text-emerald-700`}>${Number(item.total_spent).toFixed(2)}</Text>
        </View>
        <View style={tw`flex-1`}>
          <Text style={tw`text-xs text-stone-500`}>Orders</Text>
          <Text style={tw`text-sm font-bold text-stone-900`}>{item.order_count}</Text>
        </View>
        <View style={tw`flex-1`}>
          <Text style={tw`text-xs text-stone-500`}>Last order</Text>
          <Text style={tw`text-sm font-semibold text-stone-700`}>{formatDate(item.last_order_at)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`} edges={['bottom']}>
      <FlatList
        style={tw`flex-1`}
        data={customers}
        keyExtractor={(item) => item.user_id}
        renderItem={renderCustomer}
        contentContainerStyle={[
          tw`px-5 pt-2`,
          customers.length === 0 ? tw`flex-grow` : null,
          { paddingBottom: TAB_SCREEN_BOTTOM_PADDING },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#059669" colors={['#059669']} />
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
              icon="people-outline"
              title="No customers yet"
              description="Customers appear here after their first order from your store."
            />
          )
        }
      />
    </SafeAreaView>
  );
}
