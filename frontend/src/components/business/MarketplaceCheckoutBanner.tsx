import React, { useEffect, useState } from 'react';
import { View, Text, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import { getPaymentConfig } from '../../services/api/marketplace';

// Fetched once per app session and shared by every screen that shows the banner.
let paymentsEnabledPromise: Promise<boolean | null> | null = null;

function loadPaymentsEnabled(): Promise<boolean | null> {
  if (!paymentsEnabledPromise) {
    paymentsEnabledPromise = getPaymentConfig()
      .then((res) => (res?.data ? Boolean(res.data.enabled) : null))
      .catch(() => {
        // Unknown: allow a retry the next time a screen mounts; show nothing meanwhile.
        paymentsEnabledPromise = null;
        return null;
      });
  }
  return paymentsEnabledPromise;
}

/** Banner shown on Business screens while marketplace checkout (Stripe) is not configured. */
export default function MarketplaceCheckoutBanner({ style }: { style?: StyleProp<ViewStyle> }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    void loadPaymentsEnabled().then((v) => {
      if (alive) setEnabled(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (enabled !== false) return null;

  return (
    <View
      style={[tw`flex-row items-start bg-amber-50 border border-amber-200 rounded-control px-3 py-2.5`, style]}
      accessibilityRole="alert"
    >
      <Ionicons name="information-circle-outline" size={18} color={tw.color('amber-700')} style={tw`mr-2 mt-0.5`} />
      <Text style={tw`flex-1 text-sm text-amber-900`}>
        Marketplace checkout isn't live yet — customers can browse but not buy.
      </Text>
    </View>
  );
}
