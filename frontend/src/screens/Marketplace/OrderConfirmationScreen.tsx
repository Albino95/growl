import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import tw from '../../lib/tw';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { getOrder, type Order } from '../../services/api/marketplace';
import type { RootStackParamList } from '../../app/navigation/RootNavigator';

type Route = RouteProp<RootStackParamList, 'OrderConfirmation'>;
type Nav = StackNavigationProp<RootStackParamList>;

const POLL_MS = 2000;
const MAX_POLLS = 15;

export default function OrderConfirmationScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { orderId, sessionId, cancelled } = route.params || {};
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [polls, setPolls] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const paymentStatus = (order?.payment_status || '').toLowerCase();
  const isPaid = paymentStatus === 'paid';
  const isCancelled = Boolean(cancelled) || order?.status === 'cancelled';
  const stillWaiting = Boolean(orderId) && !isPaid && !isCancelled && polls < MAX_POLLS;

  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await getOrder(orderId);
      if (res.success && res.data) {
        setOrder(res.data);
        setError('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load order');
    } finally {
      setPolls((p) => p + 1);
    }
  }, [orderId]);

  useEffect(() => {
    if (!orderId || cancelled) return;
    void fetchOrder();
  }, [orderId, cancelled, fetchOrder]);

  useEffect(() => {
    if (!stillWaiting) return;
    timerRef.current = setTimeout(() => {
      void fetchOrder();
    }, POLL_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [stillWaiting, polls, fetchOrder]);

  let title = 'Waiting for payment';
  let subtitle =
    'Finish checkout in the browser if you have not already. We will confirm payment here automatically.';
  let icon: keyof typeof Ionicons.glyphMap = 'time-outline';
  let iconColor = '#D97706';
  let iconBg = 'bg-amber-50';

  if (!orderId) {
    title = 'Checkout started';
    subtitle =
      'Return here after paying in the browser. Open My orders to see payment status.';
    icon = 'card-outline';
    iconColor = '#059669';
    iconBg = 'bg-brand-50';
  } else if (isCancelled) {
    title = 'Payment cancelled';
    subtitle = 'No charge was completed. You can try checkout again from your cart.';
    icon = 'close-circle-outline';
    iconColor = '#DC2626';
    iconBg = 'bg-red-50';
  } else if (isPaid) {
    title = 'Payment confirmed';
    subtitle = 'Your order is paid. The seller will prepare shipment next.';
    icon = 'checkmark-circle';
    iconColor = '#059669';
    iconBg = 'bg-brand-50';
  } else if (polls >= MAX_POLLS) {
    title = 'Payment pending';
    subtitle =
      'We have not received Stripe confirmation yet. If you paid, it may take a moment — check My orders shortly.';
    icon = 'hourglass-outline';
    iconColor = '#D97706';
    iconBg = 'bg-amber-50';
  }

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`}>
      <View style={tw`flex-1 px-6 justify-center`}>
        <View style={tw`bg-surface-card border border-stone-200/80 rounded-3xl p-6 items-center`}>
          <View style={tw`w-16 h-16 rounded-2xl items-center justify-center mb-4 ${iconBg}`}>
            {stillWaiting ? (
              <ActivityIndicator size="large" color="#059669" />
            ) : (
              <Ionicons name={icon} size={36} color={iconColor} />
            )}
          </View>
          <Text style={tw`text-2xl font-bold text-stone-900 text-center mb-2`}>{title}</Text>
          <Text style={tw`text-sm text-stone-500 text-center leading-5 mb-4`}>{subtitle}</Text>

          {orderId ? (
            <Text style={tw`text-[11px] font-semibold tracking-wider text-stone-400 uppercase mb-1`}>
              Order · {orderId.slice(-8).toUpperCase()}
            </Text>
          ) : null}
          {sessionId ? (
            <Text style={tw`text-[10px] text-stone-400 mb-3`} numberOfLines={1}>
              Session {sessionId.slice(0, 18)}…
            </Text>
          ) : null}
          {order ? (
            <Text style={tw`text-lg font-bold text-brand-600 mb-2`}>
              ${Number(order.total).toFixed(2)}
            </Text>
          ) : null}
          {error ? <Text style={tw`text-sm text-red-600 mb-3 text-center`}>{error}</Text> : null}

          <PrimaryButton
            label="My orders"
            onPress={() => navigation.replace('UserOrders')}
            style={tw`w-full mt-2`}
          />
          <PrimaryButton
            label="Back to shop"
            variant="ghost"
            onPress={() => navigation.navigate('Individual')}
            style={tw`w-full mt-2`}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
