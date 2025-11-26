import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import tw from '../../lib/tw';

export default function FullScreenLoader() {
  return (
    <View style={tw`flex-1 items-center justify-center bg-white`}>
      <ActivityIndicator />
    </View>
  );
}
