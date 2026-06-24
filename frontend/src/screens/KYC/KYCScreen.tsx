import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { useAuth } from '../../store/hooks';
import tw from '../../lib/tw';

export default function KYCScreen() {
  const { signIn } = useAuth();
  const handleEnter = async () => { await signIn('demo@growl.app', 'password'); };
  return (
    <SafeAreaView style={tw`flex-1 bg-white`}>
      <View style={tw`flex-1 items-center justify-center p-6`}>
        <Text style={tw`text-xl font-semibold mb-2`}>KYC</Text>
        <Text style={tw`text-base text-gray-600 text-center mb-6`}>
          Pretend we verified your identity. Continue to enter the app.
        </Text>
        <PrimaryButton label="Enter App" onPress={handleEnter} />
      </View>
    </SafeAreaView>
  );
}
