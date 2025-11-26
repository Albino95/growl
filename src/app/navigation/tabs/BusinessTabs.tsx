import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import BizDashboard from '../../../screens/Business/BizDashboard';
import InventoryScreen from '../../../screens/Business/InventoryScreen';
import OrdersScreen from '../../../screens/Business/OrdersScreen';
import KpiScreen from '../../../screens/Business/KpiScreen';
import BizMessages from '../../../screens/Business/BizMessages';
import BizSettings from '../../../screens/Business/BizSettings';

export type BusinessTabsParamList = {
  Dashboard: undefined;
  Inventory: undefined;
  Orders: undefined;
  KPIs: undefined;
  Messages: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<BusinessTabsParamList>();

export default function BusinessTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Dashboard" component={BizDashboard} />
      <Tab.Screen name="Inventory" component={InventoryScreen} />
      <Tab.Screen name="Orders" component={OrdersScreen} />
      <Tab.Screen name="KPIs" component={KpiScreen} />
      <Tab.Screen name="Messages" component={BizMessages} />
      <Tab.Screen name="Settings" component={BizSettings} />
    </Tab.Navigator>
  );
}
