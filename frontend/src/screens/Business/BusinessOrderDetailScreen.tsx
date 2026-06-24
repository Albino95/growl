import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute } from '@react-navigation/native';
import tw from '../../lib/tw';
import { getBusinessOrderDetail, type Order } from '../../services/api/business';

type BusinessOrderDetailParams = {
  BusinessOrderDetail: {
    orderId: string;
  };
};

export default function BusinessOrderDetailScreen() {
  const route = useRoute<RouteProp<BusinessOrderDetailParams, 'BusinessOrderDetail'>>();
  const { orderId } = route.params;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await getBusinessOrderDetail(orderId);
        if (res.success && res.data) {
          setOrder(res.data);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Could not load order details';
        if (Platform.OS === 'web') alert(msg);
        else Alert.alert('Error', msg);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [orderId]);

  if (loading) {
    return (
      <SafeAreaView style={tw`flex-1 bg-stone-50 items-center justify-center`}>
        <ActivityIndicator size="large" color="#059669" />
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={tw`flex-1 bg-stone-50 items-center justify-center px-4`}>
        <Text style={tw`text-stone-600`}>Order not found.</Text>
      </SafeAreaView>
    );
  }

  const metadata = order.metadata || {};
  const shipping = order.shipping_address as any;

  return (
    <SafeAreaView style={tw`flex-1 bg-stone-50`}>
      <ScrollView style={tw`flex-1 px-4 pt-4`}>
        <View style={tw`bg-white rounded-xl p-4 border border-stone-200 mb-3`}>
          <Text style={tw`text-lg font-bold text-stone-900 mb-1`}>Order #{order.id.slice(-8).toUpperCase()}</Text>
          <Text style={tw`text-sm text-stone-500 capitalize`}>Status: {order.status}</Text>
          <Text style={tw`text-sm text-stone-500 mt-1`}>
            Payment: {metadata.payment_method || 'Card'} · Source: {metadata.source || 'organic'}
          </Text>
          <Text style={tw`text-2xl font-bold text-emerald-700 mt-2`}>${Number(order.total).toFixed(2)}</Text>
        </View>

        <View style={tw`bg-white rounded-xl p-4 border border-stone-200 mb-3`}>
          <Text style={tw`text-base font-semibold text-stone-900 mb-2`}>Shipping</Text>
          <Text style={tw`text-sm text-stone-700`}>{shipping?.name || 'N/A'}</Text>
          <Text style={tw`text-sm text-stone-600 mt-1`}>
            {[shipping?.street, shipping?.city, shipping?.state, shipping?.zip, shipping?.country]
              .filter(Boolean)
              .join(', ') || 'No address'}
          </Text>
        </View>

        <View style={tw`bg-white rounded-xl p-4 border border-stone-200 mb-6`}>
          <Text style={tw`text-base font-semibold text-stone-900 mb-2`}>Items</Text>
          {order.items?.map((item) => (
            <View key={item.id} style={tw`flex-row justify-between py-2 border-b border-stone-100 last:border-b-0`}>
              <View style={tw`flex-1 pr-2`}>
                <Text style={tw`text-sm font-medium text-stone-900`}>{item.product_name || 'Product'}</Text>
                <Text style={tw`text-xs text-stone-500`}>Qty {item.quantity} · ${Number(item.price).toFixed(2)}</Text>
              </View>
              <Text style={tw`text-sm font-semibold text-stone-900`}>
                ${(Number(item.price) * Number(item.quantity)).toFixed(2)}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
