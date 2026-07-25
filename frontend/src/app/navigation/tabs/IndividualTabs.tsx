import React from 'react';
import { View, Text, Platform, Animated, Pressable } from 'react-native';
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
import tw, { theme } from '../../../lib/tw';
import { usePressFeedback } from '../../../hooks/usePressFeedback';
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
  { key: 'Feed', label: 'Feed', activeIcon: 'home', inactiveIcon: 'home-outline', activeColor: theme.colors.brand },
  { key: 'Explore', label: 'Explore', activeIcon: 'compass', inactiveIcon: 'compass-outline', activeColor: theme.colors.accent },
];

const TAB_RIGHT: typeof TAB_LEFT = [
  { key: 'Journal', label: 'Journal', activeIcon: 'book', inactiveIcon: 'book-outline', activeColor: theme.colors.brand },
  { key: 'Marketplace', label: 'Shop', activeIcon: 'storefront', inactiveIcon: 'storefront-outline', activeColor: theme.colors.brand },
  { key: 'Profile', label: 'Profile', activeIcon: 'person', inactiveIcon: 'person-outline', activeColor: theme.colors.brand },
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
    <Pressable
      onPress={onPress}
      style={tw`flex-1 items-center pb-1.5 min-w-0`}
      hitSlop={{ top: 8, right: 6, bottom: 8, left: 6 }}
      accessibilityRole="button"
      accessibilityLabel={tab.label}
    >
      <Ionicons
        name={isActive ? tab.activeIcon : tab.inactiveIcon}
        size={22}
        color={isActive ? tab.activeColor : theme.colors.textSubtle}
      />
      <Text
        style={tw`text-xs mt-0.5 ${isActive ? 'font-semibold' : ''}`}
        numberOfLines={1}
      >
        <Text style={{ color: isActive ? tab.activeColor : theme.colors.textMuted }}>{tab.label}</Text>
      </Text>
    </Pressable>
  );
}

export default function IndividualTabs() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const fabFeedback = usePressFeedback({
    onPress: () => navigateFromRoot(navigation, 'Post'),
  });

  const fabShadow =
    Platform.OS === 'ios' ? theme.shadows.fab : { elevation: 8 };

  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => {
        const currentRoute = props.state.routes[props.state.index]?.name as TabKey;

        return (
          <View
            style={[
              tw`bg-white border-t border-stone-200`,
              { paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 10 : 8) },
            ]}
          >
            <View style={tw`flex-row items-end pt-2.5 px-1`}>
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

              <View style={tw`w-[74px] items-center justify-end pb-0.5`} pointerEvents="box-none">
                <Pressable
                  onPress={fabFeedback.onPress}
                  onPressIn={fabFeedback.onPressIn}
                  onPressOut={fabFeedback.onPressOut}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Create post"
                >
                  <Animated.View
                    style={[
                      tw`w-14 h-14 rounded-full bg-brand-600 items-center justify-center border-4 border-white`,
                      fabShadow,
                      { marginTop: -18 },
                      fabFeedback.animatedStyle,
                    ]}
                  >
                    <Ionicons name="add" size={30} color="#FFFFFF" />
                  </Animated.View>
                </Pressable>
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
