import React from 'react';
import { View, Text } from 'react-native';
import tw from '../../lib/tw';
import { featureFlags } from '../../constants/featureFlags';

/**
 * Identity verification for sellers.
 * Enabled by default (ENABLE_KYC); set ENABLE_KYC=false to hide.
 */
export default function KYCScreen() {
  if (!featureFlags.enableKYC) {
    return (
      <View style={tw`flex-1 items-center justify-center p-6 bg-surface-page`}>
        <Text style={tw`text-xl font-semibold mb-2 text-stone-900`}>Identity verification</Text>
        <Text style={tw`text-stone-600 text-center leading-5`}>
          KYC is not available in this build. Contact support if you were asked to verify your
          identity.
        </Text>
      </View>
    );
  }

  return (
    <View style={tw`flex-1 p-6 bg-surface-page`}>
      <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-700 uppercase`}>
        Grow!
      </Text>
      <Text style={tw`text-2xl font-bold text-stone-900 mt-2`}>Identity verification</Text>
      <Text style={tw`text-stone-600 mt-3 leading-5`}>
        Complete verification to unlock higher payout limits and featured placement. A provider
        hookup ships next — for now this screen confirms KYC is enabled for your business account.
      </Text>
      <View style={tw`mt-8 py-4 border-t border-b border-stone-200/70`}>
        <Text style={tw`text-sm font-semibold text-stone-900`}>Status</Text>
        <Text style={tw`text-sm text-emerald-700 mt-1`}>Ready to connect a KYC provider</Text>
      </View>
    </View>
  );
}
