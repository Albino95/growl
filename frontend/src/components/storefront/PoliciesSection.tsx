import React, { useState } from 'react';
import { View, Text, LayoutAnimation } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import type { StorefrontPolicies } from '../../services/api/storefront';

const ROWS: Array<{ key: keyof StorefrontPolicies; title: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'shipping', title: 'Shipping', icon: 'cube-outline' },
  { key: 'returns', title: 'Returns', icon: 'return-up-back-outline' },
  { key: 'pickup', title: 'Pickup', icon: 'storefront-outline' },
];

/** Accordion of the shop's shipping / returns / pickup policies (only the filled ones). */
export default function PoliciesSection({ policies }: { policies: StorefrontPolicies }) {
  const [open, setOpen] = useState<keyof StorefrontPolicies | null>(null);
  const rows = ROWS.filter((r) => policies[r.key]?.trim());
  if (!rows.length) return null;
  return (
    <View style={tw`bg-card border border-line rounded-card overflow-hidden`}>
      {rows.map((r, i) => {
        const expanded = open === r.key;
        return (
          <View key={r.key} style={tw`${i > 0 ? 'border-t border-line' : ''}`}>
            <PressableScale
              pressedScale={0.99}
              feedback="selection"
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setOpen(expanded ? null : r.key);
              }}
              style={tw`flex-row items-center px-4 py-3.5`}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={`${r.title} policy`}
            >
              <Ionicons name={r.icon} size={18} color={theme.colors.icon} />
              <Text style={tw`flex-1 ml-3 text-body font-semibold text-ink`}>{r.title}</Text>
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.iconMuted} />
            </PressableScale>
            {expanded ? (
              <Text style={tw`px-4 pb-4 -mt-1 text-footnote text-ink-2 leading-5`}>{policies[r.key]}</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
