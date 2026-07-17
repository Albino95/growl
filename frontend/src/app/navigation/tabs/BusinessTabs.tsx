import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import BizDashboard from '../../../screens/Business/BizDashboard';
import InventoryScreen from '../../../screens/Business/InventoryScreen';
import OrdersScreen from '../../../screens/Business/OrdersScreen';
import GrowScreen from '../../../screens/Business/GrowScreen';
import { useAppSelector } from '../../../store/hooks';

export type BusinessTabsParamList = {
  Home: undefined;
  Catalog: { openForm?: boolean } | undefined;
  Orders: { search?: string } | undefined;
  Grow: { segment?: 'partners' | 'community' } | undefined;
};

const Tab = createBottomTabNavigator<BusinessTabsParamList>();

export default function BusinessTabs() {
  const lowStockCount = useAppSelector((s) => s.business.kpis?.low_stock_count ?? 0);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';
          if (route.name === 'Home') iconName = focused ? 'grid' : 'grid-outline';
          else if (route.name === 'Catalog') iconName = focused ? 'cube' : 'cube-outline';
          else if (route.name === 'Orders') iconName = focused ? 'receipt' : 'receipt-outline';
          else if (route.name === 'Grow') iconName = focused ? 'trending-up' : 'trending-up-outline';
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
      <Tab.Screen name="Home" component={BizDashboard} options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen
        name="Catalog"
        component={InventoryScreen}
        options={{
          tabBarLabel: 'Catalog',
          tabBarBadge: lowStockCount > 0 ? lowStockCount : undefined,
        }}
      />
      <Tab.Screen name="Orders" component={OrdersScreen} options={{ tabBarLabel: 'Orders' }} />
      <Tab.Screen name="Grow" component={GrowScreen} options={{ tabBarLabel: 'Grow' }} />
    </Tab.Navigator>
  );
}
