import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BusinessTabs from './tabs/BusinessTabs';
import KpiScreen from '../../screens/Business/KpiScreen';
import BusinessOrderDetailScreen from '../../screens/Business/BusinessOrderDetailScreen';

export type BusinessStackParamList = {
  BusinessMain: undefined;
  BusinessAnalytics: undefined;
  BusinessOrderDetail: { orderId: string };
};

const Stack = createNativeStackNavigator<BusinessStackParamList>();

export default function BusinessRootStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="BusinessMain" component={BusinessTabs} />
      <Stack.Screen
        name="BusinessAnalytics"
        component={KpiScreen}
        options={{
          headerShown: true,
          title: 'Analytics',
          headerBackTitle: 'Back',
          headerTintColor: '#059669',
        }}
      />
      <Stack.Screen
        name="BusinessOrderDetail"
        component={BusinessOrderDetailScreen}
        options={{
          headerShown: true,
          title: 'Order Details',
          headerBackTitle: 'Back',
          headerTintColor: '#059669',
        }}
      />
    </Stack.Navigator>
  );
}
