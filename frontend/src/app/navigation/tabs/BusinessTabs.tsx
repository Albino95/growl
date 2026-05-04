import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import BizDashboard from '../../../screens/Business/BizDashboard';
import InventoryScreen from '../../../screens/Business/InventoryScreen';
import OrdersScreen from '../../../screens/Business/OrdersScreen';
import MarketingScreen from '../../../screens/Business/MarketingScreen';
import PartnershipsScreen from '../../../screens/Business/PartnershipsScreen';
import BizSettings from '../../../screens/Business/BizSettings';
import tw from '../../../lib/tw';

export type BusinessTabsParamList = {
  Dashboard: undefined;
  Inventory: undefined;
  Orders: undefined;
  Marketing: undefined;
  Partnerships: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<BusinessTabsParamList>();

export default function BusinessTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';

          if (route.name === 'Dashboard') {
            iconName = focused ? 'grid' : 'grid-outline';
          } else if (route.name === 'Inventory') {
            iconName = focused ? 'cube' : 'cube-outline';
          } else if (route.name === 'Orders') {
            iconName = focused ? 'receipt' : 'receipt-outline';
          } else if (route.name === 'Marketing') {
            iconName = focused ? 'megaphone' : 'megaphone-outline';
          } else if (route.name === 'Partnerships') {
            iconName = focused ? 'people' : 'people-outline';
          } else if (route.name === 'Settings') {
            iconName = focused ? 'settings' : 'settings-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#059669',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#E5E7EB',
          paddingBottom: 5,
          paddingTop: 5,
          height: 60,
        },
      })}
    >
      <Tab.Screen 
        name="Dashboard" 
        component={BizDashboard}
        options={{ tabBarLabel: 'Dashboard' }}
      />
      <Tab.Screen 
        name="Inventory" 
        component={InventoryScreen}
        options={{ tabBarLabel: 'Stock' }}
      />
      <Tab.Screen 
        name="Orders" 
        component={OrdersScreen}
        options={{ tabBarLabel: 'Orders' }}
      />
      <Tab.Screen 
        name="Marketing" 
        component={MarketingScreen}
        options={{ tabBarLabel: 'Marketing' }}
      />
      <Tab.Screen 
        name="Partnerships" 
        component={PartnershipsScreen}
        options={{ tabBarLabel: 'Partners' }}
      />
      <Tab.Screen 
        name="Settings" 
        component={BizSettings}
        options={{ tabBarLabel: 'Settings' }}
      />
    </Tab.Navigator>
  );
}
