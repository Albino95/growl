import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../../components/ui/PressableScale';
import BrandLoadingScreen from '../../components/common/BrandLoadingScreen';
import FormTextInput from '../../components/ui/FormTextInput';
import { KeyboardDoneAccessory } from '../../components/ui/KeyboardDoneAccessory';
import PrimaryButton from '../../components/ui/PrimaryButton';
import ErrorState from '../../components/ui/ErrorState';
import { haptic } from '../../theme/haptics';
import { contactCopy, type ContactReason } from '../../services/api/businessHelpers';
import {
  getBusinessOrderDetail,
  getOrderContact,
  updateOrderFulfillment,
  requestOrderRefund,
  isOrderAwaitingPayment,
  orderBusinessTotal,
  orderCurrency,
  type Order,
} from '../../services/api/business';
import { formatCurrency } from '../../utils/money';
import { updateOrderStatus } from '../../services/api/marketplace';
import OrderStatusPill from '../../components/business/OrderStatusPill';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import { toast } from '../../state/useToastStore';
import { copyToClipboard } from '../../utils/csvDownload';
import { createConversation } from '../../services/api/messages';
import { useAuth, useAppDispatch } from '../../store/hooks';
import {
  fetchBusinessDashboard,
  fetchBusinessSettings,
  patchLocalOrderStatus,
} from '../../store/slices/businessSlice';
import { parseShippingAddress, safeParseJson } from '../../utils/safeJson';
import { serverDate } from '../../utils/serverDate';

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [contactReason, setContactReason] = useState<ContactReason | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await getBusinessOrderDetail(orderId);
      if (res.success && res.data) {
        setOrder(res.data);
        const meta = safeParseJson<OrderMetadata>(res.data.metadata, {});
        setTrackingNumber(meta.tracking_number || '');
        setCarrier(meta.carrier || '');
        setLabelUrl(meta.label_url || '');
      }
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Could not load order');
    } finally {
      setLoading(false);
    }
    // Know up front whether the buyer can be messaged (blocks, their DM privacy setting),
    // instead of failing after the tap. Older servers: fall back to trying.
    getOrderContact(orderId)
      .then((c) => setContactReason(c.reason))
      .catch(() => setContactReason(null));
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
    // The server rejects a fulfillment update with no fields (generic 400).
    if (!trackingNumber.trim() && !carrier.trim() && !labelUrl.trim()) {
      alertMessage('Nothing to save', 'Add a tracking number, carrier or label link first.');
      return;
    }
    setBusy(true);
    try {
      const res = await updateOrderFulfillment(order.id, {
        tracking_number: trackingNumber.trim() || undefined,
        carrier: carrier.trim() || undefined,
        label_url: labelUrl.trim() || undefined,
      });
      if (res.ok) {
        setOrder({ ...order, metadata: { ...safeParseJson(order.metadata, {}), ...res.metadata } });
        toast.success('Shipping details saved');
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
        'No tracking number added yet. Mark as shipped anyway? You can add tracking later under Shipping details.',
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
      if (res.success && res.data) {
        // Keep list-only fields (awaiting_payment, business_total) from the detail payload.
        setOrder({ ...order, ...res.data, items: res.data.items ?? order.items });
        dispatch(patchLocalOrderStatus({ orderId: order.id, status: res.data.status }));
        void dispatch(fetchBusinessDashboard({ force: true, silent: true }));
        haptic('success');
        toast.success(`Marked ${next}`);
      }
    } catch (e: unknown) {
      alertMessage('Error', e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async () => {
    if (!order) return;
    const paid = !isOrderAwaitingPayment(order);
    const ok = await confirmAsync(
      'Cancel this order?',
      paid
        ? 'The items go back into stock. Let the customer know why — you can message them from this screen.'
        : 'This order was never paid, so nothing needs refunding.',
      { confirmLabel: 'Cancel order', cancelLabel: 'Keep order', destructive: true }
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await updateOrderStatus(order.id, 'cancelled');
      if (res.success && res.data) {
        setOrder({ ...order, ...res.data, items: res.data.items ?? order.items });
        dispatch(patchLocalOrderStatus({ orderId: order.id, status: res.data.status }));
        void dispatch(fetchBusinessDashboard({ force: true, silent: true }));
        haptic('destructive');
        toast.success('Order cancelled');
      }
    } catch (e: unknown) {
      alertMessage('Couldn’t cancel', e instanceof Error ? e.message : 'Try again in a moment.');
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
      `Submit a refund request for ${formatCurrency(orderBusinessTotal(order), orderCurrency(order))}? Platform support will review.`,
      { confirmLabel: 'Submit', destructive: true }
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await requestOrderRefund(order.id, { reason });
      if (res.ok) {
        setOrder({ ...order, metadata: { ...safeParseJson(order.metadata, {}), ...res.metadata } });
        toast.success('Refund request sent');
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
    const blockedCopy = contactCopy(contactReason);
    if (blockedCopy) {
      alertMessage('Can’t message', blockedCopy);
      return;
    }
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
          : 'Messaging isn’t available for this customer.'
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={tw`flex-1 bg-page`}>
        <BrandLoadingScreen variant="page" message="Loading order…" manageStatusBar={false} />
      </SafeAreaView>
    );
  }

  if (!order) {
    const notFound = !loadError || /not found/i.test(loadError);
    return (
      <SafeAreaView style={tw`flex-1 bg-page items-center justify-center px-gutter`}>
        <ErrorState
          icon={notFound ? 'receipt-outline' : 'cloud-offline-outline'}
          title={notFound ? 'Order not found' : 'Couldn’t load this order'}
          message={
            notFound
              ? 'It may belong to another seller or have been removed.'
              : 'Check your connection and try again.'
          }
          onRetry={notFound ? () => navigation.goBack() : () => void load()}
          retryLabel={notFound ? 'Back to orders' : 'Try again'}
        />
      </SafeAreaView>
    );
  }

  const metadata = safeParseJson<OrderMetadata>(order.metadata, {});
  const shipping = parseShippingAddress(order.shipping_address);
  const statusIdx = TIMELINE.indexOf((order.status as (typeof TIMELINE)[number]) || 'pending');
  const awaitingPayment = isOrderAwaitingPayment(order);
  const next = awaitingPayment ? null : NEXT[order.status || 'pending'];
  const currency = orderCurrency(order);
  const refundPending = Boolean(metadata.refund_requested_at);
  const cancelled = order.status === 'cancelled';
  const canCancel = order.status === 'pending' || order.status === 'processing';
  const contactNote = contactCopy(contactReason);
  const placed = serverDate(order.created_at);
  const placedLabel = Number.isNaN(placed.getTime())
    ? null
    : placed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const itemCount = (order.items || []).reduce((n, it) => n + Number(it.quantity || 0), 0);

  return (
    <SafeAreaView style={tw`flex-1 bg-page`} edges={['bottom']}>
      <ScrollView
        style={tw`flex-1 px-gutter pt-4`}
        contentContainerStyle={tw`pb-10`}
        // Fulfillment + refund inputs sit low in this list: keep the focused one above the keyboard.
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View style={tw`bg-card rounded-card p-4 border border-line mb-3`}>
          <View style={tw`flex-row items-center justify-between mb-2`}>
            <Text style={tw`text-lg font-bold text-ink`}>
              Order #{order.id.slice(-8).toUpperCase()}
            </Text>
            <OrderStatusPill status={order.status || 'pending'} awaitingPayment={awaitingPayment} />
          </View>
          <Text style={tw`text-sm text-ink-3`}>
            {placedLabel ? `Placed ${placedLabel}` : 'Placed recently'} · {itemCount} item
            {itemCount === 1 ? '' : 's'}
            {metadata.payment_method ? ` · ${metadata.payment_method}` : ''}
          </Text>
          <Text style={tw`text-2xl font-bold text-emerald-700 mt-2`}>
            {formatCurrency(orderBusinessTotal(order), currency)}
          </Text>
          {awaitingPayment ? (
            <Text style={tw`text-xs text-ink-2 mt-2`}>
              Awaiting payment — the customer hasn't completed checkout yet. Don't ship until it
              shows as paid.
            </Text>
          ) : null}
          {refundPending ? (
            <Text style={tw`text-xs text-amber-700 mt-2 font-semibold`}>Refund request pending review</Text>
          ) : null}
        </View>

        {cancelled ? (
          <View style={tw`bg-card rounded-card p-4 border border-line mb-3 flex-row items-center`}>
            <Ionicons name="close-circle" size={22} color={theme.colors.danger} />
            <Text style={tw`text-body text-ink ml-2 flex-1`}>
              This order was cancelled. No further steps.
            </Text>
          </View>
        ) : (
        <View style={tw`bg-card rounded-card p-4 border border-line mb-3`}>
          <Text style={tw`text-base font-semibold text-ink mb-3`} accessibilityRole="header">
            Fulfilment steps
          </Text>
          {TIMELINE.map((step, i) => {
            const done = statusIdx >= i || order.status === 'completed';
            const current = statusIdx === i && order.status !== 'completed';
            return (
              <View
                key={step}
                style={tw`flex-row items-center mb-2`}
                accessible
                accessibilityLabel={`${step}${done ? ', done' : ''}${current ? ', current step' : ''}`}
              >
                <View
                  style={tw`w-7 h-7 rounded-full items-center justify-center mr-3 ${
                    done ? 'bg-emerald-600' : 'bg-raised border border-line'
                  }`}
                >
                  <Ionicons name={done ? 'checkmark' : 'ellipse'} size={14} color={done ? '#FFFFFF' : theme.colors.iconMuted} />
                </View>
                <Text style={tw`capitalize font-medium ${done ? 'text-ink' : 'text-ink-3'}`}>
                  {step}
                </Text>
                {current ? (
                  <Text style={tw`text-footnote text-ink-3 ml-2`}>· now</Text>
                ) : null}
              </View>
            );
          })}
        </View>
        )}

        <View style={tw`bg-card rounded-card p-4 border border-line mb-3`}>
          <Text style={tw`text-base font-semibold text-ink mb-2`}>Shipping</Text>
          <Text style={tw`text-sm text-ink-2`}>{shipping?.name || 'N/A'}</Text>
          <Text style={tw`text-sm text-ink-2 mt-1`}>
            {[shipping?.street, shipping?.city, shipping?.state, shipping?.zip, shipping?.country]
              .filter(Boolean)
              .join(', ') || 'No address'}
          </Text>
          {metadata.note ? (
            <Text style={tw`text-sm text-ink-3 mt-3 italic`}>Note: {metadata.note}</Text>
          ) : null}
        </View>

        {!cancelled && !awaitingPayment ? (
        <View style={tw`bg-card rounded-card p-4 border border-line mb-3`}>
          <Text style={tw`text-base font-semibold text-ink mb-1`} accessibilityRole="header">
            Shipping details
          </Text>
          <Text style={tw`text-footnote text-ink-3 mb-3`}>
            Optional. Add tracking before marking as shipped so the customer can follow it.
          </Text>
          <Text style={tw`text-sm text-ink-2 mb-1`}>Tracking number</Text>
          <FormTextInput
            value={trackingNumber}
            onChangeText={setTrackingNumber}
            placeholder="1Z999..."
            autoCapitalize="characters"
            autoCorrect={false}
            style={tw`mb-3 bg-card rounded-control`}
          />
          <Text style={tw`text-sm text-ink-2 mb-1`}>Carrier</Text>
          <FormTextInput
            value={carrier}
            onChangeText={setCarrier}
            placeholder="USPS, UPS, FedEx…"
            autoCapitalize="words"
            autoCorrect={false}
            style={tw`mb-3 bg-card rounded-control`}
          />
          <Text style={tw`text-sm text-ink-2 mb-1`}>Label URL</Text>
          <FormTextInput
            value={labelUrl}
            onChangeText={setLabelUrl}
            placeholder="https://..."
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            textContentType="URL"
            style={tw`mb-3 bg-card rounded-control`}
          />
          <PrimaryButton
            label="Save shipping details"
            onPress={() => void saveFulfillment()}
            loading={busy}
            disabled={busy}
          />
        </View>
        ) : null}

        {defaultShippingNote ? (
          <View style={tw`bg-emerald-50 rounded-card p-4 border border-emerald-100 mb-3`}>
            <View style={tw`flex-row items-center justify-between mb-2`}>
              <Text style={tw`text-sm font-semibold text-emerald-900`}>Default shipping note</Text>
              <PressableScale
                onPress={() => void copyToClipboard(defaultShippingNote, 'Shipping note')}
                style={tw`flex-row items-center px-2 py-1 bg-card rounded-control border border-emerald-200`}
              >
                <Ionicons name="copy-outline" size={14} color={theme.colors.brand} />
                <Text style={tw`text-xs font-semibold text-emerald-700 ml-1`}>Copy</Text>
              </PressableScale>
            </View>
            <Text style={tw`text-sm text-emerald-800 leading-5`}>{defaultShippingNote}</Text>
          </View>
        ) : null}

        <View style={tw`bg-card rounded-card p-4 border border-line mb-4`}>
          <Text style={tw`text-base font-semibold text-ink mb-2`}>Items</Text>
          {order.items?.map((item) => (
            <View
              key={item.id}
              style={tw`flex-row justify-between py-2 border-b border-line`}
            >
              <View style={tw`flex-1 pr-2`}>
                <Text style={tw`text-sm font-medium text-ink`}>{item.product_name || 'Product'}</Text>
                <Text style={tw`text-xs text-ink-3`}>
                  Qty {item.quantity} · {formatCurrency(Number(item.price), currency)}
                </Text>
              </View>
              <Text style={tw`text-sm font-semibold text-ink`}>
                {formatCurrency(Number(item.price) * Number(item.quantity), currency)}
              </Text>
            </View>
          ))}
        </View>

        {next ? (
          <PrimaryButton
            label={`Mark as ${next}`}
            onPress={() => void advance()}
            loading={busy}
            disabled={busy}
            style={tw`mb-3`}
          />
        ) : null}

        {canCancel ? (
          <PressableScale
            onPress={() => void cancelOrder()}
            disabled={busy}
            style={tw`py-3 items-center mb-3 ${busy ? 'opacity-50' : ''}`}
            accessibilityRole="button"
            accessibilityLabel="Cancel this order"
          >
            <Text style={tw`text-red-600 font-semibold`}>Cancel order</Text>
          </PressableScale>
        ) : null}

        {!refundPending && !awaitingPayment && order.status !== 'cancelled' ? (
          <View style={tw`bg-card rounded-card p-4 border border-line mb-3`}>
            <Text style={tw`text-base font-semibold text-ink mb-2`}>Refund request</Text>
            <FormTextInput
              value={refundReason}
              onChangeText={setRefundReason}
              placeholder="Reason for refund…"
              multiline
              numberOfLines={2}
              style={tw`mb-3 bg-card rounded-control min-h-[64px] max-h-36`}
              textAlignVertical="top"
            />
            <PrimaryButton
              label="Request refund"
              onPress={() => void submitRefundRequest()}
              disabled={busy}
              loading={busy}
              style={{ backgroundColor: '#DC2626' }}
            />
          </View>
        ) : null}

        <PressableScale
          style={tw`bg-card border border-line rounded-control py-4 items-center flex-row justify-center ${
            contactNote ? 'mb-2' : 'mb-6'
          } ${busy || contactNote ? 'opacity-50' : ''}`}
          disabled={busy || !!contactNote}
          onPress={() => void messageCustomer()}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy || !!contactNote }}
          accessibilityHint={contactNote || undefined}
        >
          <Ionicons name="chatbubble-outline" size={18} color={theme.colors.brand} style={tw`mr-2`} />
          <Text style={tw`text-emerald-700 font-bold`}>Message customer</Text>
        </PressableScale>
        {contactNote ? (
          <Text style={tw`text-footnote text-ink-3 text-center mb-6 px-4`}>{contactNote}</Text>
        ) : null}
      </ScrollView>
      <KeyboardDoneAccessory />
    </SafeAreaView>
  );
}
