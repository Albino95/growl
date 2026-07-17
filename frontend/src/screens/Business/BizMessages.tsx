import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';

/** Legacy stub — redirects into BusinessMessages on the business stack. */
export default function BizMessages() {
  const navigation = useNavigation<any>();

  useEffect(() => {
    const parent = navigation.getParent?.() || navigation;
    parent.replace?.('BusinessMessages') || parent.navigate('BusinessMessages');
  }, [navigation]);

  return (
    <View style={tw`flex-1 bg-white items-center justify-center`}>
      <ActivityIndicator color="#059669" />
    </View>
  );
}
