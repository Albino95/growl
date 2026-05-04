import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BusinessTabs from './tabs/BusinessTabs';
import KpiScreen from '../../screens/Business/KpiScreen';

export type BusinessStackParamList = {
  BusinessMain: undefined;
  BusinessAnalytics: undefined;
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
    </Stack.Navigator>
  );
}
