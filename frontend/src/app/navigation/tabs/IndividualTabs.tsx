import React from 'react';
import { View, TouchableOpacity, Text, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FeedScreen from '../../../screens/Feed/FeedScreen';
import ExploreScreen from '../../../screens/Explore/ExploreScreen';
import JournalScreen from '../../../screens/Journal/JournalScreen';
import ProfileScreen from '../../../screens/Profile/ProfileScreen';
import InstructorScreen from '../../../screens/Instructor/InstructorScreen';
import MarketplaceScreen from '../../../screens/Marketplace/MarketplaceScreen';
import tw from '../../../lib/tw';
import { navigateFromRoot } from '../rootNavigation';

export type IndividualTabsParamList = {
  Feed: undefined;
  Explore: undefined;
  Journal: undefined;
  Marketplace: undefined;
  Profile: undefined;
  Instructor: undefined;
};

const Tab = createBottomTabNavigator<IndividualTabsParamList>();

type TabKey = 'Feed' | 'Explore' | 'Journal' | 'Marketplace' | 'Profile';

const TAB_LEFT: Array<{
  key: TabKey;
  label: string;
  activeIcon: keyof typeof Ionicons.glyphMap;
  inactiveIcon: keyof typeof Ionicons.glyphMap;
  activeColor: string;
}> = [
  { key: 'Feed', label: 'Feed', activeIcon: 'home', inactiveIcon: 'home-outline', activeColor: '#059669' },
  { key: 'Explore', label: 'Explore', activeIcon: 'compass', inactiveIcon: 'compass-outline', activeColor: '#7C3AED' },
];

const TAB_RIGHT: typeof TAB_LEFT = [
  { key: 'Journal', label: 'Journal', activeIcon: 'book', inactiveIcon: 'book-outline', activeColor: '#059669' },
  { key: 'Marketplace', label: 'Shop', activeIcon: 'storefront', inactiveIcon: 'storefront-outline', activeColor: '#059669' },
  { key: 'Profile', label: 'Profile', activeIcon: 'person', inactiveIcon: 'person-outline', activeColor: '#059669' },
];

function TabButton({
  tab,
  isActive,
  onPress,
}: {
  tab: (typeof TAB_LEFT)[number];
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={tw`flex-1 items-center pb-1 min-w-0`}>
      <Ionicons
        name={isActive ? tab.activeIcon : tab.inactiveIcon}
        size={22}
        color={isActive ? tab.activeColor : '#A8A29E'}
      />
      <Text
        style={tw`text-[11px] mt-0.5 ${isActive ? 'font-semibold' : ''}`}
        numberOfLines={1}
      >
        <Text style={{ color: isActive ? tab.activeColor : '#78716C' }}>{tab.label}</Text>
      </Text>
    </TouchableOpacity>
  );
}

export default function IndividualTabs() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const handleCreatePost = () => {
    navigateFromRoot(navigation, 'Post');
  };

  const fabShadow =
    Platform.OS === 'ios'
      ? {
          shadowColor: '#047857',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.35,
          shadowRadius: 6,
        }
      : { elevation: 8 };

  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => {
        const currentRoute = props.state.routes[props.state.index]?.name as TabKey;

        return (
          <View
            style={[
              tw`bg-white border-t border-stone-200`,
              { paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 8 : 6) },
            ]}
          >
            <View style={tw`flex-row items-end pt-2 px-1`}>
              <View style={tw`flex-1 flex-row`}>
                {TAB_LEFT.map((tab) => (
                  <TabButton
                    key={tab.key}
                    tab={tab}
                    isActive={currentRoute === tab.key}
                    onPress={() => props.navigation.navigate(tab.key)}
                  />
                ))}
              </View>

              <View style={tw`w-[72px] items-center justify-end pb-0.5`} pointerEvents="box-none">
                <TouchableOpacity
                  onPress={handleCreatePost}
                  activeOpacity={0.85}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={[
                    tw`w-14 h-14 rounded-full bg-emerald-600 items-center justify-center border-4 border-white`,
                    fabShadow,
                    { marginTop: -22 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Create post"
                >
                  <Ionicons name="add" size={30} color="#FFFFFF" />
                </TouchableOpacity>
                <View style={tw`h-[18px]`} />
              </View>

              <View style={tw`flex-1 flex-row`}>
                {TAB_RIGHT.map((tab) => (
                  <TabButton
                    key={tab.key}
                    tab={tab}
                    isActive={currentRoute === tab.key}
                    onPress={() => props.navigation.navigate(tab.key)}
                  />
                ))}
              </View>
            </View>
          </View>
        );
      }}
    >
      <Tab.Screen name="Feed" component={FeedScreen} options={{ tabBarButton: () => null }} />
      <Tab.Screen name="Explore" component={ExploreScreen} options={{ tabBarButton: () => null }} />
      <Tab.Screen name="Journal" component={JournalScreen} options={{ tabBarButton: () => null }} />
      <Tab.Screen name="Marketplace" component={MarketplaceScreen} options={{ tabBarButton: () => null }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarButton: () => null }} />
      <Tab.Screen
        name="Instructor"
        component={InstructorScreen}
        options={{ tabBarButton: () => null }}
      />
    </Tab.Navigator>
  );
}
