import React from 'react';
import { View, Text } from 'react-native';
import tw from '../../lib/tw';

const COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-800' },
  processing: { bg: 'bg-blue-100', text: 'text-blue-800' },
  shipped: { bg: 'bg-violet-100', text: 'text-violet-800' },
  delivered: { bg: 'bg-emerald-100', text: 'text-emerald-800' },
  completed: { bg: 'bg-emerald-100', text: 'text-emerald-800' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-800' },
};

type Props = {
  status: string;
  /** Unpaid checkout order: shown as "Awaiting payment" regardless of status. */
  awaitingPayment?: boolean;
};

export default function OrderStatusPill({ status, awaitingPayment }: Props) {
  if (awaitingPayment && status !== 'cancelled') {
    return (
      <View style={tw`px-2 py-0.5 rounded-chip bg-raised`}>
        <Text style={tw`text-xs font-semibold text-ink-2`}>Awaiting payment</Text>
      </View>
    );
  }
  const c = COLORS[status] || { bg: 'bg-raised', text: 'text-ink-2' };
  return (
    <View style={tw`px-2 py-0.5 rounded-chip ${c.bg}`}>
      <Text style={tw`text-xs font-semibold capitalize ${c.text}`}>{status}</Text>
    </View>
  );
}
