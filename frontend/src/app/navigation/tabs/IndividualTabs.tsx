import React, { useEffect, useRef, useState } from 'react';
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
import { feedback } from '../../../utils/interactionFeedback';
import { forGrowTabScene, GrowTabTransitionSpec } from '../tabTransitions';

export type IndividualTabsParamList = {
  Feed: undefined;
  Explore: undefined;
  Journal: { openCompose?: boolean } | undefined;
  Marketplace: undefined;
  Profile: undefined;
  Instructor: undefined;
};

const Tab = createBottomTabNavigator<IndividualTabsParamList>();

type DockTabKey = 'Feed' | 'Explore' | 'Journal' | 'Marketplace' | 'Profile';

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
  { key: 'Marketplace', label: 'Shop', activeIcon: 'storefront', inactiveIcon: 'storefront-outline' },
  { key: 'Profile', label: 'You', activeIcon: 'person', inactiveIcon: 'person-outline' },
];

/** Fixed stack so active/inactive tabs share the same vertical rhythm. */
const TAB_HEIGHT = 48;
const ICON_SLOT = 24;
const LABEL_SLOT = 13;
const DOT_SLOT = 6;

function DockTabButton({
  tab,
  isActive,
  onPress,
}: {
  tab: (typeof DOCK_LEFT)[number];
  isActive: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const iconScale = useRef(new Animated.Value(isActive ? 1 : 0.92)).current;
  const dotScale = useRef(new Animated.Value(isActive ? 1 : 0)).current;
  const labelOpacity = useRef(new Animated.Value(isActive ? 1 : 0.72)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(iconScale, {
        toValue: isActive ? 1.08 : 0.92,
        useNativeDriver: true,
        speed: 22,
        bounciness: 10,
      }),
      Animated.spring(dotScale, {
        toValue: isActive ? 1 : 0,
        useNativeDriver: true,
        speed: 26,
        bounciness: 8,
      }),
      Animated.timing(labelOpacity, {
        toValue: isActive ? 1 : 0.72,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isActive, iconScale, dotScale, labelOpacity]);

  return (
    <Pressable
      onPressIn={() => {
        Animated.spring(scale, {
          toValue: 0.92,
          useNativeDriver: true,
          speed: 40,
          bounciness: 0,
        }).start();
      }}
      onPressOut={() => {
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 28,
          bounciness: 6,
        }).start();
      }}
      onPress={() => {
        feedback.tab();
        onPress();
      }}
      style={[tw`flex-1 items-center justify-center min-w-0`, { height: TAB_HEIGHT }]}
      hitSlop={{ top: 6, right: 4, bottom: 6, left: 4 }}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={tab.label}
    >
      <Animated.View
        style={[tw`w-full items-center justify-center`, { height: TAB_HEIGHT, transform: [{ scale }] }]}
      >
        <Animated.View
          style={[
            tw`w-full items-center justify-center`,
            { height: ICON_SLOT, transform: [{ scale: iconScale }] },
          ]}
        >
          <Ionicons
            name={isActive ? tab.activeIcon : tab.inactiveIcon}
            size={22}
            color={isActive ? theme.colors.brand : theme.colors.textSubtle}
          />
        </Animated.View>
        <Animated.View
          style={[tw`w-full items-center justify-center`, { height: LABEL_SLOT, opacity: labelOpacity }]}
        >
          <Text
            style={{
              fontSize: 10,
              lineHeight: 12,
              fontWeight: isActive ? '600' : '400',
              color: isActive ? theme.colors.brand : theme.colors.textSubtle,
            }}
            numberOfLines={1}
          >
            {tab.label}
          </Text>
        </Animated.View>
        <View style={[tw`w-full items-center justify-center`, { height: DOT_SLOT }]}>
          <Animated.View
            style={{
              width: 4,
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.colors.brand,
              transform: [{ scale: dotScale }],
              opacity: dotScale,
            }}
          />
        </View>
      </Animated.View>
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
    kind: 'open',
  });

  const handleCreate = (action: CreateAction) => {
    setCreateOpen(false);
    // iOS drops a stack modal if it is presented while this sheet Modal is still dismissing.
    const delay = action === 'journal' ? 80 : 320;
    setTimeout(() => {
      if (action === 'post') {
        navigateFromRoot(navigation, 'Post');
        return;
      }
      if (action === 'reel') {
        navigateFromRoot(navigation, 'CreateReel');
        return;
      }
      if (action === 'story') {
        navigateFromRoot(navigation, 'CreateStory');
        return;
      }
      tabNavRef.current?.navigate('Journal', { openCompose: true });
    }, delay);
  };

  const bottomPad = Math.max(insets.bottom, 8);

  return (
    <>
      <Tab.Navigator
        // Avoid blank tabs after shift animation (RN screens + native-driver activityState race).
        detachInactiveScreens={false}
        screenOptions={{
          headerShown: false,
          animation: 'shift',
          transitionSpec: GrowTabTransitionSpec,
          sceneStyleInterpolator: forGrowTabScene,
          freezeOnBlur: false,
        }}
        tabBar={(props) => {
          tabNavRef.current = props.navigation;
          const currentRoute = props.state.routes[props.state.index]?.name as string;

          return (
            <View
              pointerEvents="box-none"
              style={[styles.dockWrap, { paddingBottom: bottomPad }]}
            >
              <View style={styles.dock}>
                <View style={[tw`flex-1 flex-row`, { height: TAB_HEIGHT }]}>
                  {DOCK_LEFT.map((tab) => (
                    <DockTabButton
                      key={tab.key}
                      tab={tab}
                      isActive={currentRoute === tab.key}
                      onPress={() => props.navigation.navigate(tab.key)}
                    />
                  ))}
                </View>

                <View
                  style={[tw`w-[56px] items-center justify-center`, { height: TAB_HEIGHT }]}
                  pointerEvents="box-none"
                >
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
                        tw`w-11 h-11 rounded-full bg-brand-600 items-center justify-center`,
                        Platform.OS === 'ios' ? theme.shadows.fab : { elevation: 6 },
                        fabFeedback.animatedStyle,
                      ]}
                    >
                      <Ionicons name="add" size={24} color="#FFFFFF" />
                    </Animated.View>
                  </Pressable>
                </View>

                <View style={[tw`flex-1 flex-row`, { height: TAB_HEIGHT }]}>
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
        <Tab.Screen
          name="Marketplace"
          component={MarketplaceScreen}
          options={{ tabBarButton: () => null }}
        />
        <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarButton: () => null }} />
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
    paddingHorizontal: 14,
    paddingTop: 8,
    backgroundColor: 'transparent',
  },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFcf7',
    borderRadius: 28,
    paddingVertical: 6,
    paddingHorizontal: 4,
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
