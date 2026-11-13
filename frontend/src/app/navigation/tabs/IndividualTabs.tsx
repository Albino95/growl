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
import tw, { theme, useColorSchemeName } from '../../../lib/tw';
import { radius } from '../../../theme/tokens';
import { iconSize } from '../../../theme/icons';
import { usePressFeedback } from '../../../hooks/usePressFeedback';
import { navigateFromRoot } from '../rootNavigation';
import { feedback } from '../../../utils/interactionFeedback';
import { haptic } from '../../../theme/haptics';
import { duration, pop, spring, timing } from '../../../theme/motion';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { forGrowTabScene, GrowTabTransitionSpec } from '../tabTransitions';
import { SHOW_CIRCLES, SHOW_SEEDS } from '../../../constants/featureFlags';
import DemoTutorial from '../../../screens/Onboarding/DemoTutorial';
import { useDemoTutorialStore } from '../../../state/useDemoTutorialStore';
import { useHomeTabStore } from '../../../state/useHomeTabStore';

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
  const reduced = useReducedMotion();
  const dark = useColorSchemeName() === 'dark';
  const mounted = useRef(false);

  useEffect(() => {
    // No pop on first mount — only when a tab actually becomes active.
    const first = !mounted.current;
    mounted.current = true;
    if (first) return;
    Animated.parallel([
      isActive ? pop(iconScale, 1.12, 'bouncy', reduced) : spring(iconScale, 0.92, 'snappy', reduced),
      spring(dotScale, isActive ? 1 : 0, 'snappy', reduced),
      timing(labelOpacity, isActive ? 1 : 0.72, { duration: duration.quick }, reduced),
    ]).start();
  }, [isActive, iconScale, dotScale, labelOpacity, reduced]);

  return (
    <Pressable
      onPressIn={() => {
        if (!reduced) spring(scale, 0.88, 'snappy').start();
      }}
      onPressOut={() => {
        spring(scale, 1, 'snappy', reduced).start();
      }}
      onPress={() => {
        // Switching tabs = tab tick + tock (Full); re-tap (scroll to top) = tick only.
        haptic(isActive ? 'selection' : 'tab');
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
            size={iconSize.md}
            color={isActive ? theme.colors.brand : theme.colors.iconMuted}
          />
        </Animated.View>
        <Animated.View
          style={[tw`w-full items-center justify-center`, { height: LABEL_SLOT, opacity: labelOpacity }]}
        >
          <Text
            style={{
              fontSize: 11,
              lineHeight: 13,
              fontWeight: isActive ? '600' : '400',
              // Night: the lighter leaf ink keeps the 11px active label legible on the dark dock.
              color: isActive ? (dark ? theme.colors.leafInk : theme.colors.brand) : theme.colors.textMuted,
            }}
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
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
  const dark = useColorSchemeName() === 'dark';
  const [createOpen, setCreateOpen] = useState(false);
  const tabNavRef = useRef<{ navigate: (name: string, params?: object) => void } | null>(null);
  const tutorialHydrated = useDemoTutorialStore((s) => s.hydrated);
  const tutorialSeen = useDemoTutorialStore((s) => s.seen);
  const tutorialForce = useDemoTutorialStore((s) => s.forceShow);
  const hydrateTutorial = useDemoTutorialStore((s) => s.hydrate);

  useEffect(() => {
    void hydrateTutorial();
  }, [hydrateTutorial]);

  const showTutorial = tutorialHydrated && (!tutorialSeen || tutorialForce);

  const fabSpin = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    spring(fabSpin, createOpen ? 1 : 0, 'snappy', reducedMotion).start();
  }, [createOpen, fabSpin, reducedMotion]);

  const fabFeedback = usePressFeedback({
    onPress: () => setCreateOpen((open) => !open),
    kind: 'impactLight',
    pressedScale: 0.9,
  });

  const handleCreate = (action: CreateAction) => {
    setCreateOpen(false);
    // iOS drops a stack modal if it is presented while this sheet Modal is still dismissing.
    const delay = action === 'journal' ? 80 : action === 'story' ? 450 : 320;
    setTimeout(() => {
      if (action === 'seed') {
        if (SHOW_SEEDS) navigateFromRoot(navigation, 'PlantSeed');
        return;
      }
      if (action === 'circle') {
        if (SHOW_CIRCLES) navigateFromRoot(navigation, 'Circles');
        return;
      }
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
          const pressTab = (key: DockTabKey) => {
            const focused = currentRoute === key;
            const route = props.state.routes.find((r) => r.name === key);
            // Standard tabPress so screens can opt in with useScrollToTop (re-tap → top).
            const event = route
              ? props.navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                })
              : undefined;
            if (key === 'Feed' && focused) {
              // Feed owns its own re-tap behaviour (scroll to top + refresh); no
              // useScrollToTop on Feed, so this is the single handler.
              useHomeTabStore.getState().requestTopAndRefresh();
              return;
            }
            if (!focused && !event?.defaultPrevented) props.navigation.navigate(key);
          };

          return (
            <View
              pointerEvents="box-none"
              style={[styles.dockWrap, { paddingBottom: bottomPad }]}
            >
              <View
                style={[
                  styles.dock,
                  {
                    backgroundColor: theme.colors.card,
                    // Light keeps the barely-there ink hairline; night needs the solid line token.
                    borderColor: dark ? theme.colors.line : 'rgba(28,25,23,0.08)',
                  },
                ]}
              >
                <View style={[tw`flex-1 flex-row`, { height: TAB_HEIGHT }]}>
                  {DOCK_LEFT.map((tab) => (
                    <DockTabButton
                      key={tab.key}
                      tab={tab}
                      isActive={currentRoute === tab.key}
                      onPress={() => pressTab(tab.key)}
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
                    onLongPress={() => {
                      feedback.egg();
                      setCreateOpen(true);
                    }}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={createOpen ? 'Close create' : 'Create'}
                  >
                    <Animated.View
                      style={[
                        tw`w-11 h-11 rounded-full bg-brand-600 items-center justify-center`,
                        Platform.OS === 'ios' ? theme.shadows.fab : { elevation: 6 },
                        fabFeedback.animatedStyle,
                      ]}
                    >
                      <Animated.View
                        style={{
                          transform: [
                            {
                              rotate: fabSpin.interpolate({
                                inputRange: [0, 1],
                                outputRange: ['0deg', '45deg'],
                              }),
                            },
                          ],
                        }}
                      >
                        <Ionicons name="add" size={24} color="#FFFFFF" />
                      </Animated.View>
                    </Animated.View>
                  </Pressable>
                </View>

                <View style={[tw`flex-1 flex-row`, { height: TAB_HEIGHT }]}>
                  {DOCK_RIGHT.map((tab) => (
                    <DockTabButton
                      key={tab.key}
                      tab={tab}
                      isActive={currentRoute === tab.key}
                      onPress={() => pressTab(tab.key)}
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

      {showTutorial ? (
        <View
          style={[StyleSheet.absoluteFill, { zIndex: 40, backgroundColor: theme.colors.page }]}
          pointerEvents="auto"
        >
          <DemoTutorial />
        </View>
      ) : null}
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
    borderRadius: radius.hero,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderWidth: StyleSheet.hairlineWidth,
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
