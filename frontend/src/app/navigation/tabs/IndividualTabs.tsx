import React, { useRef, useState } from 'react';
import { View, Text, Platform, Animated, Pressable, StyleSheet } from 'react-native';
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
import CreateActionSheet, {
  type CreateAction,
} from '../../../components/navigation/CreateActionSheet';
import tw, { theme } from '../../../lib/tw';
import { usePressFeedback } from '../../../hooks/usePressFeedback';
import { navigateFromRoot } from '../rootNavigation';
import { triggerPressFeedback } from '../../../utils/interactionFeedback';

export type IndividualTabsParamList = {
  Feed: undefined;
  Explore: undefined;
  Journal: { openCompose?: boolean } | undefined;
  Marketplace: undefined;
  Profile: undefined;
  Instructor: undefined;
};

const Tab = createBottomTabNavigator<IndividualTabsParamList>();

type DockTabKey = 'Feed' | 'Explore' | 'Journal' | 'Profile';

const DOCK_LEFT: Array<{
  key: DockTabKey;
  label: string;
  activeIcon: keyof typeof Ionicons.glyphMap;
  inactiveIcon: keyof typeof Ionicons.glyphMap;
}> = [
  { key: 'Feed', label: 'Home', activeIcon: 'home', inactiveIcon: 'home-outline' },
  { key: 'Explore', label: 'Explore', activeIcon: 'compass', inactiveIcon: 'compass-outline' },
];

const DOCK_RIGHT: typeof DOCK_LEFT = [
  { key: 'Journal', label: 'Journal', activeIcon: 'book', inactiveIcon: 'book-outline' },
  { key: 'Profile', label: 'You', activeIcon: 'person', inactiveIcon: 'person-outline' },
];

function DockTabButton({
  tab,
  isActive,
  onPress,
}: {
  tab: (typeof DOCK_LEFT)[number];
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        triggerPressFeedback();
        onPress();
      }}
      style={tw`flex-1 items-center justify-center py-1 min-w-0`}
      hitSlop={{ top: 6, right: 4, bottom: 6, left: 4 }}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={tab.label}
    >
      <View style={tw`items-center`}>
        <Ionicons
          name={isActive ? tab.activeIcon : tab.inactiveIcon}
          size={22}
          color={isActive ? theme.colors.textPrimary : theme.colors.textSubtle}
        />
        {isActive ? (
          <Text style={tw`text-[10px] font-semibold text-stone-900 mt-1`} numberOfLines={1}>
            {tab.label}
          </Text>
        ) : (
          <View style={tw`h-3.5 mt-1`} />
        )}
        <View
          style={[
            tw`mt-1 w-1 h-1 rounded-full`,
            { backgroundColor: isActive ? theme.colors.textPrimary : 'transparent' },
          ]}
        />
      </View>
    </Pressable>
  );
}

export default function IndividualTabs() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [createOpen, setCreateOpen] = useState(false);
  const tabNavRef = useRef<{ navigate: (name: string, params?: object) => void } | null>(null);

  const fabFeedback = usePressFeedback({
    onPress: () => setCreateOpen(true),
  });

  const handleCreate = (action: CreateAction) => {
    setCreateOpen(false);
    if (action === 'post') {
      navigateFromRoot(navigation, 'Post');
      return;
    }
    tabNavRef.current?.navigate('Journal', { openCompose: true });
  };

  const bottomPad = Math.max(insets.bottom, 8);

  return (
    <>
      <Tab.Navigator
        screenOptions={{ headerShown: false }}
        tabBar={(props) => {
          tabNavRef.current = props.navigation;
          const currentRoute = props.state.routes[props.state.index]?.name as string;

          return (
            <View
              pointerEvents="box-none"
              style={[styles.dockWrap, { paddingBottom: bottomPad }]}
            >
              <View style={styles.dock}>
                <View style={tw`flex-1 flex-row items-center`}>
                  {DOCK_LEFT.map((tab) => (
                    <DockTabButton
                      key={tab.key}
                      tab={tab}
                      isActive={currentRoute === tab.key}
                      onPress={() => props.navigation.navigate(tab.key)}
                    />
                  ))}
                </View>

                <View style={tw`w-[64px] items-center justify-center`} pointerEvents="box-none">
                  <Pressable
                    onPress={fabFeedback.onPress}
                    onPressIn={fabFeedback.onPressIn}
                    onPressOut={fabFeedback.onPressOut}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Create"
                  >
                    <Animated.View
                      style={[
                        tw`w-12 h-12 rounded-full bg-stone-900 items-center justify-center`,
                        Platform.OS === 'ios'
                          ? {
                              shadowColor: '#1C1917',
                              shadowOffset: { width: 0, height: 4 },
                              shadowOpacity: 0.25,
                              shadowRadius: 8,
                            }
                          : { elevation: 6 },
                        fabFeedback.animatedStyle,
                      ]}
                    >
                      <Ionicons name="add" size={26} color="#FFFFFF" />
                    </Animated.View>
                  </Pressable>
                </View>

                <View style={tw`flex-1 flex-row items-center`}>
                  {DOCK_RIGHT.map((tab) => (
                    <DockTabButton
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
        <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarButton: () => null }} />
        {/* Reachable from Explore / Profile — not in the dock */}
        <Tab.Screen
          name="Marketplace"
          component={MarketplaceScreen}
          options={{ tabBarButton: () => null }}
        />
        <Tab.Screen
          name="Instructor"
          component={InstructorScreen}
          options={{ tabBarButton: () => null }}
        />
      </Tab.Navigator>

      <CreateActionSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onSelect={handleCreate}
      />
    </>
  );
}

const styles = StyleSheet.create({
  dockWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: 'transparent',
  },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFcf7',
    borderRadius: 28,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(28,25,23,0.08)',
    ...Platform.select({
      ios: {
        shadowColor: '#1C1917',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: { elevation: 10 },
      default: {},
    }),
  },
});
