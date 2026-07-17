import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import { getBusinessOrderDetail, type Order } from '../../services/api/business';
import { updateOrderStatus } from '../../services/api/marketplace';
import OrderStatusPill from '../../components/business/OrderStatusPill';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import { createConversation } from '../../services/api/messages';
import { useAuth } from '../../store/hooks';

type BusinessOrderDetailParams = {
  BusinessOrderDetail: { orderId: string };
};

const TIMELINE = ['pending', 'processing', 'shipped', 'delivered', 'completed'] as const;

const NEXT: Record<string, string | null> = {
  pending: 'processing',
  processing: 'shipped',
  shipped: 'delivered',
  delivered: 'completed',
  completed: null,
};

export default function BusinessOrderDetailScreen() {
  const route = useRoute<RouteProp<BusinessOrderDetailParams, 'BusinessOrderDetail'>>();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { orderId } = route.params;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const res = await getBusinessOrderDetail(orderId);
      if (res.success && res.data) setOrder(res.data);
    } catch (e: unknown) {
      alertMessage('Error', e instanceof Error ? e.message : 'Could not load order');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [orderId]);

  const advance = async () => {
    if (!order) return;
    const next = NEXT[order.status || 'pending'];
    if (!next) return;
    const ok = await confirmAsync('Update status', `Mark order as ${next}?`);
    if (!ok) return;
    setBusy(true);
    try {
      const res = await updateOrderStatus(order.id, next);
      if (res.success && res.data) setOrder(res.data);
    } catch (e: unknown) {
      alertMessage('Error', e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const messageCustomer = async () => {
    const buyerId = order?.user_id;
    if (!buyerId || buyerId === user?.id) {
      alertMessage('Unavailable', 'Customer messaging is not available for this order.');
      return;
    }
    try {
      setBusy(true);
      const res = await createConversation(buyerId);
      navigation.navigate('BusinessMessages', {
        conversationId: res.data.conversation.id,
        targetUserId: buyerId,
      });
    } catch (e: unknown) {
      alertMessage(
        'Could not open chat',
        e instanceof Error
          ? e.message
          : 'You can only message customers who are friends on Growl.'
      );
    } finally {
      setBusy(false);
    }
  };

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
  const shipping = order.shipping_address as Record<string, string> | undefined;
  const statusIdx = TIMELINE.indexOf((order.status as (typeof TIMELINE)[number]) || 'pending');
  const next = NEXT[order.status || 'pending'];

  return (
    <SafeAreaView style={tw`flex-1 bg-stone-50`} edges={['bottom']}>
      <ScrollView style={tw`flex-1 px-4 pt-4`} contentContainerStyle={tw`pb-10`}>
        <View style={tw`bg-white rounded-2xl p-4 border border-stone-100 mb-3`}>
          <View style={tw`flex-row items-center justify-between mb-2`}>
            <Text style={tw`text-lg font-bold text-stone-900`}>
              Order #{order.id.slice(-8).toUpperCase()}
            </Text>
            <OrderStatusPill status={order.status || 'pending'} />
          </View>
          <Text style={tw`text-sm text-stone-500`}>
            Payment: {(metadata as { payment_method?: string }).payment_method || 'Card'}
          </Text>
          <Text style={tw`text-2xl font-bold text-emerald-700 mt-2`}>
            ${Number(order.total).toFixed(2)}
          </Text>
        </View>

        <View style={tw`bg-white rounded-2xl p-4 border border-stone-100 mb-3`}>
          <Text style={tw`text-base font-semibold text-stone-900 mb-3`}>Status timeline</Text>
          {TIMELINE.map((step, i) => {
            const done = statusIdx >= i || order.status === 'completed';
            return (
              <View key={step} style={tw`flex-row items-center mb-2`}>
                <View
                  style={tw`w-7 h-7 rounded-full items-center justify-center mr-3 ${
                    done ? 'bg-emerald-600' : 'bg-stone-200'
                  }`}
                >
                  <Ionicons name={done ? 'checkmark' : 'ellipse'} size={14} color={done ? '#fff' : '#A8A29E'} />
                </View>
                <Text style={tw`capitalize font-medium ${done ? 'text-stone-900' : 'text-stone-400'}`}>
                  {step}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={tw`bg-white rounded-2xl p-4 border border-stone-100 mb-3`}>
          <Text style={tw`text-base font-semibold text-stone-900 mb-2`}>Shipping</Text>
          <Text style={tw`text-sm text-stone-700`}>{shipping?.name || 'N/A'}</Text>
          <Text style={tw`text-sm text-stone-600 mt-1`}>
            {[shipping?.street, shipping?.city, shipping?.state, shipping?.zip, shipping?.country]
              .filter(Boolean)
              .join(', ') || 'No address'}
          </Text>
          {(metadata as { note?: string }).note ? (
            <Text style={tw`text-sm text-stone-500 mt-3 italic`}>
              Note: {(metadata as { note?: string }).note}
            </Text>
          ) : null}
        </View>

        <View style={tw`bg-white rounded-2xl p-4 border border-stone-100 mb-4`}>
          <Text style={tw`text-base font-semibold text-stone-900 mb-2`}>Items</Text>
          {order.items?.map((item) => (
            <View
              key={item.id}
              style={tw`flex-row justify-between py-2 border-b border-stone-100`}
            >
              <View style={tw`flex-1 pr-2`}>
                <Text style={tw`text-sm font-medium text-stone-900`}>{item.product_name || 'Product'}</Text>
                <Text style={tw`text-xs text-stone-500`}>
                  Qty {item.quantity} · ${Number(item.price).toFixed(2)}
                </Text>
              </View>
              <Text style={tw`text-sm font-semibold text-stone-900`}>
                ${(Number(item.price) * Number(item.quantity)).toFixed(2)}
              </Text>
            </View>
          ))}
        </View>

        {next ? (
          <TouchableOpacity
            style={tw`bg-emerald-600 rounded-xl py-4 items-center mb-3 ${busy ? 'opacity-50' : ''}`}
            disabled={busy}
            onPress={() => void advance()}
          >
            <Text style={tw`text-white font-bold`}>Mark as {next}</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={tw`bg-white border border-stone-200 rounded-xl py-4 items-center flex-row justify-center mb-6 ${
            busy ? 'opacity-50' : ''
          }`}
          disabled={busy}
          onPress={() => void messageCustomer()}
        >
          <Ionicons name="chatbubble-outline" size={18} color="#059669" style={tw`mr-2`} />
          <Text style={tw`text-emerald-700 font-bold`}>Message customer</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
