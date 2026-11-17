import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import BizDashboard from '../../../screens/Business/BizDashboard';
import InventoryScreen from '../../../screens/Business/InventoryScreen';
import OrdersScreen from '../../../screens/Business/OrdersScreen';
import GrowScreen from '../../../screens/Business/GrowScreen';
import { useAppSelector } from '../../../store/hooks';
import { haptic } from '../../../theme/haptics';
import { theme, useColorSchemeName } from '../../../lib/tw';
import { forGrowTabScene, GrowTabTransitionSpec } from '../tabTransitions';

export type BusinessTabsParamList = {
  Home: undefined;
  Catalog: { openForm?: boolean } | undefined;
  Orders: { search?: string } | undefined;
  Grow: { segment?: 'partners' | 'community' } | undefined;
};

const Tab = createBottomTabNavigator<BusinessTabsParamList>();

export default function BusinessTabs() {
  // Subscribe so tab bar colours re-resolve when the scheme flips.
  useColorSchemeName();
  const lowStockCount = useAppSelector((s) => s.business.kpis?.low_stock_count ?? 0);
  // Open paid orders (live, not period-bound) — the work waiting on the seller.
  const toFulfillCount = useAppSelector((s) => s.business.kpis?.pending_orders ?? 0);

  return (
    <Tab.Navigator
      detachInactiveScreens={false}
      screenListeners={({ navigation }) => ({
        // Switching tabs = tab tick + tock (Full); re-tap (scroll to top) = tick only.
        tabPress: () => {
          haptic(navigation.isFocused() ? 'selection' : 'tab');
        },
      })}
      screenOptions={({ route }) => ({
        headerShown: false,
        animation: 'shift',
        transitionSpec: GrowTabTransitionSpec,
        sceneStyleInterpolator: forGrowTabScene,
        freezeOnBlur: false,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';
          if (route.name === 'Home') iconName = focused ? 'grid' : 'grid-outline';
          else if (route.name === 'Catalog') iconName = focused ? 'cube' : 'cube-outline';
          else if (route.name === 'Orders') iconName = focused ? 'receipt' : 'receipt-outline';
          else if (route.name === 'Grow') iconName = focused ? 'trending-up' : 'trending-up-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.colors.brand,
        tabBarInactiveTintColor: theme.colors.iconMuted,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: theme.colors.line,
          backgroundColor: theme.colors.page,
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
          tabBarAccessibilityLabel:
            lowStockCount > 0 ? `Catalog, ${lowStockCount} low on stock` : 'Catalog',
        }}
      />
      <Tab.Screen
        name="Orders"
        component={OrdersScreen}
        options={{
          tabBarLabel: 'Orders',
          tabBarBadge: toFulfillCount > 0 ? (toFulfillCount > 99 ? '99+' : toFulfillCount) : undefined,
          tabBarAccessibilityLabel:
            toFulfillCount > 0 ? `Orders, ${toFulfillCount} to fulfill` : 'Orders',
        }}
      />
      <Tab.Screen name="Grow" component={GrowScreen} options={{ tabBarLabel: 'Grow' }} />
    </Tab.Navigator>
  );
}
