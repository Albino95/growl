import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BusinessTabs from './tabs/BusinessTabs';
import KpiScreen from '../../screens/Business/KpiScreen';
import BusinessOrderDetailScreen from '../../screens/Business/BusinessOrderDetailScreen';
import BizSettings from '../../screens/Business/BizSettings';
import CustomersScreen from '../../screens/Business/CustomersScreen';
import MessagesScreen from '../../screens/Messages/MessagesScreen';
import PostScreen from '../../screens/Post/PostScreen';
import KYCScreen from '../../screens/KYC/KYCScreen';
import { theme, useColorSchemeName } from '../../lib/tw';

export type BusinessStackParamList = {
  BusinessMain: undefined;
  BusinessAnalytics: undefined;
  BusinessOrderDetail: { orderId: string };
  BusinessSettings: undefined;
  BusinessCustomers: undefined;
  BusinessMessages: { conversationId?: string; targetUserId?: string } | undefined;
  BusinessCreatePost: undefined;
  BusinessKYC: undefined;
};

const Stack = createNativeStackNavigator<BusinessStackParamList>();

export default function BusinessRootStack() {
  // Subscribe so header tints re-resolve when the scheme flips.
  useColorSchemeName();
  const tint = theme.colors.brand;
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
          headerTintColor: tint,
        }}
      />
      <Stack.Screen
        name="BusinessOrderDetail"
        component={BusinessOrderDetailScreen}
        options={{
          headerShown: true,
          title: 'Order Details',
          headerBackTitle: 'Back',
          headerTintColor: tint,
        }}
      />
      <Stack.Screen
        name="BusinessSettings"
        component={BizSettings}
        options={{
          headerShown: true,
          title: 'Settings',
          headerBackTitle: 'Back',
          headerTintColor: tint,
        }}
      />
      <Stack.Screen
        name="BusinessCustomers"
        component={CustomersScreen}
        options={{
          headerShown: true,
          title: 'Customers',
          headerBackTitle: 'Back',
          headerTintColor: tint,
        }}
      />
      <Stack.Screen
        name="BusinessMessages"
        component={MessagesScreen}
        options={{ headerShown: false, presentation: 'card' }}
      />
      <Stack.Screen
        name="BusinessCreatePost"
        component={PostScreen}
        options={{
          headerShown: false,
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
      <Stack.Screen
        name="BusinessKYC"
        component={KYCScreen}
        options={{
          headerShown: true,
          title: 'Identity verification',
          headerBackTitle: 'Back',
          headerTintColor: tint,
        }}
      />
    </Stack.Navigator>
  );
}
