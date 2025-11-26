import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tw from '../../lib/tw';

export default function InventoryScreen() {
  return (
    <SafeAreaView style={tw`flex-1 bg-white`}>
      <View style={tw`p-6`}>
        <Text style={tw`text-2xl font-bold`}>Inventory</Text>
      </View>
    </SafeAreaView>
  );
}
