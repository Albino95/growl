import React from 'react';
import { View, Text } from 'react-native';
import tw from '../../lib/tw';

type Level = 'ok' | 'low' | 'out';

type Props = {
  stock: number;
  threshold?: number;
};

export function stockLevel(stock: number, threshold = 10): Level {
  if (stock <= 0) return 'out';
  if (stock < threshold) return 'low';
  return 'ok';
}

export default function StockBadge({ stock, threshold = 10 }: Props) {
  const level = stockLevel(stock, threshold);
  const styles =
    level === 'out'
      ? { bg: 'bg-red-100', text: 'text-red-800', label: 'Out' }
      : level === 'low'
        ? { bg: 'bg-amber-100', text: 'text-amber-800', label: `Low (${stock})` }
        : { bg: 'bg-emerald-100', text: 'text-emerald-800', label: `${stock} in stock` };

  return (
    <View style={tw`px-2 py-0.5 rounded-full ${styles.bg}`}>
      <Text style={tw`text-xs font-semibold ${styles.text}`}>{styles.label}</Text>
    </View>
  );
}
