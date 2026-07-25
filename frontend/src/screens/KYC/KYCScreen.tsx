import React from 'react';
import { View, Text } from 'react-native';
import tw from '../../lib/tw';
import { featureFlags } from '../../constants/featureFlags';

/**
 * KYC is gated off until a real provider is integrated.
 * enable via ENABLE_KYC=true on an EAS profile (never for production store builds).
 */
export default function KYCScreen() {
  if (!featureFlags.enableKYC) {
    return (
      <View style={tw`flex-1 items-center justify-center p-6 bg-white`}>
        <Text style={tw`text-xl font-semibold mb-2`}>Identity verification</Text>
        <Text style={tw`text-stone-600 text-center`}>
          KYC is not available in this build. Contact support if you were asked to verify your
          identity.
        </Text>
      </View>
    );
  }

  return (
    <View style={tw`flex-1 items-center justify-center p-6 bg-white`}>
      <Text style={tw`text-xl font-semibold mb-2`}>KYC</Text>
      <Text style={tw`text-stone-600 text-center`}>
        Identity verification provider integration is pending. This screen is only enabled for
        internal QA builds.
      </Text>
    </View>
  );
}
