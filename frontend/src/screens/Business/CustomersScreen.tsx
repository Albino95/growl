import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../../components/ui/PressableScale';
import { iconSize } from '../../theme/icons';
import ErrorState from '../../components/ui/ErrorState';
import { useRefresh } from '../../hooks/useRefresh';
import BusinessEmptyState from '../../components/business/BusinessEmptyState';
import SkeletonCard from '../../components/ui/SkeletonCard';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchCustomers } from '../../store/slices/businessSlice';
import { feedListPerformanceProps, TAB_SCREEN_BOTTOM_PADDING } from '../../constants/scroll';
import type { BusinessCustomer } from '../../services/api/business';
import { formatCurrency } from '../../utils/money';

function formatDate(dateString: string) {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

export default function CustomersScreen() {
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const customers = useAppSelector((s) => s.business.customers);
  const customersStatus = useAppSelector((s) => s.business.customersStatus);
  const customersError = useAppSelector((s) => s.business.customersError);
  const [loading, setLoading] = useState(customers.length === 0);

  const load = useCallback(async () => {
    try {
      await dispatch(fetchCustomers()).unwrap();
    } catch {
      // error is stored in the slice (customersError) and rendered below
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useRefresh(load);

  const openCustomerOrders = (customer: BusinessCustomer) => {
    const tabNav = navigation.getParent()?.getParent?.() || navigation.getParent?.() || navigation;
    tabNav.navigate('BusinessMain', {
      screen: 'Orders',
      // OrdersScreen search matches order id, shipping name and buyer user_id; the
      // user_id is the only one guaranteed to match this customer's orders.
      params: { search: customer.user_id },
    });
  };

  const renderCustomer = ({ item }: { item: BusinessCustomer }) => (
    <PressableScale
      style={tw`py-4 border-b border-line/70`}
      onPress={() => openCustomerOrders(item)}
    >
      <View style={tw`flex-row items-center`}>
        <View style={tw`w-11 h-11 rounded-full bg-raised items-center justify-center mr-3`}>
          <Text style={tw`text-lg`}>{item.avatar || '👤'}</Text>
        </View>
        <View style={tw`flex-1 pr-2`}>
          <Text style={tw`text-base font-bold text-ink`}>{item.username}</Text>
          <Text style={tw`text-xs text-ink-3 mt-0.5`}>{item.email}</Text>
        </View>
        <Ionicons name="chevron-forward" size={iconSize.sm} color={theme.colors.iconMuted} />
      </View>
      <View style={tw`flex-row mt-3`}>
        <View style={tw`flex-1`}>
          <Text style={tw`text-xs text-ink-3`}>LTV</Text>
          <Text style={tw`text-sm font-bold text-emerald-700`}>
            {formatCurrency(Number(item.total_spent || 0))}
          </Text>
        </View>
        <View style={tw`flex-1`}>
          <Text style={tw`text-xs text-ink-3`}>Orders</Text>
          <Text style={tw`text-sm font-bold text-ink`}>{item.order_count}</Text>
        </View>
        <View style={tw`flex-1`}>
          <Text style={tw`text-xs text-ink-3`}>Last order</Text>
          <Text style={tw`text-sm font-semibold text-ink-2`}>{formatDate(item.last_order_at)}</Text>
        </View>
      </View>
    </PressableScale>
  );

  return (
    <SafeAreaView style={tw`flex-1 bg-page`} edges={['bottom']}>
      <FlatList
        style={tw`flex-1`}
        data={customers}
        keyExtractor={(item) => item.user_id}
        renderItem={renderCustomer}
        contentContainerStyle={[
          tw`px-gutter-wide pt-2`,
          customers.length === 0 ? tw`flex-grow` : null,
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
          ) : customersStatus === 'failed' ? (
            <ErrorState
              title="Couldn’t load customers"
              message={customersError || 'Check your connection and try again.'}
              onRetry={() => {
                setLoading(true);
                void load();
              }}
            />
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
