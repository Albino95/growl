import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import {
  getBusinessOrderDetail,
  updateOrderFulfillment,
  requestOrderRefund,
  type Order,
} from '../../services/api/business';
import { updateOrderStatus } from '../../services/api/marketplace';
import OrderStatusPill from '../../components/business/OrderStatusPill';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import { copyToClipboard } from '../../utils/csvDownload';
import { createConversation } from '../../services/api/messages';
import { useAuth, useAppDispatch } from '../../store/hooks';
import { fetchBusinessSettings } from '../../store/slices/businessSlice';
import { parseShippingAddress, safeParseJson } from '../../utils/safeJson';

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

type OrderMetadata = {
  payment_method?: string;
  note?: string;
  tracking_number?: string;
  carrier?: string;
  label_url?: string;
  refund_requested_at?: string;
};

export default function BusinessOrderDetailScreen() {
  const route = useRoute<RouteProp<BusinessOrderDetailParams, 'BusinessOrderDetail'>>();
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const { user } = useAuth();
  const { orderId } = route.params;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrier, setCarrier] = useState('');
  const [labelUrl, setLabelUrl] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [defaultShippingNote, setDefaultShippingNote] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const res = await getBusinessOrderDetail(orderId);
      if (res.success && res.data) {
        setOrder(res.data);
        const meta = safeParseJson<OrderMetadata>(res.data.metadata, {});
        setTrackingNumber(meta.tracking_number || '');
        setCarrier(meta.carrier || '');
        setLabelUrl(meta.label_url || '');
      }
    } catch (e: unknown) {
      alertMessage('Error', e instanceof Error ? e.message : 'Could not load order');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    void dispatch(fetchBusinessSettings())
      .unwrap()
      .then((settings) => {
        const analytics = (settings.analytics_prefs || {}) as Record<string, unknown>;
        setDefaultShippingNote(String(analytics.default_shipping_note ?? ''));
      })
      .catch(() => {});
  }, [orderId, dispatch]);

  const saveFulfillment = async () => {
    if (!order) return;
    setBusy(true);
    try {
      const res = await updateOrderFulfillment(order.id, {
        tracking_number: trackingNumber.trim() || undefined,
        carrier: carrier.trim() || undefined,
        label_url: labelUrl.trim() || undefined,
      });
      if (res.ok) {
        setOrder({ ...order, metadata: { ...safeParseJson(order.metadata, {}), ...res.metadata } });
        alertMessage('Saved', 'Fulfillment details updated.');
      }
    } catch (e: unknown) {
      alertMessage('Error', e instanceof Error ? e.message : 'Could not save fulfillment');
    } finally {
      setBusy(false);
    }
  };

  const advance = async () => {
    if (!order) return;
    const next = NEXT[order.status || 'pending'];
    if (!next) return;

    if (next === 'shipped' && !trackingNumber.trim()) {
      const shipAnyway = await confirmAsync(
        'Ship without tracking?',
        'No tracking number added yet. Mark as shipped anyway? You can add tracking later in Fulfillment.',
        { confirmLabel: 'Ship anyway', cancelLabel: 'Add tracking first' }
      );
      if (!shipAnyway) return;
    } else {
      const ok = await confirmAsync('Update status', `Mark order as ${next}?`);
      if (!ok) return;
    }

    setBusy(true);
    try {
      if (next === 'shipped' && trackingNumber.trim()) {
        await updateOrderFulfillment(order.id, {
          tracking_number: trackingNumber.trim(),
          carrier: carrier.trim() || undefined,
          label_url: labelUrl.trim() || undefined,
        });
      }
      const res = await updateOrderStatus(order.id, next);
      if (res.success && res.data) setOrder(res.data);
    } catch (e: unknown) {
      alertMessage('Error', e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const submitRefundRequest = async () => {
    if (!order) return;
    const reason = refundReason.trim();
    if (!reason) {
      alertMessage('Reason required', 'Enter a reason for the refund request.');
      return;
    }
    const ok = await confirmAsync(
      'Request refund',
      `Submit a refund request for $${Number(order.total).toFixed(2)}? Platform support will review.`,
      { confirmLabel: 'Submit', destructive: true }
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await requestOrderRefund(order.id, { reason });
      if (res.ok) {
        setOrder({ ...order, metadata: { ...safeParseJson(order.metadata, {}), ...res.metadata } });
        alertMessage('Submitted', 'Refund request sent for review.');
        setRefundReason('');
      }
    } catch (e: unknown) {
      alertMessage('Error', e instanceof Error ? e.message : 'Could not submit refund request');
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

  const metadata = safeParseJson<OrderMetadata>(order.metadata, {});
  const shipping = parseShippingAddress(order.shipping_address);
  const statusIdx = TIMELINE.indexOf((order.status as (typeof TIMELINE)[number]) || 'pending');
  const next = NEXT[order.status || 'pending'];
  const refundPending = Boolean(metadata.refund_requested_at);

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
            Payment: {metadata.payment_method || 'Card'}
          </Text>
          <Text style={tw`text-2xl font-bold text-emerald-700 mt-2`}>
            ${Number(order.total).toFixed(2)}
          </Text>
          {refundPending ? (
            <Text style={tw`text-xs text-amber-700 mt-2 font-semibold`}>Refund request pending review</Text>
          ) : null}
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
          {metadata.note ? (
            <Text style={tw`text-sm text-stone-500 mt-3 italic`}>Note: {metadata.note}</Text>
          ) : null}
        </View>

        <View style={tw`bg-white rounded-2xl p-4 border border-stone-100 mb-3`}>
          <Text style={tw`text-base font-semibold text-stone-900 mb-3`}>Fulfillment</Text>
          <Text style={tw`text-sm text-stone-600 mb-1`}>Tracking number</Text>
          <TextInput
            value={trackingNumber}
            onChangeText={setTrackingNumber}
            placeholder="1Z999..."
            placeholderTextColor="#A8A29E"
            autoCapitalize="characters"
            style={tw`bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 mb-3 text-stone-900`}
          />
          <Text style={tw`text-sm text-stone-600 mb-1`}>Carrier</Text>
          <TextInput
            value={carrier}
            onChangeText={setCarrier}
            placeholder="USPS, UPS, FedEx…"
            placeholderTextColor="#A8A29E"
            style={tw`bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 mb-3 text-stone-900`}
          />
          <Text style={tw`text-sm text-stone-600 mb-1`}>Label URL</Text>
          <TextInput
            value={labelUrl}
            onChangeText={setLabelUrl}
            placeholder="https://..."
            placeholderTextColor="#A8A29E"
            autoCapitalize="none"
            style={tw`bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 mb-3 text-stone-900`}
          />
          <TouchableOpacity
            style={tw`bg-emerald-600 rounded-xl py-3 items-center ${busy ? 'opacity-50' : ''}`}
            disabled={busy}
            onPress={() => void saveFulfillment()}
          >
            <Text style={tw`text-white font-bold`}>Save fulfillment</Text>
          </TouchableOpacity>
        </View>

        {defaultShippingNote ? (
          <View style={tw`bg-emerald-50 rounded-2xl p-4 border border-emerald-100 mb-3`}>
            <View style={tw`flex-row items-center justify-between mb-2`}>
              <Text style={tw`text-sm font-semibold text-emerald-900`}>Default shipping note</Text>
              <TouchableOpacity
                onPress={() => void copyToClipboard(defaultShippingNote, 'Shipping note')}
                style={tw`flex-row items-center px-2 py-1 bg-white rounded-lg border border-emerald-200`}
              >
                <Ionicons name="copy-outline" size={14} color="#059669" />
                <Text style={tw`text-xs font-semibold text-emerald-700 ml-1`}>Copy</Text>
              </TouchableOpacity>
            </View>
            <Text style={tw`text-sm text-emerald-800 leading-5`}>{defaultShippingNote}</Text>
          </View>
        ) : null}

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

        {!refundPending && order.status !== 'cancelled' ? (
          <View style={tw`bg-white rounded-2xl p-4 border border-stone-100 mb-3`}>
            <Text style={tw`text-base font-semibold text-stone-900 mb-2`}>Refund request</Text>
            <TextInput
              value={refundReason}
              onChangeText={setRefundReason}
              placeholder="Reason for refund…"
              placeholderTextColor="#A8A29E"
              multiline
              numberOfLines={2}
              style={tw`bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 mb-3 text-stone-900 min-h-[64px]`}
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={tw`bg-red-50 border border-red-200 rounded-xl py-3 items-center ${busy ? 'opacity-50' : ''}`}
              disabled={busy}
              onPress={() => void submitRefundRequest()}
            >
              <Text style={tw`text-red-700 font-bold`}>Request refund</Text>
            </TouchableOpacity>
          </View>
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
